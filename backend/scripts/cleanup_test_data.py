"""
Deletes all non-admin accounts and all teams/members/sessions so the platform
starts from a clean slate, and renames the live competition to the official
brand name.

KEEPS:
- the admin account (identities under ADMIN_EMAIL) and its admin row,
- competitions, questions/options, coding problems, test cases.

DELETES (all rows belonging to test/participant accounts):
- quiz answers & attempts, submissions, code drafts,
- team members, team sessions, teams, leaderboard cache rows,
- audit logs for deleted users,
- participant & user rows (except admin),
- matching Supabase Auth users (via the GoTrue admin API) so old logins
  stop working entirely.

Run from backend/ with the venv interpreter:
    .venv\Scripts\python.exe -m scripts.cleanup_test_data
"""
import asyncio

import httpx
from sqlalchemy import delete, func, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.models import (
    Admin, AuditLog, CodeDraft, Competition, LeaderboardEntry, Participant, QuizAnswer,
    QuizAttempt, Submission, Team, TeamMember, TeamSession, User,
)

ADMIN_EMAIL = "dhaya00011@gmail.com"
BRAND_NAME = "Beyond The Syntax 2026"


async def cleanup() -> None:
    async with SessionLocal() as db:
        admin = await db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        if admin is None:
            print("!! Admin account not found — aborting.")
            return
        print(f"Admin: {admin.email} ({admin.role}), id={admin.id}")

        admin_participant = await db.scalar(
            select(Participant).where(Participant.user_id == admin.id)
        )
        admin_participant_id = admin_participant.id if admin_participant else None
        print(f"Admin participant row: {admin_participant_id or 'none'}")

        res = await db.execute(select(User.id).where(User.id != admin.id))
        removed_users = [r[0] for r in res.all()]
        res = await db.execute(select(User.auth_uid).where(User.id != admin.id))
        removed_auth_uids = [r[0] for r in res.all()]
        print(f"Removing {len(removed_users)} local user(s), "
              f"{len(removed_auth_uids)} supabase credential(s)")

        res = await db.execute(select(Participant.id).where(Participant.user_id != admin.id))
        removed_participants = [r[0] for r in res.all()]
        removed_attempts = []
        for a in removed_participants:
            res = await db.execute(select(QuizAttempt.id).where(QuizAttempt.participant_id == a))
            removed_attempts += [r[0] for r in res.all()]
        print(f"Removing {len(removed_participants)} participant(s), "
              f"{len(removed_attempts)} quiz attempt(s)")

        if removed_attempts:
            await db.execute(
                delete(QuizAnswer).where(QuizAnswer.attempt_id.in_(removed_attempts))
            )
        if removed_participants:
            await db.execute(
                delete(QuizAttempt).where(QuizAttempt.participant_id.in_(removed_participants))
            )

        await db.execute(delete(CodeDraft))
        await db.execute(delete(Submission))

        team_count = (
            await db.scalar(select(func.count()).select_from(Team))
        ) or 0
        await db.execute(delete(TeamMember))
        await db.execute(delete(TeamSession))
        await db.execute(delete(Team))
        print(f"Removed {team_count} team(s) and all member/session rows")

        await db.execute(delete(LeaderboardEntry))

        if removed_users:
            await db.execute(
                delete(AuditLog).where(
                    AuditLog.user_id.in_(removed_users)
                    | (AuditLog.user_id.is_(None))
                )
            )
            await db.execute(
                delete(Participant).where(Participant.user_id.in_(removed_users))
            )
            await db.execute(delete(User).where(User.id.in_(removed_users)))

        comp = await db.scalar(select(Competition).order_by(Competition.created_at.asc()).limit(1))
        if comp is not None:
            comp.name = BRAND_NAME
            print(f"Competition renamed to '{BRAND_NAME}'")

        await db.commit()
        print("DB cleanup committed.")

        # Sanity check
        remaining_users = (await db.scalar(select(func.count()).select_from(User))) or 0
        remaining_participants = (await db.scalar(select(func.count()).select_from(Participant))) or 0
        remaining_teams = (await db.scalar(select(func.count()).select_from(Team))) or 0
        print(f"After cleanup: users={remaining_users}, participants={remaining_participants}, teams={remaining_teams}")

    await delete_supabase_users(removed_auth_uids, admin.auth_uid)


async def delete_supabase_users(removed_auth_uids: list[str], admin_auth_uid: str) -> None:
    if not (settings.supabase_url and settings.supabase_service_role_key):
        print("!! SUPABASE_SERVICE_ROLE_KEY missing — skipping GoTrue auth cleanup.")
        return
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }
    base = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin"
    deleted = 0
    page = 0
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            resp = await client.get(
                f"{base}/users",
                params={"per_page": 200, "page": page},
                headers=headers,
            )
            resp.raise_for_status()
            page_users = resp.json().get("users", [])
            if not page_users:
                break
            for u in page_users:
                uid = u.get("id")
                email = (u.get("email") or "").lower()
                if uid in (admin_auth_uid,) or email == ADMIN_EMAIL:
                    print(f"  keep   {email}")
                    continue
                del_resp = await client.delete(f"{base}/users/{uid}", headers=headers)
                if del_resp.status_code in (200, 204):
                    deleted += 1
                    print(f"  delete {email}")
                else:
                    print(f"  !! fail {email}: {del_resp.status_code} {del_resp.text[:120]}")
            if len(page_users) < 200:
                break
            page += 1
    print(f"Supabase auth cleanup done — {deleted} user(s) deleted.")


if __name__ == "__main__":
    asyncio.run(cleanup())