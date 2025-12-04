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
        "enrolled": 0,
        "status": "active",
        "createdAt": iso(-20, 14),
        "slots": [
            {"id": "slot-002", "day": "Wednesday", "startTime": "14:00", "endTime": "16:00", "mode": "online", "location": None},
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
                "courseCode": "CO1234",
                "courseTitle": "Introduction to Programming",
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
    tutor_name = payload.get("name", "Tutor")
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
        "date": slot.get("date"),  # Include the specific date for one-time slots
        "recurrence": slot.get("recurrence", "once"),
        "slots": [
            {
                "id": f"slot-{slot_id}",
                "day": slot["day"],
                "date": slot.get("date"),  # Include date in slot too
                "startTime": slot["startTime"],
                "endTime": end_time,
                "mode": slot.get("mode", "online"),
                "location": slot.get("location"),
            }
        ],
    }
    
    SESSIONS[session_id] = new_session
    print(f"[sessions] Created session {session_id} with date={slot.get('date')}")
    
    return {"ok": True, "slot": slot, "session": new_session}


@app.post("/availability/publish-all")
async def publish_all_slots(request: Request):
    """POST /sessions/availability/publish-all - Publish all unpublished slots"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    tutor_name = payload.get("name", "Tutor")
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
                "date": slot.get("date"),  # Include the specific date
                "recurrence": slot.get("recurrence", "once"),
                "slots": [
                    {
                        "id": f"slot-{slot['id']}",
                        "day": slot["day"],
                        "date": slot.get("date"),  # Include date in slot
                        "startTime": slot["startTime"],
                        "endTime": end_time,
                        "mode": slot.get("mode", "online"),
                        "location": slot.get("location"),
                    }
                ],
            }
            
            SESSIONS[session_id] = new_session
            count += 1
            print(f"[sessions] Created session {session_id} with date={slot.get('date')}")
    
    return {"ok": True, "published": count}


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
    
    active_sessions = []
    for s in SESSIONS.values():
        if s["status"] == "active":
            session_data = {
                **s,
                "availableSlots": s["capacity"] - s["enrolled"],
            }
            # Include date from slot if available
            if s.get("date"):
                session_data["date"] = s["date"]
            elif s.get("slots") and s["slots"][0].get("date"):
                session_data["date"] = s["slots"][0]["date"]
            
            active_sessions.append(session_data)
    
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


# ==================== TUTOR SESSION MANAGEMENT ENDPOINTS ====================

@app.get("/tutor/sessions")
async def get_tutor_sessions(request: Request):
    """GET /sessions/tutor/sessions - Get all sessions for the logged-in tutor"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] GET /tutor/sessions for tutor_id={tutor_id}")
    
    tutor_sessions = []
    now = datetime.utcnow()
    
    for session_id, session in SESSIONS.items():
        if session.get("tutorId") == tutor_id:
            # Determine session status based on time
            slot = session.get("slots", [{}])[0] if session.get("slots") else {}
            start_time = slot.get("startTime", "09:00")
            end_time = slot.get("endTime", "11:00")
            day = slot.get("day", "Monday")
            
            # Create datetime for this week's session
            days_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
            today = now.date()
            days_ahead = days_map.get(day, 0) - today.weekday()
            if days_ahead < 0:
                days_ahead += 7
            session_date = today + timedelta(days=days_ahead)
            
            start_h, start_m = map(int, start_time.split(":"))
            end_h, end_m = map(int, end_time.split(":"))
            
            start_dt = datetime.combine(session_date, datetime.min.time().replace(hour=start_h, minute=start_m))
            end_dt = datetime.combine(session_date, datetime.min.time().replace(hour=end_h, minute=end_m))
            
            # Determine status
            if now < start_dt:
                status = "upcoming"
            elif start_dt <= now <= end_dt:
                status = "active"
            else:
                status = "past"
            
            tutor_sessions.append({
                "id": session_id,
                "tutorId": session.get("tutorId"),
                "tutorName": session.get("tutorName"),
                "courseCode": session.get("courseCode"),
                "courseTitle": session.get("courseTitle"),
                "capacity": session.get("capacity", 1),
                "enrolled": session.get("enrolled", 0),
                "status": status,
                "mode": slot.get("mode", "online"),
                "location": slot.get("location") or ("Google Meet" if slot.get("mode") == "online" else "TBD"),
                "day": day,
                "startTime": start_dt.isoformat() + "Z",
                "endTime": end_dt.isoformat() + "Z",
                "notes": session.get("notes", ""),
                "createdAt": session.get("createdAt"),
            })
    
    # Sort by startTime
    tutor_sessions.sort(key=lambda x: x.get("startTime", ""), reverse=True)
    
    return {"ok": True, "sessions": tutor_sessions}


