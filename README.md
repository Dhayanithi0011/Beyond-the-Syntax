# Beyond The Syntax

A professional two-round college coding competition platform:

- **Round 1** — individual, randomized MCQ quiz with a live leaderboard.
- **Round 2** — "Coding Relay": 3-member teams solve 3 problems in relay handoff
  format, on a single server-authoritative shared timer, in a browser-based
  Monaco editor with sandboxed multi-language execution (C, C++, Java, Python).

## Read first

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — services, state machines, execution sandboxing, real-time design
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — full table-by-table schema
- [`docs/API_SPEC.md`](docs/API_SPEC.md) — REST + WebSocket contract

## Repository layout

```
beyond-syntax/
├── frontend/     React + Vite + TS + Tailwind + Monaco
├── backend/      FastAPI — auth, business rules, REST + WS API
├── execution/    Isolated code-execution microservice (Docker sandboxes)
├── database/     Alembic migrations
└── docs/         Architecture, schema, API spec
```

## Status — what's implemented vs. scaffolded

| Area | Status |
|---|---|
| Architecture / schema / API docs | ✅ Complete |
| DB models (SQLAlchemy) | ✅ Complete, matches schema doc |
| **Alembic migration (initial schema)** | ✅ Complete — `0001_initial_schema.py` creates every table |
| **Auth: Supabase token verification → DB identity** | ✅ Implemented (`core/supabase.py`, `core/security.py`, `repositories/user_repository.py`) |
| **`POST /auth/register`, `GET /auth/me`** | ✅ Implemented |
| **Round 2 authorization guards** (role + membership + turn) | ✅ Implemented — team is always derived from the caller's own identity, never a client-supplied `team_id` |
| **Admin provisioning** | ✅ Out-of-band script (`backend/scripts/create_admin.py`) — no public endpoint can grant admin |
| Quiz start/serve/answer/submit + server-side randomization & grading | ✅ Implemented |
| Relay timer state machine (`relay_service.py`), early-handoff gated by competition setting | ✅ Implemented |
| Coding workspace endpoints (list/get problems, save/run/submit/submissions) | ✅ Implemented against the execution client contract |
| Admin endpoints (questions, participants, teams, qualify) | 🟡 Core CRUD implemented; audit logging only wired for registration so far |
| Code execution service | 🟡 API contract + Dockerfiles scaffolded; sandbox `docker run` logic not implemented (Phase 10 next) |
| WebSockets (live timer/handoff/leaderboard push) | ⬜ Not started (Phase 12) |
| Frontend pages | ✅ Full UI built (public, Round 1 quiz + leaderboard, Round 2 relay workspace + lobby + leaderboard, admin console) — runs on a demo data layer (`VITE_DEMO_MODE`) until login/roles are wired up |
| Frontend auth/roles | ✅ Implemented (Supabase auth + `ProtectedRoute` role gates); sign in with `VITE_DEMO_MODE=false` |
| Tests | ⬜ Not started (Phase 15) |

## Previewing the UI (demo mode)

