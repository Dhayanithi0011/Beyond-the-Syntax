"""rename firebase_uid to auth_uid

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-25

Fresh databases get `auth_uid` straight from migration 0001. This migration
only exists for databases that already ran 0001 while the column was still
called `firebase_uid` (e.g. the pre-Supabase local dev database) — it is a
no-op when the old column is absent.
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    has_old = bind.exec_driver_sql(
        "SELECT 1 FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'firebase_uid'"
    ).scalar()
    if has_old:
        op.execute("ALTER TABLE users RENAME COLUMN firebase_uid TO auth_uid")


def downgrade() -> None:
    bind = op.get_bind()
    has_new = bind.exec_driver_sql(
        "SELECT 1 FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'auth_uid'"
    ).scalar()
    if has_new:
        op.execute("ALTER TABLE users RENAME COLUMN auth_uid TO firebase_uid")