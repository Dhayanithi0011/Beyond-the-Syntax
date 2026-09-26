"""
Round 2 team/session endpoints. The relay state machine lives in
`services/relay_service.sync_team_session_state`, called at the top of every
handler here so timers are reconciled before any read/write.

/teams/mine and /teams/mine/handoff resolve the caller's team entirely from
their own membership row, so the frontend never needs to know its team UUID.
The /teams/{team_id} variants keep the readable URL for API consumers; the
path value is only cross-checked, never trusted, against the caller's identity.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import AuthError
from app.core.security import (
    require_participant,
    require_team_member,
    require_active_team_member,
    require_team_member_any,
    assert_path_team_matches,
)
from app.models.models import (
    Competition, Participant, QualificationStatus, QuizAttempt, SessionStatus, Team, TeamMember, User,
)
from app.repositories import team_repository
from app.core.audit import log_action
from app.services.relay_service import sync_team_session_state, get_team_or_404, advance_to_next_member, team_time_remaining
from app.services.team_service import load_team_rows

router = APIRouter(prefix="/teams", tags=["teams"])


def _handoff_message(session) -> str:
    if session.current_member_number:
        return f"Handoff successful — Member {session.current_member_number} is now active."
    return "Team completed — the relay has finished."


async def _qualification_status(db: AsyncSession, participant) -> str:
    attempt = await db.scalar(
        select(QuizAttempt)
        .where(QuizAttempt.participant_id == participant.id)
        .order_by(QuizAttempt.started_at.desc())
        .limit(1)
    )
    if attempt is not None and attempt.qualification_status is not None:
        return attempt.qualification_status.value
    return QualificationStatus.pending.value


@router.get("/status")
async def get_round2_status(db: AsyncSession = Depends(get_db), participant=Depends(require_participant)):
    """Participant-facing Round 2 snapshot. Never errors when the caller has no
    team — it lets the frontend pick between 'form a team' / 'awaiting admin
    approval' / 'workspace' without depending on a 4xx from a guard."""
    qual = await _qualification_status(db, participant)
    membership = await team_repository.get_membership_for_participant_any_team(db, participant.id)
    if membership is None:
        return {
            "qualified": qual == "qualified",
            "qualification_status": qual,
            "team_status": "none",
            "team": None,
            "your_member_number": None,
            "your_participant_code": participant.participant_code,
        }
    payload = await _team_payload(db, str(membership.team_id))
    payload["qualified"] = qual == "qualified"
    payload["qualification_status"] = qual
    payload["team_status"] = payload["team"]["status"]
    payload["your_member_number"] = membership.member_number
    me = next(
        (m for m in payload["team"]["members"] if m["member_number"] == membership.member_number),
        None,
    )
    payload["your_participant_code"] = me["participant_code"] if me else participant.participant_code
    return payload


async def _resolve_participant(db: AsyncSession, token: str) -> Participant:
    """Matches one team member by register number (unique) OR by exact name.
    Names that collide with another participant are rejected so nobody gets
    silently added to the wrong team."""
    t = token.strip()
    if not t:
        raise AuthError("PARTICIPANT_NOT_FOUND", "Every member needs a name or register number.", 404)
    p = await db.scalar(
        select(Participant)
        .join(User, User.id == Participant.user_id)
        .where(func.lower(Participant.participant_code) == t.lower())
    )
    if p is not None:
        return p
    matches = (
        await db.scalars(
            select(Participant)
            .join(User, User.id == Participant.user_id)
            .where(func.lower(User.name) == t.lower())
        )
    ).all()
    if len(matches) != 1:
        raise AuthError(
            "PARTICIPANT_NOT_FOUND",
            f"{token!r} did not match exactly one registered participant — use register numbers.",
            404,
        )
    return matches[0]


