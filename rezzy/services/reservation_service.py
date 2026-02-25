from datetime import date, time, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException, status
from itertools import combinations

from rezzy.models import Reservation, Table
from rezzy.schemas import ReservationCreate, ReservationUpdate
from rezzy.services.hours_service import HoursValidationService
from rezzy.services.restaurant_service import TableService


class ReservationService:
    @staticmethod
    def get_reservations(
        db: Session,
        start_date: date | None = None,
        end_date: date | None = None,
        status_filter: str | None = None,
        table_id: int | None = None,
    ) -> list[Reservation]:
        query = db.query(Reservation)

        if start_date:
            query = query.filter(Reservation.reservation_date >= start_date)
        if end_date:
            query = query.filter(Reservation.reservation_date <= end_date)
        if status_filter:
            query = query.filter(Reservation.status == status_filter)
        if table_id:
            query = query.filter(Reservation.tables.any(Table.id == table_id))

        return query.order_by(
            Reservation.reservation_date, Reservation.reservation_time
        ).all()

    @staticmethod
    def get_reservation(db: Session, reservation_id: int) -> Reservation:
        reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
        if not reservation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Reservation {reservation_id} not found",
            )
        return reservation

    @staticmethod
    def _overlapping_reservations(
        db: Session,
        table_ids: list[int],
        reservation_date: date,
        reservation_time: time,
        duration_minutes: int,
        exclude_reservation_id: int | None = None,
    ) -> list[Reservation]:
        """Return active reservations that overlap the given slot for any of the given tables."""
        start_dt = datetime.combine(reservation_date, reservation_time)
        end_dt = start_dt + timedelta(minutes=duration_minutes)

        query = (
            db.query(Reservation)
            .filter(
                Reservation.reservation_date == reservation_date,
                Reservation.status.in_(["confirmed", "seated"]),
                Reservation.tables.any(Table.id.in_(table_ids)),
            )
        )
        if exclude_reservation_id:
            query = query.filter(Reservation.id != exclude_reservation_id)

        conflicts = []
        for res in query.all():
            res_start = datetime.combine(res.reservation_date, res.reservation_time)
            res_end = res_start + timedelta(minutes=res.duration_minutes)
            if start_dt < res_end and end_dt > res_start:
                conflicts.append(res)
        return conflicts

    @staticmethod
    def _check_tables_available(
        db: Session,
        table_ids: list[int],
        reservation_date: date,
        reservation_time: time,
        duration_minutes: int,
        exclude_reservation_id: int | None = None,
    ) -> tuple[bool, str | None]:
        conflicts = ReservationService._overlapping_reservations(
            db, table_ids, reservation_date, reservation_time,
            duration_minutes, exclude_reservation_id
        )
        if conflicts:
            c = conflicts[0]
            return False, f"Conflicts with existing reservation for {c.guest_name} at {c.reservation_time}"
        return True, None

    @staticmethod
    def create_reservation(db: Session, reservation: ReservationCreate) -> Reservation:
        # Validate operating hours
        is_valid, error = HoursValidationService.is_time_within_hours(
            db, reservation.reservation_date, reservation.reservation_time,
            reservation.duration_minutes,
        )
        if not is_valid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

        # Validate tables exist and are active
        tables = []
        for tid in reservation.table_ids:
            table = TableService.get_table(db, tid)
            if not table.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Table {table.table_number} is not active",
                )
            tables.append(table)

        # Check combined capacity
        total_capacity = sum(t.current_chairs for t in tables)
        if reservation.party_size > total_capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Party size ({reservation.party_size}) exceeds combined table capacity ({total_capacity})",
            )

        # Check availability
        is_available, conflict = ReservationService._check_tables_available(
            db, reservation.table_ids, reservation.reservation_date,
            reservation.reservation_time, reservation.duration_minutes,
        )
        if not is_available:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=conflict)

        # Create reservation
        db_reservation = Reservation(
            guest_name=reservation.guest_name,
            party_size=reservation.party_size,
            phone_number=reservation.phone_number,
            notes=reservation.notes,
            reservation_date=reservation.reservation_date,
            reservation_time=reservation.reservation_time,
            duration_minutes=reservation.duration_minutes,
        )
        db_reservation.tables = tables
        db.add(db_reservation)
        db.commit()
        db.refresh(db_reservation)
        return db_reservation

    @staticmethod
    def update_reservation(
        db: Session, reservation_id: int, reservation: ReservationUpdate
    ) -> Reservation:
        db_reservation = ReservationService.get_reservation(db, reservation_id)
        update_data = reservation.model_dump(exclude_unset=True)

        new_date = update_data.get("reservation_date", db_reservation.reservation_date)
        new_time = update_data.get("reservation_time", db_reservation.reservation_time)
        new_duration = update_data.get("duration_minutes", db_reservation.duration_minutes)
        new_party_size = update_data.get("party_size", db_reservation.party_size)
        new_phone = update_data.get("phone_number", db_reservation.phone_number)

        if new_party_size >= 4 and not new_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is required for party size of 4 or more",
            )

        # Handle table reassignment
        new_table_ids = update_data.pop("table_ids", None)
        if new_table_ids is not None:
            tables = []
            for tid in new_table_ids:
                table = TableService.get_table(db, tid)
                if not table.is_active:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Table {table.table_number} is not active",
                    )
                tables.append(table)
            db_reservation.tables = tables
        else:
            tables = db_reservation.tables

        # Validate hours if time changed
        if "reservation_date" in update_data or "reservation_time" in update_data:
            is_valid, error = HoursValidationService.is_time_within_hours(
                db, new_date, new_time, new_duration
            )
            if not is_valid:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

        # Validate capacity
        if "party_size" in update_data or new_table_ids is not None:
            total_capacity = sum(t.current_chairs for t in tables)
            if new_party_size > total_capacity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Party size ({new_party_size}) exceeds combined table capacity ({total_capacity})",
                )

        # Check availability
        check_ids = [t.id for t in tables]
        if (
            "reservation_date" in update_data
            or "reservation_time" in update_data
            or "duration_minutes" in update_data
            or new_table_ids is not None
        ):
            is_available, conflict = ReservationService._check_tables_available(
                db, check_ids, new_date, new_time, new_duration,
                exclude_reservation_id=reservation_id,
            )
            if not is_available:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=conflict)

        for field, value in update_data.items():
            setattr(db_reservation, field, value)
        db.commit()
        db.refresh(db_reservation)
        return db_reservation

    @staticmethod
    def cancel_reservation(db: Session, reservation_id: int) -> Reservation:
        db_reservation = ReservationService.get_reservation(db, reservation_id)
        if db_reservation.status in ["completed", "cancelled"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel a {db_reservation.status} reservation",
            )
        db_reservation.status = "cancelled"
        db.commit()
        db.refresh(db_reservation)
        return db_reservation

    @staticmethod
    def get_available_tables(
        db: Session,
        reservation_date: date,
        reservation_time: time,
        party_size: int,
        duration_minutes: int = 90,
    ) -> list[dict]:
        """
        Find available tables for the given slot and party size.
        Returns individual tables that fit, plus combinations of tables
        that together can seat the party when no single table can.
        """
        is_valid, error = HoursValidationService.is_time_within_hours(
            db, reservation_date, reservation_time, duration_minutes
        )
        if not is_valid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

        all_tables = db.query(Table).filter(Table.is_active == True).all()

        # Find which tables are free for this slot
        free_tables = []
        for table in all_tables:
            conflicts = ReservationService._overlapping_reservations(
                db, [table.id], reservation_date, reservation_time, duration_minutes
            )
            if not conflicts:
                free_tables.append(table)

        available: list[dict] = []

        # Single tables that fit
        for table in free_tables:
            if table.current_chairs >= party_size:
                available.append({
                    "type": "table",
                    "table_ids": [table.id],
                    "table_numbers": [table.table_number],
                    "capacity": table.current_chairs,
                })

        # Combinations of free tables that together fit the party
        # (only suggest if no single table fits, to keep the list clean)
        if not any(o["type"] == "table" for o in available):
            for r in range(2, len(free_tables) + 1):
                for combo in combinations(free_tables, r):
                    total = sum(t.current_chairs for t in combo)
                    if total >= party_size:
                        available.append({
                            "type": "combo",
                            "table_ids": [t.id for t in combo],
                            "table_numbers": [t.table_number for t in combo],
                            "capacity": total,
                        })
                # Stop after finding combos of the smallest sufficient size
                if any(o["type"] == "combo" for o in available):
                    break

        return available
