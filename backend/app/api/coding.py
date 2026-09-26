"""
Coding workspace endpoints (individual Round 2).

Every participant is dealt QUESTION_COUNT problems (Q1..Q3 in strict order)
and works under ONE shared total timer. `run` executes against the visible
test cases (samples + direct self-check cases) and returns output directly to
the participant; `submit` executes against hidden test cases and only ever
returns a verdict + score, never the hidden expected output. All code
execution is delegated to the execution service — nothing here ever calls a
compiler/interpreter in-process.

Every route depends on `require_round2_session`, which resolves the caller's
individual session from their own participant row and confirms the round is
open and the shared deadline hasn't passed (see core/security.py) — no
participant_id/problem_id is ever accepted from the client here.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.errors import AuthError
from app.core.security import require_participant, require_round2_session
from app.models.models import CodingProblem, TestCase, CodeDraft, Submission, Round2Session
from app.services import round2_service
from app.services.execution_client import execute_job

router = APIRouter(prefix="/coding", tags=["coding"])

QUESTION_COUNT = round2_service.QUESTIONS_PER_PARTICIPANT


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


async def _dealt_problems(db: AsyncSession, session: Round2Session) -> list[CodingProblem]:
    order = round2_service.dealt_problem_ids(session)
    if not order:
        return []
    rows = (await db.scalars(
        select(CodingProblem).where(CodingProblem.id.in_(order))
    )).all()
    by_id = {str(p.id): p for p in rows}
    return [by_id[pid] for pid in order if pid in by_id]


def _is_unlocked(session: Round2Session, problem: CodingProblem, dealt: list) -> bool:
    index = next(i for i, p in enumerate(dealt) if str(p.id) == str(problem.id))
    return index <= session.current_index


def _assert_current_problem(db: AsyncSession, session: Round2Session, problem: CodingProblem | None) -> None:
    """Strict-order gate: a participant may only interact with the ONE problem
    whose turn it currently is (Q1 first; submitting Q1 unlocks Q2, etc.). No
    skipping ahead, no re-opening finished questions for edits."""
    if problem is None:
        raise AuthError("NOT_FOUND", "Problem not found.", 404)
    dealt = round2_service.dealt_problem_ids(session)
    if str(problem.id) not in dealt:
        raise AuthError("FORBIDDEN", "That question isn't part of your dealt Round 2 set.")
    if str(problem.id) != round2_service.current_problem_id(session):
        raise AuthError(
            "LOCKED",
            "This question is locked — finish the current question first (strict order Q1 → Q2 → Q3).",
        )


async def _solved_map(db: AsyncSession, participant_id, problem_ids: list) -> dict:
    """{problem_id: best_score} for the given problems — score > 0 means the
    participant has an accepted submission on it."""
    return {
        str(pid): score
        for pid, score in (
            await db.execute(
                select(Submission.problem_id, func.max(Submission.score))
                .where(
                    Submission.participant_id == participant_id,
                    Submission.problem_id.in_(list(problem_ids)),
                )
                .group_by(Submission.problem_id)
            )
        ).all()
    }


def _session_payload(session: Round2Session) -> dict:
    return {
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "deadline": session.deadline.isoformat() if session.deadline else None,
        "time_remaining_seconds": round2_service.time_remaining_seconds(session),
        "current_index": session.current_index,
        "total_questions": len(round2_service.dealt_problem_ids(session)),
    }


@router.get("/problems")
async def list_problems(db: AsyncSession = Depends(get_db), session=Depends(require_round2_session)):
    """Returns ONLY the 3 questions dealt to this participant (Q1..Q3), with
    strict-order unlock state, plus the single shared round clock."""
    dealt = await _dealt_problems(db, session)
    best = await _solved_map(db, session.participant_id, [p.id for p in dealt])
    return {
        "kind": "round2",
        "session": _session_payload(session),
        "participant": {
            "name": session.participant.user.name if session.participant.user else "",
            "participant_code": session.participant.participant_code,
        },
        "problems": [
            {
                "id": str(p.id),
                "title": p.title,
                "position": p.position,
                "q_number": index + 1,
                "domain": p.domain,
                "difficulty": p.difficulty,
                "max_score": p.max_score,
                "solved": best.get(str(p.id), 0) > 0,
                "score": best.get(str(p.id), 0),
                "unlocked": index <= session.current_index,
            }
            for index, p in enumerate(dealt)
        ],
    }


@router.get("/problems/{problem_id}")
async def get_problem(
    problem_id: str, db: AsyncSession = Depends(get_db), session=Depends(require_round2_session)
):
    problem = await db.get(CodingProblem, problem_id)
    _assert_current_problem(db, session, problem)
    samples = (
        await db.scalars(
            select(TestCase).where(
                TestCase.problem_id == problem_id, TestCase.test_type.in_(["sample", "direct"])
            ).order_by(case((TestCase.test_type == "sample", 0), else_=1), TestCase.id)
        )
    ).all()
    draft = await db.scalar(
        select(CodeDraft).where(
            CodeDraft.participant_id == session.participant_id, CodeDraft.problem_id == problem_id
        )
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
    payload: dict, db: AsyncSession = Depends(get_db), session=Depends(require_round2_session)
):
    problem = await db.get(CodingProblem, payload["problem_id"])
    _assert_current_problem(db, session, problem)
    draft = await db.scalar(
        select(CodeDraft).where(
            CodeDraft.participant_id == session.participant_id, CodeDraft.problem_id == payload["problem_id"]
        )
    )
    now = datetime.now(timezone.utc)
    if draft is None:
        draft = CodeDraft(
            participant_id=session.participant_id, problem_id=payload["problem_id"], updated_at=now
        )
        db.add(draft)
    languages = dict(draft.languages or {})
    languages[payload["language"]] = payload["source_code"]
    draft.languages = languages
    draft.language = payload["language"]
    draft.source_code = payload["source_code"]
    await db.commit()
    return {"saved": True, "saved_at": now.isoformat()}


@router.post("/run")
async def run_code(
    payload: dict, db: AsyncSession = Depends(get_db), session=Depends(require_round2_session)
):
    problem = await db.get(CodingProblem, payload["problem_id"])
    _assert_current_problem(db, session, problem)
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
    payload: dict, db: AsyncSession = Depends(get_db), session=Depends(require_round2_session)
):
    problem = await db.get(CodingProblem, payload["problem_id"])
    _assert_current_problem(db, session, problem)
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
        participant_id=session.participant_id,
        problem_id=problem.id,
        language=payload["language"],
        source_code=payload["source_code"],
        status=verdict,
        execution_time_ms=worst_time,
        memory_kb=worst_mem,
        score=score,
    )
    db.add(submission)
    await db.commit()

    # Strict order: an accepted-or-not verdict still moves the pointer to the
    # next dealt question; submitting Q3 completes the session.
    await round2_service.advance(db, session)
    await log_action(
        db,
        user_id=session.participant.user_id,
        action="CODING_SUBMIT",
        metadata={
            "problem_id": str(problem.id),
            "problem_title": problem.title,
            "verdict": verdict,
            "score": score,
        },
    )
    return {
        "submission_id": str(submission.id),
        "status": verdict,
        "score": score,
        "passed": passed,
        "total": len(hidden_cases),
        "execution_time_ms": worst_time,
        "memory_kb": worst_mem,
        "judge": "real",
        "completed": (session.status == "completed"),
        "current_index": session.current_index,
    }


@router.post("/complete")
async def finish_early(db: AsyncSession = Depends(get_db), session=Depends(require_round2_session)):
    """End this participant's Round 2 immediately — for solvers who finish
    their dealt questions mid-round. Any remaining time on the shared clock is
    discarded and no further questions can be worked."""
    await round2_service.complete_session(db, session)
    await log_action(
        db,
        user_id=session.participant.user_id,
        action="ROUND2_COMPLETED",
        metadata={"completed_at": datetime.now(timezone.utc).isoformat()},
    )
    return {"completed": True, "message": "Round 2 complete — remaining time has ended here."}


@router.get("/submissions")
async def list_submissions(
    problem_id: str | None = None, db: AsyncSession = Depends(get_db), session=Depends(require_round2_session)
):
    query = (
        select(Submission, CodingProblem)
        .join(CodingProblem, CodingProblem.id == Submission.problem_id)
        .where(Submission.participant_id == session.participant_id)
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
):
    """Anti-cheat marker: fired by the workspace when the browser detects the
    participant left the window/tab. Recorded to the audit trail so an admin
    can see the participant kept straying during Round 2."""
    await log_action(
        db,
        user_id=participant.user_id,
        action="TAB_SWITCH",
        metadata={"where": "coding", "switched_at": payload.get("switched_at")},
    )
    return {"ok": True}