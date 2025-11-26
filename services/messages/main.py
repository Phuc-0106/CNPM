import os
from typing import Dict, List

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

app = FastAPI(title="Messages service", version="1.0.0")

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


CONVERSATIONS: Dict[str, Dict[str, object]] = {
    "group-1": {
        "id": "group-1",
        "title": "CS101 - Intro group",
        "type": "GROUP",
        "members": ["stu-001", "tutor-1"],
        "messages": [
            {
                "id": "m1",
                "content": "Welcome to CS101!",
                "sender": {"id": "tutor-1", "displayName": "Dr. Tran Anh", "role": "TUTOR"},
            },
            {
                "id": "m2",
                "content": "Reminder: bring questions for lab.",
                "sender": {"id": "tutor-1", "displayName": "Dr. Tran Anh", "role": "TUTOR"},
            },
        ],
    },
    "direct-1": {
        "id": "direct-1",
        "title": "Support desk",
        "type": "DIRECT",
        "members": ["stu-001", "support"],
        "messages": [
            {
                "id": "m3",
                "content": "Hi, how can we help?",
                "sender": {"id": "support", "displayName": "Support", "role": "ADMIN"},
            }
        ],
    },
}


def require_user(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="unauthorized") from exc
    uid = payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="unauthorized")
    return uid


@app.get("/health")
async def health():
    return {"ok": True, "svc": "messages"}


@app.get("/sidebar")
async def sidebar(user_id=Depends(require_user)):
    groups: List[Dict[str, object]] = []
    directs: List[Dict[str, object]] = []
    for conv in CONVERSATIONS.values():
        if user_id not in conv["members"]:
            continue
        last = conv["messages"][-1]["content"] if conv["messages"] else "No messages yet"
        entry = {
            "id": conv["id"],
            "title": conv["title"],
            "last": last,
            "unreadCount": 0,
        }
        if conv["type"] == "GROUP":
            groups.append(entry)
        else:
            directs.append(entry)
    return {
        "me": {"id": user_id, "email": "student@hcmut.edu.vn", "displayName": "Student", "avatarUrl": None},
        "groups": groups,
        "directs": directs,
    }


@app.get("/conversations/{conv_id}/messages")
async def messages(conv_id: str, user_id=Depends(require_user)):
    conv = CONVERSATIONS.get(conv_id)
    if not conv or user_id not in conv["members"]:
        raise HTTPException(status_code=403, detail="forbidden")
    return {"messages": conv.get("messages", [])}


@app.post("/conversations/{conv_id}/messages")
async def send(conv_id: str, request: Request, user_id=Depends(require_user)):
    conv = CONVERSATIONS.get(conv_id)
    if not conv or user_id not in conv["members"]:
        raise HTTPException(status_code=403, detail="forbidden")
    form = await request.form()
    content = (form.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content required")
    msg = {
        "id": f"m{len(conv['messages'])+1}",
        "content": content,
        "sender": {"id": user_id, "displayName": "Student", "role": "STUDENT"},
    }
    conv.setdefault("messages", []).append(msg)
    return {"message": msg}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "4017")), reload=False)
