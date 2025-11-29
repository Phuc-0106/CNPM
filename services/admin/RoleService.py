from typing import List, Dict, Optional
from threading import Lock
import uuid

def gen_id() -> str:
    return str(uuid.uuid4())

class RoleService:
    """"
    In-memory RoleService. Roles stored as:
      { role_id: {"id": role_id, "name": role_name, "permissions": {perm_code: description}} }
    roleId parameter may be role id or role name; when a name is provided and no role exists, a new role is created.
    """
    def __init__(self):
        self.roles: Dict[str, Dict] = {}
        self.lock = Lock()
        for name in ["admin", "user", "guest"]:
            role_id = gen_id()
            self.roles[role_id] = {"id": role_id, "name": name, "permissions": {}}

    def list_roles(self) -> List[Dict]:
        with self.lock:
            return [{"id": r["id"], "name": r["name"]} for r in self.roles.values()]

    def get_role(self, roleId: str) -> Optional[Dict]:
        with self.lock:
            for role in self.roles.values():
                if role["id"] == roleId or role["name"] == roleId:
                    return role
            return None

    def add_permission(self, roleId: str, perm_code: str, description: str) -> bool:
        with self.lock:
            role = self.get_role(roleId)
            if not role:
                return False
            role["permissions"][perm_code] = description
            return True

    def remove_permission(self, roleId: str, perm_code: str) -> bool:
        with self.lock:
            role = self.get_role(roleId)
            if not role:
                return False
            role["permissions"].pop(perm_code, None)
            return True

    def get_permissions(self, roleId: str) -> Optional[Dict[str, str]]:
        with self.lock:
            role = self.get_role(roleId)
            if role:
                return dict(role.get("permissions", {}))
            return None
        
    def add_permission(self, roleId: str, perm_code: str, description: str) -> bool:
        # add permission to role; return True if added, False if role not found
        with self.lock:
            role = self.get_role(roleId)
            if role:
                #perm_code: identifier code for permission
                #description: human-readable description of permission
                role["permissions"][perm_code] = description
                role["permissions"][perm_code] = description
                return True
            return False
    def remove_permission(self, roleId: str, perm_code: str, description: str) -> bool:
        # remove permission from role, return True if removed, False if role or permission not found
        with self.lock:
            role = self.get_role(roleId)
            if role and perm_code in role["permission"]:
                del role["permissions"][perm_code]
                return True
            return False
        
    def get_permission(self, roleId: str) -> Optional[Dict]:
        #return permission dict or None
        with self.lock:
            role = self.get_role(roleId)
            if role:
                return role["permission"]
    def remove_permission(self, roleId: str, perm_code: str) -> bool:
        # remove permission from role, return True if removed, False if role or permission not found
        with self.lock:
            role = self.get_role(roleId)
            if role and perm_code in role.get("permissions", {}):
                del role["permissions"][perm_code]
                return True
            return False

    def get_permissions(self, roleId: str) -> Optional[Dict[str, str]]:
        # return permissions dict or None
        with self.lock:
            role = self.get_role(roleId)
            if role:
                return dict(role.get("permissions", {}))
            return None