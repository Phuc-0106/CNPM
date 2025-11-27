import os

import httpx
import jwt
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse


AUTH_UPSTREAM = os.getenv("AUTH_UPSTREAM", "http://localhost:4010")
STUDENTS_UPSTREAM = os.getenv("STUDENTS_UPSTREAM", "http://localhost:4011")
USERS_UPSTREAM = os.getenv("USERS_UPSTREAM", "http://localhost:4015")
SESSIONS_UPSTREAM = os.getenv("SESSIONS_UPSTREAM", "http://localhost:4016")
MESSAGES_UPSTREAM = os.getenv("MESSAGES_UPSTREAM", "http://localhost:4017")
LIBRARY_UPSTREAM = os.getenv("LIBRARY_UPSTREAM", "http://localhost:4018")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

app = FastAPI(title="API Gateway", version="1.0.0")

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


@app.middleware("http")
async def auth_guard(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    if path.startswith("/auth") or path in {"/health", "/students/health"}:
        return await call_next(request)

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    try:
        request.state.user = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    return await call_next(request)


@app.get("/health")
async def health():
    return {"ok": True, "svc": "api-gateway"}


async def proxy_request(target: str, path: str, request: Request) -> Response:
    url = target.rstrip("/")
    if path:
        url = f"{url}/{path.lstrip('/')}"

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in {"host", "content-length"}
    }

    body = await request.body()

    async with httpx.AsyncClient(follow_redirects=True) as client:
        upstream_resp = await client.request(
            request.method,
            url,
            params=request.query_params,
            headers=headers,
            content=body,
            cookies=request.cookies,
        )

    proxied = Response(
        content=upstream_resp.content,
        status_code=upstream_resp.status_code,
        media_type=upstream_resp.headers.get("content-type"),
    )

    for key, value in upstream_resp.headers.items():
        if key.lower() in {"content-length", "transfer-encoding", "connection"}:
            continue
        if key.lower() == "set-cookie":
            continue
        proxied.headers[key] = value

    for cookie_header in upstream_resp.headers.get_list("set-cookie"):
        proxied.headers.append("set-cookie", cookie_header)

    return proxied


@app.api_route("/auth", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def auth_root(request: Request):
    return await proxy_request(AUTH_UPSTREAM, "", request)


@app.api_route("/auth/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def auth_proxy(path: str, request: Request):
    return await proxy_request(AUTH_UPSTREAM, path, request)


@app.api_route("/students", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def students_root(request: Request):
    return await proxy_request(STUDENTS_UPSTREAM, "", request)


@app.api_route("/students/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def students_proxy(path: str, request: Request):
    return await proxy_request(STUDENTS_UPSTREAM, path, request)

@app.api_route("/register", methods=["POST"])
async def students_register(request: Request):
    return await proxy_request(STUDENTS_UPSTREAM, "register", request)

@app.api_route("/sessions/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def sessions_proxy(path: str, request: Request):
    return await proxy_request(SESSIONS_UPSTREAM, path, request)

@app.api_route("/sessions", methods=["GET"])
async def sessions_root(request: Request):
    return await proxy_request(SESSIONS_UPSTREAM, "", request)

@app.api_route("/messaging/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def messaging_proxy(path: str, request: Request):
    return await proxy_request(MESSAGES_UPSTREAM, path, request)


@app.api_route("/courses", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def courses_root(request: Request):
    return await proxy_request(STUDENTS_UPSTREAM, "courses", request)


@app.api_route("/courses/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def courses_proxy(path: str, request: Request):
    return await proxy_request(STUDENTS_UPSTREAM, f"courses/{path}", request)


@app.api_route("/messaging", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def messaging_root(request: Request):
    return await proxy_request(MESSAGES_UPSTREAM, "", request)

@app.api_route("/library/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def library_proxy(path: str, request: Request):
    return await proxy_request(LIBRARY_UPSTREAM, path, request)


@app.api_route("/users/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def users_proxy(path: str, request: Request):
    return await proxy_request(USERS_UPSTREAM, path, request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "4000")),
        reload=False,
    )
