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

app = FastAPI(title="Students service", version="1.0.0")

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1,http://172.20.95.15:5173",
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


def decode_token(request: Request) -> Dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="unauthorized") from exc


def require_student(request: Request) -> Dict:
    payload = decode_token(request)
    role = payload.get("role")
    if role != "STUDENT":
        raise HTTPException(status_code=403, detail="forbidden")
    return payload


def iso(days_from_now: int, hour: int = 9) -> str:
    return (
        datetime.utcnow() + timedelta(days=days_from_now)
    ).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat() + "Z"


def format_phone(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("0"):
        digits = "84" + digits[1:]
    if not digits.startswith("+"):
        digits = "+" + digits
    # format as +84 123 456 789
    chunks = [digits[:3]]
    rest = digits[3:]
    while rest:
        chunks.append(rest[:3])
        rest = rest[3:]
    return " ".join(chunks)

def build_sessions() -> List[Dict[str, object]]:
    tutors = [
        "Nguyen Tuan Anh",
        "Tran Hong Tai",
        "Tran Tuan Anh",
        "Tran Ngoc Bao Duy",
        "Vo Thanh Hung",
        "Tran Huy",
        "Nguyen An Khuong",
        "Nguyen Hua Phung",
        "Le Thanh Sach",
        "Tran Giang Son",
        "Vuong Ba Thinh",
        "Luong Minh Hien",
        "Vu Van Tien",
        "Le Binh Dang",
        "Tran Nguyen Minh Duy",
        "Nguyen Quang Duc",
        "Mai Xuan Toan",
        "Thi Khac Quan",
        "Nguyen Quoc Minh",
        "Duong Duc Tin",
        "Nguyen Duc Dung",
        "Le Hong Trang",
    ]

    subjects = [
        ("CO1005", "Introduction to Computing"),
        ("CO1023", "Digital Systems"),
        ("CO1007", "Programming Fundamentals"),
        ("CO2003", "Data Structures and Algorithms"),
        ("CO2011", "Computer Architecture"),
        ("CO2013", "Operating Systems"),
        ("CO2017", "Advanced Programming"),
        ("CO2001", "Computer Networks"),
        ("CO3005", "Software Engineering"),
        ("CO3001", "Probability and Statistics"),
        ("CO3011", "Compiler Construction"),
        ("CO3013", "Software Testing"),
        ("CO3001A", "Web Programming"),
        ("CO3041", "Computer Graphics"),
        ("CO3047", "Computer Vision"),
        ("CO3045", "Mobile Development"),
        ("CO3033", "Information Security"),
        ("CO3059", "Cryptography"),
        ("CO3061", "Distributed Systems"),
        ("CO3083", "Parallel Computing"),
        ("CO3115", "Machine Learning"),
        ("CO3089", "NLP"),
    ]

    days = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
    slots = [("07:00", "09:00"), ("09:00", "11:00"), ("13:00", "15:00"), ("15:00", "17:00"), ("18:00", "20:00")]
    modes = ["Online", "On campus"]

    sessions: List[Dict[str, object]] = []
    idx = 0
    for subj_code, subj_title in subjects:
        for day in days:
            for start, end in slots:
                if len(sessions) >= 90:
                    return sessions
                tutor = tutors[idx % len(tutors)]
                mode = modes[(idx + len(day)) % 2]
                rating = 4.0 + (idx % 10) * 0.1
                sessions.append(
                    {
                        "id": f"sess-{idx+1}",
                        "code": subj_code,
                        "title": subj_title,
                        "tutor": tutor,
                        "mode": mode,
                        "start": start,
                        "end": end,
                        "rating": round(rating, 1),
                        "dayOfWeek": day,
                    }
                )
                idx += 1
    return sessions


SESSIONS: List[Dict[str, object]] = build_sessions()


def january_date(day: int, hour: int = 9) -> str:
    now = datetime.utcnow()
    year = now.year if now.month <= 1 else now.year + 1
    safe_day = min(day, 28)
    return datetime(year, 1, safe_day, hour, 0, 0).isoformat() + "Z"


def now_iso(hour: Optional[int] = None) -> str:
    now = datetime.utcnow()
    if hour is not None:
        now = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    return now.isoformat() + "Z"


STUDENTS: Dict[str, Dict[str, object]] = {
    "stu-001": {
        "me": {
            "id": "stu-001",
            "fullName": "Alex Student",
            "email": "student@hcmut.edu.vn",
            "studentId": "2352259",
            "major": "Computer Science",
            "phone": "+84 900 111 222",
            "avatarUrl": None,
            "bio": "Curious learner exploring tutoring sessions.",
        },
        "preferences": ["Online", "On campus"],
        "history": {
            "attendance": [
                {
                    "id": "att1",
                    "date": iso(-7, 10),
                    "courseCode": "CS202",
                    "courseTitle": "Data Structures",
                    "mode": "On campus",
                },
                {
                    "id": "att2",
                    "date": iso(-2, 15),
                    "courseCode": "CS404",
                    "courseTitle": "Operating Systems",
                    "mode": "Online",
                },
            ],
            "bookings": [
                {
                    "id": "bk1",
                    "date": now_iso(),
                    "courseCode": "CS303",
                    "courseTitle": "Algorithms",
                    "mode": "On campus",
                }
            ],
        },
        "bookedSessions": [
            {
                "id": "bs1",
                "sessionId": "sess-1",
                "code": "CS101",
                "title": "Intro to Programming",
                "addedAt": now_iso(),
                "scheduledAt": january_date(12, 9),
                "startDate": january_date(12, 9),
                "endDate": january_date(26, 11),
            },
            {
                "id": "bs2",
                "sessionId": "sess-2",
                "code": "CS202",
                "title": "Data Structures",
                "addedAt": now_iso(),
                "scheduledAt": january_date(15, 14),
                "startDate": january_date(15, 14),
                "endDate": january_date(30, 16),
            },
        ],
        "progress": [
            {
                "id": "p1",
                "sessionId": "sess-1",
                "code": "CS101",
                "title": "Intro to Programming",
                "startDate": january_date(12, 9),
                "endDate": january_date(26, 11),
            },
            {
                "id": "p2",
                "sessionId": "sess-2",
                "code": "CS202",
                "title": "Data Structures",
                "startDate": january_date(15, 14),
                "endDate": january_date(30, 16),
            },
        ],
        "stats": {"hoursStudied": 42.5, "sessionsAttended": 12},
        "announcements": [
            "Tutoring labs close early on Fridays (17:00).",
            "Bring your student ID to on-campus sessions.",
        ],
    }
}


CONVERSATIONS: Dict[str, Dict[str, object]] = {
    "group-cs101": {
        "id": "group-cs101",
        "title": "CS101 - Intro group",
        "type": "GROUP",
        "members": ["stu-001", "tutor-1"],
        "messages": [
            {
                "id": "m1",
                "content": "Welcome to CS101!",
                "createdAt": iso(-2, 9),
                "sender": {"id": "tutor-1", "displayName": "Dr. Tran Anh", "role": "TUTOR"},
            },
            {
                "id": "m2",
                "content": "Reminder: bring questions for lab.",
                "createdAt": iso(-1, 12),
                "sender": {"id": "tutor-1", "displayName": "Dr. Tran Anh", "role": "TUTOR"},
            },
        ],
    },
    "direct-support": {
        "id": "direct-support",
        "title": "Support desk",
        "type": "DIRECT",
        "members": ["stu-001", "support"],
        "messages": [
            {
                "id": "m3",
                "content": "Hi, how can we help?",
                "createdAt": iso(-1, 8),
                "sender": {"id": "support", "displayName": "Support", "role": "ADMIN"},
            }
        ],
    },
}


def ensure_student(student_id: str) -> Dict[str, object]:
    if student_id not in STUDENTS:
        STUDENTS[student_id] = {
            "me": {
                "id": student_id,
                "fullName": "Student",
                "email": f"{student_id}@example.edu",
                "studentId": student_id,
                "major": "Undeclared",
                "phone": "",
                "avatarUrl": None,
                "bio": "",
            },
            "preferences": [],
            "history": {"attendance": [], "bookings": []},
            "bookedSessions": [],
            "progress": [],
            "stats": {"hoursStudied": 0, "sessionsAttended": 0},
            "announcements": [],
        }
    return STUDENTS[student_id]


@app.get("/health")
async def health():
    return {"ok": True, "svc": "students"}


@app.get("/sessions/browse")
async def browse_sessions(request: Request, payload=Depends(require_student)):
    _ = payload
    q = request.query_params
    code = (q.get("code") or "").strip().upper()
    from_hour = int(q.get("fromHour") or 0)
    to_hour = int(q.get("toHour") or 24)
    allow_online = (q.get("online") or "true").lower() != "false"
    allow_oncampus = (q.get("onCampus") or "true").lower() != "false"
    days_raw = (q.get("days") or "").split(",")
    days = [d.strip().upper() for d in days_raw if d.strip()]

    filtered: List[Dict[str, object]] = []
    for c in SESSIONS:
        if code and code not in str(c["code"]).upper():
            continue
        start_h = int(str(c["start"]).split(":")[0])
        end_h = int(str(c["end"]).split(":")[0])
        if start_h < from_hour or end_h > to_hour:
            continue
        if c["mode"] == "Online" and not allow_online:
            continue
        if c["mode"] == "On campus" and not allow_oncampus:
            continue
        if days and c["dayOfWeek"] not in days:
            continue
        filtered.append(c)

    return {"ok": True, "sessions": filtered}


@app.get("/courses/browse")
async def browse_courses(request: Request, payload=Depends(require_student)):
    return await browse_sessions(request, payload)


def sidebar_for(student_id: str) -> Dict[str, object]:
    me = ensure_student(student_id)["me"]
    groups: List[Dict[str, object]] = []
    directs: List[Dict[str, object]] = []
    for conv in CONVERSATIONS.values():
        if student_id not in conv["members"]:
            continue
        messages = conv.get("messages", [])
        last = messages[-1]["content"] if messages else "No messages yet"
        entry = {"id": conv["id"], "title": conv["title"], "last": last, "unreadCount": 0}
        if conv["type"] == "GROUP":
            groups.append(entry)
        else:
            directs.append(entry)
    return {"me": me, "groups": groups, "directs": directs}


@app.get("/messaging/sidebar")
async def messaging_sidebar(payload=Depends(require_student)):
    student_id = payload.get("sub")
    return sidebar_for(student_id)


@app.get("/messaging/conversations/{conv_id}/messages")
async def conversation_messages(conv_id: str, payload=Depends(require_student)):
    student_id = payload.get("sub")
    conv = CONVERSATIONS.get(conv_id)
    if not conv or student_id not in conv["members"]:
        raise HTTPException(status_code=403, detail="forbidden")
    return {"messages": conv.get("messages", [])}


@app.post("/messaging/conversations/{conv_id}/messages")
async def post_message(conv_id: str, request: Request, payload=Depends(require_student)):
    student_id = payload.get("sub")
    conv = CONVERSATIONS.get(conv_id)
    if not conv or student_id not in conv["members"]:
        raise HTTPException(status_code=403, detail="forbidden")

    body = await request.form()
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content required")

    msg_id = f"m{len(conv.get('messages', [])) + 1}"
    msg = {
        "id": msg_id,
        "content": content[:2000],
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "sender": {
            "id": student_id,
            "displayName": ensure_student(student_id)["me"]["fullName"],
            "role": "STUDENT",
        },
    }
    conv.setdefault("messages", []).append(msg)
    return {"message": msg}


@app.post("/register")
async def register_sessions(request: Request, payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    body = await request.json()
    ids = body.get("sessionIds") or []
    now = now_iso()
    added = []
    for sid in ids:
        course = next((c for c in SESSIONS if c["id"] == sid), None)
        if not course:
            continue
        already = any(bs.get("sessionId") == sid for bs in data.get("bookedSessions", []))
        if already:
            continue
        start_hour = int(str(course["start"]).split(":")[0])
        end_hour = int(str(course["end"]).split(":")[0])
        entry = {
            "id": f"reg-{sid}-{len(data.get('bookedSessions', []))}",
            "sessionId": sid,
            "code": course["code"],
            "title": course["title"],
            "addedAt": now_iso(),
            "scheduledAt": january_date(10, start_hour),
            "startDate": january_date(10, start_hour),
            "endDate": january_date(25, end_hour),
        }
        data.setdefault("bookedSessions", []).append(entry)
        data.setdefault("progress", []).append(
            {
                "id": entry["id"],
                "sessionId": sid,
                "code": course["code"],
                "title": course["title"],
                "startDate": entry["startDate"],
                "endDate": entry["endDate"],
            }
        )
        data.setdefault("history", {}).setdefault("bookings", []).append(
            {
                "id": entry["id"],
                "date": now_iso(),
                "courseCode": course["code"],
                "courseTitle": course["title"],
                "mode": course["mode"],
                "status": "SCHEDULED",
            }
        )
        added.append(entry)
    return {"ok": True, "added": added}

# alias to keep compatibility
@app.post("/students/register")
async def register_sessions_alias(request: Request, payload=Depends(require_student)):
    return await register_sessions(request, payload)


@app.get("/profile")
async def profile(payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    # compute simple progress from attendance
    attendance_codes = {h["courseCode"] for h in data["history"].get("attendance", [])}
    for p in data.get("progress", []):
        if p.get("code") in attendance_codes:
            p["percent"] = 80
    for p in data.get("progress", []):
        p.setdefault("percent", 20)
    # add attendance-only sessions into progress if missing
    existing_codes = {p["code"] for p in data.get("progress", [])}
    for h in data["history"].get("attendance", []):
        if h["courseCode"] not in existing_codes:
            data.setdefault("progress", []).append(
                {
                    "id": f"prog-{h['id']}",
                    "sessionId": h.get("sessionId", h["id"]),
                    "code": h["courseCode"],
                    "title": h["courseTitle"],
                    "startDate": h["date"],
                    "endDate": iso(30, 9),
                    "percent": 80,
                }
            )
    return {
        "ok": True,
        "student": data["me"],
        "stats": data["stats"],
        "preferences": data["preferences"],
        "bookings": data.get("bookedSessions", []),
        "history": data["history"],
        "announcements": data["announcements"],
        "status": "Students service ready",
    }


@app.get("/students/profile")
async def profile_students(payload=Depends(require_student)):
    return await profile(payload)


@app.get("/session/{session_id}")
async def session_detail(session_id: str, payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    session = next((s for s in SESSIONS if s["id"] == session_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="not found")
    # attach status if booked
    status = "AVAILABLE"
    booking_info: Optional[Dict[str, object]] = None
    for b in data.get("bookedSessions", []):
        if b.get("sessionId") == session_id:
            status = "SCHEDULED"
            booking_info = b
    if booking_info:
        merged = {**session, **booking_info}
        merged["originalCode"] = session.get("code")
        merged["originalTitle"] = session.get("title")
        merged["code"] = session.get("code")
        merged["title"] = session.get("title")
        return {"session": merged, "status": status}
    return {"session": session, "status": status}


@app.post("/session/{session_id}/cancel")
async def cancel_session(session_id: str, request: Request, payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    reason = (await request.json()).get("reason", "")
    for b in data.get("bookedSessions", []):
        if b.get("sessionId") == session_id:
            b["status"] = "CANCELLED"
            b["cancelReason"] = reason
    return {"ok": True}


@app.post("/session/{session_id}/reschedule")
async def reschedule_session(session_id: str, request: Request, payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    body = await request.json()
    reason = body.get("reason", "")
    notes = body.get("notes", "")
    new_session_id = body.get("newSessionId")
    booking = next((b for b in data.get("bookedSessions", []) if b.get("sessionId") == session_id), None)
    if not booking:
        raise HTTPException(status_code=404, detail="booking not found")

    booking["rescheduleReason"] = reason
    booking["rescheduleNotes"] = notes

    if new_session_id:
        new_session = next((s for s in SESSIONS if s["id"] == new_session_id), None)
        if not new_session:
            raise HTTPException(status_code=404, detail="new session not found")
        start_hour = int(str(new_session["start"]).split(":")[0])
        end_hour = int(str(new_session["end"]).split(":")[0])
        booking["sessionId"] = new_session["id"]
        booking["code"] = new_session["code"]
        booking["title"] = new_session["title"]
        booking["scheduledAt"] = january_date(18, start_hour)
        booking["startDate"] = booking["scheduledAt"]
        booking["endDate"] = january_date(33, end_hour)
        booking["mode"] = new_session.get("mode")
        booking["tutor"] = new_session.get("tutor")
        booking["status"] = "RESCHEDULED"
        # keep progress in sync with the new session choice
        progress_entries = data.setdefault("progress", [])
        found_progress = False
        for p in progress_entries:
            if p.get("sessionId") == session_id:
                p["sessionId"] = new_session["id"]
                p["code"] = new_session["code"]
                p["title"] = new_session["title"]
                p["startDate"] = booking["startDate"]
                p["endDate"] = booking["endDate"]
                p["percent"] = p.get("percent", 20)
                found_progress = True
        if not found_progress:
            progress_entries.append(
                {
                    "id": f"prog-{booking.get('id', new_session['id'])}",
                    "sessionId": new_session["id"],
                    "code": new_session["code"],
                    "title": new_session["title"],
                    "startDate": booking["startDate"],
                    "endDate": booking["endDate"],
                    "percent": 20,
                }
            )
        # update booking history entry if one exists
        history_bookings = data.setdefault("history", {}).setdefault("bookings", [])
        updated_hist = False
        for h in history_bookings:
            if h.get("id") == booking.get("id"):
                h["courseCode"] = new_session["code"]
                h["courseTitle"] = new_session["title"]
                h["mode"] = new_session.get("mode", h.get("mode"))
                h["date"] = booking["scheduledAt"]
                h["status"] = "RESCHEDULED"
                updated_hist = True
        if not updated_hist:
            history_bookings.append(
                {
                    "id": booking.get("id", f"bk-{new_session['id']}"),
                    "date": booking["scheduledAt"],
                    "courseCode": new_session["code"],
                    "courseTitle": new_session["title"],
                    "mode": new_session.get("mode", "Online"),
                    "status": "RESCHEDULED",
                }
            )
    else:
        booking["status"] = "RESCHEDULED"
    return {"ok": True, "booking": booking}


@app.get("/users/student/profile")
async def student_profile(payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    attendance_codes = {h["courseCode"] for h in data["history"].get("attendance", [])}
    for p in data.get("progress", []):
        if p.get("code") in attendance_codes:
            p["percent"] = 80
    for p in data.get("progress", []):
        p.setdefault("percent", 20)
    existing_codes = {p["code"] for p in data.get("progress", [])}
    for h in data["history"].get("attendance", []):
        if h["courseCode"] not in existing_codes:
            data.setdefault("progress", []).append(
                {
                    "id": f"prog-{h['id']}",
                    "sessionId": h.get("sessionId", h["id"]),
                    "code": h["courseCode"],
                    "title": h["courseTitle"],
                    "startDate": h["date"],
                    "endDate": iso(30, 9),
                    "percent": 80,
                }
            )
    return {
        "me": data["me"],
        "preferences": data["preferences"],
        "history": data["history"],
        "bookedSessions": data.get("bookedSessions", []),
        "progress": data.get("progress", []),
        "stats": data["stats"],
    }


@app.put("/users/student/profile")
async def update_profile(body: UpdateProfile, payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    me = data["me"]  # type: ignore

    if body.fullName:
        me["fullName"] = body.fullName.strip()
    if body.phone is not None:
        me["phone"] = format_phone(body.phone.strip()) if body.phone else ""
    if body.major:
        me["major"] = body.major.strip()
    if body.bio is not None:
        me["bio"] = body.bio.strip()
    if me.get("email"):
        me["email"] = str(me["email"]).strip().lower()

    return {"ok": True, "me": me}

@app.put("/students/profile")
async def update_profile_students(body: UpdateProfile, payload=Depends(require_student)):
    return await update_profile(body, payload)


# gateway strips /students prefix; allow bare /profile for PUT
@app.put("/profile")
async def update_profile_root(body: UpdateProfile, payload=Depends(require_student)):
    return await update_profile(body, payload)


@app.post("/users/student/profile/avatar")
async def update_avatar(avatar: UploadFile = File(...), payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    content = await avatar.read()
    encoded = base64.b64encode(content).decode("ascii")
    mime = avatar.content_type or "image/png"
    data["me"]["avatarUrl"] = f"data:{mime};base64,{encoded}"
    return {"ok": True, "avatarUrl": data["me"]["avatarUrl"]}

@app.post("/students/profile/avatar")
async def update_avatar_students(file: UploadFile = File(None), payload=Depends(require_student)):
    if not file:
        raise HTTPException(status_code=400, detail="file required")
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    content = await file.read()
    encoded = base64.b64encode(content).decode("ascii")
    mime = file.content_type or "image/png"
    data["me"]["avatarUrl"] = f"data:{mime};base64,{encoded}"
    return {"ok": True, "avatarUrl": data["me"]["avatarUrl"]}

@app.get("/students/profile/avatar")
async def get_avatar_students(payload=Depends(require_student)):
    student_id = payload.get("sub")
    data = ensure_student(student_id)
    return {"avatarUrl": data["me"].get("avatarUrl")}

# gateway strips /students prefix; allow bare /profile/avatar
@app.post("/profile/avatar")
async def update_avatar_root(file: UploadFile = File(None), payload=Depends(require_student)):
    return await update_avatar_students(file, payload)

@app.get("/profile/avatar")
async def get_avatar_root(payload=Depends(require_student)):
    return await get_avatar_students(payload)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "4011")),
        reload=False,
    )
