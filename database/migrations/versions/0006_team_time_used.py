"""team-level accrued usage time

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-26

Adds `team_sessions.team_time_used_seconds` (accumulated active time the team
has actually spent working inside the Round 2 workspace). The 45-minute relay
budget is NOT an absolute deadline from approval any more — it starts when the
first member enters the workspace, freezes the moment a member hands off, and
resumes when the next member enters. Only time spent with a member actively
mid-turn accrues here; unused remainder of a 15-minute slice rolls back.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "team_sessions",
        sa.Column("team_time_used_seconds", sa.Integer, server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("team_sessions", "team_time_used_seconds")