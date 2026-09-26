"""
Admin-only leaderboards, computed live from quiz_attempts / submissions. The
participant-facing leaderboard was removed — the standings now belong to the
admin console and require `require_admin` (see docs: "leaderboard admin-only").
Round 1 ranks by score desc, then fastest submission. Round 2 ranks by total
team score, then fastest completion.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_admin
from app.api.admin import _active_competition, _value
from app.models.models import AttemptStatus, Participant, Question, QuizAttempt, Submission, TeamSession, User
from app.services.team_service import load_team_rows

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
    team_rows = await load_team_rows(db, comp.id)

    started_at = {
        str(tm): ts
        for tm, ts in (await db.execute(select(TeamSession.team_id, TeamSession.team_started_at))).all()
    }
    finished_at = {
        str(team_id): at
        for team_id, at in (
            await db.execute(select(Submission.team_id, func.max(Submission.submitted_at)).group_by(Submission.team_id))
        ).all()
    }

    entries = []
    for t in team_rows:
        status = t["status"]
        time_seconds = 0
        if status == "completed" and t["id"] in started_at and t["id"] in finished_at:
            time_seconds = max(int((finished_at[t["id"]] - started_at[t["id"]]).total_seconds()), 0)
        if t["score"] <= 0 and status not in ("completed", "active", "paused"):
            continue
        entries.append({
            "rank": 0,
            "team_id": t["id"],
            "name": t["name"],
            "color": t["color"],
            "score": t["score"],
            "time_seconds": time_seconds,
            "status": status,
        })

    entries.sort(key=lambda e: (-e["score"], e["time_seconds"]))
    for i, e in enumerate(entries):
        e["rank"] = i + 1

    updated_at = max(finished_at.values(), default=None)
    return {"entries": entries, "updated_at": updated_at.isoformat() if updated_at else None}