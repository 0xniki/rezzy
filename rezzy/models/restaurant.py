from sqlalchemy import Column, Integer, String, Float, Boolean, Date, Time, ForeignKey, Text, CheckConstraint, Table as SATable
from sqlalchemy.orm import relationship
from rezzy.core.database import Base


class RestaurantConfig(Base):
    """Global restaurant configuration - single row table"""
    __tablename__ = "restaurant_config"

    id = Column(Integer, primary_key=True, default=1)
    name = Column(String(255), nullable=False)
    total_extra_chairs = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        CheckConstraint("id = 1", name="single_row_constraint"),
        CheckConstraint("total_extra_chairs >= 0", name="non_negative_extra_chairs"),
    )


# Join table for reservation <-> tables (many-to-many)
reservation_tables = SATable(
    "reservation_tables",
    Base.metadata,
    Column("reservation_id", Integer, ForeignKey("reservations.id", ondelete="CASCADE"), primary_key=True),
    Column("table_id", Integer, ForeignKey("tables.id", ondelete="CASCADE"), primary_key=True),
)


class Table(Base):
    """Restaurant tables with position and chair configuration"""
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True, index=True)
    table_number = Column(String(50), unique=True, nullable=False)

    x_position = Column(Float, nullable=False, default=0)
    y_position = Column(Float, nullable=False, default=0)

    default_chairs = Column(Integer, nullable=False)
    max_chairs = Column(Integer, nullable=False)
    current_chairs = Column(Integer, nullable=False)

    is_active = Column(Boolean, default=True)

    reservations = relationship("Reservation", secondary=reservation_tables, back_populates="tables")

    __table_args__ = (
        CheckConstraint("default_chairs > 0", name="positive_default_chairs"),
        CheckConstraint("max_chairs >= default_chairs", name="max_gte_default_chairs"),
        CheckConstraint("current_chairs >= 0", name="non_negative_current_chairs"),
        CheckConstraint("current_chairs <= max_chairs", name="current_lte_max_chairs"),
    )


class OperatingHours(Base):
    """Regular weekly operating hours (day 0 = Monday, 6 = Sunday)"""
    __tablename__ = "operating_hours"

    id = Column(Integer, primary_key=True, index=True)
    day_of_week = Column(Integer, nullable=False)
    open_time = Column(Time, nullable=True)
    close_time = Column(Time, nullable=True)
    is_closed = Column(Boolean, default=False)

    __table_args__ = (
        CheckConstraint("day_of_week >= 0 AND day_of_week <= 6", name="valid_day_of_week"),
    )


class SpecialHours(Base):
    """Override hours for specific dates (holidays, private events, etc.)"""
    __tablename__ = "special_hours"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    open_time = Column(Time, nullable=True)
    close_time = Column(Time, nullable=True)
    is_closed = Column(Boolean, default=False)
    reason = Column(String(255), nullable=True)


class Reservation(Base):
    """Customer reservations"""
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)

    guest_name = Column(String(255), nullable=False)
    party_size = Column(Integer, nullable=False)
    phone_number = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)

    reservation_date = Column(Date, nullable=False, index=True)
    reservation_time = Column(Time, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=90)

    status = Column(String(20), nullable=False, default="confirmed")

    tables = relationship("Table", secondary=reservation_tables, back_populates="reservations")

    __table_args__ = (
        CheckConstraint("party_size > 0", name="positive_party_size"),
        CheckConstraint("duration_minutes > 0", name="positive_duration"),
        CheckConstraint(
            "party_size < 4 OR phone_number IS NOT NULL",
            name="phone_required_for_large_party"
        ),
    )
