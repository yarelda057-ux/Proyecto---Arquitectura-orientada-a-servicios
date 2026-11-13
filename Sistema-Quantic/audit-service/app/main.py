from contextlib import asynccontextmanager
from datetime import timezone
from hashlib import sha256
from hmac import compare_digest
import logging
import json
from time import monotonic
from typing import Annotated
from bson import ObjectId
from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AwareDatetime
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from .config import Settings
from .models import EventIn, EventPage, Method
from .repository import Repository, Conflict

logger = logging.getLogger("audit")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.propagate = False
bearer = HTTPBearer(auto_error=False)

class BodyLimit:
    """Límite también para cuerpos sin Content-Length o enviados por fragmentos."""
    def __init__(self, app, limit=16384):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.limit:
                return await JSONResponse({"message": "Solicitud demasiado grande"}, 413)(scope, receive, send)
            if not message.get("more_body", False):
                break
        delivered = False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()
        await self.app(scope, replay, send)


def create_app(settings=None, repository=None):
    settings = settings or Settings.load()

    @asynccontextmanager
    async def lifespan(app):
        client = None
        if repository is None:
            client = MongoClient(settings.mongo_uri, tz_aware=True, serverSelectionTimeoutMS=3000,
                                 connectTimeoutMS=3000, socketTimeoutMS=5000)
            app.state.repository = Repository(client[settings.database], settings.retention_days)
        else:
            app.state.repository = repository
        try:
            app.state.repository.ping()
            app.state.repository.initialize()
            yield
        finally:
            if client is not None:
                client.close()

    app = FastAPI(title="Servicio de Control de Accesos y Auditoría", version="1.0.0", lifespan=lifespan,
                  description="Registros inmutables por API. Cada credencial está limitada a un sistema y a permisos de lectura/escritura.")
    app.add_middleware(BodyLimit)

    @app.middleware("http")
    async def headers_and_log(request: Request, call_next):
        start = monotonic()
        response = await call_next(request)
        response.headers.update({"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY"})
        # No query, cuerpo, cabeceras, claves ni mensajes de excepciones.
        logger.info(json.dumps({"method": request.method, "path": request.url.path,
                               "client": getattr(request.state, "client_id", None), "status": response.status_code,
                               "duration_ms": int((monotonic() - start) * 1000)}))
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        return JSONResponse({"message": "Datos o filtros inválidos", "fields": [".".join(map(str, e["loc"])) for e in exc.errors()]}, 422)

    @app.exception_handler(PyMongoError)
    async def unavailable(request, exc):
        logger.error(json.dumps({"event": "database_unavailable", "type": type(exc).__name__}))
        return JSONResponse({"message": "Auditoría temporalmente no disponible"}, 503)

    def permission(scope):
        def authenticate(request: Request, auth: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
            digest = sha256((auth.credentials if auth else "").encode()).hexdigest()
            client = next((c for c in settings.clients if compare_digest(c.key_sha256, digest)), None)
            if client is None:
                raise HTTPException(401, "Credenciales inválidas", headers={"WWW-Authenticate": "Bearer"})
            request.state.client_id = client.id
            if scope not in client.scopes:
                raise HTTPException(403, "Permisos insuficientes")
            return client
        return authenticate

    @app.get("/health/live", tags=["Salud"])
    def live():
        return {"status": "ok"}

    @app.get("/health/ready", tags=["Salud"])
    def ready(request: Request):
        request.app.state.repository.ping()
        return {"status": "ready"}

    @app.post("/v1/events", status_code=201, tags=["Auditoría"])
    def record(event: EventIn, request: Request, response: Response, client=Depends(permission("events:write"))):
        try:
            event_id, created = request.app.state.repository.insert(event, client.source, client.id)
        except Conflict:
            raise HTTPException(409, "El event_id ya existe con contenido diferente") from None
        if not created:
            response.status_code = 200
        return {"id": event_id, "event_id": str(event.event_id), "created": created}

    @app.get("/v1/events", response_model=EventPage, tags=["Auditoría"])
    def search(request: Request, client=Depends(permission("events:read")),
               limit: int = Query(50, ge=1, le=100), cursor: str | None = Query(None, max_length=24),
               actor_id: str | None = Query(None, max_length=128), method: Method | None = None,
               path: str | None = Query(None, max_length=1024), status_code: int | None = Query(None, ge=100, le=599),
               since: AwareDatetime | None = None, until: AwareDatetime | None = None):
        if set(request.query_params) - {"limit", "cursor", "actor_id", "method", "path", "status_code", "since", "until"}:
            raise HTTPException(422, "Filtro desconocido")
        if cursor and not ObjectId.is_valid(cursor):
            raise HTTPException(422, "Cursor inválido")
        if since and until and since > until:
            raise HTTPException(422, "Rango de fechas inválido")
        filters = {key: value for key, value in {"actor_id": actor_id, "method": method, "path": path, "status_code": status_code}.items() if value is not None}
        if since or until:
            filters["occurred_at"] = {}
            if since: filters["occurred_at"]["$gte"] = since.astimezone(timezone.utc)
            if until: filters["occurred_at"]["$lte"] = until.astimezone(timezone.utc)
        return request.app.state.repository.search(client.source, filters, cursor, limit)

    return app
