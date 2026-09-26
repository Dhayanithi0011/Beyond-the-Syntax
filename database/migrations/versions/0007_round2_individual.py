"""individual Round 2 sessions (replaces relay teams)

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-26

Round 2 is no longer a 3-member relay — every qualified participant now gets
their own dealt set of coding problems solved in strict order under one shared
total timer. This migration adds:

* `round2_sessions` — one row per qualified participant: dealt `problem_ids`
  (Q1..Q3 order), `current_index`, `started_at`, `deadline` (single common
  deadline set when the organizers launch the round) and `status`.
* `code_drafts.participant_id` (nullable) + a partial unique index on
  (participant_id, problem_id) — individual auto-save keyed to the participant.
* `submissions.participant_id` (nullable) — individual verdicts. Legacy team
  columns stay (nullable) since team tables/models are kept dormant, not dropped.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Individual Round-2 sessions (status reuses the existing `session_status` enum type)
    op.create_table(
        "round2_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("participants.id"), nullable=False),
        sa.Column("competition_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("competitions.id"), nullable=False),
        sa.Column("problem_ids", sa.JSON(), nullable=True),
        sa.Column("current_index", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="not_started", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("participant_id", "competition_id"),
    )

    # Individual drafting + submissions. Legacy team columns become nullable so
    # individual rows can simply leave them NULL (team tables stay dormant).
    op.add_column("code_drafts", sa.Column(
        "participant_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("participants.id"), nullable=True))
    op.alter_column("code_drafts", "team_id",
                    existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.create_index(
        "uq_code_drafts_participant_problem", "code_drafts",
        ["participant_id", "problem_id"], unique=True,
        postgresql_where=sa.text("participant_id IS NOT NULL"))

    op.add_column("submissions", sa.Column(
        "participant_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("participants.id"), nullable=True))
    op.alter_column("submissions", "team_id",
                    existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.alter_column("submissions", "member_id",
                    existing_type=postgresql.UUID(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.drop_index("uq_code_drafts_participant_problem", table_name="code_drafts")
    op.alter_column("submissions", "member_id",
                    existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.alter_column("submissions", "team_id",
                    existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_column("submissions", "participant_id")
    op.alter_column("code_drafts", "team_id",
                    existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_column("code_drafts", "participant_id")
    op.drop_table("round2_sessions")