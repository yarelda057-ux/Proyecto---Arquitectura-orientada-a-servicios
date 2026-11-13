from datetime import datetime, timezone, timedelta
from hashlib import sha256
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from app.config import Settings
from app.main import create_app
from app.repository import Repository

KEYS = {"write": "w" * 48, "read": "r" * 48, "other": "o" * 48}

def auth(name):
    return {"Authorization": "Bearer " + KEYS[name]}

def event(**changes):
    return {"event_id": str(uuid4()), "request_id": str(uuid4()), "occurred_at": datetime.now(timezone.utc).isoformat(),
            "actor_id": "user-123", "method": "POST", "path": "/products", "status_code": 201, "duration_ms": 12, **changes}

@pytest.fixture
def service():
    client = MongoClient("mongodb://127.0.0.1:27017", tz_aware=True, serverSelectionTimeoutMS=3000)
    db_name = "audit_pytest_" + uuid4().hex
    client.admin.command("ping")
    repo = Repository(client[db_name])
    settings = Settings(clients=[{"id": name, "source": "other" if name == "other" else "inventory",
        "key_sha256": sha256(key.encode()).hexdigest(), "scopes": ["events:write"] if name == "write" else ["events:read"]} for name, key in KEYS.items()])
    try:
        with TestClient(create_app(settings, repo)) as api:
            yield api, repo
    finally:
        if db_name.startswith("audit_pytest_"):
            client.drop_database(db_name)
        client.close()

def test_auth_and_scopes(service):
    api, _ = service
    assert api.post("/v1/events", json=event()).status_code == 401
    assert api.get("/v1/events", headers=auth("write")).status_code == 403
    assert api.post("/v1/events", headers=auth("read"), json=event()).status_code == 403
    assert api.get("/v1/events", headers={"Authorization": "Bearer invalid"}).status_code == 401

def test_immutable_idempotent_events_and_tenant_isolation(service):
    api, repo = service
    payload = event()
    response = api.post("/v1/events", headers=auth("write"), json=payload)
    assert response.status_code == 201
    assert api.post("/v1/events", headers=auth("write"), json=payload).status_code == 200
    assert repo.collection.count_documents({}) == 1
    assert api.post("/v1/events", headers=auth("write"), json={**payload, "path": "/changed"}).status_code == 409
    assert api.get("/v1/events", headers=auth("other")).json()["items"] == []
    rows = api.get("/v1/events", headers=auth("read")).json()["items"]
    assert rows[0]["source"] == "inventory"
    assert rows[0]["actor_id"] == "user-123"
    assert "client_id" not in rows[0]
    for method in [api.put, api.patch, api.delete]:
        assert method("/v1/events", headers=auth("write")).status_code == 405

def test_filters_and_cursor_without_duplicates(service):
    api, _ = service
    for method in ["GET", "PATCH", "DELETE"]:
        assert api.post("/v1/events", headers=auth("write"), json=event(method=method)).status_code == 201
    first = api.get("/v1/events?limit=2", headers=auth("read")).json()
    second = api.get("/v1/events", params={"limit": 2, "cursor": first["next_cursor"]}, headers=auth("read")).json()
    assert len(first["items"]) == 2 and len(second["items"]) == 1
    assert len({row["id"] for row in first["items"] + second["items"]}) == 3
    assert second["next_cursor"] is None
    filtered = api.get("/v1/events", params={"method": "PATCH", "actor_id": "user-123", "status_code": 201, "path": "/products"}, headers=auth("read")).json()
    assert len(filtered["items"]) == 1
    assert api.get("/v1/events?limit=101", headers=auth("read")).status_code == 422
    assert api.get("/v1/events?cursor=invalid", headers=auth("read")).status_code == 422
    assert api.get("/v1/events?actor_id[$ne]=x", headers=auth("read")).status_code == 422

def test_dates_paths_and_sensitive_fields_are_validated_without_echo(service):
    api, _ = service
    for changes in [{"occurred_at": "2026-01-01T00:00:00"}, {"occurred_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()},
                    {"path": "/login?password=TOP-SECRET"}, {"password": "TOP-SECRET"}, {"source": "other"}, {"actor_id": {"$ne": None}}, {"status_code": "200"}]:
        response = api.post("/v1/events", headers=auth("write"), json=event(**changes))
        assert response.status_code == 422
        assert "TOP-SECRET" not in response.text
    assert api.get("/v1/events?since=2026-01-02T00:00:00Z&until=2026-01-01T00:00:00Z", headers=auth("read")).status_code == 422

def test_utc_normalization_retention_and_body_limit(service):
    api, repo = service
    payload = event(occurred_at="2026-01-01T10:00:00.123456-05:00")
    assert api.post("/v1/events", headers=auth("write"), json=payload).status_code == 201
    stored = repo.collection.find_one({"event_id": payload["event_id"]})
    assert stored["occurred_at"].hour == 15
    assert "expires_at" not in stored
    response = api.post("/v1/events", headers=auth("write"), content=b"x" * 17000)
    assert response.status_code == 413
    assert response.headers["cache-control"] == "no-store"
    assert api.post("/v1/events", headers=auth("write"), json=payload).status_code == 200

def test_database_failure_returns_sanitized_503(service, monkeypatch):
    api, repo = service
    def fail(*args):
        raise ConnectionFailure("sensitive-internal-connection")
    monkeypatch.setattr(repo, "search", fail)
    response = api.get("/v1/events", headers=auth("read"))
    assert response.status_code == 503
    assert "sensitive" not in response.text

def test_openapi_and_health(service):
    api, _ = service
    assert api.get("/health/ready").status_code == 200
    schema = api.get("/openapi.json").json()
    assert schema["paths"]["/v1/events"]["post"]["security"]
