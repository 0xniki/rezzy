from sqlalchemy import Column, Integer, String, Float, Boolean, Date, Time, ForeignKey, Text, CheckConstraint
from sqlalchemy.orm import relationship
from rezzy.core.database import Base


class RestaurantConfig(Base):
    """Global restaurant configuration - single row table"""
    __tablename__ = "restaurant_config"

    id = Column(Integer, primary_key=True, default=1)
    name = Column(String(255), nullable=False)
    total_extra_chairs = Column(Integer, nullable=False, default=0)  # Unassigned chairs available

    __table_args__ = (
        CheckConstraint("id = 1", name="single_row_constraint"),
        CheckConstraint("total_extra_chairs >= 0", name="non_negative_extra_chairs"),
    )


class Table(Base):
    """Restaurant tables with position and chair configuration"""
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True, index=True)
    table_number = Column(String(50), unique=True, nullable=False)  # e.g., "T1", "A1", "Patio-3"

    # Position for frontend layout
    x_position = Column(Float, nullable=False)
    y_position = Column(Float, nullable=False)

    # Chair configuration
    default_chairs = Column(Integer, nullable=False)
    max_chairs = Column(Integer, nullable=False)
    current_chairs = Column(Integer, nullable=False)  # Tracks actual chairs currently at table

    # For table merging
    is_mergeable = Column(Boolean, default=True)
    merge_group_id = Column(Integer, ForeignKey("merge_groups.id"), nullable=True)

    # Status
    is_active = Column(Boolean, default=True)  # Can be deactivated without deletion

    reservations = relationship("Reservation", back_populates="table")
    merge_group = relationship("MergeGroup", back_populates="tables")

    __table_args__ = (
        CheckConstraint("default_chairs > 0", name="positive_default_chairs"),
        CheckConstraint("max_chairs >= default_chairs", name="max_gte_default_chairs"),
        CheckConstraint("current_chairs >= 0", name="non_negative_current_chairs"),
        CheckConstraint("current_chairs <= max_chairs", name="current_lte_max_chairs"),
    )


class MergeGroup(Base):
    """Groups of merged tables"""
    __tablename__ = "merge_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True)  # Optional name like "Large Party Area"
    is_active = Column(Boolean, default=True)

    tables = relationship("Table", back_populates="merge_group")
    reservations = relationship("Reservation", back_populates="merge_group")


class OperatingHours(Base):
    """Regular weekly operating hours (day 0 = Monday, 6 = Sunday)"""
    __tablename__ = "operating_hours"

    id = Column(Integer, primary_key=True, index=True)
    day_of_week = Column(Integer, nullable=False)  # 0-6 (Monday-Sunday)
    open_time = Column(Time, nullable=False)
    close_time = Column(Time, nullable=False)
    is_closed = Column(Boolean, default=False)  # For days restaurant is regularly closed

    __table_args__ = (
        CheckConstraint("day_of_week >= 0 AND day_of_week <= 6", name="valid_day_of_week"),
    )


class SpecialHours(Base):
    """Override hours for specific dates (holidays, private events, etc.)"""
    __tablename__ = "special_hours"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    open_time = Column(Time, nullable=True)  # Null if closed
    close_time = Column(Time, nullable=True)
    is_closed = Column(Boolean, default=False)
    reason = Column(String(255), nullable=True)  # e.g., "Christmas Day", "Private Event"


class Reservation(Base):
    """Customer reservations"""
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)

    # Customer info
    guest_name = Column(String(255), nullable=False)
    party_size = Column(Integer, nullable=False)
    phone_number = Column(String(20), nullable=True)  # Required if party_size >= 4
    notes = Column(Text, nullable=True)

    # Timing
    reservation_date = Column(Date, nullable=False, index=True)
    reservation_time = Column(Time, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=90)

    # Table assignment (either single table or merge group)
    table_id = Column(Integer, ForeignKey("tables.id"), nullable=True)
    merge_group_id = Column(Integer, ForeignKey("merge_groups.id"), nullable=True)

    # Status
    status = Column(String(20), nullable=False, default="confirmed")  # confirmed, seated, completed, cancelled, no_show

    table = relationship("Table", back_populates="reservations")
    merge_group = relationship("MergeGroup", back_populates="reservations")

    __table_args__ = (
        CheckConstraint("party_size > 0", name="positive_party_size"),
        CheckConstraint("duration_minutes > 0", name="positive_duration"),
        CheckConstraint(
            "(table_id IS NOT NULL AND merge_group_id IS NULL) OR "
            "(table_id IS NULL AND merge_group_id IS NOT NULL)",
            name="exactly_one_table_assignment"
        ),
        CheckConstraint(
            "party_size < 4 OR phone_number IS NOT NULL",
            name="phone_required_for_large_party"
        ),
    )
