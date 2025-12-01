import os
import base64
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import httpx
import jwt
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"
SESSIONS_UPSTREAM = os.getenv("SESSIONS_UPSTREAM", "http://localhost:4016")

app = FastAPI(title="Tutors service", version="2.0.0")

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

class UpdateProfile(BaseModel):
    fullName: Optional[str] = None
    phone: Optional[str] = None
    major: Optional[str] = None
    bio: Optional[str] = None
    languages: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    courses: Optional[List[str]] = None
    teachingModes: Optional[List[str]] = None


class BookingCreate(BaseModel):
    sessionId: str
    slotId: Optional[str] = None
    message: Optional[str] = None


class BookingCancel(BaseModel):
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


def require_student(request: Request) -> Dict:
    payload = decode_token(request)
    if payload.get("role") != "STUDENT":
        raise HTTPException(status_code=403, detail="student access required")
    return payload


def require_auth(request: Request) -> Dict:
    return decode_token(request)


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


# ==================== IN-MEMORY DATA ====================

TUTORS: Dict[str, Dict[str, Any]] = {
    "tut-001": {
        "me": {
            "id": "tut-001",
            "fullName": "Perfect Cell",
            "email": "tutor@hcmut.edu.vn",
            "tutorId": "2350000",
            "major": "Computer Science",
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
    },
}

# Bookings storage
BOOKINGS: Dict[str, Dict[str, Any]] = {
    "book-001": {
        "id": "book-001",
        "sessionId": "sess-001",
        "studentId": "stu-001",
        "studentName": "Alex Student",
        "studentEmail": "student@hcmut.edu.vn",
        "slotId": "slot-001",
        "status": "confirmed",  # pending | confirmed | cancelled | completed
        "message": "Looking forward to learning!",
        "createdAt": iso(-5, 10),
        "confirmedAt": iso(-4, 14),
    },
    "book-002": {
        "id": "book-002",
        "sessionId": "sess-001",
        "studentId": "stu-002",
        "studentName": "Jane Doe",
        "studentEmail": "jane@hcmut.edu.vn",
        "slotId": "slot-002",
        "status": "confirmed",
        "message": "Need help with design patterns.",
        "createdAt": iso(-3, 9),
        "confirmedAt": iso(-2, 11),
    },
    "book-003": {
        "id": "book-003",
        "sessionId": "sess-002",
        "studentId": "stu-003",
        "studentName": "John Smith",
        "studentEmail": "john@hcmut.edu.vn",
        "slotId": "slot-003",
        "status": "pending",
        "message": "Want to learn OS concepts.",
        "createdAt": iso(-1, 15),
    },
}


def ensure_tutor(tutor_id: str) -> Dict[str, Any]:
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
        }
    return TUTORS[tutor_id]


# ==================== HEALTH CHECK ====================

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
    return {"ok": True, "tutor": data["me"], "stats": data["stats"]}


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
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /profile/avatar for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)

    if file:
        contents = await file.read()
        b64 = base64.b64encode(contents).decode("utf-8")
        mime = file.content_type or "image/png"
        data["me"]["avatarUrl"] = f"data:{mime};base64,{b64}"

    return {"ok": True, "avatarUrl": data["me"]["avatarUrl"]}


@app.delete("/profile/avatar")
async def delete_avatar(request: Request):
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] DELETE /profile/avatar for tutor_id={tutor_id}")
    data = ensure_tutor(tutor_id)
    data["me"]["avatarUrl"] = None
    return {"ok": True}


# ==================== BOOKING ENDPOINTS (for Students) ====================

@app.post("/bookings")
async def create_booking(body: BookingCreate, request: Request):
    """POST /tutors/bookings - Student creates a booking"""
    payload = require_student(request)
    student_id = payload.get("sub")
    
    # Get student info from JWT token (set during login)
    student_name = payload.get("name")
    student_email = payload.get("email")
    print(student_name, student_email)
    print(f"[tutors] POST /bookings for student_id={student_id}, name={student_name}, session={body.sessionId}")
    
    # Check if already booked
    existing = next(
        (b for b in BOOKINGS.values() 
         if b["studentId"] == student_id 
         and b["sessionId"] == body.sessionId 
         and b["status"] not in ["cancelled", "rejected"]),
        None
    )
    if existing:
        raise HTTPException(status_code=400, detail="already booked this session")
    
    # Call Sessions service to check capacity
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            session_resp = await client.get(
                f"{SESSIONS_UPSTREAM}/internal/{body.sessionId}"
            )
            if session_resp.status_code == 404:
                raise HTTPException(status_code=404, detail="session not found")
            
            session_data = session_resp.json().get("session", {})
            if session_data.get("enrolled", 0) >= session_data.get("capacity", 0):
                raise HTTPException(status_code=400, detail="session is full")
                
    except httpx.RequestError as e:
        print(f"[tutors] Sessions service error: {e}")
        # Continue anyway for demo purposes
    
    # Create booking with PENDING status
    booking_id = f"book-{len(BOOKINGS) + 1:03d}-{datetime.utcnow().timestamp():.0f}"
    
    new_booking = {
        "id": booking_id,
        "sessionId": body.sessionId,
        "studentId": student_id,
        "studentName": student_name,  # From JWT
        "studentEmail": student_email,  # From JWT
        "slotId": body.slotId,
        "status": "pending",  # Initial status is PENDING
        "message": body.message or "",
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
    
    BOOKINGS[booking_id] = new_booking
    print(f"[tutors] Created booking {booking_id} with status=pending")
    
    return {"ok": True, "booking": new_booking}


@app.get("/bookings")
async def get_student_bookings(request: Request):
    """GET /tutors/bookings - Student gets their bookings"""
    payload = require_student(request)
    student_id = payload.get("sub")
    print(f"[tutors] GET /bookings for student_id={student_id}")
    
    student_bookings = [
        b for b in BOOKINGS.values() 
        if b["studentId"] == student_id
    ]
    
    # Sort by createdAt descending
    student_bookings.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    
    return {"ok": True, "bookings": student_bookings}


@app.get("/bookings/{booking_id}")
async def get_booking_detail(booking_id: str, request: Request):
    """GET /tutors/bookings/{id} - Get booking details"""
    payload = require_auth(request)
    user_id = payload.get("sub")
    role = payload.get("role")
    
    booking = BOOKINGS.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="booking not found")
    
    # Students can only see their own bookings
    if role == "STUDENT" and booking["studentId"] != user_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    return {"ok": True, "booking": booking}


