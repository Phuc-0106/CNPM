import os
from datetime import datetime, timedelta
from typing import Dict, Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

# Hard-coded demo users (no database)
USERS: Dict[str, Dict[str, Optional[str]]] = {
    "student@hcmut.edu.vn": {
        "id": "stu-001",
        "email": "student@hcmut.edu.vn",
        "password": "demo123",
        "role": "STUDENT",
        "name": "Alex Student",
        "phone": "+84 900 111 222",
        "major": "Computer Science",
    },
    "admin@hcmut.edu.vn": {
        "id": "adm-001",
        "email": "admin@hcmut.edu.vn",
        "password": "admin123",
        "role": "ADMIN",
        "name": "Admin",
        "phone": None,
        "major": None,
    },
    "tutor@hcmut.edu.vn":{
        "id": "tut-001",
        "email": "tutor@hcmut.edu.vn",
        "password": "tutor123",
        "role": "TUTOR",
        "name": "Perfect Cell",
        "phone": "+94 999 888 777",
        "major": "Antagonist",
    }
}


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    name: Optional[str] = None
    phone: Optional[str] = None
    major: Optional[str] = None


def create_token(user: Dict[str, Optional[str]]) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"], 
        "role": user["role"],
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="unauthorized") from exc


def get_current_user(request: Request) -> Dict[str, Optional[str]]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="unauthorized")
    payload = decode_token(token)
    user_id = payload.get("sub")
    role = payload.get("role")
    for user in USERS.values():
        if user["id"] == user_id and user["role"] == role:
            return user
    raise HTTPException(status_code=401, detail="unauthorized")


app = FastAPI(title="Auth service", version="1.0.0")

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


@app.get("/health")
async def health():
    return {"ok": True, "svc": "auth"}


@app.post("/login")
async def login(data: LoginRequest, response: Response):
    email = data.email.strip().lower()
    user = USERS.get(email)
    if not user or data.password != user["password"]:
        raise HTTPException(status_code=401, detail="invalid credentials")

    token = create_token(user)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * JWT_EXPIRY_HOURS,
        path="/",
    )

    return {"ok": True, "user": UserResponse(**user)}


@app.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/me")
async def me(user=Depends(get_current_user)):
    return {"ok": True, "user": UserResponse(**user)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "4010")),
        reload=False,
    )
