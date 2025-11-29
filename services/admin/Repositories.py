from typing import Optional, List, Dict, Any
from threading import Lock
from datetime import datetime
import uuid
import copy

def _gen_id() -> str:
    return str(uuid.uuid4())

class UserRepo:
    def __init__(self):
        self._lock = Lock()
        self._store: Dict[str, Dict[str, Any]] = {}

    def get(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            u = self._store.get(user_id)
            return copy.deepcopy(u) if u is not None else None

    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for u in self._store.values():
                if u.get("email") == email:
                    return copy.deepcopy(u)
            return None

    def list(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            items = list(self._store.values())[skip: skip + limit]
            return copy.deepcopy(items)

    def save(self, user: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            uid = user.get("id") or _gen_id()
            user_copy = dict(user, id=uid)
            self._store[uid] = copy.deepcopy(user_copy)
            return copy.deepcopy(user_copy)

    def delete(self, user_id: str) -> bool:
        with self._lock:
            return self._store.pop(user_id, None) is not None

class RoleRepo:
    def __init__(self):
        self._lock = Lock()
        self._store: Dict[str, Dict[str, Any]] = {}

    def create(self, name: str) -> Dict[str, Any]:
        with self._lock:
            rid = _gen_id()
            role = {"id": rid, "name": name, "permissions": {}} 
            self._store[rid] = role
            return copy.deepcopy(role)

    def get(self, role_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            r = self._store.get(role_id)
            return copy.deepcopy(r) if r else None

    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for r in self._store.values():
                if r.get("name").lower() == name.lower():
                    return copy.deepcopy(r)
            return None

    def list(self) -> List[Dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(list(self._store.values()))

    def add_permission(self, role_id: str, perm_code: str, description: str = "") -> bool:
        with self._lock:
            r = self._store.get(role_id)
            if not r:
                return False
            r["permissions"][perm_code] = description
            return True

    def remove_permission(self, role_id: str, perm_code: str) -> bool:
        with self._lock:
            r = self._store.get(role_id)
            if not r:
                return False
            r["permissions"].pop(perm_code, None)
            return True

    def get_permissions(self, role_id: str) -> List[Dict[str, str]]:
        with self._lock:
            r = self._store.get(role_id)
            if not r:
                return []
            return [{"code": c, "description": d} for c, d in r["permissions"].items()]

class PermissionRepo:
    def __init__(self):
        self._lock = Lock()
        self._store: Dict[str, Dict[str, str]] = {}  # code -> {code, description}

    def get_or_create(self, code: str, description: str = "") -> Dict[str, str]:
        with self._lock:
            p = self._store.get(code)
            if not p:
                p = {"code": code, "description": description}
                self._store[code] = p
            return dict(p)

    def list(self) -> List[Dict[str, str]]:
        with self._lock:
            return [dict(p) for p in self._store.values()]

class ScheduleRepo:
    def __init__(self):
        self._lock = Lock()
        self._store: Dict[str, Dict[str, Any]] = {}  # schedule_id -> schedule

    def create(self, tutor_id: str, slots: List[Dict[str, Any]], timezone: str, created_by: str) -> Dict[str, Any]:
        with self._lock:
            sid = _gen_id()
            sched = {
                "id": sid,
                "tutor_id": tutor_id,
                "slots": copy.deepcopy(slots),
                "timezone": timezone,
                "created_by": created_by,
                "updated_by": created_by,
                "created_at": datetime.utcnow().isoformat() + "Z"
            }
            self._store[sid] = sched
            return copy.deepcopy(sched)

    def update(self, schedule_id: str, slots: Optional[List[Dict[str, Any]]] = None, timezone: Optional[str] = None, updated_by: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self._lock:
            s = self._store.get(schedule_id)
            if not s:
                return None
            if slots is not None:
                s["slots"] = copy.deepcopy(slots)
            if timezone is not None:
                s["timezone"] = timezone
            if updated_by:
                s["updated_by"] = updated_by
            s["updated_at"] = datetime.utcnow().isoformat() + "Z"
            return copy.deepcopy(s)

    def delete(self, schedule_id: str) -> bool:
        with self._lock:
            return self._store.pop(schedule_id, None) is not None

    def list_for_tutor(self, tutor_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            out = [copy.deepcopy(s) for s in self._store.values() if s.get("tutor_id") == tutor_id]
            return out

class MatchingRepo:
    def __init__(self):
        self._lock = Lock()
        self._store: Dict[str, Dict[str, Any]] = {}

    def create(self, student_id: str, course_id: str, suggested: Optional[List[str]] = None) -> Dict[str, Any]:
        with self._lock:
            rid = _gen_id()
            req = {
                "id": rid,
                "student_id": student_id,
                "course_id": course_id,
                "status": "PENDING",
                "suggested_tutor_ids": list(suggested or []),
                "assigned_tutor_id": None,
                "assigned_by_admin": None,
                "override_flag": False,
                "created_at": datetime.utcnow().isoformat() + "Z"
            }
            self._store[rid] = req
            return copy.deepcopy(req)

    def get(self, request_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            r = self._store.get(request_id)
            return copy.deepcopy(r) if r else None

    def list(self, filter: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        with self._lock:
            items = list(self._store.values())
        if not filter:
            return [copy.deepcopy(i) for i in items]
        def match(i: Dict[str, Any]) -> bool:
            if "status" in filter and i.get("status") != filter["status"]:
                return False
            if "student_id" in filter and i.get("student_id") != filter["student_id"]:
                return False
            if "tutor_id" in filter:
                tid = filter["tutor_id"]
                if i.get("assigned_tutor_id") != tid and tid not in (i.get("suggested_tutor_ids") or []):
                    return False
            return True
        filtered = [copy.deepcopy(i) for i in items if match(i)]
        skip = int(filter.get("skip", 0)) if "skip" in filter else 0
        limit = int(filter.get("limit", len(filtered))) if "limit" in filter else len(filtered)
        return filtered[skip: skip + limit]

    def save(self, request_obj: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            rid = request_obj.get("id") or _gen_id()
            self._store[rid] = copy.deepcopy(request_obj)
            return copy.deepcopy(self._store[rid])

    def delete(self, request_id: str) -> bool:
        with self._lock:
            return self._store.pop(request_id, None) is not None

class PolicyRepo:
    def __init__(self):
        self._lock = Lock()
        self._store: Dict[str, Dict[str, Any]] = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            p = self._store.get(key)
            return copy.deepcopy(p) if p else None

    def set(self, key: str, value: str, updated_by: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            now = datetime.utcnow().isoformat() + "Z"
            p = self._store.get(key)
            if not p:
                p = {"key": key, "value": value, "updated_by": updated_by, "updated_at": now}
                self._store[key] = p
            else:
                p["value"] = value
                p["updated_by"] = updated_by
                p["updated_at"] = now
            return copy.deepcopy(p)

    def list(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [copy.deepcopy(p) for p in self._store.values()]

# convenience container grouping repositories
class Repositories:
    def __init__(self):
        self.user = UserRepo()
        self.role = RoleRepo()
        self.permission = PermissionRepo()
        self.schedule = ScheduleRepo()
        self.matching = MatchingRepo()
        self.policy = PolicyRepo()
 # filepath: c:\Users\admin\Repositories.py