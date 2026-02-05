"""Initial schema

Revision ID: 2e842156351d
Revises:
Create Date: 2026-02-04 15:59:21.976448

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2e842156351d'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Restaurant config table
    op.create_table(
        'restaurant_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('total_extra_chairs', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('id = 1', name='single_row_constraint'),
        sa.CheckConstraint('total_extra_chairs >= 0', name='non_negative_extra_chairs'),
    )

    # Merge groups table (created before tables due to FK)
    op.create_table(
        'merge_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_merge_groups_id'), 'merge_groups', ['id'], unique=False)

    # Tables table
    op.create_table(
        'tables',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('table_number', sa.String(length=50), nullable=False),
        sa.Column('x_position', sa.Float(), nullable=False),
        sa.Column('y_position', sa.Float(), nullable=False),
        sa.Column('default_chairs', sa.Integer(), nullable=False),
        sa.Column('max_chairs', sa.Integer(), nullable=False),
        sa.Column('current_chairs', sa.Integer(), nullable=False),
        sa.Column('is_mergeable', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('merge_group_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['merge_group_id'], ['merge_groups.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('table_number'),
        sa.CheckConstraint('default_chairs > 0', name='positive_default_chairs'),
        sa.CheckConstraint('max_chairs >= default_chairs', name='max_gte_default_chairs'),
        sa.CheckConstraint('current_chairs >= 0', name='non_negative_current_chairs'),
        sa.CheckConstraint('current_chairs <= max_chairs', name='current_lte_max_chairs'),
    )
    op.create_index(op.f('ix_tables_id'), 'tables', ['id'], unique=False)

    # Operating hours table
    op.create_table(
        'operating_hours',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('open_time', sa.Time(), nullable=False),
        sa.Column('close_time', sa.Time(), nullable=False),
        sa.Column('is_closed', sa.Boolean(), nullable=False, server_default='false'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('day_of_week >= 0 AND day_of_week <= 6', name='valid_day_of_week'),
    )
    op.create_index(op.f('ix_operating_hours_id'), 'operating_hours', ['id'], unique=False)

    # Special hours table
    op.create_table(
        'special_hours',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('open_time', sa.Time(), nullable=True),
        sa.Column('close_time', sa.Time(), nullable=True),
        sa.Column('is_closed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('reason', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date'),
    )
    op.create_index(op.f('ix_special_hours_id'), 'special_hours', ['id'], unique=False)
    op.create_index(op.f('ix_special_hours_date'), 'special_hours', ['date'], unique=True)

    # Reservations table
    op.create_table(
        'reservations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('guest_name', sa.String(length=255), nullable=False),
        sa.Column('party_size', sa.Integer(), nullable=False),
        sa.Column('phone_number', sa.String(length=20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('reservation_date', sa.Date(), nullable=False),
        sa.Column('reservation_time', sa.Time(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default='90'),
        sa.Column('table_id', sa.Integer(), nullable=True),
        sa.Column('merge_group_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default="'confirmed'"),
        sa.ForeignKeyConstraint(['merge_group_id'], ['merge_groups.id'], ),
        sa.ForeignKeyConstraint(['table_id'], ['tables.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('party_size > 0', name='positive_party_size'),
        sa.CheckConstraint('duration_minutes > 0', name='positive_duration'),
        sa.CheckConstraint(
            '(table_id IS NOT NULL AND merge_group_id IS NULL) OR '
            '(table_id IS NULL AND merge_group_id IS NOT NULL)',
            name='exactly_one_table_assignment'
        ),
        sa.CheckConstraint(
            'party_size < 4 OR phone_number IS NOT NULL',
            name='phone_required_for_large_party'
        ),
    )
    op.create_index(op.f('ix_reservations_id'), 'reservations', ['id'], unique=False)
    op.create_index(op.f('ix_reservations_reservation_date'), 'reservations', ['reservation_date'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_reservations_reservation_date'), table_name='reservations')
    op.drop_index(op.f('ix_reservations_id'), table_name='reservations')
    op.drop_table('reservations')

    op.drop_index(op.f('ix_special_hours_date'), table_name='special_hours')
    op.drop_index(op.f('ix_special_hours_id'), table_name='special_hours')
    op.drop_table('special_hours')

    op.drop_index(op.f('ix_operating_hours_id'), table_name='operating_hours')
    op.drop_table('operating_hours')

    op.drop_index(op.f('ix_tables_id'), table_name='tables')
    op.drop_table('tables')

    op.drop_index(op.f('ix_merge_groups_id'), table_name='merge_groups')
    op.drop_table('merge_groups')

    op.drop_table('restaurant_config')
