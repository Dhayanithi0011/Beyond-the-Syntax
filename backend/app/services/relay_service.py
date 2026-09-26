"""
Server-authoritative relay state machine.

This is the single place that decides whose turn it is and how much time is
left. It is called defensively at the start of every Round 2 request so that
even a team nobody has touched in minutes reflects accurate state the instant
someone (participant or admin) looks at it — no reliance on a cron job being
perfectly on time.

Timing model (verified against product owner):
  * The team budget is `round2_team_duration_seconds` (45 min) split into one
    fixed 15-minute slice per member (duration / 3). It does NOT start at admin
    approval. The CURRENT member's private countdown starts lazily the first
    time they open the coding workspace (`ensure_member_clock`); in between
    turns nothing ticks.
  * There is NO time bank: a member's turn spends their ENTIRE slice from the
    team budget whether they use it all or hand off early (`_consume_slice`).
    Unused time is discarded, so the team total steps down 45 -> 30 -> 15 as
    each turn is used. The last member cannot hand off and their remaining
    time simply runs out.
  * A team that finishes its work early can close the round by calling
    `complete_team_round` (POST /coding/complete) — the whole budget is
    consumed and the session is flagged `completed` immediately.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthError
from app.models.models import Team, TeamMember, TeamSession, SessionStatus, Competition


TEAM_MEMBERS_COUNT = 3


def budget_seconds(competition: Competition | None) -> int:
    return competition.round2_team_duration_seconds if competition and competition.round2_team_duration_seconds else 45 * 60


def team_time_remaining(session: TeamSession, competition: Competition | None) -> int:
    """Seconds of active budget still unused. This is a STATIC snapshot — it
    only drops when a turn is completed (or the round is closed early), never
    while the relay is idle."""
    return max(budget_seconds(competition) - (session.team_time_used_seconds or 0), 0)


async def _consume_slice(session: TeamSession, budget: int, slice_seconds: int) -> bool:
    """A member's turn spends their ENTIRE allocated slice from the team
    budget. Any unused remainder is deliberately discarded — there is no time
    bank (every member keeps a fixed 15:00 of their own). Returns True when the
    whole budget has been consumed (relay time is over).

    The ADMIN advance to member 1 (and any advance on a turn nobody ever
    started) has no `member_deadline`, so it spends nothing — a slice is only
    consumed after a member entered the workspace and their clock started."""
    if session.member_deadline is None:
        return (session.team_time_used_seconds or 0) >= budget
    session.team_time_used_seconds = min((session.team_time_used_seconds or 0) + slice_seconds, budget)
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
        if session.current_member_number == TEAM_MEMBERS_COUNT:
            raise AuthError(
                "LAST_MEMBER",
                "You are the final member — there is no one to hand off to. Finish the round early or let your timer run out.",
                409,
            )

    await _advance_locked(db, session, reason=reason)
    return session


async def complete_team_round(db: AsyncSession, session: TeamSession) -> TeamSession:
    """Finish the team's Round 2 immediately (early completion). Consumes the
    whole budget and flags the session `completed`, so no further turns can run
    and any remaining time is discarded. Used by POST /coding/complete."""
    team = await db.get(Team, session.team_id)
    competition = await db.get(Competition, team.competition_id) if team else None
    budget = budget_seconds(competition)
    session.team_time_used_seconds = budget
    session.member_started_at = None
    session.member_deadline = None
    session.status = SessionStatus.completed
    await db.commit()
    return session


async def _advance_locked(db: AsyncSession, session: TeamSession, reason: str):
    """Moves the relay to the next member. A turn always spends the member's
    ENTIRE 15-minute slice (`_consume_slice`) — unused time is discarded, not
    banked — so the team budget steps down by one full slice per turn. When the
    whole budget is gone the relay is over.

    The team clock PAUSES here (nothing ticks while idle): the incoming member
    has no deadline until they open the workspace (`ensure_member_clock`).
    """
    next_number = (session.current_member_number or 0) + 1

    if next_number > TEAM_MEMBERS_COUNT:
        next_number = 1
        session.completed_rounds = (session.completed_rounds or 0) + 1

    team = await db.get(Team, session.team_id)
    competition = await db.get(Competition, team.competition_id) if team else None
    slice_seconds = budget_seconds(competition) // TEAM_MEMBERS_COUNT
    exhausted = await _consume_slice(session, budget_seconds(competition), slice_seconds)

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
    enter the coding workspace — the timer starts only on workspace entry, per
    the product rule. Until they show up, no personal timer runs. The member
    slice is their own fixed 15 minutes, capped by the team budget actually
    left (which is always a multiple of the slice). If that is zero the relay
    is over. Re-entry is a no-op — the clock is never restarted by a second
    page load."""
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

    slice_seconds = min(budget_seconds(competition) // TEAM_MEMBERS_COUNT, remaining)
    now = datetime.now(timezone.utc)
    session.member_started_at = now
    session.member_deadline = now + timedelta(seconds=slice_seconds)
    await db.commit()
    return session
