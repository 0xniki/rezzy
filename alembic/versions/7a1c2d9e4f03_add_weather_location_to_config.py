"""add weather location to restaurant config

Revision ID: 7a1c2d9e4f03
Revises: 9c7b6f2a1d4e
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7a1c2d9e4f03"
down_revision: Union[str, Sequence[str], None] = "9c7b6f2a1d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "restaurant_config",
        sa.Column("weather_location", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("restaurant_config", "weather_location")
