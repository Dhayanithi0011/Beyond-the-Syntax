"""
Admin-only endpoints. Every route here depends on `require_admin`. All reads
are computed live from the database (no cached leaderboards yet); state-changing
actions are recorded via core/audit.log_action.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.errors import AuthError
from app.core.security import require_admin
from app.models.models import (
    AuditLog, CodingProblem, Competition, Difficulty, Option, Participant, Question,
    QualificationStatus, QuizAnswer, QuizAttempt, AttemptStatus, Submission,
    Round2Session, SessionStatus, User,
)
from app.services import round2_service

router = APIRouter(prefix="/admin", tags=["admin"])

SUBMITTED = (AttemptStatus.submitted, AttemptStatus.auto_submitted)


async def _active_competition(db: AsyncSession) -> Competition:
    comp = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
    if comp is None:
        raise AuthError("NO_COMPETITION", "No competition has been configured yet.", 409)
    return comp


def _value(enum_value) -> str | None:
    return enum_value.value if enum_value is not None else None


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------

def _question_payload(q: Question) -> dict:
    return {
        "id": str(q.id),
        "text": q.text,
        "options": [q.option_a, q.option_b, q.option_c, q.option_d],
        "correct_option": _value(q.correct_option),
        "category": q.category,
        "difficulty": _value(q.difficulty) or "medium",
        "marks": q.marks,
        "is_enabled": bool(q.is_enabled),
    }


def _question_from_payload(payload: dict, competition_id) -> dict:
    opts = payload.get("options")
    if opts:
        option_a, option_b, option_c, option_d = (opts + [None] * 4)[:4]
    else:
        option_a = payload.get("option_a")
        option_b = payload.get("option_b")
        option_c = payload.get("option_c")
        option_d = payload.get("option_d")
    return {
        "competition_id": competition_id,
        "text": payload["text"],
        "option_a": option_a,
        "option_b": option_b,
        "option_c": option_c,
        "option_d": option_d,
        "correct_option": Option(payload["correct_option"]),
        "category": payload.get("category"),
        "difficulty": Difficulty(payload.get("difficulty", "medium")),
        "marks": payload.get("marks", 1),
        "is_enabled": payload.get("is_enabled", True),
    }


@router.get("/questions")
async def list_questions(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    questions = (
        await db.scalars(select(Question).where(Question.competition_id == comp.id).order_by(Question.created_at))
    ).all()
    return {"questions": [_question_payload(q) for q in questions]}


@router.post("/questions")
async def create_question(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    q = Question(**_question_from_payload(payload, comp.id))
    db.add(q)
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="QUESTION_CREATED", metadata={"question_id": str(q.id)}, commit=True)
    return {"id": str(q.id)}


@router.put("/questions/{question_id}")
async def update_question(question_id: str, payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    q = await db.get(Question, question_id)
    if q is None:
        raise AuthError("NOT_FOUND", "Question not found", 404)
    for key, value in _question_from_payload(payload, q.competition_id).items():
        setattr(q, key, value)
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="QUESTION_UPDATED", metadata={"question_id": question_id})
    return {"id": str(q.id)}


@router.delete("/questions/{question_id}")
async def delete_question(question_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    q = await db.get(Question, question_id)
    if q is None:
        raise AuthError("NOT_FOUND", "Question not found", 404)
    used = await db.scalar(
        select(func.count()).select_from(QuizAnswer).where(QuizAnswer.question_id == question_id)
    )
    if used:
        raise AuthError("QUESTION_IN_USE", "This question already has participant answers and cannot be deleted.", 409)
    await db.delete(q)
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="QUESTION_DELETED", metadata={"question_id": question_id})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Participants & qualification
# ---------------------------------------------------------------------------

@router.get("/participants")
async def list_participants(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    rows = (
        await db.execute(
            select(Participant, User, QuizAttempt)
            .join(User, User.id == Participant.user_id)
            .outerjoin(QuizAttempt, QuizAttempt.participant_id == Participant.id)
            .order_by(Participant.registered_at)
        )
    ).all()
    user_ids = [str(user.id) for _, user, _ in rows]

    # Tab-switch counts per person per round, from the TAB_SWITCH audit trail
    # (where='quiz' -> Round 1, where='coding' -> Round 2).
    where_field = func.jsonb_extract_path_text(AuditLog.metadata_, "where")
    tab_rows = (
        await db.execute(
            select(AuditLog.user_id, where_field, func.count())
            .where(AuditLog.action == "TAB_SWITCH", AuditLog.user_id.in_(user_ids))
            .group_by(AuditLog.user_id, where_field)
        )
    ).all()
    tab_by_user: dict[str, dict] = {}
    for uid, where, count in tab_rows:
        tab_by_user.setdefault(str(uid), {})[str(where)] = count

    # Round 2 sessions per participant (individual round — no teams any more).
    sessions = (
        await db.scalars(
            select(Round2Session).where(Round2Session.competition_id == comp.id)
        )
    ).all()
    session_by_participant = {str(s.participant_id): s for s in sessions}
    solved_by_participant: dict[str, int] = {}
    for pid, solved in (
        await db.execute(
            select(Submission.participant_id, func.count())
            .where(Submission.participant_id.in_([str(x) for x in session_by_participant]))
            .group_by(Submission.participant_id)
        )
    ).all():
        solved_by_participant[str(pid)] = solved

    participants = []
    for p, user, attempt in rows:
        if attempt and attempt.status in SUBMITTED:
            quiz_status = "submitted"
        elif attempt is not None:
            quiz_status = "in_progress"
        else:
            quiz_status = "not_submitted"
        switches = tab_by_user.get(str(user.id), {})
        sess = session_by_participant.get(str(p.id))
        participants.append({
            "id": str(p.id),
            "participant_code": p.participant_code,
            "name": user.name,
            "email": user.email,
            "department": p.department,
            "year": p.year,
            "quiz_status": quiz_status,
            "score": attempt.score if attempt else None,
            "submitted_at": attempt.submitted_at.isoformat() if attempt and attempt.submitted_at else None,
            "qualification_status": _value(attempt.qualification_status) if attempt else QualificationStatus.pending.value,
            "round2_status": _value(sess.status) if sess else None,
            "round2_solved": solved_by_participant.get(str(p.id), 0),
            "tab_switches": {
                "round1": switches.get("quiz", 0),
                "round2": switches.get("coding", 0),
            },
        })
    return {"participants": participants}


@router.post("/qualify")
async def qualify_participants(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    ids = payload["participant_ids"]
    attempts = (await db.scalars(select(QuizAttempt).where(QuizAttempt.participant_id.in_(ids)))).all()
    for a in attempts:
        a.qualification_status = QualificationStatus.qualified
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="PARTICIPANTS_QUALIFIED", metadata={"count": len(attempts)})
    return {"qualified": len(attempts)}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)

    total_participants = await db.scalar(select(func.count()).select_from(Participant)) or 0
    attempts = (
        await db.scalars(
            select(QuizAttempt).where(
                QuizAttempt.competition_id == comp.id, QuizAttempt.status.in_(SUBMITTED)
            )
        )
    ).all()
    scores = [a.score or 0 for a in attempts]

    sessions = (
        await db.scalars(select(Round2Session).where(Round2Session.competition_id == comp.id))
    ).all()
    active_sessions = [s for s in sessions if s.status == SessionStatus.active]
    completed_sessions = [s for s in sessions if s.status == SessionStatus.completed]
    expired_sessions = [s for s in sessions if s.status == SessionStatus.expired]

    total_submissions = await db.scalar(select(func.count()).select_from(Submission)) or 0
    accepted_submissions = (
        await db.scalar(select(func.count()).select_from(Submission).where(Submission.status == "accepted")) or 0
    )

    # Buckets are derived from the competition's max achievable quiz score so the
    # distribution always reflects the actual question bank (e.g. 0-30).
    max_score = (
        await db.scalar(
            select(func.coalesce(func.sum(Question.marks), 0)).where(
                Question.competition_id == comp.id, Question.is_enabled.is_(True)
            )
        )
        or 0
    )
    width = 5
    num_buckets = (max_score + width) // width
    distribution = [
        {"range": f"{i * width}–{min((i + 1) * width - 1, max_score)}", "count": 0}
        for i in range(num_buckets)
    ]
    for s in scores:
        bucket = min(s // width, num_buckets - 1) if s >= 0 else 0
        distribution[bucket]["count"] += 1

    activity: list[dict] = []

    for sub, problem, p, user in (
        await db.execute(
            select(Submission, CodingProblem, Participant, User)
            .join(CodingProblem, CodingProblem.id == Submission.problem_id)
            .outerjoin(Participant, Participant.id == Submission.participant_id)
            .outerjoin(User, User.id == Participant.user_id)
            .order_by(Submission.submitted_at.desc())
            .limit(6)
        )
    ).all():
        activity.append({
            "actor": user.name if user else "System",
            "action": "CODE_SUBMITTED",
            "target": f"{problem.title} · {sub.score} pts",
            "at": sub.submitted_at.isoformat() if sub.submitted_at else None,
        })

    recent_attempts = attempts[-6:]
    if recent_attempts:
        quiz_actors = {
            str(a.id): (user.name, p.participant_code)
            for p, user, a in (
                await db.execute(
                    select(Participant, User, QuizAttempt)
                    .join(User, User.id == Participant.user_id)
                    .where(QuizAttempt.id.in_([a.id for a in recent_attempts]))
                )
            ).all()
        }
    else:
        quiz_actors = {}

    for a in recent_attempts:
        actor, code = quiz_actors.get(str(a.id), ("Participant", ""))
        activity.append({
            "actor": actor,
            "action": "QUIZ_SUBMITTED",
            "target": f"{code} · {a.score or 0} pts",
            "at": a.submitted_at.isoformat() if a.submitted_at else None,
        })

    for s in active_sessions:
        if s.started_at:
            activity.append({
                "actor": "System",
                "action": "ROUND2_STARTED",
                "target": "Individual Round 2 launched",
                "at": s.started_at.isoformat(),
            })

    activity = [a for a in activity if a["at"]]
    activity.sort(key=lambda a: a["at"], reverse=True)

    return {
        "stats": {
            "total_participants": total_participants,
            "quiz_completed": len(attempts),
            "qualified": len([a for a in attempts if a.qualification_status == QualificationStatus.qualified]),
            "round2_sessions": len(sessions),
            "active_round2": len(active_sessions),
            "completed_round2": len(completed_sessions),
            "expired_round2": len(expired_sessions),
            "avg_quiz_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "highest_quiz_score": max(scores) if scores else 0,
            "total_submissions": total_submissions,
            "accepted_submissions": accepted_submissions,
        },
        "score_distribution": distribution,
        "recent_activity": [
            {"id": i, "actor": a["actor"], "action": a["action"], "target": a["target"], "at": a["at"]}
            for i, a in enumerate(activity[:8])
        ],
    }


# ---------------------------------------------------------------------------
# Round 2 (individual)
# ---------------------------------------------------------------------------

async def _round2_row(db: AsyncSession, session: Round2Session) -> dict:
    participant = await db.get(Participant, session.participant_id)
    user = await db.get(User, participant.user_id) if participant else None
    dealt = round2_service.dealt_problem_ids(session)

    rows = (
        await db.execute(
            select(CodingProblem.title, Submission.problem_id, func.max(Submission.score))
            .join(Submission, Submission.problem_id == CodingProblem.id)
            .where(Submission.participant_id == session.participant_id)
            .group_by(CodingProblem.title, Submission.problem_id)
        )
    ).all()
    by_problem = {str(pid): {"title": title, "score": score} for title, pid, score in rows}
    score = sum(item["score"] or 0 for item in by_problem.values())
    solved = sum(1 for item in by_problem.values() if (item["score"] or 0) > 0)

    return {
        "id": str(session.id),
        "participant_id": str(session.participant_id),
        "participant_code": participant.participant_code if participant else "",
        "name": user.name if user else "Participant",
        "status": _value(session.status),
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "deadline": session.deadline.isoformat() if session.deadline else None,
        "time_remaining_seconds": round2_service.time_remaining_seconds(session) if session.status in (SessionStatus.active,) else None,
        "current_index": session.current_index,
        "total_questions": len(dealt),
        "dealt": [
            {
                "q_number": i + 1,
                "problem_id": pid,
                "title": by_problem.get(pid, {}).get("title", "Problem"),
                "score": by_problem.get(pid, {}).get("score", 0),
                "solved": (by_problem.get(pid, {}).get("score") or 0) > 0,
            }
            for i, pid in enumerate(dealt)
        ],
        "score": score,
        "solved_count": solved,
    }


@router.get("/round2")
async def list_round2_sessions(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    sessions = (
        await db.scalars(
            select(Round2Session).where(Round2Session.competition_id == comp.id).order_by(Round2Session.created_at)
        )
    ).all()
    return {
        "sessions": [await _round2_row(db, s) for s in sessions],
        "competition_state": _value(comp.state),
        "round2_duration_seconds": round2_service.round2_total_seconds(comp),
    }


@router.post("/round2/start")
async def start_round2(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    """Launches the individual round for every qualified participant: deals each
    participant Q1..Q3 round-robin from a freshly shuffled deck and opens all
    clocks to one shared deadline. Idempotent — participants already running
    keep their existing session. Sets the competition state to `round2_active`."""
    comp = await _active_competition(db)
    result = await round2_service.start_round2(db, comp.id)
    await log_action(
        db, user_id=admin.user_id, action="ROUND2_STARTED",
        metadata={"dealt": result["dealt"], "deadline": result["deadline"]},
    )
    return {"started": result["dealt"], "total_sessions": result["total_sessions"], "deadline": result["deadline"]}


@router.post("/round2/{session_id}/reset")
async def reset_round2_session(session_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    """Re-deals one participant a fresh 3-problem set, wipes their drafts and
    submissions, and restarts their individual clock (admin override for
    connection issues / disputes)."""
    session = await db.get(Round2Session, session_id)
    if session is None:
        raise AuthError("NOT_FOUND", "Round 2 session not found", 404)
    await round2_service.reset_session(db, session, session.competition_id)
    await log_action(db, user_id=admin.user_id, action="ROUND2_SESSION_RESET", metadata={"session_id": session_id})
    return {"reset": True, "status": _value(session.status)}


@router.post("/round2/reset-timers")
async def reset_all_round2_timers(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    """Restarts the shared Round-2 clock for every running participant (active
    or expired) without re-dealing problems or touching progress. Completed
    sessions are left untouched."""
    comp = await _active_competition(db)
    result = await round2_service.restart_timers(db, comp.id)
    await log_action(
        db, user_id=admin.user_id, action="ROUND2_TIMERS_RESET",
        metadata={"restarted": result["restarted"], "deadline": result["deadline"]},
    )
    return result


@router.post("/round2/{session_id}/timer")
async def reset_round2_session_timer(session_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    """Restarts the clock for ONE participant only, keeping their current deal
    and progress (admin override when a single person lost time)."""
    session = await db.get(Round2Session, session_id)
    if session is None:
        raise AuthError("NOT_FOUND", "Round 2 session not found", 404)
    result = await round2_service.restart_timers(db, session.competition_id, session_ids=[session_id])
    await log_action(db, user_id=admin.user_id, action="ROUND2_SESSION_TIMER_RESET", metadata={"session_id": session_id})
    return result


@router.post("/round2/close")
async def close_round2(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    """Locks the coding workspace for everyone immediately (any running sessions
    keep ticking to their deadline but can no longer be worked)."""
    comp = await _active_competition(db)
    comp.state = "round2_closed"
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="ROUND2_CLOSED", metadata={})
    return {"state": comp.state}


# ---------------------------------------------------------------------------
# Live monitor
# ---------------------------------------------------------------------------

@router.get("/live")
async def live(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    sessions = (
        await db.scalars(
            select(Round2Session).where(Round2Session.competition_id == comp.id).order_by(Round2Session.created_at)
        )
    ).all()
    # Reconcile expired deadlines so the monitor reflects ground truth.
    for s in sessions:
        if s.status == SessionStatus.active:
            s = await round2_service.sync_session_state(db, s)

    in_progress_attempts = set(
        (await db.scalars(select(QuizAttempt.participant_id).where(QuizAttempt.status == AttemptStatus.in_progress))).all()
    )
    active_participants = {
        str(s.participant_id) for s in sessions if s.status == SessionStatus.active
    }
    online_count = len(
        {str(x) for x in in_progress_attempts} | {str(x) for x in active_participants}
    )

    submitted_count = await db.scalar(
        select(func.count()).select_from(QuizAttempt).where(
            QuizAttempt.competition_id == comp.id, QuizAttempt.status.in_(SUBMITTED)
        )
    ) or 0

    return {
        "online_count": online_count,
        "submitted_count": submitted_count,
        "coding_now": len(active_participants),
        "competition_state": _value(comp.state),
        "sessions": [await _round2_row(db, s) for s in sessions],
    }


# ---------------------------------------------------------------------------
# Competition lifecycle
# ---------------------------------------------------------------------------

@router.post("/competition/transition")
async def transition_competition(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    competition_id = payload.get("competition_id")
    if competition_id is None:
        # Convenience: most projects run a single competition, so the id is
        # optional — default to the most recent one.
        competition = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
    else:
        competition = await db.get(Competition, competition_id)
    if competition is None:
        raise AuthError("NOT_FOUND", "Competition not found", 404)
    to_state = payload.get("to_state")
    if to_state is None:
        raise AuthError("INVALID_REQUEST", "Missing required field: to_state", 400)
    competition.state = to_state
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="COMPETITION_STATE_CHANGED", metadata={"to_state": payload["to_state"]})
    return {"state": competition.state}