@app.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, body: BookingCancel, request: Request):
    """POST /tutors/bookings/{id}/cancel - Student cancels booking"""
    payload = require_student(request)
    student_id = payload.get("sub")
    print(f"[tutors] POST /bookings/{booking_id}/cancel for student_id={student_id}")
    
    booking = BOOKINGS.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="booking not found")
    
    if booking["studentId"] != student_id:
        raise HTTPException(status_code=403, detail="access denied")
    
    if booking["status"] in ["cancelled", "completed"]:
        raise HTTPException(status_code=400, detail="cannot cancel this booking")
    
    # Call sessions service to unenroll
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{SESSIONS_UPSTREAM}/internal/unenroll/{booking['sessionId']}"
            )
    except httpx.RequestError as e:
        print(f"[tutors] Sessions service error: {e}")
    
    booking["status"] = "cancelled"
    booking["cancelledAt"] = datetime.utcnow().isoformat() + "Z"
    booking["cancelReason"] = body.reason or ""
    
    return {"ok": True, "booking": booking}


# ==================== TUTOR BOOKING MANAGEMENT ====================

@app.get("/tutor/bookings")
async def get_tutor_bookings(request: Request):
    """GET /tutors/tutor/bookings - Tutor gets bookings for their sessions"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] GET /tutor/bookings for tutor_id={tutor_id}")
    
    # Get tutor's sessions first, then filter bookings
    # For demo, return all bookings (in real app, filter by tutor's sessions)
    all_bookings = list(BOOKINGS.values())
    all_bookings.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    
    return {"ok": True, "bookings": all_bookings}


@app.post("/tutor/bookings/{booking_id}/confirm")
async def confirm_booking(booking_id: str, request: Request):
    """POST /tutors/tutor/bookings/{id}/confirm - Tutor confirms booking
    
    Status flow: pending → confirmed
    When confirmed, the session is added to student's registered sessions
    """
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /tutor/bookings/{booking_id}/confirm for tutor_id={tutor_id}")
    
    booking = BOOKINGS.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="booking not found")
    
    if booking["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"booking is {booking['status']}, not pending")
    
    # Update booking status to CONFIRMED
    booking["status"] = "confirmed"
    booking["confirmedAt"] = datetime.utcnow().isoformat() + "Z"
    booking["confirmedBy"] = tutor_id
    
    # Call Sessions service to:
    # 1. Increment enrolled count
    # 2. Mark slot as booked (if applicable)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Enroll student in session
            enroll_resp = await client.post(
                f"{SESSIONS_UPSTREAM}/internal/enroll/{booking['sessionId']}"
            )
            if enroll_resp.is_success:
                print(f"[tutors] Enrolled student in session {booking['sessionId']}")
            
            # Mark specific slot as booked if slotId provided
            slot_id = booking.get("slotId")
            if slot_id:
                await client.put(
                    f"{SESSIONS_UPSTREAM}/internal/slots/{slot_id}/book",
                    json={
                        "tutorId": tutor_id,
                        "studentId": booking["studentId"],
                    }
                )
    except httpx.RequestError as e:
        print(f"[tutors] Sessions service error: {e}")
    
    print(f"[tutors] Booking {booking_id} confirmed - student can now see it in Course Registration")
    
    return {"ok": True, "booking": booking}


@app.post("/tutor/bookings/{booking_id}/reject")
async def reject_booking(booking_id: str, request: Request):
    """POST /tutors/tutor/bookings/{id}/reject - Tutor rejects booking
    
    Status flow: pending → rejected
    """
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /tutor/bookings/{booking_id}/reject for tutor_id={tutor_id}")
    
    booking = BOOKINGS.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="booking not found")
    
    if booking["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"booking is {booking['status']}, not pending")
    
    # Update status to REJECTED (not cancelled - that's for student cancellation)
    booking["status"] = "rejected"
    booking["rejectedAt"] = datetime.utcnow().isoformat() + "Z"
    booking["rejectedBy"] = tutor_id
    
    print(f"[tutors] Booking {booking_id} rejected")
    
    return {"ok": True, "booking": booking}


@app.post("/tutor/bookings/{booking_id}/complete")
async def complete_booking(booking_id: str, request: Request):
    """POST /tutors/tutor/bookings/{id}/complete - Tutor marks booking complete"""
    payload = require_tutor(request)
    tutor_id = payload.get("sub")
    print(f"[tutors] POST /tutor/bookings/{booking_id}/complete for tutor_id={tutor_id}")
    
    booking = BOOKINGS.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="booking not found")
    
    if booking["status"] != "confirmed":
        raise HTTPException(status_code=400, detail="booking must be confirmed first")
    
    booking["status"] = "completed"
    booking["completedAt"] = datetime.utcnow().isoformat() + "Z"
    
    # Update tutor stats
    data = ensure_tutor(tutor_id)
    data["stats"]["totalSessions"] = data["stats"].get("totalSessions", 0) + 1
    
    return {"ok": True, "booking": booking}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "4099")),
        reload=False,
    )

