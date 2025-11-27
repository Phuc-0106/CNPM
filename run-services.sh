#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/.venv"
LOGDIR="$ROOT/logs"

# activate venv if present
if [ -d "$VENV" ]; then
  # shellcheck source=/dev/null
  source "$VENV/bin/activate"
fi

mkdir -p "$LOGDIR"

echo "[run] killing existing listeners on 4000/4010/4011/4015/4016/4017 (ignore errors if none)"
fuser -k 4000/tcp 4010/tcp 4011/tcp 4015/tcp 4016/tcp 4017/tcp 2>/dev/null || true

start_service() {
  local dir="$1"
  local port="$2"
  local name="$3"
  (
    cd "$ROOT/$dir"
    echo "[run] starting $name on :$port"
    nohup uvicorn main:app --host 0.0.0.0 --port "$port" >"$LOGDIR/$name.log" 2>&1 &
  )
}

start_service "services/auth" 4010 "auth"
start_service "services/api-gateway" 4000 "api-gateway"
start_service "services/students" 4011 "students"
start_service "services/users" 4015 "users"
start_service "services/sessions" 4016 "sessions"
start_service "services/messages" 4017 "messages"
start_service "services/library" 4018 "library"

echo "[run] done. Logs in $LOGDIR (e.g., tail -f logs/api-gateway.log)"
