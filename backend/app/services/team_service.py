"""
Shared Round 2 team-row builder. Produces the admin/teams, admin/live and
round-2 leaderboard representation of every team from live tables: members
(names + relay status), aggregated score (sum of Submission.score), the
current member, how much of the member window remains, and the active
problem. Everything is derived from the database — nothing stored separately.
"""
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    CodingProblem, Competition, Participant, Submission, Team, TeamMember, TeamSession,
    SessionStatus, TeamStatus, User,
)

TEAM_COLORS = [
    "#6366F1", "#F59E0B", "#22C55E", "#A78BFA", "#F97316", "#38BDF8", "#EF4444", "#14B8A6",
]


def member_statuses(team_status: str, current_member_number) -> dict[int, str]:
    """Relay status per member number, derived from the team's overall status
    and the current relay position. Mirrors the states the frontend renders
    (not_started / active / completed / expired / paused)."""
    out: dict[int, str] = {}
    for n in (1, 2, 3):
        if team_status == "completed":
            out[n] = "completed"
        elif team_status == "expired":
            out[n] = "completed" if current_member_number and n < current_member_number else (
                "expired" if n == current_member_number else "not_started"
            )
        elif team_status == "paused":
            out[n] = "completed" if current_member_number and n < current_member_number else (
                "paused" if n == current_member_number else "not_started"
            )
        elif current_member_number and n == current_member_number:
            out[n] = "active"
        else:
            out[n] = "completed" if current_member_number and n < current_member_number else "not_started"
    return out


async def load_team_rows(db: AsyncSession, competition_id, now=None) -> list[dict]:
    """One flat dict per team with the fields the admin console / leaderboard
    pages consume. `now` is injectable for deterministic testing."""
    now = now or datetime.now(timezone.utc)
    competition = await db.get(Competition, competition_id)
    budget = competition.round2_team_duration_seconds if competition and competition.round2_team_duration_seconds else 2700

    teams = (
        await db.scalars(select(Team).where(Team.competition_id == competition_id).order_by(Team.created_at))
    ).all()

    sessions = {
        str(s.team_id): s
        for s in (await db.scalars(select(TeamSession))).all()
        if str(s.team_id)
    }

    members_by_team: dict[str, list[dict]] = {}
    for tm, p, u in (
        await db.execute(
            select(TeamMember, Participant, User)
            .join(Participant, Participant.id == TeamMember.participant_id)
            .join(User, User.id == Participant.user_id)
        )
    ).all():
        members_by_team.setdefault(str(tm.team_id), []).append({
            "member_number": tm.member_number,
            "name": u.name,
            "participant_code": p.participant_code,
            "participant_id": str(p.id),
        })

    scores = {
        str(team_id): int(total)
        for team_id, total in (
            await db.execute(
                select(Submission.team_id, func.coalesce(func.sum(Submission.score), 0))
                .group_by(Submission.team_id)
            )
        ).all()
    }

    problems = {
        p.position: p.title
        for p in (await db.scalars(select(CodingProblem).where(CodingProblem.competition_id == competition_id))).all()
    }

    rows: list[dict] = []
    for i, team in enumerate(teams):
        tid = str(team.id)
        session = sessions.get(tid)

        status = team.status.value if team.status else TeamStatus.pending.value
        if session is not None:
            if session.status == SessionStatus.completed:
                status = "completed"
            elif session.status == SessionStatus.expired:
                status = "expired"
            elif session.status == SessionStatus.active and team.status != TeamStatus.paused:
                status = "active"
            elif team.status == TeamStatus.paused:
                status = "paused"

        current = session.current_member_number if session else None

        time_remaining_ms = None
        if session and session.status == SessionStatus.active and session.member_deadline:
            time_remaining_ms = max(int((session.member_deadline - now).total_seconds() * 1000), 0)

        team_time_remaining_ms = None
        if session and session.status == SessionStatus.active:
            used = session.team_time_used_seconds or 0
            team_time_remaining_ms = max(int((budget - used) * 1000), 0)

        per_member = member_statuses(status, current)

        members = sorted(members_by_team.get(tid, []), key=lambda m: m["member_number"])
        for m in members:
            m["status"] = per_member.get(m["member_number"], "not_started")

        rows.append({
            "id": tid,
            "name": team.name,
            "color": team.color or TEAM_COLORS[i % len(TEAM_COLORS)],
            "status": status,
            "round2_access": bool(team.round2_access),
            "score": scores.get(tid, 0),
            "current_member_number": current,
            "current_problem": problems.get(current) if current else None,
            "time_remaining_ms": time_remaining_ms,
            "team_time_remaining_ms": team_time_remaining_ms,
            "members": members,
        })

    return rows