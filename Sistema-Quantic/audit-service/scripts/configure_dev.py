"""Genera credenciales locales sin imprimirlas ni sobrescribir configuración existente."""
import hashlib
import json
import secrets
from pathlib import Path
from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
server_env = root.parent / "server" / ".env"
audit_env = root / ".env"
clients_file = root / "clients.local.json"
existing = dotenv_values(server_env) if server_env.exists() else {}
if clients_file.exists() or audit_env.exists() or existing.get("AUDIT_WRITE_KEY") or existing.get("AUDIT_READ_KEY"):
    raise SystemExit("Ya existe configuración de auditoría; no se sobrescribió. Consulta README.md para configurar/rotar claves.")
write_key, read_key = secrets.token_urlsafe(48), secrets.token_urlsafe(48)
clients_file.write_text(json.dumps([
    {"id": "inventory-writer", "source": "inventory", "scopes": ["events:write"], "key_sha256": hashlib.sha256(write_key.encode()).hexdigest()},
    {"id": "inventory-reader", "source": "inventory", "scopes": ["events:read"], "key_sha256": hashlib.sha256(read_key.encode()).hexdigest()}
], indent=2) + "\n", encoding="utf-8")
audit_env.write_text("AUDIT_MONGODB_URI=mongodb://127.0.0.1:27017\nAUDIT_DB_NAME=quantic_audit\nAUDIT_CLIENTS_FILE=clients.local.json\nAUDIT_RETENTION_DAYS=0\n", encoding="utf-8")
with server_env.open("a", encoding="utf-8") as f:
    f.write(f"\nAUDIT_ENABLED=true\nAUDIT_SERVICE_URL=http://127.0.0.1:8001\nAUDIT_WRITE_KEY={write_key}\nAUDIT_READ_KEY={read_key}\n")
print("Auditoría local configurada. Las claves están solo en server/.env y sus hashes en clients.local.json.")
