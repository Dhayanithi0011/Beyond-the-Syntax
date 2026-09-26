"""
Authentication & authorization dependencies.

Design rule: the frontend is never trusted for identity, role, team_id,
member_id, or timer state. Every protected route resolves the caller's
identity from the verified Supabase access token, then loads role-specific
state from the database. Where a route also receives a team_id in its URL
(for readable, RESTful paths), the dependency still derives the *real* team
from the authenticated participant's own membership and only uses the path
value to double-check consistency — never as the source of truth.
"""
from fastapi import Depends, Header, HTTPException, Path, status
from jose.exceptions import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.supabase import SupabaseAuthError, verify_access_token
from app.core.errors import AuthError
from app.core.database import get_db
from app.repositories import user_repository, team_repository
from app.services import relay_service


async def get_current_user(
    authorization: str = Header(default=""), db: AsyncSession = Depends(get_db)
):
    """Verify the Supabase access token and resolve it to our `users` row. Never
    trusts a client-supplied user id / role — only the verified `sub` claim
    (the auth.users UUID stored in `users.auth_uid`)."""
    if not authorization.startswith("Bearer "):
        raise AuthError("UNAUTHENTICATED", "Missing bearer token", status.HTTP_401_UNAUTHORIZED)
    token = authorization.removeprefix("Bearer ")
    try:
        decoded = await verify_access_token(token)
    except (SupabaseAuthError, JWTError):
        raise AuthError("UNAUTHENTICATED", "Invalid or expired token", status.HTTP_401_UNAUTHORIZED)

    user = await user_repository.get_user_by_auth_uid(db, decoded["sub"])
    if user is None:
        raise AuthError(
            "UNAUTHENTICATED", "No account for this identity. Register first.", status.HTTP_401_UNAUTHORIZED
        )
    return user


async def require_admin(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.role != "admin":
        raise AuthError("FORBIDDEN", "Admin role required")
    admin = await user_repository.get_admin_by_user_id(db, user.id)
    if admin is None:
        raise AuthError("FORBIDDEN", "Admin record missing for this user")
    admin.user = user
    return admin


async def require_participant(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Resolves and returns the `participants` row (not the `users` row) since
    that's what every quiz/team endpoint keys its data on."""
    if user.role != "participant":
        raise AuthError("FORBIDDEN", "Participant role required")
    participant = await user_repository.get_participant_by_user_id(db, user.id)
    if participant is None:
        raise AuthError("FORBIDDEN", "Participant record missing for this user")
    participant.user = user
    return participant


async def require_team_member(
    team_id: str = Path(...),
    participant=Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    """Read-access guard: confirms the caller is one of this team's 3 members.
    Does NOT check whose turn it is — use `require_active_team_member` for
    anything that writes code or advances the relay."""
    membership = await team_repository.get_membership_for_participant(db, team_id, participant.id)
    if membership is None:
        raise AuthError("FORBIDDEN", "Not a member of this team")
    return membership


async def require_team_member_any(participant=Depends(require_participant), db: AsyncSession = Depends(get_db)):
    """Read-access guard for `/teams/mine`: resolves the caller's own team (any
    competition) from their membership row — no team_id needed in the URL."""
    membership = await team_repository.get_membership_for_participant_any_team(db, participant.id)
    if membership is None:
        raise AuthError("FORBIDDEN", "Not assigned to a Round 2 team")
    return membership


async def require_active_team_member(
    participant=Depends(require_participant), db: AsyncSession = Depends(get_db)
):
    """Guards every /coding/* action and the relay handoff: qualified, on a
    team, Round 2 access granted, and it is currently this member's turn.
    This is the single choke point for Round 2 write actions — the frontend
    hiding a button is never sufficient on its own (see docs/ARCHITECTURE.md
    section 4). The team is derived entirely from the participant's own
    membership row, never from a client-supplied team_id."""
    membership = await team_repository.get_membership_for_participant_any_team(db, participant.id)
    if membership is None:
        raise AuthError("FORBIDDEN", "Not assigned to a Round 2 team")

    team = await team_repository.get_team(db, membership.team_id)
    if team is None or not team.round2_access:
        raise AuthError("ROUND2_ACCESS_DENIED", "Round 2 access has not been granted.")

    session = await relay_service.sync_team_session_state(db, str(membership.team_id))
    if session.status == "expired":
        raise AuthError("SESSION_EXPIRED", "This team's competition window has ended.")
    if session.status != "active" or session.current_member_number != membership.member_number:
        raise AuthError("NOT_YOUR_TURN", "It is not currently your turn in the relay.")

    membership.team = team
    return membership


def assert_path_team_matches(path_team_id: str, membership) -> None:
    """Small consistency check for endpoints that keep a team_id in the URL
    for readability — the authorization decision above never depends on it,
    this only rejects a mismatched URL rather than silently acting on the
    caller's real team."""
    if str(membership.team_id) != str(path_team_id):
        raise AuthError("FORBIDDEN", "Team ID does not match your membership")
