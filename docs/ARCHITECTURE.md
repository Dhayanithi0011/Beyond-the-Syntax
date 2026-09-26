# Beyond The Syntax — Architecture

## 1. System Overview

Beyond The Syntax is a two-round college coding competition platform:

- **Round 1 — Individual Quiz**: randomized MCQ quiz, server-graded, produces a ranked leaderboard.
- **Round 2 — Coding Relay**: admin-qualified participants are grouped into 3-person teams that
  solve 3 problems in a relay handoff format, with a server-authoritative shared timer.

```
React (Vite/TS) ──HTTP/WS──> FastAPI ──> PostgreSQL
                                 │
                                 ├──> Supabase Auth (identity)
                                 └──> Execution Service ──> Docker sandbox workers
```

## 2. Core Design Principles

1. **Backend is authoritative for everything that matters.** Timers, scores, rankings, question
   content, answer keys, and Round 2 access are all decided/enforced server-side. The frontend
   only *renders* state it is given.
2. **No untrusted code runs in the API process.** Submissions go to an isolated execution
   service that runs each job in a locked-down, network-disabled container with strict
   CPU/memory/time/output limits.
3. **Every session is resumable.** A member's timer, code, and problem state live in the
   database, keyed by `team_session`. Refresh/disconnect never loses time or work.
4. **Least exposure of secrets.** Hidden test cases and unattempted question answer keys are
   never serialized into any API response sent to participants.

## 3. Services

| Service | Responsibility |
|---|---|
| `frontend` | React SPA — public site, quiz UI, relay workspace, admin dashboard |
| `backend` (FastAPI) | Auth/session validation, business rules, REST + WebSocket API |
| `execution` | Stateless execution workers; receives (language, source, stdin, limits), returns (stdout, stderr, time, memory, status) |
| `postgres` | System of record for all competition data (Supabase-hosted Postgres) |
| `supabase (hosted)` | Identity provider: Auth (participant + admin login) + Postgres; RS256/HS256 access tokens |

## 4. Authentication & Authorization

- Identity: Supabase Auth issues an access-token JWT per user (participant or admin); its `sub`
  claim is the `auth.users` UUID we store as `users.auth_uid`.
- Every backend request carries the Supabase access token; FastAPI verifies it (HS256 via the
  project JWT secret for legacy tokens, RS256/ES256 via JWKS for current ones) and
  resolves it to a `users` row, then loads role + competition-specific state
  (`participant`, `team_member`, `admin`) needed for that endpoint.
- Authorization is **role + state** based, not just role based, e.g. a team member additionally
  needs `round2_access = true`, `team.status = ACTIVE`, and `is_current_turn = true` to reach
  the code execution endpoints for their problem.
- The frontend never sends `teamId`, `memberId`, `roundStatus`, or timer values that the backend
  trusts — those are always derived server-side from the authenticated identity.

## 5. Competition State Machine

```
DRAFT -> REGISTRATION_OPEN -> REGISTRATION_CLOSED -> ROUND1_ACTIVE -> ROUND1_CLOSED
      -> QUALIFICATION_DONE -> TEAMS_CREATED -> ROUND2_ACTIVE -> ROUND2_CLOSED -> FINALIZED
```

Each transition is an admin-only action (`POST /admin/competition/transition`) and is logged to
`audit_logs`. Participant/team-facing endpoints check the current state before allowing actions
(e.g. quiz submission is rejected once state has moved past `ROUND1_ACTIVE` and the participant's
attempt is not already open).

### Team relay sub-state machine (per team)

```
PENDING -> ACTIVE (member 1 active) -> HANDOFF -> ACTIVE (member 2 active)
        -> HANDOFF -> ACTIVE (member 3 active) -> COMPLETED
                                              (or EXPIRED if team time runs out)
```

Each `team_session` row tracks `current_member_number`, `member_deadline`, `team_deadline`, and
`status`. A background scheduler (or lazy check-on-request, see below) flips `ACTIVE` members to
`EXPIRED` and activates the next member once `member_deadline` passes.

**Timer enforcement strategy:** rather than relying solely on a cron/scheduler, every
state-changing request to `/coding/*` and `/teams/{id}` first calls
`sync_team_session_state(team_id)`, which compares `now()` to the stored deadlines and performs
any pending transition (member expiry → next member activation, or team expiry → team completed)
before processing the request. A lightweight periodic job also runs this for idle teams so the
admin live monitor stays accurate even with no participant activity.

## 6. Code Execution Architecture

```
FastAPI  ──enqueue──>  Execution Queue  ──>  Worker  ──>  ephemeral Docker container
   ^                                                            │
   └───────────────────── result (stdout/err, time, mem, status) ┘
```

- Each submission/run request creates a `job` with a language, source, stdin, and a `mode`
  (`run` = sample cases only, `submit` = hidden test cases).
- Workers launch a **fresh, disposable container per execution** with:
  - `--network none`
  - CPU quota (e.g. `--cpus=0.5`)
  - Memory limit (e.g. `--memory=256m`, `--memory-swap` equal to disable swap)
  - `--pids-limit` to stop fork bombs
  - Wall-clock timeout enforced by the worker (kill + mark `Time Limit Exceeded`)
  - Output truncated at a fixed byte cap
  - Read-only root filesystem except a scratch tmpfs
- The FastAPI process never `exec`s student code itself.

## 7. Real-time Updates

WebSocket channels (namespaced by role/subject), each pushing only *events*, with the client
re-deriving countdowns from server-provided deadlines rather than receiving a tick every second:

- `/ws/team/{team_id}` — member activated, handoff, session expired, submission result
- `/ws/leaderboard/round1`, `/ws/leaderboard/round2` — score/rank changes
- `/ws/admin/live` — aggregated live monitor feed

## 8. Deployment Shape

`docker-compose.yml` runs: `frontend` (static build behind nginx in prod), `backend`,
`postgres`, and an `execution-worker` pool. Supabase is external/managed. See root `README.md`
for environment variables.
