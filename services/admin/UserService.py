# ...existing code...
from typing import Optional, Dict, Any, List
from threading import Lock
import uuid

def gen_id() -> str:
    return str(uuid.uuid4())

class UserService:
    """
    In-memory UserService implementation (no DB).
    Stores users as dicts: {id, name, email, roles: List[str]}
    """

    def __init__(self):
        self._lock = Lock()
        self.users: Dict[str, Dict[str, Any]] = {}
        # optional role registry (stores role id->name), but here we treat roleId as name string
        self.roles: Dict[str, str] = {}
        # seed example user
        admin_id = gen_id()
        self.users[admin_id] = {"id": admin_id, "name": "Admin", "email": "admin@example.com", "roles": ["Department Staff"]}
        self._seed_admin_id = admin_id

    def getUser(self, userId: str) -> Optional[Dict[str, Any]]:
        return self.users.get(userId)

    def listUsers(self, filter: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        users = list(self.users.values())
        if not filter:
            return users
        # simple filters: skip, limit, role
        skip = int(filter.get("skip", 0)) if "skip" in filter else 0
        limit = int(filter.get("limit", len(users))) if "limit" in filter else len(users)
        role = filter.get("role")
        if role:
            users = [u for u in users if any(r.lower() == role.lower() for r in u.get("roles", []))]
        return users[skip: skip + limit]

    def assignRole(self, userId: str, roleId: str, actorId: str) -> Dict[str, Any]:
        """
        roleId is treated as role name in this in-memory impl.
        Returns updated user dict.
        """
        with self._lock:
            user = self.users.get(userId)
            if not user:
                raise ValueError("User not found")
            role_name = roleId  # no role table, so use name directly
            if role_name not in user["roles"]:
                user["roles"].append(role_name)
            return user

    def removeRole(self, userId: str, roleId: str, actorId: str) -> Dict[str, Any]:
        with self._lock:
            user = self.users.get(userId)
            if not user:
                raise ValueError("User not found")
            role_name = roleId
            if role_name in user["roles"]:
                user["roles"].remove(role_name)
            return user

    # helper to create users for tests/dev
    def create_user(self, name: str, email: str, roles: Optional[List[str]] = None) -> Dict[str, Any]:
        with self._lock:
            uid = gen_id()
            user = {"id": uid, "name": name, "email": email, "roles": roles or []}
            self.users[uid] = user
            return user
# ...existing code...