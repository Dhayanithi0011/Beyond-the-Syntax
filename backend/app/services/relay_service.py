"""
Server-authoritative relay state machine.

This is the single place that decides whose turn it is and how much time is
left. It is called defensively at the start of every Round 2 request so that
even a team nobody has touched in minutes reflects accurate state the instant
someone (participant or admin) looks at it — no reliance on a cron job being
perfectly on time.

Timing model (verified against product owner):
  * The team budget is `round2_team_duration_seconds` (45 min) of ACTIVE time.
    It does NOT start at admin approval. The first member's workspace entry
    starts the clock; when that member hands off the clock FREEZES; the next
    member's entry resumes it. Only time spent mid-turn accrues — this is
    stored in `team_time_used_seconds` and never ticks while idle.
  * Each member gets a nominal 15-minute slice (duration / 3). Their private
    countdown starts lazily the first time the CURRENT member opens the coding
    workspace (`ensure_member_clock`), capped by the team budget still left.
  * Only the time a member actually USES is spent (`_accrue_usage`). An early
    hand off keeps the unused remainder in the team budget — the next member
    still enters with a fresh 15:00 of their own.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthError
from app.models.models import Team, TeamMember, TeamSession, SessionStatus, Competition


def budget_seconds(competition: Competition | None) -> int:
    return competition.round2_team_duration_seconds if competition and competition.round2_team_duration_seconds else 45 * 60


def team_time_remaining(session: TeamSession, competition: Competition | None) -> int:
    """Seconds of active budget still unused. This is a STATIC snapshot — it
    only drops when a turn actually runs, never while the relay is idle."""
    return max(budget_seconds(competition) - (session.team_time_used_seconds or 0), 0)


async def _accrue_usage(db: AsyncSession, session: TeamSession, now: datetime, budget: int, slice_seconds: int) -> bool:
    """Fold the just-finished turn's usage into the team budget. Returns True
    when the whole budget has been consumed (relay time is over)."""
    started = session.member_started_at
    used = int((now - started).total_seconds()) if started else 0
    used = max(min(used, slice_seconds), 0)
    session.team_time_used_seconds = min((session.team_time_used_seconds or 0) + used, budget)
    return (session.team_time_used_seconds or 0) >= budget


async def get_team_or_404(db: AsyncSession, team_id: str) -> Team:
    team = await db.get(Team, team_id)
    if team is None:
        raise AuthError("NOT_FOUND", "Team not found", 404)
    return team


async def sync_team_session_state(db: AsyncSession, team_id: str) -> TeamSession:
    session = await db.scalar(select(TeamSession).where(TeamSession.team_id == team_id))
    if session is None:
        raise AuthError("NOT_FOUND", "Team session not found", 404)

    if session.status != SessionStatus.active:
        return session

    now = datetime.now(timezone.utc)

    if session.team_time_used_seconds is None:
        session.team_time_used_seconds = 0

    if session.member_deadline and now >= session.member_deadline:
        await _advance_locked(db, session, reason="timeout")

    return session


async def advance_to_next_member(db: AsyncSession, team_id: str, reason: str) -> TeamSession:
    session = await db.scalar(select(TeamSession).where(TeamSession.team_id == team_id))
    if session is None or session.status != SessionStatus.active:
        raise AuthError("CONFLICT", "Team is not currently active", 409)

    if reason == "early_handoff":
        team = await db.get(Team, team_id)
        competition = await db.get(Competition, team.competition_id)
        if not competition.round2_early_handoff_allowed:
            raise AuthError(
                "EARLY_HANDOFF_DISABLED",
                "Early handoff is disabled for this competition; wait for your timer to expire.",
                409,
            )

    await _advance_locked(db, session, reason=reason)
    return session


async def _advance_locked(db: AsyncSession, session: TeamSession, reason: str):
    """Moves the relay to the next member. The relay cycles round-robin:
    member 3 hands back to member 1, incrementing `completed_rounds` so the
    team's question-set advances — the next set starts only after a complete
    full pass of all 3 members.

    The finished turn's actual usage is folded into `team_time_used_seconds`
    (the team clock PAUSES here — nothing ticks while idle). The incoming
    member then has no clock at all until they open the workspace
    (`ensure_member_clock`). If the whole team budget is gone, the relay is
    over.
    """
    team_members_count = 3
    next_number = (session.current_member_number or 0) + 1

    if next_number > team_members_count:
        next_number = 1
        session.completed_rounds = (session.completed_rounds or 0) + 1

    team = await db.get(Team, session.team_id)
    competition = await db.get(Competition, team.competition_id) if team else None
    slice_seconds = budget_seconds(competition) // team_members_count
    exhausted = await _accrue_usage(db, session, datetime.now(timezone.utc), budget_seconds(competition), slice_seconds)

    session.current_member_number = next_number
    session.member_started_at = None
    session.member_deadline = None
    if exhausted:
        session.status = SessionStatus.expired
    await db.commit()
    # A MEMBER_HANDOFF / SESSION_EXPIRED audit_log entry and a /ws/team/{id}
    # push are emitted here once the WebSocket layer lands (Phase 12).


async def ensure_member_clock(db: AsyncSession, session: TeamSession) -> TeamSession:
    """Lazily starts the CURRENT member's private countdown the first time they
    enter the coding workspace. Until they show up, no personal timer runs, and
    the team clock is frozen (usage only accrues mid-turn). The member slice is
    their own 15 minutes capped by the team budget actually left — if that is
    zero the relay is over. Re-entry is a no-op — the clock is never restarted
    by a second page load."""
    if session.member_deadline is not None:
        return session
    if session.status != SessionStatus.active:
        return session

    team = await db.get(Team, session.team_id)
    competition = await db.get(Competition, team.competition_id) if team else None
    remaining = team_time_remaining(session, competition)
    if remaining <= 0:
        session.status = SessionStatus.expired
        await db.commit()
        return session

    if session.team_started_at is None:
        session.team_started_at = datetime.now(timezone.utc)

    slice_seconds = min(budget_seconds(competition) // 3, remaining)
    now = datetime.now(timezone.utc)
    session.member_started_at = now
    session.member_deadline = now + timedelta(seconds=slice_seconds)
    await db.commit()
    return session
