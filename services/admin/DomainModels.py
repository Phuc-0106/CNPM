from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Union
from enum import Enum
from datetime import datetime, time
import uuid

def _to_uuid(val: Union[str, uuid.UUID, None]) -> Optional[uuid.UUID]:
    if val is None:
        return None
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))

class UserStatus(Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"

class MatchingStatus(Enum):
    PENDING = "PENDING"
    ASSIGNED = "ASSIGNED"
    CANCELLED = "CANCELLED"

@dataclass
class Permission:
    code: str
    description: str = ""

@dataclass
class Role:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    permissions: List[Permission] = field(default_factory=list)

    def add_permission(self, perm: Permission) -> None:
        if not any(p.code == perm.code for p in self.permissions):
            self.permissions.append(perm)

@dataclass
class User:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    email: str = ""
    roles: List[Role] = field(default_factory=list)
    status: UserStatus = UserStatus.ACTIVE

    def __post_init__(self):
        self.id = _to_uuid(self.id)

    def isTutor(self) -> bool:
        return any(r.name.lower() == "tutor" for r in self.roles)

    def isStudent(self) -> bool:
        return any(r.name.lower() == "student" for r in self.roles)

@dataclass
class TutorSchedule:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    tutorId: uuid.UUID = field(default_factory=uuid.uuid4)
    slots: List[Dict[str, Any]] = field(default_factory=list)
    timezone: str = "UTC"  # note: timezone handling is not applied to availability checks here

    def __post_init__(self):
        self.id = _to_uuid(self.id)
        self.tutorId = _to_uuid(self.tutorId)

    def isAvailable(self, dt: datetime) -> bool:
        """
        Check if schedule has a slot that matches the datetime.
        Slot format example: {"day": "Mon", "from": "09:00", "to": "11:00"}
        This method compares the local time portion and weekday name (Mon, Tue, ...).
        Timezone-aware checks are out of scope for this simple model.
        """
        day_str = dt.strftime("%a")  # Mon, Tue, ...
        t = dt.time()
        for slot in self.slots:
            sday = slot.get("day")
            sfrom = slot.get("from")
            sto = slot.get("to")
            if not (sday and sfrom and sto):
                continue
            if sday == day_str:
                try:
                    from_t = time.fromisoformat(sfrom)
                    to_t = time.fromisoformat(sto)
                except Exception:
                    continue
                if from_t <= t <= to_t:
                    return True
        return False

@dataclass
class MatchingRequest:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    studentId: uuid.UUID = field(default_factory=uuid.uuid4)
    courseId: uuid.UUID = field(default_factory=uuid.uuid4)
    status: MatchingStatus = MatchingStatus.PENDING
    suggestedTutorIds: List[uuid.UUID] = field(default_factory=list)
    assignedTutorId: Optional[uuid.UUID] = None
    assignedByAdmin: Optional[uuid.UUID] = None
    overrideFlag: bool = False
    createdAt: datetime = field(default_factory=datetime.utcnow)
    updatedAt: Optional[datetime] = None

    def __post_init__(self):
        self.id = _to_uuid(self.id)
        self.studentId = _to_uuid(self.studentId)
        self.courseId = _to_uuid(self.courseId)
        self.suggestedTutorIds = [ _to_uuid(x) for x in self.suggestedTutorIds ]
        self.assignedTutorId = _to_uuid(self.assignedTutorId)
        self.assignedByAdmin = _to_uuid(self.assignedByAdmin)

    def assign(self, tutorId: Union[str, uuid.UUID], adminId: Union[str, uuid.UUID], override: bool = False) -> None:
        self.assignedTutorId = _to_uuid(tutorId)
        self.assignedByAdmin = _to_uuid(adminId)
        self.overrideFlag = bool(override)
        self.status = MatchingStatus.ASSIGNED
        self.updatedAt = datetime.utcnow()

@dataclass
class Policy:
    key: str
    value: str
    updatedBy: Optional[uuid.UUID] = None
    updatedAt: Optional[datetime] = None

    def __post_init__(self):
        self.updatedBy = _to_uuid(self.updatedBy)
        if isinstance(self.updatedAt, str):
            try:
                self.updatedAt = datetime.fromisoformat(self.updatedAt)
            except Exception:
                self.updatedAt = None