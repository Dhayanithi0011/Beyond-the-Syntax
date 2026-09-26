"""
Admin-only endpoints. Every route here depends on `require_admin`. All reads
are computed live from the database (no cached leaderboards yet); state-changing
actions are recorded via core/audit.log_action.
"""
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.errors import AuthError
from app.core.security import require_admin
from app.models.models import (
    AuditLog, CodingProblem, Competition, Difficulty, Option, Participant, Question,
    QualificationStatus, QuizAnswer, QuizAttempt, AttemptStatus, Submission,
    Team, TeamMember, TeamSession, SessionStatus, TeamStatus, User,
)
from app.services.relay_service import advance_to_next_member
from app.services.team_service import load_team_rows

router = APIRouter(prefix="/admin", tags=["admin"])

SUBMITTED = (AttemptStatus.submitted, AttemptStatus.auto_submitted)


async def _active_competition(db: AsyncSession) -> Competition:
    comp = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
    if comp is None:
        raise AuthError("NO_COMPETITION", "No competition has been configured yet.", 409)
    return comp


def _value(enum_value) -> str | None:
    return enum_value.value if enum_value is not None else None


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------

def _question_payload(q: Question) -> dict:
    return {
        "id": str(q.id),
        "text": q.text,
        "options": [q.option_a, q.option_b, q.option_c, q.option_d],
        "correct_option": _value(q.correct_option),
        "category": q.category,
        "difficulty": _value(q.difficulty) or "medium",
        "marks": q.marks,
        "is_enabled": bool(q.is_enabled),
    }


def _question_from_payload(payload: dict, competition_id) -> dict:
    opts = payload.get("options")
    if opts:
        option_a, option_b, option_c, option_d = (opts + [None] * 4)[:4]
    else:
        option_a = payload.get("option_a")
        option_b = payload.get("option_b")
        option_c = payload.get("option_c")
        option_d = payload.get("option_d")
    return {
        "competition_id": competition_id,
        "text": payload["text"],
        "option_a": option_a,
        "option_b": option_b,
        "option_c": option_c,
        "option_d": option_d,
        "correct_option": Option(payload["correct_option"]),
        "category": payload.get("category"),
        "difficulty": Difficulty(payload.get("difficulty", "medium")),
        "marks": payload.get("marks", 1),
        "is_enabled": payload.get("is_enabled", True),
    }