The entire UI runs without Postgres / FastAPI / Supabase. `frontend/src/services/mock.ts`
simulates the backend through an axios adapter that mirrors `docs/API_SPEC.md` exactly, so
the same page code later talks to the real API unchanged.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (demo mode is the default)
```

Browse:

- `/` — landing, `/rules`, `/register`, `/login`
- `/quiz` → `/quiz/attempt` — Round 1 quiz (randomized, auto-submit, marked-for-review navigator)
- `/leaderboard/round1` — score + time leaderboard
- `/team` → `/team/workspace` — Round 2 coding relay (Monaco, run/submit, handoff, shared drafts)
- `/leaderboard/round2` — team leaderboard
- `/admin/login` → `/admin` — dashboard, questions, participants (bulk qualify), teams, live monitor

Set `VITE_DEMO_MODE=false` in `frontend/.env` to point pages at the real backend.

## Local development

```bash
cp .env.example .env   # fill in Supabase project settings, and a real DATABASE_URL
docker compose up --build postgres
```

Then run the initial migration:

```bash
cd backend
pip install -r requirements.txt --break-system-packages   # or use a venv
alembic upgrade head                                       # targets SUPABASE_URL/database_url in .env
```

Provision the first admin (the Supabase auth user must already exist in Auth → Users — the
script can look it up by email, resolving its `auth.users` id automatically; or pass it via
`--auth-user-id`, the `sub` of the access token):

```bash
python -m scripts.create_admin --email admin@college.edu --name "Admin Name"
```

Then bring the rest of the stack up:

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend docs: http://localhost:8000/docs
- Execution service: http://localhost:8100

## Production deployment

### Option A — Vercel, single deployment (recommended)

One Vercel project serves BOTH the static frontend and the FastAPI backend, so
the site and the API share a single origin and no CORS/API-URL wiring is needed.
Because Vercel's Python runtime auto-detects FastAPI and serves the whole
project from one function (mounting it under `/api`), the function itself serves
the React app for every non-API path and normalizes paths back to the app's
registered `/api/v1/...` routes. The layout:

- `vercel.json` (root) — builds `frontend/dist`, routes every request to the function
- `api/index.py` (root) — FastAPI app with a path-normalizing middleware, SPA
  serving from `frontend/dist`, plus a `Mangum` handler
- `requirements.txt` (root) — backend deps + `mangum`

1. Push the repo to GitHub, import it into Vercel with **Root Directory `/`**,
   and deploy — no framework preset needed.

2. In the project's **Settings → Environment Variables** (Production):

   ```text
   DATABASE_URL                Supabase pooler DSN (postgresql+asyncpg://...?ssl=require)
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_JWT_SECRET
   SUPABASE_SERVICE_ROLE_KEY
   CORS_ORIGINS                optional — same-origin, so not strictly needed
   DEV_MODE=false              disables /admin/dev/* endpoints
   VITE_SUPABASE_URL           baked into the frontend at build time
   VITE_SUPABASE_ANON_KEY      baked into the frontend at build time
   ```

3. Provision the first admin (one-off, from your machine against the same DB):

   ```bash
   cd backend
   python -m scripts.create_admin --email admin@college.edu --name "Admin Name"
   ```

   (Set the same env vars locally, or point `DATABASE_URL` at the production
   Postgres.)

4. Redeploy. The site is at `https://<project>.vercel.app` and the API at
   `https://<project>.vercel.app/api/v1/...`.

Caveats of the serverless setup:
- Code execution is external (Piston) — each `Run`/`Submit` makes HTTP calls
  inside the function. The Hobby plan caps function duration at 10s, which can
  time out a 5-hidden-case submit; a Pro plan (60s+ `maxDuration`) is safer.
- WebSockets (Phase 12) are not available on serverless functions; the
  frontend currently polls, so nothing breaks.
- Migrations are NOT auto-applied here — run them once (e.g.
  `alembic upgrade head` from `backend/` against the production DB before or
  after the first deploy), and remember `frontend/dist` is only built in CI, so
  changing backend code requires a redeploy of the frontend too.

### Option B — Docker

The frontend is a static SPA served by nginx, which also proxies `/api` and `/ws`
to the backend. The backend runs its own migrations on startup and needs the
`postgres` service, plus Supabase project credentials.

1. Copy the environment template and fill in real values:

   ```bash
   cp .env.example .env
   ```

   Required for a live deployment:
   - `DATABASE_URL` — production Postgres (Supabase pooler or any PostgreSQL)
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGINS` — the public frontend origin(s)
   - `DEV_MODE=false` — disables the `/admin/dev/*` endpoints
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — baked into the frontend bundle at build time

2. Build and start the whole stack:

   ```bash
   docker compose up --build -d
   ```

3. Provision the first admin (once):

   ```bash
   docker compose exec backend python -m scripts.create_admin --email admin@college.edu --name "Admin Name"
   ```

4. Open the site at http://localhost:5173. The frontend talks to the backend
   through nginx, so no separate API URL is needed.

Non-Docker option — run the backend directly and serve the built frontend with
any static host (nginx, S3/CloudFront, Vercel, etc.). If the API lives on a
different origin than the frontend, override the base URL by setting
`VITE_API_URL` at build time (see `frontend/src/services/api.ts`).

## Design principles (see ARCHITECTURE.md for detail)

1. The backend is authoritative for timers, scores, rankings, question content,
   and Round 2 access — the frontend only renders what it's given.
2. A participant's team in Round 2 is always resolved from their authenticated
   identity, never accepted as a client-supplied `team_id`/`member_id`.
3. Student code never executes inside the API process — only in disposable,
   network-disabled, resource-limited containers.
4. Every relay session is resumable from the database; refresh/disconnect never
   loses time or code.

## Next steps (recommended order)

1. **Execution grading** — the API already delegates `Run`/`Submit` to the
   Piston remote judge (`execution_client.py`). For a self-hosted grade, swap
   `execute_job`'s Piston branch for a Docker-isolated runner.
2. **WebSocket push** (Phase 12) for timer/handoff/leaderboard events, replacing
   polling in the frontend. Note: not available on Vercel serverless functions.
3. **Leaderboard computation** — a service that (re)populates the `leaderboards`
   table on quiz-submit / code-submit events, called from `quiz.py` and
   `coding.py`.
4. **Admin dashboard pages** — wire `AdminParticipantsPage`, `AdminTeamsPage`,
   `AdminQuestionsPage`, `AdminLiveMonitorPage` to the already-implemented
   `/admin/*` endpoints.
5. **Tests** (Phase 15) — auth, quiz randomization/grading, relay timer
   transitions, and authorization edge cases (wrong turn, no access, expired
   session) are the highest-value first tests given what's now implemented.
