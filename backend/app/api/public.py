"""
Public (unauthenticated) endpoints for the landing page, quiz lobby and rules
page. All counts are computed live from the database.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import AuthError
from app.models.models import CodingProblem, Competition, Participant, Question, Team, TeamSession

router = APIRouter(tags=["public"])


async def _latest_competition(db: AsyncSession) -> Competition:
    comp = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
    if comp is None:
        raise AuthError("NOT_FOUND", "No competition has been configured yet.", 404)
    return comp


@router.get("/competition")
async def get_competition(db: AsyncSession = Depends(get_db)):
    comp = await _latest_competition(db)

    questions = (
        await db.scalar(
            select(func.count()).select_from(Question).where(
                Question.competition_id == comp.id, Question.is_enabled.is_(True)
            )
        )
        or 0
    )
    problems = (
        await db.scalar(select(func.count()).select_from(CodingProblem).where(CodingProblem.competition_id == comp.id))
        or 0
    )
    participants = await db.scalar(select(func.count()).select_from(Participant)) or 0
    colleges = (
        await db.scalar(
            select(func.count(func.distinct(Participant.department)))
            .select_from(Participant)
            .where(Participant.department.isnot(None))
        )
        or 0
    )

    team_ids = select(Team.id).where(Team.competition_id == comp.id)
    round2_ends_at = await db.scalar(
        select(func.max(TeamSession.team_deadline)).where(TeamSession.team_id.in_(team_ids))
    )

    return {
        "id": str(comp.id),
        "name": comp.name,
        "tagline": "Inter-college competitive programming championship",
        "state": comp.state.value if comp.state else "draft",
        "registration_open": bool(comp.registration_open),
        "round1_duration_seconds": comp.round1_duration_seconds,
        "round2_team_duration_seconds": comp.round2_team_duration_seconds,
        "round2_early_handoff_allowed": bool(comp.round2_early_handoff_allowed),
        "round1_questions": questions,
        "round2_problems": problems,
        "participants_accepted": participants,
        "colleges": colleges if participants else 0,
        "round2_ends_at": round2_ends_at.isoformat() if round2_ends_at else None,
    }


@router.get("/rules")
async def get_rules():
    return {
        "rules": [
            {
                "title": "Eligibility",
                "body": "Open to all enrolled undergraduate students. One registration per participant.",
            },
            {
                "title": "Round 1 — Individual Quiz",
                "body": (
                    "A timed technical MCQ round (30 minutes). Each participant receives a randomized "
                    "question and option order. Questions are auto-submitted when the timer ends."
                ),
            },
            {
                "title": "Qualification",
                "body": (
                    "Only top performers, as decided by the organizing committee, qualify for Round 2. "
                    "The rankings order by score, then by fastest submission."
                ),
            },
            {
                "title": "Round 2 — Coding Relay",
                "body": (
                    "Qualified participants form teams of 3. The team shares a fixed 45 minutes — "
                    "a 15-minute turn for each member, in relay order. A member's clock starts only "
                    "when they enter the workspace and pauses in between turns. There is no time bank: "
                    "any time left unused in a turn is discarded, so the team's remaining time steps "
                    "down 45 → 30 → 15 as each turn is used. The final member cannot hand off. Teams "
                    "that finish their work early may close the round ahead of time."
                ),
            },
            {
                "title": "Fair Play",
                "body": (
                    "Collaboration is strictly within your own team and only during your own turn. "
                    "Switching tabs, exiting fullscreen and other suspicious activity is recorded and "
                    "reviewed by the committee. All grading decisions by the committee are final."
                ),
            },
        ]
    }