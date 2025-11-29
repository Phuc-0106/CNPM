# services/admin/main.py
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn

app = FastAPI(title="Admin Service")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory user service
class SimpleUserService:
    def __init__(self):
        self._store = {}
        import uuid
        admin_id = str(uuid.uuid4())
        self._store[admin_id] = {
            "id": admin_id, 
            "name": "Admin User", 
            "email": "admin@example.com", 
            "roles": ["Admin"],
            "status": "ACTIVE",
            "department": "IT",
            "lastLogin": "2024-01-15T10:30:00Z",
            "activeToday": True
        }

    def _norm(self, s: str) -> str:
        return (s or "").strip().lower()

    def find_by_email(self, email: str):
        target = self._norm(email)
        for u in self._store.values():
            if self._norm(u.get("email")) == target:
                return u
        return None
    
    def listUsers(self, filter=None):
        users = list(self._store.values())
        if not filter:
            return users
        role = filter.get("role")
        if role:
            users = [u for u in users if any(r.lower() == role.lower() for r in u.get("roles", []))]
        skip = int(filter.get("skip", 0))
        limit = int(filter.get("limit", len(users)))
        return users[skip:skip + limit]
    
    def create_user(self, name, email, roles=None):
        import uuid
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "name": name,
            "email": email,
            "roles": roles or ["User"],
            "status": "ACTIVE",
            "department": "",
            "lastLogin": "",
            "activeToday": False
        }
        self._store[user_id] = user
        return user

    def ensure_user(self, name: str, email: str, roles=None):
        roles = roles or []
        existing = self.find_by_email(email)
        if existing:
            # Hợp nhất roles, cập nhật tên nếu cần
            current_roles = set(existing.get("roles", []))
            for r in roles:
                if r and r not in current_roles:
                    current_roles.add(r)
            existing["roles"] = sorted(current_roles)
            if name and name != existing.get("name"):
                existing["name"] = name
            return existing
        return self.create_user(name, email, roles)

    
    def assignRole(self, userId, roleId, actorId):
        user = self._store.get(userId)
        if not user:
            raise ValueError("User not found")
        if roleId not in user["roles"]:
            user["roles"].append(roleId)
        return user
    
    def removeRole(self, userId, roleId, actorId):
        user = self._store.get(userId)
        if not user:
            raise ValueError("User not found")
        if roleId in user["roles"]:
            user["roles"].remove(roleId)
        return user

user_service = SimpleUserService()

# Pydantic models
class UserIn(BaseModel):
    name: str
    email: str
    roles: Optional[List[str]] = Field(default_factory=list)

# API endpoints
@app.get("/api/users")
async def list_users(skip: int = 0, limit: int = 100, role: Optional[str] = None):
    filt = {"skip": skip, "limit": limit}
    if role:
        filt["role"] = role
    users = user_service.listUsers(filt)
    return users

@app.post("/api/users")
async def create_user(payload: UserIn):
    user = user_service.create_user(payload.name, payload.email, payload.roles)
    return user

@app.post("/api/users/ensure")
async def ensure_user(payload: UserIn):
    user = user_service.ensure_user(payload.name, payload.email, payload.roles or [])
    return user

@app.post("/api/users/{user_id}/roles")
async def assign_role(user_id: str, data: Dict[str, str] = Body(...)):
    role = data.get("role")
    admin = data.get("admin") or "system"
    try:
        user = user_service.assignRole(user_id, role, admin)
        return user
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/api/users/{user_id}/roles")
async def remove_role(user_id: str, data: Dict[str, str] = Body(...)):
    role = data.get("role")
    admin = data.get("admin") or "system"
    try:
        user = user_service.removeRole(user_id, role, admin)
        return user
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "admin"}

@app.get("/")
async def root():
    return {"message": "Admin Service", "endpoints": ["/api/users", "/api/health"]}
# ===== Policies (in-memory) =====
POLICIES: Dict[str, Dict[str, Any]] = {
    "late_cancellation_window_hours": {
        "key": "late_cancellation_window_hours",
        "label": "Late Cancellation Window (hours)",
        "value": 12,
        "enabled": True,
        "description": "Window before a session that counts as a late cancellation."
    },
    "late_cancellation_max_count": {
        "key": "late_cancellation_max_count",
        "label": "Max Late Cancellations Before Penalty",
        "value": 3,
        "enabled": True,
        "description": "Max number of late cancellations allowed before applying penalties."
    },
    "tutor_response_sla_hours": {
        "key": "tutor_response_sla_hours",
        "label": "Tutor Response SLA (hours)",
        "value": 24,
        "enabled": True,
        "description": "Expected SLA for tutors to respond to requests."
    },
    "tutor_sla_reminder_enabled": {
        "key": "tutor_sla_reminder_enabled",
        "label": "Auto reminders before SLA deadline",
        "value": True,
        "enabled": True,
        "description": "Send automatic reminders to tutors before SLA deadline."
    },
}

from pydantic import BaseModel, Field

class PolicyIn(BaseModel):
    key: str
    value: Any
    enabled: Optional[bool] = None
    label: Optional[str] = None
    description: Optional[str] = None

@app.get("/api/policies")
async def list_policies():
    return list(POLICIES.values())

@app.get("/api/policies/{key}")
async def get_policy(key: str):
    p = POLICIES.get(key)
    if not p:
        raise HTTPException(status_code=404, detail="Policy not found")
    return p

@app.post("/api/policies")
async def upsert_policy(p: PolicyIn):
    # keep existing meta if present
    existing = POLICIES.get(p.key, {})
    new = {
        "key": p.key,
        "label": p.label or existing.get("label") or p.key,
        "description": p.description or existing.get("description", ""),
        "enabled": existing.get("enabled", True) if p.enabled is None else bool(p.enabled),
        "value": p.value,
    }
    # coerce numeric for known numeric keys
    if p.key in {"late_cancellation_window_hours", "late_cancellation_max_count", "tutor_response_sla_hours"}:
        try:
            new["value"] = int(p.value)
        except Exception:
            raise HTTPException(status_code=400, detail="value must be an integer")
    if p.key in {"tutor_sla_reminder_enabled"}:
        new["value"] = bool(p.value)
    POLICIES[p.key] = new
    return new

@app.patch("/api/policies/{key}/toggle")
async def toggle_policy(key: str, payload: Dict[str, Any] = Body(...)):
    p = POLICIES.get(key)
    if not p:
        raise HTTPException(status_code=404, detail="Policy not found")
    enabled = payload.get("enabled")
    if enabled is None:
        raise HTTPException(status_code=400, detail="enabled is required")
    p["enabled"] = bool(enabled)
    return p

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=4019, reload=True)