import os
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parents[2]
ASSETS_DIR = ROOT / "apps" / "web" / "static" / "assets"

app = FastAPI(title="Library service", version="1.0.0")

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


def asset(name: str) -> str:
    return str((ASSETS_DIR / name).resolve())


RESOURCE_FILES: Dict[str, Dict[str, str]] = {
    "lib-syllabus": {"path": asset("syllabus-co3083.txt"), "name": "Syllabus.txt", "size": "320 KB"},
    "lib-videos": {"path": asset("videos-co3083.txt"), "name": "Videos.txt", "size": "1.2 MB"},
    "lib-tests": {"path": asset("tests-co3083.txt"), "name": "Tests.txt", "size": "540 KB"},
    "lib-resources": {"path": asset("resources-co3083.txt"), "name": "Resources.txt", "size": "450 KB"},
}

LIBRARY_BY_SESSION: Dict[str, Dict[str, List[Dict[str, str]]]] = {
    "sess-5": {
        "syllabus": [{"id": "lib-syllabus", "name": "Workshop syllabus", "size": "320 KB"}],
        "videos": [{"id": "lib-videos", "name": "Workshop recap videos", "size": "1.2 MB"}],
        "tests": [{"id": "lib-tests", "name": "Practice tests", "size": "540 KB"}],
        "resources": [{"id": "lib-resources", "name": "Extra resources", "size": "450 KB"}],
    },
    "sess-12": {
        "syllabus": [{"id": "lib-syllabus", "name": "Compiler lab syllabus", "size": "280 KB"}],
        "videos": [{"id": "lib-videos", "name": "Lab videos", "size": "1.1 MB"}],
        "tests": [{"id": "lib-tests", "name": "Parser drills", "size": "480 KB"}],
        "resources": [{"id": "lib-resources", "name": "Lab resources", "size": "520 KB"}],
    },
    "sess-25": {
        "syllabus": [{"id": "lib-syllabus", "name": "OS review syllabus", "size": "300 KB"}],
        "videos": [{"id": "lib-videos", "name": "Review videos", "size": "1.0 MB"}],
        "tests": [{"id": "lib-tests", "name": "OS practice", "size": "420 KB"}],
        "resources": [{"id": "lib-resources", "name": "Reference kit", "size": "400 KB"}],
    },
    "sess-40": {
        "syllabus": [{"id": "lib-syllabus", "name": "Parallel seminar syllabus", "size": "310 KB"}],
        "videos": [{"id": "lib-videos", "name": "Seminar videos", "size": "1.3 MB"}],
        "tests": [{"id": "lib-tests", "name": "Parallel tests", "size": "560 KB"}],
        "resources": [{"id": "lib-resources", "name": "Example code", "size": "950 KB"}],
    },
}


@app.get("/health")
async def health():
    return {"ok": True, "svc": "library"}


@app.get("/resources")
async def list_resources(sessionId: str = Query(..., alias="sessionId")):
    data = LIBRARY_BY_SESSION.get(sessionId)
    if not data:
        return {"ok": True, "syllabus": [], "videos": [], "tests": [], "resources": []}
    # attach download URLs
    def enrich(items):
        return [
          {**item, "url": f"/library/resources/{item['id']}/download"}
          for item in (items or [])
        ]
    return {
        "ok": True,
        "syllabus": enrich(data.get("syllabus")),
        "videos": enrich(data.get("videos")),
        "tests": enrich(data.get("tests")),
        "resources": enrich(data.get("resources")),
    }


@app.get("/resources/{res_id}/download")
async def download_resource(res_id: str):
    meta = RESOURCE_FILES.get(res_id)
    if not meta:
        raise HTTPException(status_code=404, detail="not found")
    path = meta["path"]
    if not Path(path).exists():
        raise HTTPException(status_code=404, detail="file missing")
    return FileResponse(path, media_type="text/plain", filename=meta["name"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "4018")), reload=False)
