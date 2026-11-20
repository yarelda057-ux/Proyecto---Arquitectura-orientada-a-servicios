from datetime import datetime, timezone, timedelta
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

class Conflict(Exception):
    pass

class Repository:
    def __init__(self, database, retention_days=0):
        self.collection = database.events
        self.retention_days = retention_days

    def initialize(self):
        self.collection.create_index([("source", ASCENDING), ("event_id", ASCENDING)], unique=True)
        self.collection.create_index([("source", ASCENDING), ("_id", DESCENDING)])
        self.collection.create_index([("source", ASCENDING), ("occurred_at", DESCENDING)])
        self.collection.create_index([("source", ASCENDING), ("actor_id", ASCENDING), ("_id", DESCENDING)])
                                                                                          
        self.collection.create_index("expires_at", expireAfterSeconds=0)

    def ping(self):
        self.collection.database.command("ping")

    def insert(self, event, source, client_id):
        data = event.model_dump(mode="json")
        data["occurred_at"] = event.occurred_at
        data.update(source=source, received_at=datetime.now(timezone.utc), client_id=client_id)
        if self.retention_days:
            data["expires_at"] = data["received_at"] + timedelta(days=self.retention_days)
        try:
            result = self.collection.insert_one(data)
            return str(result.inserted_id), True
        except DuplicateKeyError:
            existing = self.collection.find_one({"source": source, "event_id": str(event.event_id)})
            fields = event.model_dump(mode="json")
            if existing is None or any(existing[k] != data[k] for k in fields):
                raise Conflict() from None
            return str(existing["_id"]), False

    def search(self, source, filters, cursor, limit):
        query = {"source": source, **filters}
        if cursor:
            query["_id"] = {"$lt": ObjectId(cursor)}
        rows = list(self.collection.find(query).sort("_id", DESCENDING).limit(limit + 1).max_time_ms(3000))
        more = len(rows) > limit
        rows = rows[:limit]
        result = []
        for row in rows:
            result.append({k: v for k, v in {**row, "id": str(row["_id"])}.items() if k not in {"_id", "client_id", "expires_at"}})
        return {"items": result, "next_cursor": str(rows[-1]["_id"]) if more else None}
