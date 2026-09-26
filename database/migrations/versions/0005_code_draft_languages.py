"""per-language coding drafts

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-26

Adds `code_drafts.languages` (JSON map language -> source_code) so a team can
keep one saved code per language per problem. Switching C -> C++ -> C restores
the last C code instead of wiping it, and a member who hands off mid-language
picks up exactly where the previous member left. Existing single-language rows
are backfilled from `language`/`source_code`; those columns stay in sync as the
"last used" convenience view.
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "code_drafts",
        sa.Column("languages", sa.JSON, server_default=sa.text("'{}'"), nullable=False),
    )
    op.execute(
        "UPDATE code_drafts SET languages = json_build_object(language, source_code) "
        "WHERE language IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("code_drafts", "languages")