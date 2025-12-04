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
            "bookings": [
                {
                    "id": "bk1",
                    "date": now_iso(),
                    "courseCode": "CO2013",
                    "courseTitle": "Operating Systems",
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
   

    return {"ok": True, "sessions": []}





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
