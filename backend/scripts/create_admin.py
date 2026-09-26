"""
Out-of-band admin provisioning. Run manually by the organizers:

    # Resolve the Supabase auth user id from the email, then link it:
    python -m scripts.create_admin --email dhaya00011@gmail.com --name "Dhaya Admin"

    # Or pass the auth user id directly (the `sub` of the Supabase access token):
    python -m scripts.create_admin --auth-user-id <supabase-user-uuid> --name "Dhaya Admin"

Deliberately NOT an API endpoint: there is no public HTTP path that can grant
the admin role (see api/auth.py). The Supabase auth user must already exist
(create it in Supabase Auth > Users, or via sign-up), then this script links
that identity to our `users` + `admins` rows via `users.auth_uid`.
"""
import argparse
import asyncio

from sqlalchemy import text

from app.core.database import SessionLocal
from app.repositories.user_repository import create_admin_user


async def resolve_auth_user_id(db, email: str) -> str | None:
    row = await db.execute(
        text("SELECT id FROM auth.users WHERE email = :email"), {"email": email}
    )
    uid = row.scalar()
    return str(uid) if uid else None


async def main(auth_user_id: str | None, email: str | None, name: str):
    async with SessionLocal() as db:
        if auth_user_id is None:
            if email is None:
                raise SystemExit("Provide --auth-user-id or --email.")
            auth_user_id = await resolve_auth_user_id(db, email)
            if auth_user_id is None:
                raise SystemExit(
                    f"No Supabase auth user with email {email!r}. Create it in Supabase "
                    "Auth (Users), then re-run this script."
                )
            print(f"Resolved {email} -> auth user {auth_user_id}")

        user = await create_admin_user(db, auth_uid=auth_user_id, email=email, name=name)
        print(f"Admin ready: {user.email} (user_id={user.id})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--auth-user-id", help="Supabase auth.users.id (the access token 'sub' claim)")
    parser.add_argument("--email", help="Resolve the auth user id from this email instead")
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    asyncio.run(main(args.auth_user_id, args.email, args.name))