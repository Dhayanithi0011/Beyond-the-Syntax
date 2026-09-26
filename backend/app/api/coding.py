"""
Coding workspace endpoints. `run` executes against the visible test cases
(samples + direct self-check cases) and returns output directly to the team;
`submit` executes against hidden test cases and only ever returns a verdict +
score, never the hidden expected output. All code execution is delegated to the
execution service — nothing here ever calls a compiler/interpreter in-process.

Every route depends on `require_active_team_member`, which resolves the
caller's team from their own membership row and confirms it is currently
their turn (see core/security.py) — no team_id/member_id is ever accepted
from the client here.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.errors import AuthError
from app.core.security import require_active_team_member, require_participant
from app.models.models import CodingProblem, Competition, TestCase, CodeDraft, Submission, TeamSession, SessionStatus, TeamMember, Participant, User
from app.services.execution_client import execute_job
from app.services.relay_service import ensure_member_clock, team_time_remaining, complete_team_round

router = APIRouter(prefix="/coding", tags=["coding"])

SET_SIZE = 3  # questions per set in the Round 2 bank


def _set_index_of_position(position: int) -> int:
    return (position - 1) // SET_SIZE


def _num_sets(problems: list) -> int:
    return max((p.position for p in problems), default=SET_SIZE) // SET_SIZE or 1


def _current_set_index(problems: list, session: TeamSession | None) -> int:
    start = (session.start_set_index if session and session.start_set_index is not None else 0) % _num_sets(problems)
    rounds = session.completed_rounds if session and session.completed_rounds else 0
    return (start + rounds) % _num_sets(problems)


def _problems_of_set(problems: list, idx: int) -> list:
    return [p for p in problems if _set_index_of_position(p.position) == idx]


async def _load_session_and_current_set(db: AsyncSession, membership) -> tuple:
    session = await db.scalar(select(TeamSession).where(TeamSession.team_id == membership.team_id))
    problems = (
        await db.scalars(
            select(CodingProblem)
            .where(CodingProblem.competition_id == membership.team.competition_id)
            .order_by(CodingProblem.position)
        )
    ).all()
    idx = _current_set_index(problems, session)
    return session, idx, _problems_of_set(problems, idx)


async def _assert_in_current_set(db: AsyncSession, membership, problem: CodingProblem) -> None:
    """Round-2 access rule: a team may only work the ONE set it has been dealt
    for the current relay round, and only questions whose turn on the
    progressive unlock is reached. Solvers can't open tomorrow's questions
    early — the set advances round-robin only after every member has taken a
    turn, and within a set each member opens one more question while solving
    the previous question unlocks the next one."""
    if problem is None:
        raise AuthError("NOT_FOUND", "Problem not found.", 404)
    session, _, current = await _load_session_and_current_set(db, membership)
    if str(problem.id) not in {str(p.id) for p in current}:
        raise AuthError("FORBIDDEN", "That question isn't part of your team's current set.")
    solved_map = await _solved_map(db, membership.team_id, [p.id for p in current])
    if not _is_unlocked(session, current, problem, solved_map):
        raise AuthError(
            "FORBIDDEN",
            "This question is locked — finish the previous question in this set first; "
            "the later member's turn also opens more questions.",
        )


async def _solved_map(db: AsyncSession, team_id, problem_ids: list) -> dict:
    """{problem_id: best_score} for the given problems — score > 0 means the
    team has an accepted submission on it."""
    return {
        str(pid): score
        for pid, score in (
            await db.execute(
                select(Submission.problem_id, func.max(Submission.score))
                .where(Submission.team_id == team_id, Submission.problem_id.in_(list(problem_ids)))
                .group_by(Submission.problem_id)
            )
        ).all()
    }


def _is_unlocked(session, current: list, problem, solved_map: dict) -> bool:
    """Progressive unlock inside the current set (1..3), where the number of
    open questions is max(current member's turn, solved questions + 1):
    - Member 1 starts with Q1 open; solving Q1 opens Q2, solving Q2 opens Q3.
    - Member 2 always has at least Q1+Q2 open (continuation), and so on, so a
      member who couldn't finish Q1 leaves it — and the next one more —
      open for the next member, with the previous code intact.
    - Member 3 opens the whole set from the start."""
    member_number = session.current_member_number if session and session.current_member_number else 1
    q_number = (problem.position - 1) % SET_SIZE + 1
    solved_before = sum(
        1 for p in current
        if p.position < problem.position and solved_map.get(str(p.id), 0) > 0
    )
    return q_number <= max(member_number, solved_before + 1)


def _norm(s: str) -> str:
    return (s or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _first_failure_status(result) -> str:
    if result.status == "compilation_error":
        return "compilation_error"
    if result.status == "runtime_error":
        return "runtime_error"
    if result.status in ("tle", "mle"):
        return result.status
    return "wrong_answer"


def _session_payload(sess: TeamSession | None, team_remaining_seconds: int = 0) -> dict | None:
    if sess is None:
        return None
    return {
        "status": sess.status,
        "team_started_at": sess.team_started_at.isoformat() if sess.team_started_at else None,
        "team_time_remaining_seconds": team_remaining_seconds,
        "current_member_number": sess.current_member_number,
        "member_started_at": sess.member_started_at.isoformat() if sess.member_started_at else None,
        "member_deadline": sess.member_deadline.isoformat() if sess.member_deadline else None,
    }


async def _team_brief(db: AsyncSession, membership, session: TeamSession | None) -> dict:
    """Small team identity block so the workspace can render the real team name,
    the member roster and whose turn it is without a second round-trip."""
    members = (
        await db.execute(
            select(TeamMember, Participant, User)
            .join(Participant, Participant.id == TeamMember.participant_id)
            .join(User, User.id == Participant.user_id)
            .where(TeamMember.team_id == membership.team_id)
            .order_by(TeamMember.member_number)
        )
    ).all()
    return {
        "name": membership.team.name,
        "color": membership.team.color or "#6366F1",
        "icon": "⚡",
        "your_member_number": membership.member_number,
        "current_member_number": session.current_member_number if session else None,
        "members": [
            {
                "member_number": tm.member_number,
                "name": user.name,
                "participant_code": participant.participant_code,
            }
            for tm, participant, user in members
        ],
    }


@router.get("/problems")
async def list_problems(db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)):
    """Returns ONLY the single set (3 questions) dealt to this team for the
    current relay round — sets rotate round-robin after every full pass.
    Entering the workspace starts (once) the CURRENT member's private 15-minute
    countdown, per the lazy-start relay timing model."""
    session, idx, current = await _load_session_and_current_set(db, membership)
    if session is not None:
        await ensure_member_clock(db, session)
    competition = await db.get(Competition, membership.team.competition_id)
    remaining = team_time_remaining(session, competition)
    problems = (await db.scalars(
        select(CodingProblem)
        .where(CodingProblem.competition_id == membership.team.competition_id)
        .order_by(CodingProblem.position)
    )).all()
    num_sets = _num_sets(problems)
    best = await _solved_map(db, membership.team_id, [p.id for p in current])
    return {
        "set": {
            "id": "round2",
            "topic": "Coding Relay",
            "set_number": idx + 1,
            "total_sets": num_sets,
            "round": (session.completed_rounds or 0) + 1,
        },
        "session": _session_payload(session, remaining),
        "team": await _team_brief(db, membership, session),
        "problems": [
            {
                "id": str(p.id),
                "title": p.title,
                "position": p.position,
                "q_number": (p.position - 1) % SET_SIZE + 1,
                "domain": p.domain,
                "difficulty": p.difficulty,
                "max_score": p.max_score,
                "solved": best.get(str(p.id), 0) > 0,
                "score": best.get(str(p.id), 0),
                "unlocked": _is_unlocked(session, current, p, best),
            }
            for p in current
        ],
    }


@router.get("/problems/{problem_id}")
async def get_problem(
    problem_id: str, db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)
):
    problem = await db.get(CodingProblem, problem_id)
    await _assert_in_current_set(db, membership, problem)
    samples = (
        await db.scalars(
            select(TestCase).where(
                TestCase.problem_id == problem_id, TestCase.test_type.in_(["sample", "direct"])
            ).order_by(case((TestCase.test_type == "sample", 0), else_=1), TestCase.id)
        )
    ).all()
    draft = await db.scalar(
        select(CodeDraft).where(CodeDraft.team_id == membership.team_id, CodeDraft.problem_id == problem_id)
    )
    if draft is None:
        draft_payload = {"language": "python", "languages": {}, "source_code": ""}
    else:
        draft_payload = {
            "language": draft.language,
            "languages": draft.languages or {},
            "source_code": draft.source_code,
        }
    visible = [
        {"input": s.input, "expected_output": s.expected_output, "kind": s.test_type, "label": s.test_type}
        for s in samples
    ]
    return {
        "problem": {
            "id": str(problem.id),
            "title": problem.title,
            "position": problem.position,
            "domain": problem.domain,
            "difficulty": problem.difficulty,
            "max_score": problem.max_score,
            "statement_md": problem.statement_md,
            "constraints_md": problem.constraints_md,
            "time_limit_ms": problem.time_limit_ms,
            "memory_limit_mb": problem.memory_limit_mb,
            "sample_cases": [c for c in visible if c["kind"] == "sample"],
            "direct_cases": [c for c in visible if c["kind"] == "direct"],
            "test_cases": [],
        },
        "draft": draft_payload,
    }


@router.post("/save")
async def save_draft(
    payload: dict, db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)
):
    problem = await db.get(CodingProblem, payload["problem_id"])
    await _assert_in_current_set(db, membership, problem)
    draft = await db.scalar(
        select(CodeDraft).where(
            CodeDraft.team_id == membership.team_id, CodeDraft.problem_id == payload["problem_id"]
        )
    )
    if draft is None:
        draft = CodeDraft(team_id=membership.team_id, problem_id=payload["problem_id"])
        db.add(draft)
    languages = dict(draft.languages or {})
    languages[payload["language"]] = payload["source_code"]
    draft.languages = languages
    draft.language = payload["language"]
    draft.source_code = payload["source_code"]
    draft.last_edited_by = membership.id
    draft.updated_at = datetime.now(timezone.utc)  # set in Python so no lazy reload after commit
    await db.commit()
    return {"saved": True, "saved_at": draft.updated_at.isoformat()}


@router.post("/run")
async def run_code(
    payload: dict, db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)
):
    problem = await db.get(CodingProblem, payload["problem_id"])
    await _assert_in_current_set(db, membership, problem)
    samples = (
        await db.scalars(
            select(TestCase).where(
                TestCase.problem_id == problem.id, TestCase.test_type.in_(["sample", "direct"])
            ).order_by(case((TestCase.test_type == "sample", 0), else_=1), TestCase.id)
        )
    ).all()

    cases = []
    stdout_chunks = []
    status = "accepted"
    first_stderr = ""
    worst_time = worst_mem = 0
    for i, tc in enumerate(samples, start=1):
        result = await execute_job(
            language=payload["language"],
            source_code=payload["source_code"],
            stdin=tc.input,
            time_limit_ms=problem.time_limit_ms,
            memory_limit_mb=problem.memory_limit_mb,
        )
        worst_time = max(worst_time, result.time_ms or 0)
        worst_mem = max(worst_mem, result.memory_kb or 0)
        stdout_chunks.append(result.stdout)
        passed = result.status == "ok" and _norm(result.stdout) == _norm(tc.expected_output)
        if not passed and status == "accepted":
            status = _first_failure_status(result)
            first_stderr = result.stderr or ""
        cases.append({
            "label": f"{tc.test_type.title()} case {i}",
            "input": tc.input,
            "expected": tc.expected_output,
            "actual": result.stdout,
            "passed": passed,
        })

    return {
        "status": status,
        "stdout": "\n".join(stdout_chunks)[:32_000],
        "stderr": first_stderr,
        "execution_time_ms": worst_time,
        "memory_kb": worst_mem,
        "judge": "real",
        "cases": cases,
    }


@router.post("/submit")
async def submit_code(
    payload: dict, db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)
):
    problem = await db.get(CodingProblem, payload["problem_id"])
    await _assert_in_current_set(db, membership, problem)
    hidden_cases = (
        await db.scalars(
            select(TestCase).where(TestCase.problem_id == problem.id, TestCase.test_type == "hidden")
        )
    ).all()

    verdict = "accepted"
    passed = 0
    worst_time = worst_mem = 0
    for tc in hidden_cases:
        result = await execute_job(
            language=payload["language"],
            source_code=payload["source_code"],
            stdin=tc.input,
            time_limit_ms=problem.time_limit_ms,
            memory_limit_mb=problem.memory_limit_mb,
        )
        worst_time = max(worst_time, result.time_ms or 0)
        worst_mem = max(worst_mem, result.memory_kb or 0)
        if result.status != "ok":
            if verdict == "accepted":
                verdict = result.status
        elif _norm(result.stdout) != _norm(tc.expected_output):
            if verdict == "accepted":
                verdict = "wrong_answer"
        else:
            passed += 1

    score = problem.max_score if verdict == "accepted" else 0
    submission = Submission(
        team_id=membership.team_id,
        problem_id=problem.id,
        member_id=membership.id,
        language=payload["language"],
        source_code=payload["source_code"],
        status=verdict,
        execution_time_ms=worst_time,
        memory_kb=worst_mem,
        score=score,
    )
    db.add(submission)
    await db.commit()
    return {
        "submission_id": str(submission.id),
        "status": verdict,
        "score": score,
        "passed": passed,
        "total": len(hidden_cases),
        "execution_time_ms": worst_time,
        "memory_kb": worst_mem,
        "judge": "real",
    }


@router.post("/complete")
async def complete_round(db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)):
    """End the team's Round 2 immediately — for teams that finish their work
    mid-round. Any remaining time is discarded and no further turns can run.
    Only the currently active member may close the round."""
    session = await db.scalar(select(TeamSession).where(TeamSession.team_id == membership.team_id))
    if session is None or session.status != SessionStatus.active:
        raise AuthError("CONFLICT", "Your team's round is not currently active.", 409)
    await complete_team_round(db, session)
    await log_action(
        db,
        user_id=None,
        action="ROUND2_COMPLETED",
        metadata={
            "team_id": str(membership.team_id),
            "member_number": membership.member_number,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {"completed": True, "message": "Round 2 complete — your team's share of time ends here."}


@router.get("/submissions")
async def list_submissions(
    problem_id: str | None = None, db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)
):
    query = (
        select(Submission, CodingProblem)
        .join(CodingProblem, CodingProblem.id == Submission.problem_id)
        .where(Submission.team_id == membership.team_id)
        .order_by(Submission.submitted_at.desc())
    )
    if problem_id:
        query = query.where(Submission.problem_id == problem_id)
    rows = (await db.execute(query)).all()
    return {
        "submissions": [
            {
                "id": str(s.id),
                "problem_id": str(s.problem_id),
                "problem_title": problem.title,
                "language": s.language,
                "status": s.status,
                "score": s.score,
                "execution_time_ms": s.execution_time_ms,
                "memory_kb": s.memory_kb,
                "submitted_at": s.submitted_at.isoformat(),
            }
            for s, problem in rows
        ]
    }


@router.post("/tab-switch")
async def log_tab_switch(
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    participant=Depends(require_participant),
    membership=Depends(require_active_team_member),
):
    """Anti-cheat marker: fired by the workspace when the browser detects the
    participant left the window/tab. Recorded to the audit trail so an admin
    can see the team kept straying mid-relay (see docs/ARCHITECTURE.md)."""
    await log_action(
        db,
        user_id=participant.user_id,
        action="TAB_SWITCH",
        metadata={"where": "coding", "switched_at": payload.get("switched_at")},
    )
    return {"ok": True, "member_number": membership.member_number}
