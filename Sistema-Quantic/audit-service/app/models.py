from datetime import datetime, timezone, timedelta
from typing import Literal
from uuid import UUID
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

Method = Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

class EventIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    event_id: UUID
    occurred_at: AwareDatetime
    actor_id: str | None = Field(default=None, max_length=128, pattern=r"^[^\x00-\x1f\x7f]+$")
    method: Method
    path: str = Field(min_length=1, max_length=1024, pattern=r"^/[^?#\x00-\x1f\x7f]*$")
    status_code: int = Field(ge=100, le=599, strict=True)
    duration_ms: int = Field(ge=0, le=86400000, strict=True)
    request_id: UUID

    @field_validator("occurred_at")
    @classmethod
    def utc_time(cls, value):
        value = value.astimezone(timezone.utc)
        if value > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("La fecha no puede estar en el futuro")
        return value.replace(microsecond=(value.microsecond // 1000) * 1000)

class EventOut(EventIn):
    id: str
    source: str
    received_at: AwareDatetime

class EventPage(BaseModel):
    items: list[EventOut]
    next_cursor: str | None
