"""Ejemplo mínimo para un consumidor externo; no depende de Quantic."""
import json
import os
from datetime import datetime, timezone
from uuid import uuid4
from urllib.request import Request, urlopen

url = os.environ["AUDIT_URL"].rstrip("/")
key = os.environ["AUDIT_API_KEY"]
event = {"event_id": str(uuid4()), "request_id": str(uuid4()),
         "occurred_at": datetime.now(timezone.utc).isoformat(), "actor_id": "demo-user",
         "method": "GET", "path": "/example", "status_code": 200, "duration_ms": 10}
request = Request(url + "/v1/events", data=json.dumps(event).encode(), method="POST",
                  headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
with urlopen(request, timeout=5) as response:
    print(response.status, response.read().decode())
# Para reintentar conservar el mismo event_id y contenido; no regenerar el evento.
