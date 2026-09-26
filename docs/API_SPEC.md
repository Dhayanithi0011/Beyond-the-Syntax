# Beyond The Syntax — API Specification (v1)

Base URL: `/api/v1`. Auth: `Authorization: Bearer <supabase_access_token>` on every protected route.

## Auth / Profile
- `POST /auth/register` — create participant profile after Supabase sign-up
- `GET /auth/me` — resolved identity: role, participant/admin record, competition state

## Public
- `GET /competition` — active competition summary (name, state, registration_open, round durations)
- `GET /rules` — static rules content

## Round 1 — Quiz (participant)
- `POST /quiz/start` — creates/returns the participant's `quiz_attempt` with a randomized,
  server-shuffled question+option order and `deadline`; idempotent for an existing in-progress attempt
- `GET /quiz/questions` — the participant's assigned question set **without** `correct_option`
- `POST /quiz/answer` — `{question_id, selected_option}` — upsert a single answer (used for autosave)
- `POST /quiz/submit` — finalizes attempt, grades server-side, returns score summary; rejected if
  already submitted or deadline passed (auto-submit path uses the same handler)
- `GET /leaderboard/round1` — ranked list, `[{participant, score, time_taken}]`

## Round 1 — Admin
- `POST /admin/questions` / `PUT /admin/questions/{id}` / `DELETE /admin/questions/{id}`
- `POST /admin/questions/import` — bulk CSV/JSON import
- `GET /admin/participants` — filterable/sortable participant + quiz status list
- `POST /admin/qualify` — `{participant_ids: []}` sets `qualification_status = qualified`
- `POST /admin/competition/transition` — `{to_state}`

## Teams
- `POST /admin/teams` — `{name, member_participant_ids: [3]}`
- `POST /admin/teams/{id}/grant-access` / `revoke-access`
- `POST /admin/teams/{id}/activate` — starts `team_sessions` clock, activates member 1
- `POST /admin/teams/{id}/pause` / `resume` / `reset`
- `GET /teams/{id}` — team + session status (participant sees only their own team; enforced server-side)

## Round 2 — Coding Relay (team member)
All require: qualified + on the team + `round2_access` + it is currently this member's turn
(`sync_team_session_state` runs first on every call below).

- `GET /coding/problems` — problem list + current team progress
- `GET /coding/problems/{id}` — statement + sample test cases + current shared draft
- `POST /coding/save` — `{problem_id, language, source_code}` — writes `code_drafts` (debounced from client)
- `POST /coding/run` — `{problem_id, language, source_code, stdin?}` — executes against sample cases only
- `POST /coding/submit` — `{problem_id, language, source_code}` — executes against hidden test cases,
  persists a `submissions` row, updates team score
- `GET /coding/submissions?problem_id=` — this team's submission history
- `POST /teams/{id}/handoff` — voluntary early handoff to the next member (only if
  `round2_early_handoff_allowed`); server validates caller is the current active member

## Leaderboard / Live
- `GET /leaderboard/round2` — ranked teams
- `GET /admin/live` — live monitor snapshot (also pushed over `/ws/admin/live`)

## WebSockets
- `/ws/team/{team_id}` — member_activated, handoff, session_expired, submission_result
- `/ws/leaderboard/{round}` — score_updated
- `/ws/admin/live` — aggregated state for the live monitor

## Error model
```json
{ "error": "ROUND2_ACCESS_DENIED", "message": "Round 2 access has not been granted." }
```
Standard codes used throughout: `401 UNAUTHENTICATED`, `403 FORBIDDEN` (role/state violations,
e.g. `ROUND2_ACCESS_DENIED`, `NOT_YOUR_TURN`, `SESSION_EXPIRED`), `404 NOT_FOUND`,
`409 CONFLICT` (duplicate submission, competition state mismatch), `422` validation errors,
`500` generic (never includes a stack trace in the body).
