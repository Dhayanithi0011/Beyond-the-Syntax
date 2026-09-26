"""coding problem metadata + visible test cases

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-25

Adds domain/difficulty to coding problems (for the 10-set question bank) and a
test_type classifier on test cases so participants see 2 samples + 2 direct
cases while the 5 hidden cases stay judge-only. Existing rows are back-filled:
is_sample=True -> 'sample', everything else -> 'hidden'.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("coding_problems", sa.Column("domain", sa.String, nullable=True))
    op.add_column("coding_problems", sa.Column("difficulty", sa.String, nullable=True))

    op.add_column(
        "test_cases",
        sa.Column("test_type", sa.String, server_default="hidden", nullable=False),
    )
    op.execute("UPDATE test_cases SET test_type = 'sample' WHERE is_sample = TRUE")


def downgrade() -> None:
    op.drop_column("test_cases", "test_type")
    op.drop_column("coding_problems", "difficulty")
    op.drop_column("coding_problems", "domain")