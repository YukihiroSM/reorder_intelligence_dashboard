"""ai advisor: extend action enum, enrich ai_suggestions, add ai_briefings

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-28

Phase 7 (AI layer). Adds two action types the advisor reasons about (EXPEDITE when a
stockout gap is already locked in; REDUCE_ORDER when an MOQ overshoots demand), enriches
the per-SKU cache with the operator-facing fields (headline, confidence, revenue at risk,
fallback marker), and adds a portfolio-wide briefing cache table (no sku_id).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ai_confidence = postgresql.ENUM(
    "HIGH", "MEDIUM", "LOW", name="ai_confidence", create_type=False
)


def upgrade() -> None:
    # 1. Extend the action enum (PG16 allows ADD VALUE in a transaction; unused here).
    op.execute("ALTER TYPE ai_action_type ADD VALUE IF NOT EXISTS 'EXPEDITE'")
    op.execute("ALTER TYPE ai_action_type ADD VALUE IF NOT EXISTS 'REDUCE_ORDER'")

    # 2. New confidence enum type.
    op.execute("CREATE TYPE ai_confidence AS ENUM ('HIGH', 'MEDIUM', 'LOW')")

    # 3. Enrich ai_suggestions (table is empty pre-Phase-7; server_defaults are belt-and-braces).
    op.add_column(
        "ai_suggestions",
        sa.Column("headline", sa.String(200), nullable=False, server_default=""),
    )
    op.add_column(
        "ai_suggestions",
        sa.Column(
            "revenue_at_risk_usd",
            sa.Numeric(14, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "ai_suggestions",
        sa.Column(
            "confidence",
            _ai_confidence,
            nullable=False,
            server_default=sa.text("'MEDIUM'"),
        ),
    )
    op.add_column(
        "ai_suggestions",
        sa.Column(
            "ai_status", sa.String(20), nullable=False, server_default=sa.text("'ok'")
        ),
    )

    # 4. Portfolio briefing cache (spans the portfolio — no sku_id).
    op.create_table(
        "ai_briefings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("context_hash", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("total_cash_to_commit_usd", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_revenue_at_risk_usd", sa.Numeric(14, 2), nullable=False),
        sa.Column("ai_status", sa.String(20), server_default=sa.text("'ok'"), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("tokens_input", sa.Integer(), nullable=True),
        sa.Column("tokens_output", sa.Integer(), nullable=True),
        sa.Column(
            "generated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("context_hash", name="uq_ai_briefing_key"),
    )
    op.create_index("ix_ai_briefings_generated_at", "ai_briefings", ["generated_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_briefings_generated_at", table_name="ai_briefings")
    op.drop_table("ai_briefings")
    op.drop_column("ai_suggestions", "ai_status")
    op.drop_column("ai_suggestions", "confidence")
    op.drop_column("ai_suggestions", "revenue_at_risk_usd")
    op.drop_column("ai_suggestions", "headline")
    op.execute("DROP TYPE ai_confidence")
    # Note: Postgres can't DROP VALUE from an enum, so EXPEDITE / REDUCE_ORDER remain on
    # ai_action_type after downgrade. Harmless — nothing references them once 0004 is gone.
