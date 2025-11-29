import base64
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import jwt
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

app = FastAPI(title="Tutors service", version="1.0.0")

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1,http://192.168.56.1:5173,http://172.20.95.15:5173,http://192.168.118.1:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o],
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UpdateProfile(BaseModel):
    fullName: Optional[str] = None
    phone: Optional[str] = None
    major: Optional[str] = None
    bio: Optional[str] = None
    languages: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    courses: Optional[List[str]] = None
    teachingModes: Optional[List[str]] = None


class SessionAction(BaseModel):
    sessionId: str
    action: str  # "accept", "reject", "cancel", "complete"
    reason: Optional[str] = None


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
    role = payload.get("role")
    if role != "TUTOR":
        raise HTTPException(status_code=403, detail="forbidden")
    return payload


def format_phone(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("0"):
        digits = "84" + digits[1:]
    if not digits.startswith("+"):
        digits = "+" + digits
    chunks = [digits[:3]]
    rest = digits[3:]
    while rest:
        chunks.append(rest[:3])
        rest = rest[3:]
    return " ".join(chunks)


def iso(days_from_now: int, hour: int = 9) -> str:
    return (
        datetime.utcnow() + timedelta(days=days_from_now)
    ).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat() + "Z"


# In-memory tutor data
TUTORS: Dict[str, Dict[str, object]] = {
    "tut-001": {
        "me": {
            "id": "tut-001",
            "fullName": "Perfect Cell",
            "email": "tutor@hcmut.edu.vn",
            "tutorId": "2350000",
            "major": "Antagonist",
            "phone": "+84 999 888 777",
            "avatarUrl": None,
            "bio": "Passionate about teaching AI and Machine Learning.",
            "languages": ["English", "Vietnamese"],
            "skills": ["Programming", "Algorithms", "Data Structures"],
            "courses": ["Data Structures", "Databases", "Algorithm Design"],
            "teachingModes": ["in-person", "online"],
        },
        "stats": {
            "totalSessions": 24,
            "totalStudents": 45,
            "hoursTeaching": 120,
            "avgRating": 4.8,
        },
        # Sessions for management page
        "pendingRequests": [
            {
                "id": "req-1",
                "studentId": "stu-001",
                "studentName": "Alex Student",
                "studentEmail": "student@hcmut.edu.vn",
                "courseCode": "CO3005",
                "courseTitle": "Software Engineering",
                "requestedAt": iso(-2, 10),
                "preferredMode": "Online",
                "preferredDay": "MON",
                "preferredTime": "09:00-11:00",
                "message": "I need help with design patterns.",
                "status": "PENDING",
            },
            {
                "id": "req-2",
                "studentId": "stu-002",
                "studentName": "Jane Doe",
                "studentEmail": "jane@hcmut.edu.vn",
                "courseCode": "CO1005",
                "courseTitle": "Introduction to Computing",
                "requestedAt": iso(-1, 14),
                "preferredMode": "On campus",
                "preferredDay": "WED",
                "preferredTime": "14:00-16:00",
                "message": "Need tutoring for upcoming exam.",
                "status": "PENDING",
            },
        ],
        "upcomingSessions": [
            {
                "id": "sess-t1",
                "studentId": "stu-003",
                "studentName": "John Smith",
                "studentEmail": "john@hcmut.edu.vn",
                "courseCode": "CO2013",
                "courseTitle": "Operating Systems",
                "scheduledAt": iso(1, 9),
                "mode": "Online",
                "dayOfWeek": "TUE",
                "start": "09:00",
                "end": "11:00",
                "status": "CONFIRMED",
            },
            {
                "id": "sess-t2",
                "studentId": "stu-001",
                "studentName": "Alex Student",
                "studentEmail": "student@hcmut.edu.vn",
                "courseCode": "CO3005",
                "courseTitle": "Software Engineering",
                "scheduledAt": iso(3, 14),
                "mode": "On campus",
                "dayOfWeek": "THU",
                "start": "14:00",
                "end": "16:00",
                "status": "CONFIRMED",
            },
        ],
        "completedSessions": [
            {
                "id": "comp-1",
                "studentId": "stu-001",
                "studentName": "Alex Student",
                "courseCode": "CO3005",
                "courseTitle": "Software Engineering Workshop",
                "completedAt": iso(-7, 11),
                "mode": "On campus",
                "rating": 4.9,
                "feedback": "Great session! Very helpful.",
            },
            {
                "id": "comp-2",
                "studentId": "stu-002",
                "studentName": "Jane Doe",
                "courseCode": "CO1005",
                "courseTitle": "Intro to Computing Lab",
                "completedAt": iso(-3, 15),
                "mode": "Online",
                "rating": 4.7,
                "feedback": "Explained concepts clearly.",
            },
        ],
        "students": [
            {
                "id": "stu-001",
                "name": "Alex Student",
                "email": "student@hcmut.edu.vn",
                "enrolledCourses": ["CO3005", "CO2013"],
                "sessionsCompleted": 5,
                "lastSession": iso(-7, 11),
            },
            {
                "id": "stu-002",
                "name": "Jane Doe",
                "email": "jane@hcmut.edu.vn",
                "enrolledCourses": ["CO1005"],
                "sessionsCompleted": 3,
                "lastSession": iso(-3, 15),
            },
            {
                "id": "stu-003",
                "name": "John Smith",
                "email": "john@hcmut.edu.vn",
                "enrolledCourses": ["CO2013", "CO3083"],
                "sessionsCompleted": 8,
                "lastSession": iso(-1, 10),
            },
        ],
    }
}


def ensure_tutor(tutor_id: str) -> Dict[str, object]:
    if tutor_id not in TUTORS:
        TUTORS[tutor_id] = {
            "me": {
                "id": tutor_id,
                "fullName": "Tutor",
                "email": f"{tutor_id}@hcmut.edu.vn",
                "tutorId": tutor_id,
                "major": "Undeclared",
                "phone": "",
                "avatarUrl": None,
                "bio": "",
                "languages": [],
                "skills": [],
                "courses": [],
                "teachingModes": [],
            },
            "stats": {"totalSessions": 0, "totalStudents": 0, "hoursTeaching": 0, "avgRating": 0},
            "pendingRequests": [],
            "upcomingSessions": [],
            "completedSessions": [],
            "students": [],
        }
    return TUTORS[tutor_id]


@app.get("/health")
async def health():
    return {"ok": True, "svc": "tutors"}


# ==================== PROFILE ENDPOINTS ====================

@app.get("/profile")
async def get_profile(request: Request):
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /profile for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    return {
        "ok": True,
        "tutor": data["me"],
        "stats": data["stats"],
    }


@app.put("/profile")
async def update_profile(body: UpdateProfile, request: Request):
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] PUT /profile for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    me = data["me"]

    if body.fullName is not None:
        me["fullName"] = body.fullName.strip()
    if body.phone is not None:
        me["phone"] = format_phone(body.phone.strip()) if body.phone else ""
    if body.major is not None:
        me["major"] = body.major.strip()
    if body.bio is not None:
        me["bio"] = body.bio.strip()
    if body.languages is not None:
        me["languages"] = body.languages
    if body.skills is not None:
        me["skills"] = body.skills
    if body.courses is not None:
        me["courses"] = body.courses
    if body.teachingModes is not None:
        me["teachingModes"] = body.teachingModes

    return {"ok": True, "tutor": me}


