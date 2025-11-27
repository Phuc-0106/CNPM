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


def december_date(day: int, hour: int = 9) -> str:
    now = datetime.utcnow()
    year = now.year if now.month <= 12 else now.year + 1
    return datetime(year, 12, day, hour, 0, 0).isoformat() + "Z"


ATTENDED_SESSIONS: List[Dict[str, object]] = [
    {
        "id": "att-1",
        "sessionId": "sess-5",
        "code": "CO3005",
        "title": "Software Engineering Workshop",
        "tutor": "Dr. Nguyen Lan",
        "mode": "On campus",
        "dayOfWeek": "MON",
        "start": "09:00",
        "end": "11:00",
        "description": "Hands-on recap of agile practices and design reviews.",
        "completedAt": december_date(1, 10),
        "resources": [
            {"id": "lib-resources", "name": "Slides (PDF)", "size": "2.3 MB", "url": "/library/resources/lib-resources/download"},
            {"id": "lib-resources", "name": "Demo source code", "size": "840 KB", "url": "/library/resources/lib-resources/download"},
        ],
        "progress": 100,
        "library": {
            "syllabus": [{"id": "lib-syllabus", "name": "Workshop syllabus", "size": "320 KB", "url": "/library/resources/lib-syllabus/download"}],
            "videos": [{"id": "lib-videos", "name": "Workshop recap videos", "size": "1.2 MB", "url": "/library/resources/lib-videos/download"}],
            "tests": [{"id": "lib-tests", "name": "Practice tests", "size": "540 KB", "url": "/library/resources/lib-tests/download"}],
            "resources": [{"id": "lib-resources", "name": "Extra resources", "size": "450 KB", "url": "/library/resources/lib-resources/download"}],
        },
    },
    {
        "id": "att-2",
        "sessionId": "sess-12",
        "code": "CO3011",
        "title": "Compiler Construction Lab",
        "tutor": "Tran Huy",
        "mode": "Online",
        "dayOfWeek": "TUE",
        "start": "13:00",
        "end": "15:00",
        "description": "Parser and lexer exercises with a mini-compiler.",
        "completedAt": december_date(2, 14),
        "resources": [
            {"id": "lib-resources", "name": "Grammar files", "size": "120 KB", "url": "/library/resources/lib-resources/download"},
            {"id": "lib-resources", "name": "Lab guide", "size": "1.1 MB", "url": "/library/resources/lib-resources/download"},
        ],
        "progress": 100,
        "library": {
            "syllabus": [{"id": "lib-syllabus", "name": "Compiler lab syllabus", "size": "280 KB", "url": "/library/resources/lib-syllabus/download"}],
            "videos": [{"id": "lib-videos", "name": "Lab videos", "size": "1.1 MB", "url": "/library/resources/lib-videos/download"}],
            "tests": [{"id": "lib-tests", "name": "Parser drills", "size": "480 KB", "url": "/library/resources/lib-tests/download"}],
            "resources": [{"id": "lib-resources", "name": "Lab resources", "size": "520 KB", "url": "/library/resources/lib-resources/download"}],
        },
    },
    {
        "id": "att-3",
        "sessionId": "sess-25",
        "code": "CO2013",
        "title": "Operating Systems Review",
        "tutor": "Le Binh Dang",
        "mode": "On campus",
        "dayOfWeek": "WED",
        "start": "15:00",
        "end": "17:00",
        "description": "Kernel scheduling walkthrough with practice questions.",
        "completedAt": december_date(3, 16),
        "resources": [
            {"id": "lib-resources", "name": "Process scheduling notes", "size": "640 KB", "url": "/library/resources/lib-resources/download"},
            {"id": "lib-resources", "name": "Practice questions", "size": "410 KB", "url": "/library/resources/lib-resources/download"},
        ],
        "progress": 100,
        "library": {
            "syllabus": [{"id": "lib-syllabus", "name": "OS review syllabus", "size": "300 KB", "url": "/library/resources/lib-syllabus/download"}],
            "videos": [{"id": "lib-videos", "name": "Review videos", "size": "1.0 MB", "url": "/library/resources/lib-videos/download"}],
            "tests": [{"id": "lib-tests", "name": "OS practice", "size": "420 KB", "url": "/library/resources/lib-tests/download"}],
            "resources": [{"id": "lib-resources", "name": "Reference kit", "size": "400 KB", "url": "/library/resources/lib-resources/download"}],
        },
    },
    {
        "id": "att-4",
        "sessionId": "sess-40",
        "code": "CO3083",
        "title": "Parallel Computing Seminar",
        "tutor": "Mai Xuan Toan",
        "mode": "Online",
        "dayOfWeek": "THU",
        "start": "18:00",
        "end": "20:00",
        "description": "Case studies on parallel patterns and performance.",
        "completedAt": december_date(4, 19),
        "resources": [
            {"id": "lib-resources", "name": "Slide deck", "size": "2.0 MB", "url": "/library/resources/lib-resources/download"},
            {"id": "lib-resources", "name": "Example code", "size": "950 KB", "url": "/library/resources/lib-resources/download"},
        ],
        "progress": 100,
        "library": {
            "syllabus": [{"id": "lib-syllabus", "name": "Parallel seminar syllabus", "size": "310 KB", "url": "/library/resources/lib-syllabus/download"}],
            "videos": [{"id": "lib-videos", "name": "Seminar videos", "size": "1.3 MB", "url": "/library/resources/lib-videos/download"}],
            "tests": [{"id": "lib-tests", "name": "Parallel tests", "size": "560 KB", "url": "/library/resources/lib-tests/download"}],
            "resources": [{"id": "lib-resources", "name": "Example code", "size": "950 KB", "url": "/library/resources/lib-resources/download"}],
        },
    },
]


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


@app.get("/attended")
async def attended_sessions(_user_id=Depends(require_user)):
    return {"ok": True, "attended": ATTENDED_SESSIONS}


@app.get("/attended/{att_id}")
async def attended_detail(att_id: str, _user_id=Depends(require_user)):
    item = next((a for a in ATTENDED_SESSIONS if a["id"] == att_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="not found")
    return {"ok": True, "attended": item}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "4016")), reload=False)
