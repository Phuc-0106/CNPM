from typing import List, Optional, Dict, Any
from threading import Lock
import uuid
from datetime import datetime

# ...existing code...
def gen_id() -> str:
    return str(uuid.uuid4())
# Parse ISO 8601 datetime string
def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    # Accept common ISO forms and trailing 'Z' (UTC)
    try:
        if s.endswith("Z"):
            s = s[:-1]
        return datetime.fromisoformat(s)
    except Exception:
        try:
            # fallback without fractional seconds
            return datetime.strptime(s.split(".")[0], "%Y-%m-%dT%H:%M:%S")
        except Exception:
            return None
def _intervals_overlap(start1: datetime, end1: datetime, start2: datetime, end2: datetime) -> bool:
    return max(start1, start2) < min(end1, end2)
class ScheduleService:
    """
    In-memory ScheduleService.
    Stores schedules as:
      { schedule_id: {"id": schedule_id, "tutor_id": tutor_id, "slots": [...], "timezone": tz, "created_by": actorId} }
    slots can be either:
    """
    def __init__(self):
        self.schedules: Dict[str, Dict[str, Any]] = {}
        self.lock = Lock()
    def createSchedule(self, tutor_id: str, slots: List[Dict[str, str]], timezone: str, actorId: str) -> Dict[str, Any]:
        with self.lock:
            schedule_id = gen_id()
            schedule = {
                "id": schedule_id,
                "tutor_id": tutor_id,
                "slots": slots,
                "timezone": timezone,
                "created_by": actorId
            }
            self.schedules[schedule_id] = schedule
            return schedule
    def updateSchedule(self, schedule_id: str, slots: List[Dict[str, str]], timezone: str, actorId: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            if schedule_id not in self.schedules:
                return None
            schedule = self.schedules[schedule_id]
            schedule["slots"] = slots
            schedule["timezone"] = timezone
            schedule["updated_by"] = actorId
            return schedule
    def deleteSchedule(self, schedule_id: str) -> bool:
        with self.lock:
            if schedule_id in self.schedules:
                del self.schedules[schedule_id]
                return True
            return False
    
    def getSchedulesForTutor(self, tutor_id: str, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
        result = []
        start_dt = _parse_iso(start) if start else None
        end_dt = _parse_iso(end) if end else None
        with self.lock:
            for schedule in self.schedules.values():
                if schedule["tutor_id"] != tutor_id:
                    continue
                if start_dt or end_dt:
                    filtered_slots = []
                    for slot in schedule["slots"]:
                        slot_start = _parse_iso(slot["start"])
                        slot_end = _parse_iso(slot["end"])
                        if slot_start and slot_end:
                            if (not start_dt or slot_end >= start_dt) and (not end_dt or slot_start <= end_dt):
                                filtered_slots.append(slot)
                    if filtered_slots:
                        filtered_schedule = schedule.copy()
                        filtered_schedule["slots"] = filtered_slots
                        result.append(filtered_schedule)
                else:
                    result.append(schedule)
        return result
    def findAvailableTutors(self, start: str, end: str) -> List[str]:
        #find tutors with availability overlapping the given time range
        start_dt = _parse_iso(start)
        end_dt = _parse_iso(end)
        if not start_dt or not end_dt:
            return []
        available_tutors = set()
        with self.lock:
            for schedule in self.schedules.values():
                for slot in schedule["slots"]:
                    slot_start = _parse_iso(slot["start"])
                    slot_end = _parse_iso(slot["end"])
                    if slot_start and slot_end:
                        if _intervals_overlap(start_dt, end_dt, slot_start, slot_end):
                            available_tutors.add(schedule["tutor_id"])
                            break
        return list(available_tutors)