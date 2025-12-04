# CNPM Monorepo

Static web (in `apps`), FastAPI microservices (in `services`), and simple infra helpers live together here.

## Structure
- `apps/web/www`: static pages (student/profile/session) served by `http-server` in dev.
- `services/*`: FastAPI services (`auth`, `students`, `sessions`, `users`, `messages`, `api-gateway`, `library`, `admin`, `tutors`).
- `infra/`: environment helpers (e.g., `nginx.conf`, docker bits if added later).
- `logs/`: service logs (ignored by git).

## Getting started
1. Install Python 3.10+ and Node.js.
2. (Optional) create/activate a venv: `python -m venv .venv && source .venv/bin/activate`.
3. Install Python deps inside each service as needed (e.g., `pip install -r services/students/requirements.txt`).
4. Install web dev deps: `cd apps/web && npm install`.

## Run all services
From repo root:
```bash
bash ./run-services.sh
```
This starts:
- api-gateway on :4000
- auth on :4010
- students on :4011
- users on :4015
- sessions on :4016
- messages on :4017
- admin on:4019
- tutors on: 4099

Logs are written to `logs/*.log` (e.g., `tail -f logs/api-gateway.log`).

## Web dev server
```bash
cd apps/web
npm run dev   # serves www/ at :5173 via http-server
```
Pages make API calls to the gateway on :4000 (configured in the JS).

## Contributing
- Add new UIs under `apps/web/www` (e.g., tutor/admin pages) with supporting JS in `apps/web/static/js`.
- Add/extend APIs inside the corresponding `services/*` FastAPI apps.
- Keep `run-services.sh` updated if you introduce new services/ports.
- Use the shared `access_token` cookie for auth across roles; add role-specific UI/logic as needed.
