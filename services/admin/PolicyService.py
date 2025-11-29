from typing import Optional, Dict, List
from threading import Lock
from datetime import datetime

class PolicyService:
    """
    In-memory PolicyService.
    Policies stored as:
      { key: {"key": key, "value": value, "updated_by": adminId, "updated_at": iso_datetime} }
    """

    def __init__(self):
        self._lock = Lock()
        self._policies: Dict[str, Dict[str, str]] = {}

    def getPolicy(self, key: str) -> Optional[Dict[str, str]]:
        """Return a shallow copy of the policy dict or None if not found."""
        with self._lock:
            p = self._policies.get(key)
            return dict(p) if p is not None else None

    def setPolicy(self, key: str, value: str, adminId: str) -> Dict[str, str]:
        """Create or update a policy. Returns the saved policy dict."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._lock:
            policy = self._policies.get(key)
            if policy is None:
                policy = {"key": key, "value": value, "updated_by": adminId, "updated_at": now}
                self._policies[key] = policy
            else:
                policy["value"] = value
                policy["updated_by"] = adminId
                policy["updated_at"] = now
            return dict(policy)

    def listPolicies(self) -> List[Dict[str, str]]:
        """Return a list of shallow-copied policy dicts."""
        with self._lock:
            return [dict(p) for p in self._policies.values()]
# filepath: c:\Users\admin\PolicyService.py
from typing import Optional, Dict, List
from threading import Lock
from datetime import datetime

class PolicyService:
    """
    In-memory PolicyService.
    Policies stored as:
      { key: {"key": key, "value": value, "updated_by": adminId, "updated_at": iso_datetime} }
    """

    def __init__(self):
        self._lock = Lock()
        self._policies: Dict[str, Dict[str, str]] = {}

    def getPolicy(self, key: str) -> Optional[Dict[str, str]]:
        """Return a shallow copy of the policy dict or None if not found."""
        with self._lock:
            p = self._policies.get(key)
            return dict(p) if p is not None else None

    def setPolicy(self, key: str, value: str, adminId: str) -> Dict[str, str]:
        """Create or update a policy. Returns the saved policy dict."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._lock:
            policy = self._policies.get(key)
            if policy is None:
                policy = {"key": key, "value": value, "updated_by": adminId, "updated_at": now}
                self._policies[key] = policy
            else:
                policy["value"] = value
                policy["updated_by"] = adminId
                policy["updated_at"] = now
            return dict(policy)

    def listPolicies(self) -> List[Dict[str, str]]:
        """Return a list of shallow-copied policy dicts."""
        with self._lock:
            return [dict(p) for p in self._policies.values()]