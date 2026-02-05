from datetime import date, time, datetime, timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from rezzy.models import OperatingHours, SpecialHours
from rezzy.schemas import (
    OperatingHoursCreate,
    OperatingHoursUpdate,
    SpecialHoursCreate,
    SpecialHoursUpdate,
)
from rezzy.core.config import get_settings


class OperatingHoursService:
    @staticmethod
    def get_all_hours(db: Session) -> list[OperatingHours]:
        return db.query(OperatingHours).order_by(OperatingHours.day_of_week).all()

    @staticmethod
    def get_hours_for_day(db: Session, day_of_week: int) -> OperatingHours | None:
        return (
            db.query(OperatingHours)
            .filter(OperatingHours.day_of_week == day_of_week)
            .first()
        )

    @staticmethod
    def create_hours(db: Session, hours: OperatingHoursCreate) -> OperatingHours:
        existing = OperatingHoursService.get_hours_for_day(db, hours.day_of_week)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Operating hours for day {hours.day_of_week} already exist. Use update instead.",
            )
        db_hours = OperatingHours(**hours.model_dump())
        db.add(db_hours)
        db.commit()
        db.refresh(db_hours)
        return db_hours

    @staticmethod
    def update_hours(
        db: Session, day_of_week: int, hours: OperatingHoursUpdate
    ) -> OperatingHours:
        db_hours = OperatingHoursService.get_hours_for_day(db, day_of_week)
        if not db_hours:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Operating hours for day {day_of_week} not found",
            )
        update_data = hours.model_dump(exclude_unset=True)

        # Validate times if both are being set or one is being updated
        new_open = update_data.get("open_time", db_hours.open_time)
        new_close = update_data.get("close_time", db_hours.close_time)
        new_closed = update_data.get("is_closed", db_hours.is_closed)

        if not new_closed and new_open >= new_close:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="open_time must be before close_time",
            )

        for field, value in update_data.items():
            setattr(db_hours, field, value)
        db.commit()
        db.refresh(db_hours)
        return db_hours

    @staticmethod
    def bulk_create_hours(
        db: Session, hours_list: list[OperatingHoursCreate]
    ) -> list[OperatingHours]:
        """Create operating hours for multiple days at once"""
        created = []
        for hours in hours_list:
            db_hours = OperatingHours(**hours.model_dump())
            db.add(db_hours)
            created.append(db_hours)
        db.commit()
        for h in created:
            db.refresh(h)
        return created


class SpecialHoursService:
    @staticmethod
    def get_special_hours(
        db: Session, start_date: date | None = None, end_date: date | None = None
    ) -> list[SpecialHours]:
        query = db.query(SpecialHours)
        if start_date:
            query = query.filter(SpecialHours.date >= start_date)
        if end_date:
            query = query.filter(SpecialHours.date <= end_date)
        return query.order_by(SpecialHours.date).all()

    @staticmethod
    def get_special_hours_for_date(db: Session, target_date: date) -> SpecialHours | None:
        return db.query(SpecialHours).filter(SpecialHours.date == target_date).first()

    @staticmethod
    def create_special_hours(db: Session, hours: SpecialHoursCreate) -> SpecialHours:
        existing = SpecialHoursService.get_special_hours_for_date(db, hours.date)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Special hours for {hours.date} already exist. Use update instead.",
            )
        db_hours = SpecialHours(**hours.model_dump())
        db.add(db_hours)
        db.commit()
        db.refresh(db_hours)
        return db_hours

    @staticmethod
    def update_special_hours(
        db: Session, target_date: date, hours: SpecialHoursUpdate
    ) -> SpecialHours:
        db_hours = SpecialHoursService.get_special_hours_for_date(db, target_date)
        if not db_hours:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Special hours for {target_date} not found",
            )
        update_data = hours.model_dump(exclude_unset=True)

        # Validate times
        new_open = update_data.get("open_time", db_hours.open_time)
        new_close = update_data.get("close_time", db_hours.close_time)
        new_closed = update_data.get("is_closed", db_hours.is_closed)

        if not new_closed:
            if new_open is None or new_close is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="open_time and close_time required when not closed",
                )
            if new_open >= new_close:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="open_time must be before close_time",
                )

        for field, value in update_data.items():
            setattr(db_hours, field, value)
        db.commit()
        db.refresh(db_hours)
        return db_hours

    @staticmethod
    def delete_special_hours(db: Session, target_date: date) -> None:
        db_hours = SpecialHoursService.get_special_hours_for_date(db, target_date)
        if not db_hours:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Special hours for {target_date} not found",
            )
        db.delete(db_hours)
        db.commit()


class HoursValidationService:
    """Service to validate times against operating hours"""

    @staticmethod
    def get_hours_for_date(
        db: Session, target_date: date
    ) -> tuple[time | None, time | None, bool]:
        """
        Get operating hours for a specific date.
        Returns (open_time, close_time, is_closed).
        Special hours override regular hours.
        """
        # Check for special hours first
        special = SpecialHoursService.get_special_hours_for_date(db, target_date)
        if special:
            return special.open_time, special.close_time, special.is_closed

        # Fall back to regular operating hours
        day_of_week = target_date.weekday()
        regular = OperatingHoursService.get_hours_for_day(db, day_of_week)
        if regular:
            return regular.open_time, regular.close_time, regular.is_closed

        # No hours defined - treat as closed
        return None, None, True

    @staticmethod
    def is_time_within_hours(
        db: Session,
        target_date: date,
        target_time: time,
        duration_minutes: int,
    ) -> tuple[bool, str | None]:
        """
        Check if a reservation time is valid.
        Returns (is_valid, error_message).
        """
        settings = get_settings()
        open_time, close_time, is_closed = HoursValidationService.get_hours_for_date(
            db, target_date
        )

        if is_closed:
            return False, "Restaurant is closed on this date"

        if open_time is None or close_time is None:
            return False, "No operating hours defined for this date"

        # Check if reservation time is within operating hours
        if target_time < open_time:
            return False, f"Reservation time is before opening ({open_time})"

        # Calculate the cutoff time (30 min before close)
        close_datetime = datetime.combine(target_date, close_time)
        cutoff_datetime = close_datetime - timedelta(
            minutes=settings.reservation_cutoff_minutes
        )
        cutoff_time = cutoff_datetime.time()

        if target_time > cutoff_time:
            return (
                False,
                f"Reservations must be made at least {settings.reservation_cutoff_minutes} minutes before closing ({close_time})",
            )

        # Check if reservation would extend past closing
        reservation_end = datetime.combine(target_date, target_time) + timedelta(
            minutes=duration_minutes
        )
        if reservation_end.time() > close_time:
            return (
                False,
                f"Reservation would extend past closing time ({close_time})",
            )

        return True, None
