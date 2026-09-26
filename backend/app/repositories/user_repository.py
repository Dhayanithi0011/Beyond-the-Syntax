"""
Repository layer for users/participants/admins. Keeping DB access behind
functions (rather than querying directly from route handlers everywhere)
means `core/security.py` and `api/*.py` share one place that knows how these
rows relate to each other.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import User, Participant, Admin, Role


async def get_user_by_auth_uid(db: AsyncSession, auth_uid: str) -> User | None:
    return await db.scalar(select(User).where(User.auth_uid == auth_uid))


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email))


async def get_user_by_participant_code(db: AsyncSession, participant_code: str) -> User | None:
    return await db.scalar(
        select(User)
        .join(Participant, Participant.user_id == User.id)
        .where(Participant.participant_code == participant_code)
    )


async def get_user_by_phone(db: AsyncSession, phone: str) -> User | None:
    return await db.scalar(
        select(User)
        .join(Participant, Participant.user_id == User.id)
        .where(Participant.phone == phone.strip())
    )


async def create_participant_user(
    db: AsyncSession, *, auth_uid: str, email: str, name: str,
    participant_code: str, department: str | None, year: int | None, phone: str | None,
) -> User:
    """Creates the (users, participants) pair for a newly-registered participant.
    Idempotent on auth_uid: if the identity already has an account, returns it
    unchanged rather than creating a duplicate."""
    existing = await get_user_by_auth_uid(db, auth_uid)
    if existing is not None:
        return existing

    user = User(auth_uid=auth_uid, email=email, name=name, role=Role.participant)
    db.add(user)
    await db.flush()  # populates user.id without committing yet

    participant = Participant(
        user_id=user.id,
        participant_code=participant_code,
        department=department,
        year=year,
        phone=phone,
    )
    db.add(participant)
    await db.commit()
    await db.refresh(user)
    return user


async def get_participant_by_user_id(db: AsyncSession, user_id) -> Participant | None:
    return await db.scalar(select(Participant).where(Participant.user_id == user_id))


async def get_admin_by_user_id(db: AsyncSession, user_id) -> Admin | None:
    return await db.scalar(select(Admin).where(Admin.user_id == user_id))


async def create_admin_user(db: AsyncSession, *, auth_uid: str, email: str, name: str) -> User:
    """Admin accounts are provisioned out-of-band (not via public /auth/register) —
    e.g. a seed script or a super-admin action — since anyone hitting a public
    signup endpoint must never be able to grant themselves the admin role."""
    existing = await get_user_by_auth_uid(db, auth_uid)
    if existing is not None:
        return existing

    user = User(auth_uid=auth_uid, email=email, name=name, role=Role.admin)
    db.add(user)
    await db.flush()
    db.add(Admin(user_id=user.id, permissions={}))
    await db.commit()
    await db.refresh(user)
    return user
