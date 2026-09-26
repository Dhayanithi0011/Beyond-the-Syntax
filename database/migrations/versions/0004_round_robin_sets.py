"""round-robin question-set relay

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-26

Adds the two fields that drive per-team question-set rotation in Round 2:
`team_sessions.start_set_index` picks the random 1-set-of-3 questions dealt to a
team when an admin activates it, and `team_sessions.completed_rounds` counts how
many full 3-member relay passes have finished, so the next set starts only after
a complete round. Existing sessions default to set 0 / 0 completed rounds.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("team_sessions", sa.Column("start_set_index", sa.Integer, nullable=True))
    op.add_column(
        "team_sessions",
        sa.Column("completed_rounds", sa.Integer, server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("team_sessions", "completed_rounds")
    op.drop_column("team_sessions", "start_set_index")