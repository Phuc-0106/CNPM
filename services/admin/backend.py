# backend.py - Integrated Backend with Admin Interface
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import importlib
import os

# Try import your in-memory repos/services (adjust module names if different)
try:
    from Repositories import Repositories
except Exception:
    # fallback: minimal in-file simple store if Repositories not present
    Repositories = None

try:
    from UserService import UserService
except Exception:
    UserService = None

try:
    from MatchingService import MatchingService as MSvc
except Exception:
    MSvc = None

# If provided Repositories exists, create and populate some sample users
if Repositories is not None:
    repos = Repositories()
    # Optionally seed some users using repo.user.save -- but repo API differs; we will use UserService if available
else:
    repos = None

# If UserService provided, create instance
if UserService is not None:
    user_service = UserService()
else:
    # lightweight fallback user service
    class _SimpleUserSvc:
        def __init__(self):
            self._store = {}
            import uuid
            admin_id = str(uuid.uuid4())
            self._store[admin_id] = {"id": admin_id, "name": "Admin", "email": "admin@example.com", "roles": ["Department Staff"]}
        def listUsers(self, filter=None):
            users = list(self._store.values())
            if not filter:
                return users
            role = filter.get("role")
            if role:
                users = [u for u in users if any(r.lower() == role.lower() for r in u.get("roles", []))]
            skip = int(filter.get("skip", 0)) if "skip" in filter else 0
            limit = int(filter.get("limit", len(users))) if "limit" in filter else len(users)
            return users[skip: skip + limit]
        def getUser(self, userId):
            return self._store.get(userId)
        def create_user(self, name, email, roles=None):
            import uuid
            uid = str(uuid.uuid4())
            u = {"id": uid, "name": name, "email": email, "roles": roles or []}
            self._store[uid] = u
            return u
        def assignRole(self, userId, roleId, actorId):
            u = self._store.get(userId)
            if not u: raise ValueError("User not found")
            if roleId not in u["roles"]:
                u["roles"].append(roleId)
            return u
        def removeRole(self, userId, roleId, actorId):
            u = self._store.get(userId)
            if not u: raise ValueError("User not found")
            if roleId in u["roles"]:
                u["roles"].remove(roleId)
            return u
    user_service = _SimpleUserSvc()

# Matching service
if MSvc is not None:
    # Try to instantiate with user_service if constructor supports it
    try:
        matching_service = MSvc(user_service=user_service)
    except Exception:
        matching_service = MSvc()
else:
    # fallback minimal matching repo
    class _SimpleMatchingSvc:
        def __init__(self):
            self._store = {}
            import uuid, datetime
        def create_request(self, student_id, course_id, suggested=None):
            import uuid, datetime
            rid = str(uuid.uuid4())
            now = datetime.datetime.utcnow().isoformat() + "Z"
            req = {"id": rid, "student_id": student_id, "course_id": course_id,
                   "status": "PENDING", "suggested_tutor_ids": suggested or [],
                   "assigned_tutor_id": None, "assigned_by_admin": None,
                   "override_flag": False, "created_at": now}
            self._store[rid] = req
            return req
        def listMatchingRequests(self, filter=None):
            items = list(self._store.values())
            if not filter: return items
            # very simple filtering
            out = items
            if filter.get("status"):
                out = [i for i in out if i.get("status") == filter.get("status")]
            return out
        def manualAssign(self, requestId, tutorId, adminId, override=False):
            r = self._store.get(requestId)
            if not r:
                raise ValueError("not found")
            r["assigned_tutor_id"] = tutorId
            r["status"] = "ASSIGNED"
            r["assigned_by_admin"] = adminId
            r["override_flag"] = bool(override)
            return r
        def get_request(self, requestId):
            return self._store.get(requestId)
    matching_service = _SimpleMatchingSvc()

# Policy store - simple in-memory
POLICIES: Dict[str, Dict[str, Any]] = {}

# FastAPI app
app = FastAPI(title="Admin API with Static Files")

# Serve static files (CSS, JS, images, HTML)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Allow CORS from local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:4000", "http://127.0.0.1:4000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class UserIn(BaseModel):
    name: str
    email: str
    roles: Optional[List[str]] = Field(default_factory=list)

class UserOut(UserIn):
    id: str

class MatchingCreate(BaseModel):
    student_id: str
    course_id: str
    suggested_tutor_ids: Optional[List[str]] = Field(default_factory=list)

