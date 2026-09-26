"""
Public (unauthenticated) endpoints for the landing page, quiz lobby and rules
page. All counts are computed live from the database.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import AuthError
from app.models.models import CodingProblem, Competition, Participant, Question, Round2Session

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

    round2_ends_at = await db.scalar(
        select(func.max(Round2Session.deadline)).where(
            Round2Session.competition_id == comp.id, Round2Session.deadline.isnot(None)
        )
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
                "title": "Round 2 — Individual Coding Sprint",
                "body": (
                    "Qualified participants compete individually. Each participant is dealt 3 coding "
                    "problems and has one fixed total time budget (45 minutes) shared across all three, "
                    "solved in strict order — Q1 first, then Q2, then Q3. Solving a question submits it "
                    "and unlocks the next; you can revisit a solved question's code history but not re-submit "
                    "outside the order. There are no teams, no turns and no handoffs. The timer starts for "
                    "everyone at once when the organizers launch the round and ends at a single shared "
                    "deadline. Finishing early ends your round immediately."
                ),
            },
            {
                "title": "Fair Play",
                "body": (
                    "The coding round is strictly individual — collaboration with anyone else is "
                    "disqualifying. Switching tabs, exiting fullscreen and other suspicious activity is "
                    "recorded and reviewed by the committee. All grading decisions by the committee are "
                    "final."
                ),
            },
        ]
    }