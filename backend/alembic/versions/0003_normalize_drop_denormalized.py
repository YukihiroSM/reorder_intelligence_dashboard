"""normalize: drop denormalized SKU columns + snapshot confidence_flags

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-27

The skus table mirrored stock/cost/retail/moq from the latest snapshot, but the
importer overwrote them on every import regardless of date (stale after a
back-dated import) and nothing read them — the snapshot is the single source of
truth. sku_snapshots.confidence_flags was always written empty; flags are
computed at read-time (and depend on live config), so the stored column is dead.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("sku_snapshots", "confidence_flags")
    op.drop_column("skus", "current_stock")
    op.drop_column("skus", "moq")
    op.drop_column("skus", "retail_price_usd")
    op.drop_column("skus", "cost_per_unit_usd")


def downgrade() -> None:
    # Re-add with server_default so existing rows satisfy NOT NULL on the way back.
    op.add_column(
        "skus",
        sa.Column(
            "cost_per_unit_usd",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "skus",
        sa.Column(
            "retail_price_usd",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "skus", sa.Column("moq", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "skus",
        sa.Column("current_stock", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sku_snapshots",
        sa.Column(
            "confidence_flags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
