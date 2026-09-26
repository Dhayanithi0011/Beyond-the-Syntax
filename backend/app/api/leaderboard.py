"""
Admin-only leaderboards, computed live from quiz_attempts / submissions. The
participant-facing leaderboard was removed — the standings now belong to the
admin console and require `require_admin`. Round 1 ranks by score desc, then
fastest submission. Round 2 ranks every dealt participant by total individual
score (sum over their 3 dealt problems), then by how fast they reached their
final submission after the shared timer started.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_admin
from app.api.admin import _active_competition, _value
from app.models.models import (
    AttemptStatus, Participant, Question, QuizAttempt, Round2Session, Submission, User,
)

router = APIRouter(prefix="/admin/leaderboard", tags=["admin"])

SUBMITTED = (AttemptStatus.submitted, AttemptStatus.auto_submitted)


@router.get("/round1")
async def leaderboard_round1(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    qmarks = {
        str(q.id): q.marks
        for q in (await db.scalars(select(Question).where(Question.competition_id == comp.id))).all()
    }
    rows = (
        await db.execute(
            select(Participant, User, QuizAttempt)
            .join(User, User.id == Participant.user_id)
            .join(QuizAttempt, QuizAttempt.participant_id == Participant.id)
            .where(
                QuizAttempt.competition_id == comp.id,
                QuizAttempt.status.in_(SUBMITTED),
            )
        )
    ).all()

    entries = []
    latest = None
    for p, user, attempt in rows:
        score = attempt.score or 0
        total = sum(qmarks.get(qid, 0) for qid in (attempt.question_order or []))
        time_taken = 0
        if attempt.submitted_at and attempt.started_at:
            time_taken = max(int((attempt.submitted_at - attempt.started_at).total_seconds()), 0)
        if attempt.submitted_at and (latest is None or attempt.submitted_at > latest):
            latest = attempt.submitted_at
        entries.append({
            "rank": 0,
            "id": str(p.id),
            "name": user.name,
            "participant_code": p.participant_code,
            "department": p.department,
            "year": p.year,
            "score": score,
            "total": total,
            "time_taken_seconds": time_taken,
            "qualification_status": _value(attempt.qualification_status) or "pending",
        })

    entries.sort(key=lambda e: (-e["score"], e["time_taken_seconds"]))
    for i, e in enumerate(entries):
        e["rank"] = i + 1

    return {"entries": entries, "updated_at": latest.isoformat() if latest else None}


@router.get("/round2")
async def leaderboard_round2(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    sessions = (
        await db.scalars(select(Round2Session).where(Round2Session.competition_id == comp.id))
    ).all()
    by_participant = {str(s.participant_id): s for s in sessions}

    rows = (
        await db.execute(
            select(Submission.participant_id, func.sum(Submission.score), func.max(Submission.submitted_at))
            .where(Submission.participant_id.in_([str(x) for x in by_participant]))
            .group_by(Submission.participant_id)
        )
    ).all()
    by_pid = {
        str(pid): {"score": int(score or 0), "last_submitted_at": last}
        for pid, score, last in rows
    }

    people = (
        await db.execute(
            select(Participant, User)
            .join(User, User.id == Participant.user_id)
            .where(Participant.id.in_([str(x) for x in by_participant]))
        )
    ).all()
    info = {str(p.id): {"name": user.name, "participant_code": p.participant_code} for p, user in people}

    entries = []
    updated_at = None
    for participant_id, session in by_participant.items():
        agg = by_pid.get(participant_id, {"score": 0, "last_submitted_at": None})
        time_seconds = 0
        if session.started_at and agg["last_submitted_at"] is not None:
            time_seconds = max(int((agg["last_submitted_at"] - session.started_at).total_seconds()), 0)
        if agg["last_submitted_at"] and (updated_at is None or agg["last_submitted_at"] > updated_at):
            updated_at = agg["last_submitted_at"]
        status = _value(session.status)
        if agg["score"] <= 0 and status not in ("active", "completed"):
            continue
        entries.append({
            "rank": 0,
            "participant_id": participant_id,
            "name": info.get(participant_id, {}).get("name", "Participant"),
            "participant_code": info.get(participant_id, {}).get("participant_code", ""),
            "score": agg["score"],
            "time_seconds": time_seconds,
            "status": status,
        })

    entries.sort(key=lambda e: (-e["score"], e["time_seconds"]))
    for i, e in enumerate(entries):
        e["rank"] = i + 1

    return {"entries": entries, "updated_at": updated_at.isoformat() if updated_at else None}