@router.get("/questions")
async def list_questions(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    questions = (
        await db.scalars(select(Question).where(Question.competition_id == comp.id).order_by(Question.created_at))
    ).all()
    return {"questions": [_question_payload(q) for q in questions]}


@router.post("/questions")
async def create_question(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    q = Question(**_question_from_payload(payload, comp.id))
    db.add(q)
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="QUESTION_CREATED", metadata={"question_id": str(q.id)}, commit=True)
    return {"id": str(q.id)}


@router.put("/questions/{question_id}")
async def update_question(question_id: str, payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    q = await db.get(Question, question_id)
    if q is None:
        raise AuthError("NOT_FOUND", "Question not found", 404)
    for key, value in _question_from_payload(payload, q.competition_id).items():
        setattr(q, key, value)
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="QUESTION_UPDATED", metadata={"question_id": question_id})
    return {"id": str(q.id)}


@router.delete("/questions/{question_id}")
async def delete_question(question_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    q = await db.get(Question, question_id)
    if q is None:
        raise AuthError("NOT_FOUND", "Question not found", 404)
    used = await db.scalar(
        select(func.count()).select_from(QuizAnswer).where(QuizAnswer.question_id == question_id)
    )
    if used:
        raise AuthError("QUESTION_IN_USE", "This question already has participant answers and cannot be deleted.", 409)
    await db.delete(q)
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="QUESTION_DELETED", metadata={"question_id": question_id})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Participants & qualification
# ---------------------------------------------------------------------------

@router.get("/participants")
async def list_participants(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    rows = (
        await db.execute(
            select(Participant, User, QuizAttempt)
            .join(User, User.id == Participant.user_id)
            .outerjoin(QuizAttempt, QuizAttempt.participant_id == Participant.id)
            .order_by(Participant.registered_at)
        )
    ).all()
    user_ids = [str(user.id) for _, user, _ in rows]

    # Tab-switch counts per person per round, from the TAB_SWITCH audit trail
    # (where='quiz' -> Round 1, where='coding' -> Round 2).
    where_field = func.jsonb_extract_path_text(AuditLog.metadata_, "where")
    tab_rows = (
        await db.execute(
            select(AuditLog.user_id, where_field, func.count())
            .where(AuditLog.action == "TAB_SWITCH", AuditLog.user_id.in_(user_ids))
            .group_by(AuditLog.user_id, where_field)
        )
    ).all()
    tab_by_user: dict[str, dict] = {}
    for uid, where, count in tab_rows:
        tab_by_user.setdefault(str(uid), {})[str(where)] = count

    # Which Round 2 team each participant belongs to (if any, i.e. qualified).
    team_rows = (
        await db.execute(
            select(Participant.user_id, Team.name)
            .join(TeamMember, TeamMember.participant_id == Participant.id)
            .join(Team, Team.id == TeamMember.team_id)
            .where(Participant.user_id.in_(user_ids))
        )
    ).all()
    team_by_user = {str(uid): name for uid, name in team_rows}

    participants = []
    for p, user, attempt in rows:
        if attempt and attempt.status in SUBMITTED:
            quiz_status = "submitted"
        elif attempt is not None:
            quiz_status = "in_progress"
        else:
            quiz_status = "not_submitted"
        switches = tab_by_user.get(str(user.id), {})
        participants.append({
            "id": str(p.id),
            "participant_code": p.participant_code,
            "name": user.name,
            "email": user.email,
            "department": p.department,
            "year": p.year,
            "quiz_status": quiz_status,
            "score": attempt.score if attempt else None,
            "submitted_at": attempt.submitted_at.isoformat() if attempt and attempt.submitted_at else None,
            "qualification_status": _value(attempt.qualification_status) if attempt else QualificationStatus.pending.value,
            "team": team_by_user.get(str(user.id)),
            "tab_switches": {
                "round1": switches.get("quiz", 0),
                "round2": switches.get("coding", 0),
            },
        })
    return {"participants": participants}


@router.post("/qualify")
async def qualify_participants(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    ids = payload["participant_ids"]
    attempts = (await db.scalars(select(QuizAttempt).where(QuizAttempt.participant_id.in_(ids)))).all()
    for a in attempts:
        a.qualification_status = QualificationStatus.qualified
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="PARTICIPANTS_QUALIFIED", metadata={"count": len(attempts)})
    return {"qualified": len(attempts)}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)

    total_participants = await db.scalar(select(func.count()).select_from(Participant)) or 0
    attempts = (
        await db.scalars(
            select(QuizAttempt).where(
                QuizAttempt.competition_id == comp.id, QuizAttempt.status.in_(SUBMITTED)
            )
        )
    ).all()
    scores = [a.score or 0 for a in attempts]

    teams = (await db.scalars(select(Team).where(Team.competition_id == comp.id))).all()
    sessions = {
        str(s.team_id): s
        for s in (await db.scalars(select(TeamSession))).all()
        if str(s.team_id)
    }
    team_ids = {str(t.id) for t in teams}

    total_submissions = await db.scalar(select(func.count()).select_from(Submission)) or 0
    accepted_submissions = (
        await db.scalar(select(func.count()).select_from(Submission).where(Submission.status == "accepted")) or 0
    )

    # Buckets are derived from the competition's max achievable quiz score so the
    # distribution always reflects the actual question bank (e.g. 0-30).
    max_score = (
        await db.scalar(
            select(func.coalesce(func.sum(Question.marks), 0)).where(
                Question.competition_id == comp.id, Question.is_enabled.is_(True)
            )
        )
        or 0
    )
    width = 5
    num_buckets = (max_score + width) // width
    distribution = [
        {"range": f"{i * width}–{min((i + 1) * width - 1, max_score)}", "count": 0}
        for i in range(num_buckets)
    ]
    for s in scores:
        bucket = min(s // width, num_buckets - 1) if s >= 0 else 0
        distribution[bucket]["count"] += 1

    activity: list[dict] = []

    for sub, problem in (
        await db.execute(
            select(Submission, CodingProblem)
            .join(CodingProblem, CodingProblem.id == Submission.problem_id)
            .order_by(Submission.submitted_at.desc())
            .limit(6)
        )
    ).all():
        team = await db.get(Team, sub.team_id)
        activity.append({
            "actor": team.name if team else "System",
            "action": "CODE_SUBMITTED",
            "target": f"{problem.title}",
            "at": sub.submitted_at.isoformat() if sub.submitted_at else None,
        })

    recent_attempts = attempts[-6:]
    if recent_attempts:
        quiz_actors = {
            str(a.id): (user.name, p.participant_code)
            for p, user, a in (
                await db.execute(
                    select(Participant, User, QuizAttempt)
                    .join(User, User.id == Participant.user_id)
                    .where(QuizAttempt.id.in_([a.id for a in recent_attempts]))
                )
            ).all()
        }
    else:
        quiz_actors = {}

    for a in recent_attempts:
        actor, code = quiz_actors.get(str(a.id), ("Participant", ""))
        activity.append({
            "actor": actor,
            "action": "QUIZ_SUBMITTED",
            "target": f"{code} · {a.score or 0} pts",
            "at": a.submitted_at.isoformat() if a.submitted_at else None,
        })

    for s in sessions.values():
        if s.team_started_at and str(s.team_id) in team_ids:
            team = await db.get(Team, s.team_id)
            activity.append({
                "actor": "System",
                "action": "TEAM_STARTED",
                "target": team.name if team else "Team",
                "at": s.team_started_at.isoformat(),
            })

    activity = [a for a in activity if a["at"]]
    activity.sort(key=lambda a: a["at"], reverse=True)

    return {
        "stats": {
            "total_participants": total_participants,
            "quiz_completed": len(attempts),
            "qualified": len([a for a in attempts if a.qualification_status == QualificationStatus.qualified]),
            "teams_created": len(teams),
            "active_teams": len([s for s in sessions.values() if str(s.team_id) in team_ids and s.status == SessionStatus.active]),
            "completed_teams": len([s for s in sessions.values() if str(s.team_id) in team_ids and s.status == SessionStatus.completed]),
            "avg_quiz_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "highest_quiz_score": max(scores) if scores else 0,
            "total_submissions": total_submissions,
            "accepted_submissions": accepted_submissions,
        },
        "score_distribution": distribution,
        "recent_activity": [
            {"id": i, "actor": a["actor"], "action": a["action"], "target": a["target"], "at": a["at"]}
            for i, a in enumerate(activity[:8])
        ],
    }


# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------

@router.get("/teams")
async def list_teams(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    return {"teams": await load_team_rows(db, comp.id)}


@router.post("/teams")
async def create_team(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    team = Team(competition_id=comp.id, name=payload["name"], color=payload.get("color"))
    db.add(team)
    await db.flush()

    ids = payload.get("member_participant_ids")
    if ids is None and payload.get("member_names"):
        names = payload["member_names"]
        participants = (
            await db.execute(
                select(Participant, User)
                .join(User, User.id == Participant.user_id)
                .where(User.name.in_(names))
            )
        ).all()
        by_name = {user.name: p for p, user in participants}
        ids = [str(by_name[name].id) for name in names if name in by_name]

    for number, participant_id in enumerate((ids or [])[:3], start=1):
        db.add(TeamMember(team_id=team.id, participant_id=participant_id, member_number=number))
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="TEAM_CREATED", metadata={"team_id": str(team.id)})
    return {"id": str(team.id)}


async def _get_team(db: AsyncSession, team_id: str) -> Team:
    team = await db.get(Team, team_id)
    if team is None:
        raise AuthError("NOT_FOUND", "Team not found", 404)
    return team


async def _deal_set_to_session(db: AsyncSession, session: TeamSession, competition_id) -> None:
    """Randomly deals one question-set (1 of the 10) to a team about to start.
    The round-robin rotation then derives the active set from
    `start_set_index + completed_rounds`, so each team starts somewhere
    different but follows the same set sequence."""
    n_problems = (
        await db.scalar(
            select(func.count())
            .select_from(CodingProblem)
            .where(CodingProblem.competition_id == competition_id)
        )
        or 0
    )
    num_sets = max(n_problems // 3, 1)
    session.start_set_index = random.randrange(num_sets)
    session.completed_rounds = 0


@router.post("/teams/{team_id}/activate")
async def activate_team(team_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    team = await _get_team(db, team_id)

    session = await db.scalar(select(TeamSession).where(TeamSession.team_id == team_id))
    if session is None:
        session = TeamSession(team_id=team_id)
        db.add(session)
    session.status = SessionStatus.active
    # No timer yet: team_started_at is set the first time a member enters the
    # workspace, and usage only accrues mid-turn (see ensure_member_clock).
    session.team_time_used_seconds = 0
    session.current_member_number = 0
    await _deal_set_to_session(db, session, team.competition_id)
    team.status = TeamStatus.active
    await db.commit()

    await advance_to_next_member(db, team_id, reason="admin_activate")
    await log_action(db, user_id=admin.user_id, action="TEAM_STARTED", metadata={"team_id": team_id})
    return {"activated": True}


@router.post("/teams/{team_id}/approve")
async def approve_team(team_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    """One-step approval for participant-submitted teams: grants Round 2 access
    AND starts the relay timer. This is the action an admin takes when they see
    a pending team in the Teams console."""
    team = await _get_team(db, team_id)
    team.round2_access = True

    session = await db.scalar(select(TeamSession).where(TeamSession.team_id == team_id))
    if session is None:
        session = TeamSession(team_id=team_id)
        db.add(session)
    session.status = SessionStatus.active
    # No timer yet: the first workspace entry starts the team clock (see
    # ensure_member_clock) — nothing ticks and nothing is lost while the team
    # readies themselves after approval.
    session.team_time_used_seconds = 0
    session.current_member_number = 0
    session.member_started_at = None
    session.member_deadline = None
    await _deal_set_to_session(db, session, team.competition_id)
    team.status = TeamStatus.active
    await db.commit()

    await advance_to_next_member(db, team_id, reason="admin_approve")
    await log_action(db, user_id=admin.user_id, action="TEAM_APPROVED", metadata={"team_id": team_id})
    return {"approved": True}


@router.post("/teams/{team_id}/pause")
async def pause_team(team_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    team = await _get_team(db, team_id)
    team.status = TeamStatus.paused
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="TEAM_PAUSED", metadata={"team_id": team_id})
    return {"paused": True}


@router.post("/teams/{team_id}/resume")
async def resume_team(team_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    team = await _get_team(db, team_id)
    team.status = TeamStatus.active
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="TEAM_RESUMED", metadata={"team_id": team_id})
    return {"resumed": True}


@router.post("/teams/{team_id}/reset")
async def reset_team(team_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    team = await _get_team(db, team_id)
    session = await db.scalar(select(TeamSession).where(TeamSession.team_id == team_id))
    if session is not None:
        session.status = SessionStatus.not_started
        session.current_member_number = None
        session.member_started_at = None
        session.member_deadline = None
        session.team_started_at = None
        session.team_deadline = None
        session.team_time_used_seconds = 0
        session.start_set_index = None
        session.completed_rounds = 0
    team.status = TeamStatus.pending
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="TEAM_RESET", metadata={"team_id": team_id})
    return {"reset": True}


@router.post("/teams/{team_id}/grant-access")
async def grant_access(team_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    team = await _get_team(db, team_id)
    team.round2_access = True
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="ROUND2_ACCESS_GRANTED", metadata={"team_id": team_id})
    return {"round2_access": True}


@router.post("/teams/{team_id}/revoke-access")
async def revoke_access(team_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    team = await _get_team(db, team_id)
    team.round2_access = False
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="ROUND2_ACCESS_REVOKED", metadata={"team_id": team_id})
    return {"round2_access": False}


# ---------------------------------------------------------------------------
# Live monitor
# ---------------------------------------------------------------------------

@router.get("/live")
async def live(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    comp = await _active_competition(db)
    teams = await load_team_rows(db, comp.id)

    in_progress_attempts = set(
        (await db.scalars(select(QuizAttempt.participant_id).where(QuizAttempt.status == AttemptStatus.in_progress))).all()
    )
    active_members = set(
        (await db.scalars(
            select(TeamMember.participant_id)
            .join(TeamSession, TeamSession.team_id == TeamMember.team_id)
            .where(TeamSession.status == SessionStatus.active)
        )).all()
    )
    online_count = len({str(x) for x in in_progress_attempts} | {str(x) for x in active_members})

    submitted_count = await db.scalar(
        select(func.count()).select_from(QuizAttempt).where(
            QuizAttempt.competition_id == comp.id, QuizAttempt.status.in_(SUBMITTED)
        )
    ) or 0
    teams_coding = sum(1 for t in teams if t["status"] == "active")

    return {
        "online_count": online_count,
        "submitted_count": submitted_count,
        "teams_coding": teams_coding,
        "teams": teams,
    }


# ---------------------------------------------------------------------------
# Competition lifecycle
# ---------------------------------------------------------------------------

@router.post("/competition/transition")
async def transition_competition(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    competition_id = payload.get("competition_id")
    if competition_id is None:
        # Convenience: most projects run a single competition, so the id is
        # optional — default to the most recent one.
        competition = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
    else:
        competition = await db.get(Competition, competition_id)
    if competition is None:
        raise AuthError("NOT_FOUND", "Competition not found", 404)
    competition.state = payload["to_state"]
    await db.commit()
    await log_action(db, user_id=admin.user_id, action="COMPETITION_STATE_CHANGED", metadata={"to_state": payload["to_state"]})
    return {"state": competition.state}