import os
from typing import Dict

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

app = FastAPI(title="Users service", version="1.0.0")

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


class UpdateProfile(BaseModel):
    fullName: str
    phone: str = ""
    major: str = ""
    bio: str = ""


USERS: Dict[str, Dict[str, str]] = {
    "stu-001": {
        "id": "stu-001",
        "fullName": "Alex Student",
        "email": "student@hcmut.edu.vn",
        "studentId": "2352259",
        "major": "Computer Science",
        "phone": "+84 900 111 222",
        "avatarUrl": None,
    }
}


def require_user(request: Request) -> Dict[str, str]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="unauthorized") from exc
    user_id = payload.get("sub")
    if not user_id or user_id not in USERS:
        raise HTTPException(status_code=401, detail="unauthorized")
    return USERS[user_id]


@app.get("/health")
async def health():
    return {"ok": True, "svc": "users"}


@app.get("/student/profile")
async def profile(user=Depends(require_user)):
    return {"me": user}


@app.put("/student/profile")
async def update_profile(body: UpdateProfile, user=Depends(require_user)):
    user["fullName"] = body.fullName.strip()
    user["phone"] = body.phone.strip()
    user["major"] = body.major.strip()
    user["bio"] = body.bio.strip()
    return {"ok": True, "me": user}


@app.post("/student/profile/avatar")
async def update_avatar(file: UploadFile = File(None), user=Depends(require_user)):
    if not file:
        raise HTTPException(status_code=400, detail="file required")
    content = await file.read()
    mime = file.content_type or "image/png"
    import base64

    encoded = base64.b64encode(content).decode("ascii")
    data_url = f"data:{mime};base64,{encoded}"
    user["avatarUrl"] = data_url
    return {"ok": True, "avatarUrl": data_url}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "4015")), reload=False)
