"""seed reference data: categories, suppliers, app_config singleton

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-27

Seeds the 5 categories and 4 suppliers present in inventory.json, plus the
singleton app_config row (all tunables fall back to their column defaults).

Category `code` is the lowercased name — the Phase 2 importer derives the same
key when it UPSERTs categories, so seeded rows are matched, not duplicated.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


CATEGORIES = [
    ("supplements", "Supplements"),
    ("vitamins", "Vitamins"),
    ("sports nutrition", "Sports Nutrition"),
    ("beauty", "Beauty"),
    ("bundles", "Bundles"),
]

# (name, production_lead_days, shipping_days) — from inventory.json
SUPPLIERS = [
    ("Shenzhen Wellness Co", 28, 14),
    ("Guangzhou Health Labs", 35, 18),
    ("Mumbai Pharma Direct", 42, 21),
    ("Bangkok BioWorks", 21, 12),
]


def upgrade() -> None:
    cat_values = ", ".join(f"('{code}', '{name}')" for code, name in CATEGORIES)
    op.execute(f"INSERT INTO categories (code, name) VALUES {cat_values}")

    sup_values = ", ".join(
        f"('{name}', {lead}, {ship})" for name, lead, ship in SUPPLIERS
    )
    op.execute(
        "INSERT INTO suppliers (name, production_lead_days, shipping_days) "
        f"VALUES {sup_values}"
    )

    # Singleton config row; every other column uses its server default.
    op.execute("INSERT INTO app_config (id) VALUES ('active')")


def downgrade() -> None:
    op.execute("DELETE FROM app_config WHERE id = 'active'")

    sup_names = ", ".join(f"'{name}'" for name, _, _ in SUPPLIERS)
    op.execute(f"DELETE FROM suppliers WHERE name IN ({sup_names})")

    cat_codes = ", ".join(f"'{code}'" for code, _ in CATEGORIES)
    op.execute(f"DELETE FROM categories WHERE code IN ({cat_codes})")
