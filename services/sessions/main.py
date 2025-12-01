import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import jwt
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

app = FastAPI(title="Sessions service", version="2.0.0")

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o],
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== PYDANTIC MODELS ====================

class SlotCreate(BaseModel):
    day: str
    startTime: str
    endTime: Optional[str] = None
    duration: int = 60
    mode: str = "online"
    location: Optional[str] = None
    capacity: int = 1
    leadTime: int = 24
    cancelWindow: int = 12
    recurrence: str = "once"
    date: Optional[str] = None
    courseCode: Optional[str] = None
    courseTitle: Optional[str] = None


class SlotUpdate(BaseModel):
    day: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    duration: Optional[int] = None
    mode: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[int] = None
    leadTime: Optional[int] = None
    cancelWindow: Optional[int] = None


class ExceptionCreate(BaseModel):
    startDate: str
    endDate: str
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    reason: Optional[str] = None


# ==================== HELPER FUNCTIONS ====================

def decode_token(request: Request) -> Dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="unauthorized") from exc


def require_tutor(request: Request) -> Dict:
    payload = decode_token(request)
    if payload.get("role") != "TUTOR":
        raise HTTPException(status_code=403, detail="tutor access required")
    return payload


def require_auth(request: Request) -> Dict:
    return decode_token(request)


def iso(days_from_now: int, hour: int = 9) -> str:
    return (
        datetime.utcnow() + timedelta(days=days_from_now)
    ).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat() + "Z"


def calculate_end_time(start_time: str, duration: int) -> str:
    h, m = map(int, start_time.split(":"))
    total_minutes = h * 60 + m + duration
    end_h = total_minutes // 60
    end_m = total_minutes % 60
    return f"{end_h:02d}:{end_m:02d}"


# ==================== IN-MEMORY DATA ====================

# Tutor info for display
TUTORS_INFO: Dict[str, Dict[str, str]] = {
    "tut-001": {"name": "Perfect Cell", "email": "tutor@hcmut.edu.vn"},
}

# Sessions storage (what students browse)
SESSIONS: Dict[str, Dict[str, Any]] = {
    "sess-001": {
        "id": "sess-001",
        "tutorId": "tut-001",
        "tutorName": "Perfect Cell",
        "courseCode": "CO3005",
        "courseTitle": "Software Engineering",
        "capacity": 5,
        "enrolled": 2,
        "status": "active",
        "createdAt": iso(-30, 10),
        "slots": [
            {"id": "slot-001", "day": "Monday", "startTime": "09:00", "endTime": "11:00", "mode": "online", "location": None},
        ],
    },
    "sess-002": {
        "id": "sess-002",
        "tutorId": "tut-001",
        "tutorName": "Perfect Cell",
        "courseCode": "CO2013",
        "courseTitle": "Operating Systems",
        "capacity": 3,
        "enrolled": 1,
        "status": "active",
        "createdAt": iso(-20, 14),
        "slots": [
            {"id": "slot-002", "day": "Tuesday", "startTime": "09:00", "endTime": "11:00", "mode": "online", "location": None},
        ],
    },
}

# Tutor availability storage (what tutor configures)
AVAILABILITY: Dict[str, Dict[str, Any]] = {
    "tut-001": {
        "slots": [
            {
                "id": "avail-001",
                "day": "Monday",
                "date": None,
                "startTime": "09:00",
                "duration": 120,
                "mode": "online",
                "location": None,
                "capacity": 3,
                "leadTime": 24,
                "cancelWindow": 12,
                "recurrence": "weekly",
                "status": "published",
                "booked": False,
                "courseCode": "CO3005",
                "courseTitle": "Software Engineering",
            },
            {
                "id": "avail-002",
                "day": "Wednesday",
                "date": None,
                "startTime": "14:00",
                "duration": 120,
                "mode": "offline",
                "location": "Room B1-101",
                "capacity": 2,
                "leadTime": 24,
                "cancelWindow": 12,
                "recurrence": "weekly",
                "status": "published",
                "booked": True,
                "courseCode": "CO2013",
                "courseTitle": "Operating Systems",
            },
            {
                "id": "avail-003",
                "day": "Friday",
                "date": None,
                "startTime": "10:00",
                "duration": 60,
                "mode": "online",
                "location": None,
                "capacity": 1,
                "leadTime": 48,
                "cancelWindow": 24,
                "recurrence": "weekly",
                "status": "unpublished",
                "booked": False,
                "courseCode": None,
                "courseTitle": None,
            },
        ],
        "exceptions": [],
        "policy": {
            "allowedHoursStart": "07:00",
            "allowedHoursEnd": "22:00",
            "maxSlotsPerDay": 8,
            "maxSlotsPerWeek": 30,
        },
    },
}

