"""
Repository functions backing the Round 2 authorization guards in
core/security.py. Nothing here trusts a client-supplied team_id/member_id
beyond using it to look up rows scoped to the authenticated participant —
the participant_id always comes from the verified identity.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import TeamMember, Team, TeamSession, Participant


async def get_membership_for_participant(
    db: AsyncSession, team_id: str, participant_id
) -> TeamMember | None:
    """Returns this participant's membership row for the given team, or None
    if they aren't on it — the None case is what makes an unrelated
    participant's request to someone else's team_id fail with FORBIDDEN
    rather than leaking team state."""
    return await db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.participant_id == participant_id)
    )


async def get_membership_for_participant_any_team(
    db: AsyncSession, participant_id
) -> TeamMember | None:
    """A participant belongs to at most one team per competition, so Round 2
    write actions (save/run/submit/handoff) resolve the team purely from the
    caller's identity rather than requiring/trusting a team_id from the
    client. Returns the most recently created membership if somehow more
    than one exists (defensive; team creation should enforce uniqueness)."""
    return await db.scalar(
        select(TeamMember)
        .where(TeamMember.participant_id == participant_id)
        .order_by(TeamMember.id.desc())
        .limit(1)
    )


async def get_team(db: AsyncSession, team_id: str) -> Team | None:
    return await db.get(Team, team_id)


async def get_team_session(db: AsyncSession, team_id: str) -> TeamSession | None:
    return await db.scalar(select(TeamSession).where(TeamSession.team_id == team_id))


async def get_participant_id_for_user(db: AsyncSession, user_id) -> str | None:
    participant = await db.scalar(select(Participant).where(Participant.user_id == user_id))
    return str(participant.id) if participant else None
