"""Individual Round-2 session state machine (server-authoritative).

Round 2 is now an individual round: each qualified participant is dealt
`QUESTIONS_PER_PARTICIPANT` coding problems (round-robin from the shuffled
problem deck) and must solve them in strict order Q1 -> Q2 -> Q3 under a
single shared total timer. All clock logic lives here — clients never set
deadlines, indexes or statuses.
"""
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthError
from app.models.models import (
    CodingProblem, Competition, Participant, QualificationStatus,
    QuizAttempt, Round2Session, SessionStatus,
)

QUESTIONS_PER_PARTICIPANT = 3

DEFAULT_TOTAL_SECONDS = 45 * 60  # 45-minute total budget when competition row has no duration


def round2_total_seconds(competition: Competition | None) -> int:
    """Total Round-2 timer budget. Reuses the `round2_team_duration_seconds`
    column (kept for schema stability) as the individual total duration."""
    if competition and competition.round2_team_duration_seconds:
        return int(competition.round2_team_duration_seconds)
    return DEFAULT_TOTAL_SECONDS


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def qualification_status(db: AsyncSession, participant_id) -> str:
    """Latest Round-1 quiz verdict for a participant."""
    attempt = await db.scalar(
        select(QuizAttempt)
        .where(QuizAttempt.participant_id == participant_id)
        .order_by(QuizAttempt.started_at.desc())
        .limit(1)
    )
    if attempt is not None and attempt.qualification_status is not None:
        return attempt.qualification_status.value
    return QualificationStatus.pending.value


async def qualified_participant_ids(db: AsyncSession, competition_id) -> list:
    ids = await db.scalars(
        select(QuizAttempt.participant_id)
        .where(
            QuizAttempt.competition_id == competition_id,
            QuizAttempt.qualification_status == QualificationStatus.qualified,
        )
        .order_by(QuizAttempt.participant_id)
    )
    return list(ids)


async def get_session(db: AsyncSession, participant_id) -> Round2Session | None:
    return await db.scalar(
        select(Round2Session).where(Round2Session.participant_id == participant_id)
    )


def time_remaining_seconds(session: Round2Session) -> int | None:
    """Whole seconds left until `deadline`, None when the clock hasn't started."""
    if not session.deadline:
        return None
    return max(0, int((session.deadline - utcnow()).total_seconds()))


async def sync_session_state(db: AsyncSession, session: Round2Session) -> Round2Session:
    """Flips an active session to `expired` once its deadline passes. Returns the
    (possibly updated) session. Cheap if it already expired — keeps working state
    truthful without leaning on background jobs."""
    if session.status == SessionStatus.active and session.deadline and utcnow() >= session.deadline:
        session.status = SessionStatus.expired
        await db.commit()
    return session


def active_or_raise(session: Round2Session | None) -> Round2Session:
    if session is None:
        raise AuthError("ROUND2_NOT_STARTED", "Round 2 has not been assigned to you yet.")
    if session.status in (SessionStatus.not_started,):
        raise AuthError("ROUND2_NOT_STARTED", "Round 2 has not started for you yet.")
    if session.status == SessionStatus.expired:
        raise AuthError("ROUND2_EXPIRED", "Your Round 2 session has expired.")
    if session.status == SessionStatus.completed:
        raise AuthError("ROUND2_COMPLETED", "You have already completed Round 2.")
    return session


def assert_round_open(competition: Competition | None) -> None:
    if competition is None:
        raise AuthError("ROUND2_NOT_ACTIVE", "Round 2 is not active right now.")
    if competition.state.value != "round2_active":
        raise AuthError("ROUND2_NOT_ACTIVE", "Round 2 has been closed by the organizers.")


def dealt_problem_ids(session: Round2Session) -> list[str]:
    return [str(pid) for pid in (session.problem_ids or [])]


def current_problem_id(session: Round2Session) -> str | None:
    ids = dealt_problem_ids(session)
    if session.current_index is None or session.current_index >= len(ids):
        return None
    return ids[session.current_index]


async def _random_deck(db: AsyncSession, competition_id) -> list[str]:
    problems = list(await db.scalars(
        select(CodingProblem.id)
        .where(CodingProblem.competition_id == competition_id)
        .order_by(CodingProblem.position)
    ))
    ids = [str(pid) for pid in problems]
    if len(ids) < QUESTIONS_PER_PARTICIPANT:
        raise AuthError(
            "NOT_ENOUGH_PROBLEMS",
            f"Round 2 needs at least {QUESTIONS_PER_PARTICIPANT} coding problems.",
            status_code=409,
        )
    random.shuffle(ids)
    return ids