# Attended sessions storage
ATTENDED: Dict[str, List[Dict[str, Any]]] = {
    "stu-001": [
        {"id": "att-001", "code": "CO3005", "title": "Software Engineering", "tutor": "Perfect Cell", "mode": "online", "completedAt": iso(-7, 11)},
        {"id": "att-002", "code": "CO2013", "title": "Operating Systems", "tutor": "Perfect Cell", "mode": "offline", "completedAt": iso(-3, 16)},
    ],
}


def ensure_availability(tutor_id: str) -> Dict[str, Any]:
    if tutor_id not in AVAILABILITY:
        AVAILABILITY[tutor_id] = {
            "slots": [],
            "exceptions": [],
            "policy": {
                "allowedHoursStart": "07:00",
                "allowedHoursEnd": "22:00",
                "maxSlotsPerDay": 8,
                "maxSlotsPerWeek": 30,
            },
        }
    return AVAILABILITY[tutor_id]


def get_tutor_name(tutor_id: str) -> str:
    return TUTORS_INFO.get(tutor_id, {}).get("name", "Tutor")


# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health():
    return {"ok": True, "svc": "sessions"}


# ==================== TUTOR AVAILABILITY ENDPOINTS ====================

@app.get("/availability")
async def get_availability(request: Request):
    """GET /sessions/availability - Get tutor's availability slots"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] GET /availability for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    week_usage = len([s for s in data["slots"] if s.get("status") == "published"])
    
    return {
        "ok": True,
        "slots": data["slots"],
        "exceptions": data["exceptions"],
        "policy": data["policy"],
        "weekUsage": week_usage,
    }


@app.post("/availability/slots")
async def add_availability_slot(body: SlotCreate, request: Request):
    """POST /sessions/availability/slots - Add a new availability slot"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] POST /availability/slots for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    
    # Check policy limits
    current_count = len(data["slots"])
    if current_count >= data["policy"]["maxSlotsPerWeek"]:
        raise HTTPException(status_code=400, detail="max slots per week exceeded")
    
    slot_id = f"avail-{tutor_id}-{datetime.utcnow().timestamp():.0f}"
    
    end_time = body.endTime or calculate_end_time(body.startTime, body.duration)
    
    new_slot = {
        "id": slot_id,
        "day": body.day,
        "date": body.date,
        "startTime": body.startTime,
        "endTime": end_time,
        "duration": body.duration,
        "mode": body.mode,
        "location": body.location,
        "capacity": body.capacity,
        "leadTime": body.leadTime,
        "cancelWindow": body.cancelWindow,
        "recurrence": body.recurrence,
        "status": "unpublished",
        "booked": False,
        "courseCode": body.courseCode,
        "courseTitle": body.courseTitle,
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
    
    data["slots"].append(new_slot)
    print(f"[sessions] Added slot {slot_id}")
    
    return {"ok": True, "slot": new_slot}


@app.put("/availability/slots/{slot_id}")
async def update_availability_slot(slot_id: str, body: SlotUpdate, request: Request):
    """PUT /sessions/availability/slots/{id} - Update an availability slot"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] PUT /availability/slots/{slot_id} for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    slot = next((s for s in data["slots"] if s["id"] == slot_id), None)
    
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    if slot.get("booked"):
        raise HTTPException(status_code=400, detail="cannot modify booked slot")
    
    for field in ["day", "startTime", "endTime", "duration", "mode", "location", "capacity", "leadTime", "cancelWindow"]:
        value = getattr(body, field, None)
        if value is not None:
            slot[field] = value
    
    slot["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    
    return {"ok": True, "slot": slot}


@app.delete("/availability/slots/{slot_id}")
async def delete_availability_slot(slot_id: str, request: Request):
    """DELETE /sessions/availability/slots/{id} - Delete an availability slot"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] DELETE /availability/slots/{slot_id} for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    slot = next((s for s in data["slots"] if s["id"] == slot_id), None)
    
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    if slot.get("booked"):
        raise HTTPException(status_code=400, detail="cannot delete booked slot")
    
    # Also remove from SESSIONS if it was published
    session_id = slot.get("sessionId")
    if session_id and session_id in SESSIONS:
        del SESSIONS[session_id]
        print(f"[sessions] Also deleted session {session_id}")
    
    data["slots"] = [s for s in data["slots"] if s["id"] != slot_id]
    
    return {"ok": True}


@app.post("/availability/slots/{slot_id}/publish")
async def publish_slot(slot_id: str, request: Request):
    """POST /sessions/availability/slots/{id}/publish - Publish a slot and create a session"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    tutor_name = payload.get("name", get_tutor_name(tutor_id))
    print(f"[sessions] POST /availability/slots/{slot_id}/publish for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    slot = next((s for s in data["slots"] if s["id"] == slot_id), None)
    
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    if slot.get("status") == "published":
        return {"ok": True, "slot": slot, "message": "already published"}
    
    slot["status"] = "published"
    slot["publishedAt"] = datetime.utcnow().isoformat() + "Z"
    
    # CREATE A NEW SESSION from this slot
    session_id = f"sess-{slot_id}"
    end_time = slot.get("endTime") or calculate_end_time(slot["startTime"], slot.get("duration", 60))
    
    new_session = {
        "id": session_id,
        "tutorId": tutor_id,
        "tutorName": tutor_name,
        "courseCode": slot.get("courseCode") or "TUTORING",
        "courseTitle": slot.get("courseTitle") or f"{slot['day']} {slot['startTime']} Session",
        "capacity": slot.get("capacity", 1),
        "enrolled": 0,
        "status": "active",
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "slots": [
            {
                "id": f"slot-{slot_id}",
                "day": slot["day"],
                "startTime": slot["startTime"],
                "endTime": end_time,
                "mode": slot.get("mode", "online"),
                "location": slot.get("location"),
            }
        ],
        "sourceSlotId": slot_id,  # Link back to availability slot
    }
    
    SESSIONS[session_id] = new_session
    slot["sessionId"] = session_id  # Link availability slot to session
    
    print(f"[sessions] Published slot {slot_id} and created session {session_id}")
    
    return {"ok": True, "slot": slot, "session": new_session}


@app.post("/availability/publish-all")
async def publish_all_slots(request: Request):
    """POST /sessions/availability/publish-all - Publish all unpublished slots"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    tutor_name = payload.get("name", get_tutor_name(tutor_id))
    print(f"[sessions] POST /availability/publish-all for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    count = 0
    now = datetime.utcnow().isoformat() + "Z"
    
    for slot in data["slots"]:
        if slot.get("status") == "unpublished":
            slot["status"] = "published"
            slot["publishedAt"] = now
            
            # Create session for each published slot
            session_id = f"sess-{slot['id']}"
            end_time = slot.get("endTime") or calculate_end_time(slot["startTime"], slot.get("duration", 60))
            
            new_session = {
                "id": session_id,
                "tutorId": tutor_id,
                "tutorName": tutor_name,
                "courseCode": slot.get("courseCode") or "TUTORING",
                "courseTitle": slot.get("courseTitle") or f"{slot['day']} {slot['startTime']} Session",
                "capacity": slot.get("capacity", 1),
                "enrolled": 0,
                "status": "active",
                "createdAt": now,
                "slots": [
                    {
                        "id": f"slot-{slot['id']}",
                        "day": slot["day"],
                        "startTime": slot["startTime"],
                        "endTime": end_time,
                        "mode": slot.get("mode", "online"),
                        "location": slot.get("location"),
                    }
                ],
                "sourceSlotId": slot["id"],
            }
            
            SESSIONS[session_id] = new_session
            slot["sessionId"] = session_id
            count += 1
            print(f"[sessions] Published slot {slot['id']} and created session {session_id}")
    
    return {"ok": True, "count": count}


@app.delete("/availability/bulk-delete-unpublished")
async def bulk_delete_unpublished(request: Request):
    """DELETE /sessions/availability/bulk-delete-unpublished"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] DELETE /availability/bulk-delete-unpublished for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    original_count = len(data["slots"])
    data["slots"] = [s for s in data["slots"] if s.get("status") != "unpublished" or s.get("booked")]
    deleted_count = original_count - len(data["slots"])
    
    return {"ok": True, "deletedCount": deleted_count}


# ==================== EXCEPTION ENDPOINTS ====================

@app.post("/availability/exceptions")
async def add_exception(body: ExceptionCreate, request: Request):
    """POST /sessions/availability/exceptions - Add an exception/blackout"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] POST /availability/exceptions for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    
    exc_id = f"exc-{tutor_id}-{datetime.utcnow().timestamp():.0f}"
    
    new_exception = {
        "id": exc_id,
        "startDate": body.startDate,
        "endDate": body.endDate,
        "startTime": body.startTime,
        "endTime": body.endTime,
        "reason": body.reason or "",
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
    
    data["exceptions"].append(new_exception)
    
    return {"ok": True, "exception": new_exception}


@app.delete("/availability/exceptions/{exc_id}")
async def delete_exception(exc_id: str, request: Request):
    """DELETE /sessions/availability/exceptions/{id}"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] DELETE /availability/exceptions/{exc_id} for tutor_id={tutor_id}")
    
    data = ensure_availability(tutor_id)
    exc = next((e for e in data["exceptions"] if e["id"] == exc_id), None)
    
    if not exc:
        raise HTTPException(status_code=404, detail="exception not found")
    
    data["exceptions"] = [e for e in data["exceptions"] if e["id"] != exc_id]
    
    return {"ok": True}


# ==================== PUBLIC SESSION ENDPOINTS (for Students) ====================

@app.get("/browse")
async def browse_sessions(request: Request):
    """GET /sessions/browse - Students browse all active sessions"""
    _ = require_auth(request)
    
    active_sessions = [
        {
            **s,
            "availableSlots": s["capacity"] - s["enrolled"],
        }
        for s in SESSIONS.values()
        if s["status"] == "active"
    ]
    
    # Sort by createdAt descending
    active_sessions.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    
    print(f"[sessions] GET /browse - returning {len(active_sessions)} sessions")
    
    return {"ok": True, "sessions": active_sessions}


@app.get("/attended")
async def get_attended_sessions(request: Request):
    """GET /sessions/attended - Get student's attended sessions"""
    payload = require_auth(request)
    student_id = payload.get("sub")
    print(f"[sessions] GET /attended for student_id={student_id}")
    
    attended = ATTENDED.get(student_id, [])
    return {"ok": True, "attended": attended}


# ==================== INTERNAL ENDPOINTS (for Tutors service) ====================

@app.post("/internal/enroll/{session_id}")
async def internal_enroll(session_id: str):
    """Internal: Called by Tutors service to increment enrolled count"""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session["enrolled"] >= session["capacity"]:
        raise HTTPException(status_code=400, detail="session is full")
    
    session["enrolled"] += 1
    print(f"[sessions] INTERNAL enroll {session_id} - now {session['enrolled']}/{session['capacity']}")
    
    return {"ok": True, "enrolled": session["enrolled"], "capacity": session["capacity"]}


@app.post("/internal/unenroll/{session_id}")
async def internal_unenroll(session_id: str):
    """Internal: Called by Tutors service to decrement enrolled count"""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session["enrolled"] > 0:
        session["enrolled"] -= 1
    
    print(f"[sessions] INTERNAL unenroll {session_id} - now {session['enrolled']}/{session['capacity']}")
    
    return {"ok": True, "enrolled": session["enrolled"]}


@app.get("/internal/{session_id}")
async def internal_get_session(session_id: str):
    """Internal: Get session info without auth (for other services)"""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    return {"ok": True, "session": session}


@app.put("/internal/slots/{slot_id}/book")
async def internal_book_slot(slot_id: str, request: Request):
    """Internal: Mark a slot as booked when tutor confirms"""
    body = await request.json()
    tutor_id = body.get("tutorId")
    student_id = body.get("studentId")
    
    if not tutor_id:
        raise HTTPException(status_code=400, detail="tutorId required")
    
    data = AVAILABILITY.get(tutor_id)
    if not data:
        raise HTTPException(status_code=404, detail="tutor availability not found")
    
    slot = next((s for s in data["slots"] if s["id"] == slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    slot["booked"] = True
    slot["bookedBy"] = student_id
    slot["bookedAt"] = datetime.utcnow().isoformat() + "Z"
    
    print(f"[sessions] INTERNAL book slot {slot_id} for student {student_id}")
    
    return {"ok": True, "slot": slot}


@app.put("/internal/slots/{slot_id}/unbook")
async def internal_unbook_slot(slot_id: str, request: Request):
    """Internal: Unbook a slot when booking is cancelled/rejected"""
    body = await request.json()
    tutor_id = body.get("tutorId")
    
    if not tutor_id:
        raise HTTPException(status_code=400, detail="tutorId required")
    
    data = AVAILABILITY.get(tutor_id)
    if not data:
        raise HTTPException(status_code=404, detail="tutor availability not found")
    
    slot = next((s for s in data["slots"] if s["id"] == slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    slot["booked"] = False
    slot["bookedBy"] = None
    slot["bookedAt"] = None
    
    print(f"[sessions] INTERNAL unbook slot {slot_id}")
    
    return {"ok": True, "slot": slot}


# ==================== SESSION DETAIL (MUST BE LAST) ====================

@app.get("/{session_id}")
async def get_session_detail(session_id: str, request: Request):
    """GET /sessions/{id} - Get session details"""
    _ = require_auth(request)
    
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    return {
        "ok": True,
        "session": {**session, "availableSlots": session["capacity"] - session["enrolled"]},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "4016")),
        reload=False,
    )