@app.get("/tutor/sessions/{session_id}/participants")
async def get_session_participants(session_id: str, request: Request):
    """GET /sessions/tutor/sessions/{id}/participants - Get participants for a session"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[sessions] GET /tutor/sessions/{session_id}/participants for tutor_id={tutor_id}")
    
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session.get("tutorId") != tutor_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    # Get participants from session's participant list or return empty
    participants = session.get("participants", [])
    
    return {"ok": True, "participants": participants}


@app.post("/tutor/sessions/{session_id}/attendance")
async def mark_attendance(session_id: str, request: Request):
    """POST /sessions/tutor/sessions/{id}/attendance - Mark attendance for participants"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    body = await request.json()
    attendance = body.get("attendance", [])
    
    print(f"[sessions] POST /tutor/sessions/{session_id}/attendance for tutor_id={tutor_id}")
    
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session.get("tutorId") != tutor_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    # Update participant statuses
    participants = session.get("participants", [])
    for record in attendance:
        student_id = record.get("studentId")
        status = record.get("status", "absent")
        for p in participants:
            if p.get("id") == student_id:
                p["status"] = status
                break
    
    session["participants"] = participants
    
    return {"ok": True, "message": "Attendance saved"}


@app.post("/tutor/sessions/{session_id}/extend")
async def extend_session(session_id: str, request: Request):
    """POST /tutor/sessions/{id}/extend - Extend session duration"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    body = await request.json()
    minutes = body.get("minutes", 15)
    
    print(f"[sessions] POST /tutor/sessions/{session_id}/extend by {minutes} minutes for tutor_id={tutor_id}")
    
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session.get("tutorId") != tutor_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    # Update end time in slots
    slots = session.get("slots", [])
    for slot in slots:
        if slot.get("endTime"):
            end_h, end_m = map(int, slot["endTime"].split(":"))
            total_minutes = end_h * 60 + end_m + minutes
            new_h = total_minutes // 60
            new_m = total_minutes % 60
            slot["endTime"] = f"{new_h:02d}:{new_m:02d}"
    
    return {"ok": True, "message": f"Session extended by {minutes} minutes"}


@app.post("/tutor/sessions/{session_id}/change-mode")
async def change_session_mode(session_id: str, request: Request):
    """POST /sessions/tutor/sessions/{id}/change-mode - Change session mode"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    body = await request.json()
    new_mode = body.get("mode", "online")
    new_location = body.get("location", "")
    
    print(f"[sessions] POST /tutor/sessions/{session_id}/change-mode to {new_mode} for tutor_id={tutor_id}")
    
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session.get("tutorId") != tutor_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    # Update mode in slots
    slots = session.get("slots", [])
    for slot in slots:
        slot["mode"] = new_mode
        slot["location"] = new_location if new_mode == "offline" else None
    
    return {"ok": True, "message": f"Session mode changed to {new_mode}"}


@app.post("/tutor/sessions/{session_id}/notes")
async def save_session_notes(session_id: str, request: Request):
    """POST /sessions/tutor/sessions/{id}/notes - Save session notes"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    body = await request.json()
    notes = body.get("notes", "")
    
    print(f"[sessions] POST /tutor/sessions/{session_id}/notes for tutor_id={tutor_id}")
    
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session.get("tutorId") != tutor_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    session["notes"] = notes
    
    return {"ok": True, "message": "Notes saved"}


@app.put("/{session_id}/status")
async def update_session_status(session_id: str, request: Request):
    """PUT /sessions/{id}/status - Update session status (end session)"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    body = await request.json()
    new_status = body.get("status", "past")
    
    print(f"[sessions] PUT /{session_id}/status to {new_status} for tutor_id={tutor_id}")
    
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    if session.get("tutorId") != tutor_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    session["status"] = new_status
    if new_status == "past":
        session["endedAt"] = datetime.utcnow().isoformat() + "Z"
    
    return {"ok": True, "message": f"Session status updated to {new_status}"}


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