"""
Round 2 (individual) participant endpoints.

The Round 2 state machine lives in `services/round2_service`. Every browser
clock is derived server-side: `status` returns the caller's dealt-session
snapshot (single shared total timer, strict Q1 -> Q2 -> Q3 order). Participants
never receive or send problem UUIDs for their own session beyond the ones the
API returns — identity is always derived from the verified token.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_participant
from app.models.models import Competition
from app.services import round2_service

router = APIRouter(prefix="/round2", tags=["round2"])


@router.get("/status")
async def get_round2_status(db: AsyncSession = Depends(get_db), participant=Depends(require_participant)):
    """Participant-facing Round 2 snapshot. Never errors when the caller has no
    session — it lets the frontend pick between 'not qualified' / 'awaiting
    launch' / 'in progress' / 'finished' without depending on a 4xx from a guard."""
    qual = await round2_service.qualification_status(db, participant.id)
    competition = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
    session = await round2_service.get_session(db, participant.id)
    if session is not None:
        session = await round2_service.sync_session_state(db, session)

    payload = {
        "qualified": qual == "qualified",
        "qualification_status": qual,
        "your_participant_code": participant.participant_code,
        "competition_state": competition.state.value if competition else None,
        "round2_duration_seconds": round2_service.round2_total_seconds(competition),
    }

    if session is None:
        payload["session"] = None
        return payload

    remaining = round2_service.time_remaining_seconds(session)
    payload["session"] = {
        "status": session.status.value,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "deadline": session.deadline.isoformat() if session.deadline else None,
        "time_remaining_seconds": remaining,
        "current_index": session.current_index,
        "total_questions": len(round2_service.dealt_problem_ids(session)),
    }
    return payload