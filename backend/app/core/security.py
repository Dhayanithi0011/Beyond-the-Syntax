"""
Authentication & authorization dependencies.

Design rule: the frontend is never trusted for identity, role, participant_id,
or timer state. Every protected route resolves the caller's identity from the
verified Supabase access token, then loads role-specific state from the
database. The managed endpoint group /coding/* derives everything (dealt
problems, current question, deadline) from the caller's own Round 2 session —
never from a client-supplied id.
"""
from fastapi import Depends, Header, HTTPException, Path, status
from jose.exceptions import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.supabase import SupabaseAuthError, verify_access_token
from app.core.errors import AuthError
from app.core.database import get_db
from app.models.models import Competition
from app.repositories import user_repository
from app.services import round2_service


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
    that's what every quiz/Round-2 endpoint keys its data on."""
    if user.role != "participant":
        raise AuthError("FORBIDDEN", "Participant role required")
    participant = await user_repository.get_participant_by_user_id(db, user.id)
    if participant is None:
        raise AuthError("FORBIDDEN", "Participant record missing for this user")
    participant.user = user
    return participant


async def require_round2_session(
    participant=Depends(require_participant), db: AsyncSession = Depends(get_db)
):
    """Guards every /coding/* action and the Round-2 workspace: qualified,
    issued an individual Round 2 session, the round is open, and the shared
    deadline hasn't passed. This is the single choke point for Round 2 write
    actions — the frontend hiding a button is never sufficient on its own.
    Everything (dealt problems, current question, deadline) is derived from
    the caller's own session, never from a client-supplied id."""
    session = await round2_service.get_session(db, participant.id)
    if session is not None:
        session = await round2_service.sync_session_state(db, session)
    round2_service.active_or_raise(session)

    competition = await db.get(Competition, session.competition_id)
    round2_service.assert_round_open(competition)

    session.competition = competition
    session.participant = participant
    return session
