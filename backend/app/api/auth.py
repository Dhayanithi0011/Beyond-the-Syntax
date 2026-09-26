"""
Identity endpoints. `/auth/register` is the ONLY way a participant account
gets created from the public frontend — it always assigns role=participant
(see repositories/user_repository.create_participant_user). There is
deliberately no public "become an admin" path; admin accounts are
provisioned out of band (seed script / an existing admin's action).
"""
import re
import httpx
from fastapi import APIRouter, Depends, Header, Request
from jose.exceptions import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, AuthError
from app.core.supabase import SupabaseAuthError, verify_access_token
from app.core.audit import log_action
from app.repositories import user_repository
from app.models.models import QualificationStatus, QuizAttempt
from app.schemas.auth import (
    RegisterParticipantRequest,
    SignupRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _synthetic_email(participant_code: str) -> str:
    """Stable account identity for mobile-only registrations. The domain must be
    an ordinary-looking one — `syntax.local`/`.test`/`.invalid` are reserved
    special-use names that Pydantic's email validator rejects outright."""
    clean = re.sub(r"[^a-zA-Z0-9]", "", participant_code).lower()
    return f"{clean}@syntax.event"


def _supabase_headers(service_role: bool = False) -> dict:
    headers = {
        "apikey": settings.supabase_anon_key,
        "Content-Type": "application/json",
    }
    if service_role:
        headers["Authorization"] = f"Bearer {settings.supabase_service_role_key}"
    return headers


async def _profile(db: AsyncSession, user) -> MeResponse:
    participant = None
    qualification_status = None
    if user.role == "participant":
        participant = await user_repository.get_participant_by_user_id(db, user.id)
        if participant is not None:
            attempt = await db.scalar(
                select(QuizAttempt)
                .where(QuizAttempt.participant_id == participant.id)
                .order_by(QuizAttempt.started_at.desc())
                .limit(1)
            )
            if attempt is not None and attempt.qualification_status is not None:
                qualification_status = attempt.qualification_status.value
    return MeResponse(
        id=str(user.id),
        role=user.role,
        name=user.name,
        email=user.email,
        participant_id=str(participant.id) if participant else None,
        participant_code=participant.participant_code if participant else None,
        qualification_status=qualification_status,
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """The single entry point for both roles. `identifier` can be an email, a
    participant register number, or a phone — the row is resolved from OUR
    database (never trusts client-side role claims), then the password is
    checked against Supabase. Returns a fresh session token for AuthContext."""
    identifier = payload.identifier.strip()
    if "@" in identifier:
        user = await user_repository.get_user_by_email(db, identifier)
    else:
        user = await user_repository.get_user_by_participant_code(db, identifier)
        if user is None:
            user = await user_repository.get_user_by_phone(db, identifier)
    if user is None:
        raise AuthError("NOT_FOUND", "No account found with that email, register number, or phone — please register first.", 401)

    if not (settings.supabase_url and settings.supabase_anon_key):
        raise AuthError("OAUTH_ERROR", "Identity provider not configured.", 503)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
                json={"email": user.email, "password": payload.password},
                headers={"apikey": settings.supabase_anon_key, "Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise AuthError("OAUTH_ERROR", "Could not reach the identity provider.", 503) from exc

    if resp.status_code != 200:
        # The identifier resolved to a real account, so a rejected password
        # grant means the password itself was wrong.
        raise AuthError("INVALID_CREDENTIALS", "Incorrect password. Please try again.", 401)

    data = resp.json()
    await log_action(
        db,
        user_id=user.id,
        action="SIGN_IN",
        metadata={"identifier": identifier},
        ip_address=request.client.host if request.client else None,
    )
    return LoginResponse(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        user=await _profile(db, user),
    )


@router.post("/signup", response_model=LoginResponse)
async def signup(
    payload: SignupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Participant signup done server-side. Requires `SUPABASE_SERVICE_ROLE_KEY`
    so the account is created via the admin API and EMAIL-CONFIRMED immediately:
    this avoids the public signup endpoint's rate limit AND lets mobile-only
    registrations (synthesised email) work even when email confirmation is on.

    The response carries a real session token when Supabase isn't throttling the
    password grant; otherwise `access_token` is empty and the participant simply
    signs in after (the account already exists and is confirmed)."""
    if not settings.supabase_service_role_key:
        raise AuthError(
            "NOT_CONFIGURED",
            "Server-side registration is not configured. Add SUPABASE_SERVICE_ROLE_KEY to the backend .env.",
            503,
        )
    if not (settings.supabase_url and settings.supabase_anon_key):
        raise AuthError("OAUTH_ERROR", "Identity provider not configured.", 503)

    # Mobile-only registration: synthesize the account identity server-side.
    signup_email = payload.email if payload.email is not None else _synthetic_email(payload.participant_code)

    existing = await user_repository.get_user_by_email(db, signup_email)
    if existing is not None:
        raise AuthError("ALREADY_REGISTERED", "An account already exists for that email or register number.", 409)

    existing = await user_repository.get_user_by_participant_code(db, payload.participant_code.strip())
    if existing is not None:
        raise AuthError("ALREADY_REGISTERED", "An account already exists for that register number.", 409)

    if (payload.phone or "").strip():
        existing = await user_repository.get_user_by_phone(db, payload.phone.strip())
        if existing is not None:
            raise AuthError("ALREADY_REGISTERED", "That mobile number is already registered to another account.", 409)

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            created = await client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users",
                headers=_supabase_headers(service_role=True),
                json={
                    "email": signup_email,
                    "password": payload.password,
                    "email_confirm": True,
                },
            )
            auth_uid = created.json().get("id") if created.status_code in (200, 201) else None

            if auth_uid is None:
                if created.status_code == 429:
                    raise AuthError("RATE_LIMITED", "Sign-up is throttled right now — try again in a moment.", 429)
                msg = created.json().get("msg") or "Could not create the account."
                # Supabase: a user with this email already registered.
                if "already been registered" in msg.lower():
                    raise AuthError("ALREADY_REGISTERED", "An account already exists for that email or register number.", 409)
                raise AuthError("SIGNUP_FAILED", msg, 400)

            user = await user_repository.create_participant_user(
                db,
                auth_uid=auth_uid,
                email=signup_email,
                name=payload.name,
                participant_code=payload.participant_code,
                department=payload.department,
                year=payload.year,
                phone=payload.phone,
            )

            aura_token = await client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
                headers=_supabase_headers(),
                json={"email": signup_email, "password": payload.password},
            )
    except AuthError:
        raise
    except httpx.HTTPError as exc:
        raise AuthError("OAUTH_ERROR", "Could not reach the identity provider.", 503) from exc

    await log_action(
        db,
        user_id=user.id,
        action="PARTICIPANT_REGISTERED",
        metadata={"participant_code": payload.participant_code, "via": "server_signup"},
        ip_address=request.client.host if request.client else None,
    )

    profile = await _profile(db, user)
    if aura_token.status_code != 200:
        return LoginResponse(access_token="", user=profile)
    data = aura_token.json()
    return LoginResponse(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        user=profile,
    )


@router.post("/register", response_model=MeResponse)
async def register(
    payload: RegisterParticipantRequest,
    request: Request,
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    if not authorization.startswith("Bearer "):
        raise AuthError("UNAUTHENTICATED", "Missing bearer token", 401)
    token = authorization.removeprefix("Bearer ")
    try:
        decoded = await verify_access_token(token)
    except (SupabaseAuthError, JWTError):
        raise AuthError("UNAUTHENTICATED", "Invalid or expired token", 401)

    user = await user_repository.create_participant_user(
        db,
        auth_uid=decoded["sub"],
        email=payload.email,
        name=payload.name,
        participant_code=payload.participant_code,
        department=payload.department,
        year=payload.year,
        phone=payload.phone,
    )
    await log_action(
        db,
        user_id=user.id,
        action="PARTICIPANT_REGISTERED",
        metadata={"participant_code": payload.participant_code},
        ip_address=request.client.host if request.client else None,
    )
    return await _profile(db, user)


@router.get("/me", response_model=MeResponse)
async def me(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _profile(db, user)
