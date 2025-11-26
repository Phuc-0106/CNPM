import os
from datetime import datetime, timedelta
from typing import Dict, List

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

app = FastAPI(title="Sessions service", version="1.0.0")

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1,http://172.20.95.15:5173,http://172.20.95.15",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o],
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def iso(days: int, hour: int) -> str:
    return (
        datetime.utcnow() + timedelta(days=days)
    ).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat() + "Z"


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
                        "status": "SCHEDULED",
                        "start": start,
                        "end": end,
                        "rating": round(rating, 1),
                        "dayOfWeek": day,
                    }
                )
                idx += 1
    return sessions


SESSIONS: List[Dict[str, object]] = build_sessions()


def require_user(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return "stu-001"
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return "stu-001"
    return payload.get("sub", "stu-001")


@app.get("/health")
async def health():
    return {"ok": True, "svc": "sessions"}


@app.get("/student/list")
async def list_sessions(user_id=Depends(require_user)):
    return {"sessions": [s for s in SESSIONS if s["studentId"] == user_id]}


@app.get("/browse")
async def browse_sessions(_user_id=Depends(require_user)):
    return {"ok": True, "sessions": SESSIONS}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "4016")), reload=False)
