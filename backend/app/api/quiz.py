"""
Round 1 — quiz endpoints.

Key rules enforced here (see docs/ARCHITECTURE.md / API_SPEC.md):
- Question order AND option order are randomized per participant, server-side,
  and persisted on the attempt so a refresh doesn't reshuffle.
- `correct_option` is stripped before any response reaches the participant.
- Grading happens only in `submit`, never trusted from the client.
- One attempt per (participant, competition) unless an admin resets it.
"""
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.security import require_participant, AuthError
from app.models.models import (
    QuizAttempt, QuizAnswer, Question, Competition, AttemptStatus, Option
)

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/start")
async def start_quiz(db: AsyncSession = Depends(get_db), participant=Depends(require_participant)):
    existing = await db.scalar(
        select(QuizAttempt).where(QuizAttempt.participant_id == participant.id)
    )
    if existing:
        return _attempt_summary(existing, time_taken_seconds=_time_taken(existing))

    competition = await db.scalar(select(Competition).where(Competition.state == "round1_active"))
    if competition is None:
        raise AuthError("ROUND_NOT_AVAILABLE", "Round 1 is not currently active", 409)

    questions = (
        await db.scalars(
            select(Question).where(
                Question.competition_id == competition.id, Question.is_enabled.is_(True)
            )
        )
    ).all()
    question_ids = [str(q.id) for q in questions]
    random.shuffle(question_ids)

    option_order = {
        qid: random.sample(["A", "B", "C", "D"], 4) for qid in question_ids
    }

    now = datetime.now(timezone.utc)
    attempt = QuizAttempt(
        participant_id=participant.id,
        competition_id=competition.id,
        question_order=question_ids,
        option_order=option_order,
        started_at=now,
        deadline=now + timedelta(seconds=competition.round1_duration_seconds),
        status=AttemptStatus.in_progress,
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return _attempt_summary(attempt)


@router.get("/attempt")
async def get_attempt(db: AsyncSession = Depends(get_db), participant=Depends(require_participant)):
    """Read-only attempt summary (no side effects) so the lobby can show a
    completed/submitted state without accidentally creating or starting a quiz."""
    attempt = await _require_attempt(db, participant.id)
    return _attempt_summary(attempt, time_taken_seconds=_time_taken(attempt))


@router.get("/questions")
async def get_questions(db: AsyncSession = Depends(get_db), participant=Depends(require_participant)):
    attempt = await _require_attempt(db, participant.id)
    questions_by_id = {
        str(q.id): q
        for q in (await db.scalars(select(Question).where(Question.id.in_(attempt.question_order)))).all()
    }
    out = []
    for qid in attempt.question_order:
        q = questions_by_id[qid]
        option_text = {"A": q.option_a, "B": q.option_b, "C": q.option_c, "D": q.option_d}
        shuffled = attempt.option_order[qid]
        out.append({
            "question_id": qid,
            "text": q.text,
            # options re-labelled A-D in shuffled display order; correct_option is never included,
            # and marks stay hidden from participants (admin-only).
            "options": [{"label": lbl, "text": option_text[orig]} for lbl, orig in zip("ABCD", shuffled)],
            "category": q.category,
        })
    return {"questions": out, "deadline": attempt.deadline.isoformat()}


@router.post("/answer")
async def save_answer(
    payload: dict, db: AsyncSession = Depends(get_db), participant=Depends(require_participant)
):
    attempt = await _require_attempt(db, participant.id)
    _reject_if_closed(attempt)

    answer = await db.scalar(
        select(QuizAnswer).where(
            QuizAnswer.attempt_id == attempt.id, QuizAnswer.question_id == payload["question_id"]
        )
    )
    display_label = payload["selected_option"]  # 'A'..'D' as shown to the participant
    original_option = attempt.option_order[payload["question_id"]]["ABCD".index(display_label)]

    if answer is None:
        answer = QuizAnswer(attempt_id=attempt.id, question_id=payload["question_id"])
        db.add(answer)
    answer.selected_option = Option(original_option)
    await db.commit()
    return {"saved": True}


@router.post("/submit")
async def submit_quiz(db: AsyncSession = Depends(get_db), participant=Depends(require_participant)):
    attempt = await _require_attempt(db, participant.id)
    if attempt.status != AttemptStatus.in_progress:
        raise AuthError("ALREADY_SUBMITTED", "This attempt has already been submitted.", 409)

    return await _grade_and_close(db, attempt, auto=False)


@router.post("/tab-switch")
async def log_tab_switch(
    payload: dict = {}, db: AsyncSession = Depends(get_db), participant=Depends(require_participant)
):
    """Anti-cheat marker fired by the quiz screen when the browser detects the
    participant switched away from the tab. Recorded to the audit trail so
    admins can see who kept leaving the exam window."""
    await log_action(
        db,
        user_id=participant.user_id,
        action="TAB_SWITCH",
        metadata={"where": "quiz", "switched_at": payload.get("switched_at")},
    )
    return {"ok": True}


async def _grade_and_close(db: AsyncSession, attempt: QuizAttempt, auto: bool) -> dict:
    answers = (
        await db.scalars(select(QuizAnswer).where(QuizAnswer.attempt_id == attempt.id))
    ).all()
    questions_by_id = {
        str(q.id): q
        for q in (await db.scalars(select(Question).where(Question.id.in_(attempt.question_order)))).all()
    }

    correct = incorrect = score = 0
    for ans in answers:
        q = questions_by_id[str(ans.question_id)]
        ans.is_correct = ans.selected_option is not None and ans.selected_option == q.correct_option
        if ans.is_correct:
            correct += 1
            score += q.marks
        elif ans.selected_option is not None:
            incorrect += 1

    attempt.score = score
    attempt.correct_count = correct
    attempt.incorrect_count = incorrect
    attempt.submitted_at = datetime.now(timezone.utc)
    attempt.status = AttemptStatus.auto_submitted if auto else AttemptStatus.submitted
    await db.commit()
    return _attempt_summary(attempt, time_taken_seconds=_time_taken(attempt))


def _reject_if_closed(attempt: QuizAttempt):
    if attempt.status != AttemptStatus.in_progress:
        raise AuthError("ALREADY_SUBMITTED", "This attempt has already been submitted.", 409)
    if datetime.now(timezone.utc) >= attempt.deadline:
        # Caller flows should trigger auto-submit instead of allowing further writes.
        raise AuthError("DEADLINE_PASSED", "The time for this attempt has ended.", 409)


async def _require_attempt(db: AsyncSession, participant_id) -> QuizAttempt:
    attempt = await db.scalar(select(QuizAttempt).where(QuizAttempt.participant_id == participant_id))
    if attempt is None:
        raise AuthError("NOT_FOUND", "No quiz attempt found. Call /quiz/start first.", 404)
    return attempt


def _time_taken(attempt: QuizAttempt) -> int | None:
    if attempt.submitted_at and attempt.started_at:
        return max(int((attempt.submitted_at - attempt.started_at).total_seconds()), 0)
    return None


def _attempt_summary(attempt: QuizAttempt, time_taken_seconds: int | None = None) -> dict:
    # Scores are intentionally OMITTED here: participants must never see marks —
    # only admins can (via /admin endpoints). Grading still happens in
    # _grade_and_close and the values are persisted for admins.
    return {
        "attempt_id": str(attempt.id),
        "status": attempt.status.value if attempt.status else None,
        "deadline": attempt.deadline.isoformat(),
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "time_taken_seconds": time_taken_seconds,
    }