class MatchingAssign(BaseModel):
    tutor_id: str
    admin_id: str
    override: Optional[bool] = False

class PolicyIn(BaseModel):
    key: str
    value: str

# ===== STATIC FILE ROUTES =====

@app.get("/")
async def serve_index():
    """Serve the main index page"""
    return FileResponse("static/index.html")

@app.get("/admin")
async def serve_admin():
    """Serve the admin interface"""
    return FileResponse("static/admin.html")

@app.get("/student")
async def serve_student():
    """Serve the student interface"""
    return FileResponse("static/student.html")

# ===== API ENDPOINTS =====

# --- Users endpoints ---
@app.get("/api/users", response_model=List[Dict[str, Any]])
def list_users(skip: int = 0, limit: int = 100, role: Optional[str] = None):
    filt = {"skip": skip, "limit": limit}
    if role:
        filt["role"] = role
    users = user_service.listUsers(filt)
    return users

@app.post("/api/users", response_model=Dict[str, Any])
def create_user(payload: UserIn):
    # try available create_user
    if hasattr(user_service, "create_user"):
        u = user_service.create_user(payload.name, payload.email, payload.roles)
        return u
    # generic fallback: return payload with generated id
    import uuid
    uid = str(uuid.uuid4())
    user = {"id": uid, "name": payload.name, "email": payload.email, "roles": payload.roles}
    return user

@app.post("/api/users/{user_id}/roles")
def assign_role(user_id: str, data: Dict[str, str] = Body(...)):
    role = data.get("role")
    admin = data.get("admin") or "system"
    try:
        u = user_service.assignRole(user_id, role, admin)
        return u
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/api/users/{user_id}/roles")
def remove_role(user_id: str, data: Dict[str, str] = Body(...)):
    role = data.get("role")
    admin = data.get("admin") or "system"
    try:
        u = user_service.removeRole(user_id, role, admin)
        return u
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

# --- Matching endpoints ---
@app.get("/api/matchings", response_model=List[Dict[str, Any]])
def list_matchings(status: Optional[str] = None, skip: int = 0, limit: int = 100):
    filt = {}
    if status:
        filt["status"] = status
    filt["skip"] = skip
    filt["limit"] = limit
    items = matching_service.listMatchingRequests(filt) if hasattr(matching_service, "listMatchingRequests") else matching_service.list(filt)
    return items

@app.post("/api/matchings", response_model=Dict[str, Any])
def create_matching(payload: MatchingCreate):
    if hasattr(matching_service, "create_request"):
        r = matching_service.create_request(payload.student_id, payload.course_id, payload.suggested_tutor_ids)
    else:
        r = matching_service.create(payload.student_id, payload.course_id, payload.suggested_tutor_ids)
    return r

@app.get("/api/matchings/{match_id}", response_model=Dict[str, Any])
def get_matching(match_id: str):
    if hasattr(matching_service, "get_request"):
        m = matching_service.get_request(match_id)
    else:
        m = matching_service.get(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Matching not found")
    return m

@app.post("/api/matchings/{match_id}/assign", response_model=Dict[str, Any])
def assign_matching(match_id: str, payload: MatchingAssign):
    try:
        # prefer manualAssign
        if hasattr(matching_service, "manualAssign"):
            r = matching_service.manualAssign(match_id, payload.tutor_id, payload.admin_id, payload.override)
        else:
            # try assign on MatchingRequest objects if available
            r = matching_service.manualAssign(match_id, payload.tutor_id, payload.admin_id, payload.override)
        return r
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Policies endpoints ---
@app.get("/api/policies", response_model=List[Dict[str, Any]])
def list_policies():
    return list(POLICIES.values())

@app.post("/api/policies", response_model=Dict[str, Any])
def upsert_policy(p: PolicyIn):
    now = __import__("datetime").datetime.utcnow().isoformat() + "Z"
    POLICIES[p.key] = {"key": p.key, "value": p.value, "updated_at": now}
    return POLICIES[p.key]

@app.get("/api/policies/{key}", response_model=Dict[str, Any])
def get_policy(key: str):
    p = POLICIES.get(key)
    if not p:
        raise HTTPException(status_code=404, detail="Policy not found")
    return p

# --- Health endpoint ---
@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/health")
def root_health():
    return {"status": "ok", "service": "integrated-admin-backend"}

if __name__ == "__main__":
    uvicorn.run("backend:app", host="127.0.0.1", port=4000, reload=True)