@app.post("/profile/avatar")
async def update_avatar(request: Request, file: UploadFile = File(None)):
    payload = require_tutor(request)
    if not file:
        raise HTTPException(status_code=400, detail="file required")
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /profile/avatar for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    content = await file.read()
    encoded = base64.b64encode(content).decode("ascii")
    mime = file.content_type or "image/png"
    data["me"]["avatarUrl"] = f"data:{mime};base64,{encoded}"
    return {"ok": True, "avatarUrl": data["me"]["avatarUrl"]}


@app.delete("/profile/avatar")
async def delete_avatar(request: Request):
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] DELETE /profile/avatar for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    data["me"]["avatarUrl"] = None
    return {"ok": True}


# ==================== MANAGEMENT ENDPOINTS ====================

@app.get("/dashboard")
async def get_dashboard(request: Request):
    """Main dashboard data for tutor management page"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /dashboard for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    return {
        "ok": True,
        "tutor": data["me"],
        "stats": data["stats"],
        "pendingRequests": data.get("pendingRequests", []),
        "upcomingSessions": data.get("upcomingSessions", []),
        "completedSessions": data.get("completedSessions", []),
        "students": data.get("students", []),
    }


@app.get("/requests")
async def get_pending_requests(request: Request):
    """Get pending session requests"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /requests for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    return {
        "ok": True,
        "requests": data.get("pendingRequests", []),
    }


