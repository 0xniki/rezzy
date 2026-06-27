"""add_account_approval_and_reservation_creator

Revision ID: 9c7b6f2a1d4e
Revises: d7a893975d1f
Create Date: 2026-06-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c7b6f2a1d4e"
down_revision: Union[str, Sequence[str], None] = "d7a893975d1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=20), nullable=False, server_default="user"),
    )
    op.add_column(
        "users",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("approved_by_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_approved_by_id_users",
        "users",
        "users",
        ["approved_by_id"],
        ["id"],
    )

    op.add_column(
        "reservations",
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_reservations_created_by_user_id"),
        "reservations",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_reservations_created_by_user_id_users",
        "reservations",
        "users",
        ["created_by_user_id"],
        ["id"],
    )

    op.alter_column("users", "role", server_default=None)


def downgrade() -> None:
    op.drop_constraint(
        "fk_reservations_created_by_user_id_users",
        "reservations",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_reservations_created_by_user_id"), table_name="reservations")
    op.drop_column("reservations", "created_by_user_id")

    op.drop_constraint("fk_users_approved_by_id_users", "users", type_="foreignkey")
    op.drop_column("users", "approved_by_id")
    op.drop_column("users", "approved_at")
    op.drop_column("users", "created_at")
    op.drop_column("users", "role")