@router.post("/register")
async def register_team(payload: dict, db: AsyncSession = Depends(get_db), participant=Depends(require_participant)):
    """A qualified participant submits their team of 3 (names or register
    numbers) for admin approval. The team is created as `pending`; the relay
    only starts once an admin approves it (POST /admin/teams/{id}/approve)."""
    name = (payload.get("name") or "").strip()
    tokens = [str(x).strip() for x in (payload.get("members") or [])][:3]
    if not name:
        raise AuthError("VALIDATION", "Team name is required.", 422)
    if len(tokens) < 3:
        raise AuthError("VALIDATION", "All 3 team members are required.", 422)

    if await _qualification_status(db, participant) != "qualified":
        raise AuthError("NOT_QUALIFIED", "Only qualified participants can form a Round 2 team.", 403)
    if await team_repository.get_membership_for_participant_any_team(db, participant.id) is not None:
        raise AuthError("ALREADY_IN_TEAM", "You are already on a Round 2 team.", 409)

    members: list[Participant] = []
    for token in tokens:
        p = await _resolve_participant(db, token)
        if any(m.id == p.id for m in members):
            raise AuthError("DUPLICATE_MEMBER", f"{token!r} appears more than once.", 409)
        members.append(p)

    if participant.id not in [m.id for m in members]:
        raise AuthError("MUST_INCLUDE_YOURSELF", "One of the team members must be you.", 403)

    for token, m in zip(tokens, members):
        if await team_repository.get_membership_for_participant_any_team(db, m.id) is not None:
            raise AuthError("MEMBER_ALREADY_IN_TEAM", f"{token!r} is already on a team.", 409)
        if await _qualification_status(db, m) != "qualified":
            raise AuthError("MEMBER_NOT_QUALIFIED", f"{token!r} has not been selected for Round 2.", 403)

    competition = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
    if competition is None:
        raise AuthError("NOT_FOUND", "No active competition.", 404)

    team = Team(competition_id=competition.id, name=name)
    db.add(team)
    await db.flush()
    for number, m in enumerate(members, start=1):
        db.add(TeamMember(team_id=team.id, participant_id=m.id, member_number=number))
    await db.commit()
    await log_action(
        db,
        user_id=participant.user.id,
        action="TEAM_SUBMITTED",
        metadata={"team_id": str(team.id), "team_name": name},
    )
    return {"team_id": str(team.id), "status": "pending"}


async def _team_payload(db: AsyncSession, team_id: str) -> dict:
    team = await get_team_or_404(db, team_id)
    competition = await db.get(Competition, team.competition_id)
    try:
        session = await sync_team_session_state(db, team_id)
    except AuthError:
        session = None

    rows = await load_team_rows(db, team.competition_id)
    row = next((t for t in rows if t["id"] == str(team_id)), None)
    if row is None:
        row = {
            "id": str(team_id),
            "name": team.name,
            "color": "#6366F1",
            "status": "pending",
            "round2_access": bool(team.round2_access),
            "current_member_number": None,
            "members": [],
        }

    return {
        "team": {
            "id": row["id"],
            "name": row["name"],
            "color": row["color"],
            "icon": "⚡",
            "status": row["status"],
            "round2_access": row["round2_access"],
            "current_member_number": row["current_member_number"],
            "members": [
                {k: m[k] for k in ("member_number", "name", "participant_code", "status")} for m in row["members"]
            ],
        },
        "session": {
            "status": session.status.value if session and session.status else SessionStatus.not_started.value,
            "team_started_at": session.team_started_at.isoformat() if session and session.team_started_at else None,
            "team_deadline": session.team_deadline.isoformat() if session and session.team_deadline else None,
            "team_time_remaining_seconds": (
                team_time_remaining(session, competition)
                if session and session.status == SessionStatus.active else None
            ),
            "member_started_at": session.member_started_at.isoformat() if session and session.member_started_at else None,
            "member_deadline": session.member_deadline.isoformat() if session and session.member_deadline else None,
        },
    }


@router.get("/mine")
async def get_my_team(db: AsyncSession = Depends(get_db), membership=Depends(require_team_member_any)):
    payload = await _team_payload(db, str(membership.team_id))
    payload["your_member_number"] = membership.member_number
    me = next(
        (m for m in payload["team"]["members"] if m["member_number"] == membership.member_number),
        None,
    )
    payload["your_participant_code"] = me["participant_code"] if me else None
    return payload


@router.get("/{team_id}")
async def get_team(
    team_id: str, db: AsyncSession = Depends(get_db), membership=Depends(require_team_member)
):
    assert_path_team_matches(team_id, membership)
    payload = await _team_payload(db, team_id)
    payload["your_member_number"] = membership.member_number
    me = next(
        (m for m in payload["team"]["members"] if m["member_number"] == membership.member_number),
        None,
    )
    payload["your_participant_code"] = me["participant_code"] if me else None
    return payload


@router.post("/mine/handoff")
async def handoff_mine(db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)):
    """Voluntary early handoff — only the currently active member may call this
    (`require_active_team_member` confirms it's this participant's turn)."""
    session = await advance_to_next_member(db, str(membership.team_id), reason="early_handoff")
    return {
        "advanced": True,
        "current_member_number": session.current_member_number,
        "message": _handoff_message(session),
    }


@router.post("/{team_id}/handoff")
async def handoff(
    team_id: str, db: AsyncSession = Depends(get_db), membership=Depends(require_active_team_member)
):
    assert_path_team_matches(team_id, membership)
    session = await advance_to_next_member(db, team_id, reason="early_handoff")
    return {
        "advanced": True,
        "current_member_number": session.current_member_number,
        "message": _handoff_message(session),
    }