@app.post("/requests/{request_id}/accept")
async def accept_request(request_id: str, request: Request):
    """Accept a pending session request"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /requests/{request_id}/accept for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    pending = data.get("pendingRequests", [])
    req = next((r for r in pending if r["id"] == request_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="request not found")
    
    # Move to upcoming sessions
    new_session = {
        "id": f"sess-{request_id}",
        "studentId": req["studentId"],
        "studentName": req["studentName"],
        "studentEmail": req["studentEmail"],
        "courseCode": req["courseCode"],
        "courseTitle": req["courseTitle"],
        "scheduledAt": iso(2, 9),
        "mode": req["preferredMode"],
        "dayOfWeek": req["preferredDay"],
        "start": req["preferredTime"].split("-")[0] if "-" in req["preferredTime"] else "09:00",
        "end": req["preferredTime"].split("-")[1] if "-" in req["preferredTime"] else "11:00",
        "status": "CONFIRMED",
    }
    data.setdefault("upcomingSessions", []).append(new_session)
    
    # Remove from pending
    data["pendingRequests"] = [r for r in pending if r["id"] != request_id]
    
    return {"ok": True, "session": new_session}


@app.post("/requests/{request_id}/reject")
async def reject_request(request_id: str, request: Request):
    """Reject a pending session request"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /requests/{request_id}/reject for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    pending = data.get("pendingRequests", [])
    req = next((r for r in pending if r["id"] == request_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="request not found")
    
    # Remove from pending
    data["pendingRequests"] = [r for r in pending if r["id"] != request_id]
    
    return {"ok": True}


@app.get("/sessions/upcoming")
async def get_upcoming_sessions(request: Request):
    """Get upcoming confirmed sessions"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /sessions/upcoming for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    return {
        "ok": True,
        "sessions": data.get("upcomingSessions", []),
    }


@app.get("/sessions/completed")
async def get_completed_sessions(request: Request):
    """Get completed sessions history"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /sessions/completed for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    return {
        "ok": True,
        "sessions": data.get("completedSessions", []),
    }