async def start_round2(db: AsyncSession, competition_id, *, reopen_existing: bool = False) -> dict:
    """Launches the individual round for everyone who already qualified.

    Deals each qualified participant Q1..Q3 round-robin from a single freshly
    shuffled deck and opens all clocks to one shared deadline. Idempotent for
    already-running participants (waits for their existing session) unless
    `reopen_existing` is explicitly set — a second admin start never wipes a
    live deal; use the per-session reset endpoint for that."""
    deck = await _random_deck(db, competition_id)
    participant_ids = await qualified_participant_ids(db, competition_id)
    competition = await db.get(Competition, competition_id)
    total = round2_total_seconds(competition)
    now = utcnow()
    deadline = now + timedelta(seconds=total)

    dealt = 0
    for i, participant_id in enumerate(participant_ids):
        session = await get_session(db, participant_id)
        if session is None or reopen_existing:
            if session is None:
                session = Round2Session(
                    participant_id=participant_id,
                    competition_id=competition_id,
                    problem_ids=[],  # filled below
                )
                db.add(session)
            ids = [(deck[(i * QUESTIONS_PER_PARTICIPANT + k) % len(deck)])
                   for k in range(QUESTIONS_PER_PARTICIPANT)]
            session.problem_ids = ids
            session.current_index = 0
            session.status = SessionStatus.active
            session.started_at = now
            session.deadline = deadline
            dealt += 1

    if competition is not None:
        competition.state = "round2_active"

    await db.commit()
    return {"dealt": dealt, "total_sessions": len(participant_ids), "deadline": deadline.isoformat()}


async def restart_timers(db: AsyncSession, competition_id, *, session_ids: list[str] | None = None) -> dict:
    """Restarts the Round-2 clock WITHOUT re-dealing problems or touching any
    participant's progress. Every running session (active or expired) gets a
    fresh shared deadline = now + total duration. Completed sessions are left
    alone. This is the admin's "give everyone more time" override."""
    competition = await db.get(Competition, competition_id)
    total = round2_total_seconds(competition)
    now = utcnow()
    deadline = now + timedelta(seconds=total)

    query = select(Round2Session).where(Round2Session.competition_id == competition_id)
    if session_ids:
        query = query.where(Round2Session.id.in_(session_ids))
    candidates = (await db.scalars(query)).all()
    sessions = [
        s for s in candidates
        if s.status in (SessionStatus.active, SessionStatus.expired)
    ]
    for session in sessions:
        session.started_at = now
        session.deadline = deadline
        session.status = SessionStatus.active
    await db.commit()
    return {"restarted": len(sessions), "deadline": deadline.isoformat()}


async def reset_session(db: AsyncSession, session: Round2Session, competition_id) -> None:
    """Re-deals a single participant a fresh 3-problem set and restarts their clock."""
    from app.models.models import CodeDraft, Submission  # local import avoids top-level cycle cost

    await db.execute(
        Submission.__table__.delete().where(Submission.participant_id == session.participant_id)
    )
    await db.execute(
        CodeDraft.__table__.delete().where(CodeDraft.participant_id == session.participant_id)
    )

    deck = await _random_deck(db, competition_id)
    # Deterministic re-deal: take the first dealt-only ids from the fresh deck.
    ids = deck[:QUESTIONS_PER_PARTICIPANT]

    session.problem_ids = ids
    session.current_index = 0
    session.status = SessionStatus.active
    now = utcnow()
    session.started_at = now
    competition = await db.get(Competition, competition_id)
    session.deadline = now + timedelta(seconds=round2_total_seconds(competition))
    await db.commit()


async def complete_session(db: AsyncSession, session: Round2Session) -> None:
    """Marks the session finished (all questions submitted / early finish)."""
    session.status = SessionStatus.completed
    await db.commit()


async def advance(db: AsyncSession, session: Round2Session) -> None:
    """Moves the strict-order pointer to the next dealt problem or completes when
    the last question was submitted."""
    ids = dealt_problem_ids(session)
    nxt = (session.current_index or 0) + 1
    if nxt >= len(ids):
        session.status = SessionStatus.completed
    else:
        session.current_index = nxt
    await db.commit()


async def participant_score(db: AsyncSession, participant_id) -> int:
    from app.models.models import Submission  # local import to keep this module decoupled

    row = await db.execute(
        select(Submission.score).where(Submission.participant_id == participant_id)
    )
    return int(sum(s or 0 for s in row.scalars()))


async def ensure_participant_relationship(session: Round2Session, participant: Participant) -> None:
    """Kick out discordant states (deleted/mismatched participant) with a clean error."""
    if participant is None or session.participant_id != participant.id:
        raise AuthError("ROUND2_NOT_STARTED", "Your Round 2 session is not linked to your account.")