"""Configuración sin claves por defecto ni dependencias del inventario."""
import json
import os
from pathlib import Path
from typing import Literal
from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[1]

class Client(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    key_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    scopes: list[Literal["events:write", "events:read"]] = Field(min_length=1)

class Settings(BaseModel):
    mongo_uri: str = "mongodb://127.0.0.1:27017"
    database: str = Field(default="quantic_audit", pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    clients: list[Client] = Field(min_length=1)
    retention_days: int = Field(default=0, ge=0, le=36500)

    @classmethod
    def load(cls):
        load_dotenv(ROOT / ".env")
        path = Path(os.environ.get("AUDIT_CLIENTS_FILE", str(ROOT / "clients.local.json")))
        if not path.is_absolute():
            path = ROOT / path
        clients = json.loads(path.read_text(encoding="utf-8"))
        settings = cls(mongo_uri=os.environ.get("AUDIT_MONGODB_URI", "mongodb://127.0.0.1:27017"),
                       database=os.environ.get("AUDIT_DB_NAME", "quantic_audit"), clients=clients,
                       retention_days=os.environ.get("AUDIT_RETENTION_DAYS", "0"))
        if len({c.key_sha256 for c in settings.clients}) != len(settings.clients):
            raise ValueError("Las claves de clientes deben ser distintas")
        return settings