@app.post("/sessions/{session_id}/cancel")
async def cancel_session(session_id: str, request: Request):
    """Cancel an upcoming session"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /sessions/{session_id}/cancel for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    upcoming = data.get("upcomingSessions", [])
    session = next((s for s in upcoming if s["id"] == session_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    # Remove from upcoming
    data["upcomingSessions"] = [s for s in upcoming if s["id"] != session_id]
    
    return {"ok": True}


@app.post("/sessions/{session_id}/complete")
async def complete_session(session_id: str, request: Request):
    """Mark a session as completed"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /sessions/{session_id}/complete for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    upcoming = data.get("upcomingSessions", [])
    session = next((s for s in upcoming if s["id"] == session_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    
    # Move to completed
    completed_session = {
        "id": session["id"],
        "studentId": session["studentId"],
        "studentName": session["studentName"],
        "courseCode": session["courseCode"],
        "courseTitle": session["courseTitle"],
        "completedAt": datetime.utcnow().isoformat() + "Z",
        "mode": session["mode"],
        "rating": None,
        "feedback": None,
    }
    data.setdefault("completedSessions", []).insert(0, completed_session)
    
    # Remove from upcoming
    data["upcomingSessions"] = [s for s in upcoming if s["id"] != session_id]
    
    # Update stats
    data["stats"]["totalSessions"] = data["stats"].get("totalSessions", 0) + 1
    data["stats"]["hoursTeaching"] = data["stats"].get("hoursTeaching", 0) + 2
    
    return {"ok": True, "session": completed_session}


@app.get("/students")
async def get_students(request: Request):
    """Get list of students tutored"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /students for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    return {
        "ok": True,
        "students": data.get("students", []),
    }


@app.get("/students/{student_id}")
async def get_student_detail(student_id: str, request: Request):
    """Get details of a specific student"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /students/{student_id} for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    student = next((s for s in data.get("students", []) if s["id"] == student_id), None)
    if not student:
        raise HTTPException(status_code=404, detail="student not found")
    
    # Get sessions with this student
    completed = [s for s in data.get("completedSessions", []) if s.get("studentId") == student_id]
    upcoming = [s for s in data.get("upcomingSessions", []) if s.get("studentId") == student_id]
    
    return {
        "ok": True,
        "student": student,
        "completedSessions": completed,
        "upcomingSessions": upcoming,
    }


# ==================== AVAILABILITY MANAGEMENT ENDPOINTS ====================

@app.get("/availability")
async def get_availability(request: Request):
    """Get tutor's availability slots for the current week"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /availability for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    # Initialize availability if not exists
    if "availability" not in data:
        data["availability"] = {
            "slots": [
                {
                    "id": "slot-1",
                    "day": "Monday",
                    "date": None,
                    "startTime": "09:00",
                    "duration": 60,
                    "mode": "online",
                    "location": None,
                    "capacity": 1,
                    "leadTime": 24,
                    "cancelWindow": 12,
                    "status": "published",
                    "recurrence": "weekly",
                    "booked": False,
                },
                {
                    "id": "slot-2",
                    "day": "Wednesday",
                    "date": None,
                    "startTime": "14:00",
                    "duration": 60,
                    "mode": "offline",
                    "location": "Room B1-101",
                    "capacity": 2,
                    "leadTime": 24,
                    "cancelWindow": 12,
                    "status": "unpublished",
                    "recurrence": "weekly",
                    "booked": False,
                },
                {
                    "id": "slot-3",
                    "day": "Friday",
                    "date": None,
                    "startTime": "10:00",
                    "duration": 60,
                    "mode": "online",
                    "location": None,
                    "capacity": 1,
                    "leadTime": 48,
                    "cancelWindow": 24,
                    "status": "published",
                    "recurrence": "weekly",
                    "booked": False,
                },
            ],
            "exceptions": [],
            "policy": {
                "allowedHoursStart": 7,
                "allowedHoursEnd": 22,
                "maxSlotsPerDay": 8,
                "maxSlotsPerWeek": 30,
            },
        }
    
    return {
        "ok": True,
        "slots": data["availability"]["slots"],
        "exceptions": data["availability"]["exceptions"],
        "policy": data["availability"]["policy"],
        "weekUsage": len([s for s in data["availability"]["slots"] if s["status"] == "published"]),
    }


@app.post("/availability/slots")
async def add_slot(request: Request):
    """Add a new availability slot"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /availability/slots for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    body = await request.json()
    
    if "availability" not in data:
        data["availability"] = {"slots": [], "exceptions": [], "policy": {}}
    
    new_slot = {
        "id": f"slot-{len(data['availability']['slots']) + 1}-{datetime.utcnow().timestamp():.0f}",
        "day": body.get("day"),
        "date": body.get("date"),
        "startTime": body.get("startTime"),
        "duration": int(body.get("duration", 60)),
        "mode": body.get("mode", "online"),
        "location": body.get("location"),
        "capacity": int(body.get("capacity", 1)),
        "leadTime": int(body.get("leadTime", 24)),
        "cancelWindow": int(body.get("cancelWindow", 12)),
        "status": "unpublished",
        "recurrence": body.get("recurrence", "once"),
        "booked": False,
    }
    
    data["availability"]["slots"].append(new_slot)
    
    return {"ok": True, "slot": new_slot}


@app.put("/availability/slots/{slot_id}")
async def update_slot(slot_id: str, request: Request):
    """Update an availability slot"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] PUT /availability/slots/{slot_id} for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    if "availability" not in data:
        raise HTTPException(status_code=404, detail="slot not found")
    
    slot = next((s for s in data["availability"]["slots"] if s["id"] == slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    body = await request.json()
    
    for key in ["day", "date", "startTime", "duration", "mode", "location", "capacity", "leadTime", "cancelWindow", "recurrence"]:
        if key in body:
            slot[key] = body[key]
    
    return {"ok": True, "slot": slot}


@app.delete("/availability/slots/{slot_id}")
async def delete_slot(slot_id: str, request: Request):
    """Delete an availability slot"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] DELETE /availability/slots/{slot_id} for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    if "availability" not in data:
        raise HTTPException(status_code=404, detail="slot not found")
    
    slots = data["availability"]["slots"]
    slot = next((s for s in slots if s["id"] == slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    if slot.get("booked"):
        raise HTTPException(status_code=400, detail="cannot delete booked slot")
    
    data["availability"]["slots"] = [s for s in slots if s["id"] != slot_id]
    
    return {"ok": True}


@app.post("/availability/slots/{slot_id}/publish")
async def publish_slot(slot_id: str, request: Request):
    """Publish an availability slot"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /availability/slots/{slot_id}/publish for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    if "availability" not in data:
        raise HTTPException(status_code=404, detail="slot not found")
    
    slot = next((s for s in data["availability"]["slots"] if s["id"] == slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="slot not found")
    
    slot["status"] = "published"
    
    return {"ok": True, "slot": slot}


@app.post("/availability/publish-all")
async def publish_all_slots(request: Request):
    """Publish all unpublished slots"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /availability/publish-all for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    if "availability" not in data:
        return {"ok": True, "count": 0}
    
    count = 0
    for slot in data["availability"]["slots"]:
        if slot["status"] == "unpublished":
            slot["status"] = "published"
            count += 1
    
    return {"ok": True, "count": count}


@app.post("/availability/exceptions")
async def add_exception(request: Request):
    """Add a blackout date/exception"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /availability/exceptions for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    body = await request.json()
    
    if "availability" not in data:
        data["availability"] = {"slots": [], "exceptions": [], "policy": {}}
    
    new_exception = {
        "id": f"exc-{len(data['availability']['exceptions']) + 1}-{datetime.utcnow().timestamp():.0f}",
        "startDate": body.get("startDate"),
        "endDate": body.get("endDate"),
        "startTime": body.get("startTime"),
        "endTime": body.get("endTime"),
        "reason": body.get("reason", ""),
    }
    
    data["availability"]["exceptions"].append(new_exception)
    
    return {"ok": True, "exception": new_exception}


@app.delete("/availability/exceptions/{exception_id}")
async def delete_exception(exception_id: str, request: Request):
    """Delete an exception"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] DELETE /availability/exceptions/{exception_id} for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    if "availability" not in data:
        raise HTTPException(status_code=404, detail="exception not found")
    
    exceptions = data["availability"]["exceptions"]
    exc = next((e for e in exceptions if e["id"] == exception_id), None)
    if not exc:
        raise HTTPException(status_code=404, detail="exception not found")
    
    data["availability"]["exceptions"] = [e for e in exceptions if e["id"] != exception_id]
    
    return {"ok": True}


@app.delete("/availability/bulk-delete-unpublished")
async def bulk_delete_unpublished(request: Request):
    """Delete all unpublished slots"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] DELETE /availability/bulk-delete-unpublished for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    
    if "availability" not in data:
        return {"ok": True, "count": 0}
    
    before_count = len(data["availability"]["slots"])
    data["availability"]["slots"] = [s for s in data["availability"]["slots"] if s["status"] != "unpublished"]
    deleted_count = before_count - len(data["availability"]["slots"])
    
    return {"ok": True, "count": deleted_count}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "4019")),
        reload=False,
    )

