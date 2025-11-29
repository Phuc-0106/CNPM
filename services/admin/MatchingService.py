# ...existing code...
from typing import List, Dict, Optional, Any
from threading import Lock
from datetime import datetime
import uuid

def gen_id() -> str:
    return str(uuid.uuid4())

class MatchingService:
    """
    In-memory MatchingService.
    Stores matching requests as:
      { req_id: {
          "id": req_id,
          "student_id": ...,
          "course_id": ...,
          "status": "PENDING"|"ASSIGNED"|"CANCELLED",
          "suggested_tutor_ids": [...],
          "assigned_tutor_id": Optional[str],
          "assigned_by_admin": Optional[str],
          "override_flag": bool,
          "created_at": iso
        } }
    Optional dependencies:
      - user_service: should expose listUsers(filter) returning list of user dicts with "id" and "roles"
      - schedule_service: optional to refine suggestions
    """

    def __init__(self, user_service: Optional[Any] = None, schedule_service: Optional[Any] = None):
        self._lock = Lock()
        self._store: Dict[str, Dict[str, Any]] = {}
        self.user_service = user_service
        self.schedule_service = schedule_service

    def create_request(self, student_id: str, course_id: str, suggested_tutor_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        with self._lock:
            rid = gen_id()
            req = {
                "id": rid,
                "student_id": student_id,
                "course_id": course_id,
                "status": "PENDING",
                "suggested_tutor_ids": suggested_tutor_ids or [],
                "assigned_tutor_id": None,
                "assigned_by_admin": None,
                "override_flag": False,
                "created_at": datetime.utcnow().isoformat() + "Z",
            }
            self._store[rid] = req
            return dict(req)

    def listMatchingRequests(self, filter: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        filter supports: status, student_id, tutor_id, skip, limit
        """
        with self._lock:
            items = list(self._store.values())

        if not filter:
            return [dict(i) for i in items]

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

        filtered = [dict(i) for i in items if match(i)]
        skip = int(filter.get("skip", 0)) if "skip" in filter else 0
        limit = int(filter.get("limit", len(filtered))) if "limit" in filter else len(filtered)
        return filtered[skip: skip + limit]

    def suggestMatches(self, studentId: str, limit: int = 5) -> List[str]:
        """
        Naive suggestion:
         - if user_service provided, list users with role 'Tutor' and return their ids (up to limit)
         - else return empty list
        If schedule_service available, can be enhanced to prefer available tutors.
        """
        tutors: List[str] = []
        if self.user_service:
            users = self.user_service.listUsers({"role": "Tutor", "skip": 0, "limit": 1000})
            for u in users:
                # user may be dict or ORM-like; try to read id
                uid = u.get("id") if isinstance(u, dict) else getattr(u, "id", None)
                if uid:
                    tutors.append(uid)
            # optionally refine by schedule_service (prefer those available)
            if self.schedule_service and hasattr(self.schedule_service, "findAvailableTutors"):
                # try a broad window (now..+24h) as ISO strings
                start = datetime.utcnow()
                end = start.replace(hour=start.hour)  # keep same day/time; caller can refine
                # schedule_service interface varies; call defensively if supported
                try:
                    available = self.schedule_service.findAvailableTutors(start.isoformat(), (start.replace(hour=start.hour+24)).isoformat())
                    # keep tutors that are both in tutors and available (preserve order)
                    if isinstance(available, list):
                        tutors = [t for t in tutors if t in available]
                except Exception:
                    pass
        return tutors[:limit]

    def manualAssign(self, requestId: str, tutorId: str, adminId: str, override: bool = False) -> Dict[str, Any]:
        """
        Assign tutor to request. Sets status to ASSIGNED, records admin and override flag.
        Raises ValueError if request not found.
        """
        with self._lock:
            req = self._store.get(requestId)
            if not req:
                raise ValueError("Matching request not found")
            req["assigned_tutor_id"] = tutorId
            req["status"] = "ASSIGNED"
            req["assigned_by_admin"] = adminId
            req["override_flag"] = bool(override)
            req["updated_at"] = datetime.utcnow().isoformat() + "Z"
            return dict(req)

    # helper for tests/debug
    def get_request(self, requestId: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            r = self._store.get(requestId)
            return dict(r) if r is not None else None
# ...existing code...