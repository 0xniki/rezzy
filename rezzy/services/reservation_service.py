from datetime import date, time, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from fastapi import HTTPException, status

from rezzy.models import Reservation, Table, MergeGroup, RestaurantConfig
from rezzy.schemas import ReservationCreate, ReservationUpdate
from rezzy.services.hours_service import HoursValidationService
from rezzy.services.restaurant_service import TableService, MergeGroupService


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
            query = query.filter(Reservation.table_id == table_id)

        return query.order_by(
            Reservation.reservation_date, Reservation.reservation_time
        ).all()

    @staticmethod
    def get_reservation(db: Session, reservation_id: int) -> Reservation:
        reservation = (
            db.query(Reservation).filter(Reservation.id == reservation_id).first()
        )
        if not reservation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Reservation {reservation_id} not found",
            )
        return reservation

    @staticmethod
    def _get_table_capacity(db: Session, table_id: int | None, merge_group_id: int | None) -> int:
        """Get the seating capacity for a table or merge group"""
        if table_id:
            table = TableService.get_table(db, table_id)
            return table.current_chairs
        elif merge_group_id:
            return MergeGroupService.get_total_capacity(db, merge_group_id)
        return 0

    @staticmethod
    def _check_table_availability(
        db: Session,
        table_id: int | None,
        merge_group_id: int | None,
        reservation_date: date,
        reservation_time: time,
        duration_minutes: int,
        exclude_reservation_id: int | None = None,
    ) -> tuple[bool, str | None]:
        """
        Check if a table/merge group is available for the given time slot.
        Returns (is_available, conflict_message).
        """
        # Calculate reservation time window
        start_dt = datetime.combine(reservation_date, reservation_time)
        end_dt = start_dt + timedelta(minutes=duration_minutes)

        # Build query for conflicting reservations
        query = db.query(Reservation).filter(
            Reservation.reservation_date == reservation_date,
            Reservation.status.in_(["confirmed", "seated"]),
        )

        if table_id:
            # Check if table is part of a merge group
            table = TableService.get_table(db, table_id)
            if table.merge_group_id:
                # If booking a single table that's in a merge group,
                # check both direct table bookings and merge group bookings
                query = query.filter(
                    or_(
                        Reservation.table_id == table_id,
                        Reservation.merge_group_id == table.merge_group_id,
                    )
                )
            else:
                query = query.filter(Reservation.table_id == table_id)
        elif merge_group_id:
            # For merge group, check bookings on the group AND individual tables
            group = MergeGroupService.get_merge_group(db, merge_group_id)
            table_ids = [t.id for t in group.tables]
            query = query.filter(
                or_(
                    Reservation.merge_group_id == merge_group_id,
                    Reservation.table_id.in_(table_ids),
                )
            )

        if exclude_reservation_id:
            query = query.filter(Reservation.id != exclude_reservation_id)

        existing_reservations = query.all()

        for existing in existing_reservations:
            existing_start = datetime.combine(
                existing.reservation_date, existing.reservation_time
            )
            existing_end = existing_start + timedelta(minutes=existing.duration_minutes)

            # Check for overlap
            if start_dt < existing_end and end_dt > existing_start:
                return (
                    False,
                    f"Conflicts with existing reservation for {existing.guest_name} at {existing.reservation_time}",
                )

        return True, None

    @staticmethod
    def create_reservation(db: Session, reservation: ReservationCreate) -> Reservation:
        # Validate operating hours
        is_valid, error = HoursValidationService.is_time_within_hours(
            db,
            reservation.reservation_date,
            reservation.reservation_time,
            reservation.duration_minutes,
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=error
            )

        # Validate table/merge group exists and is active
        if reservation.table_id:
            table = TableService.get_table(db, reservation.table_id)
            if not table.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Table {table.table_number} is not active",
                )
        elif reservation.merge_group_id:
            group = MergeGroupService.get_merge_group(db, reservation.merge_group_id)
            if not group.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Merge group is not active",
                )

        # Check capacity
        capacity = ReservationService._get_table_capacity(
            db, reservation.table_id, reservation.merge_group_id
        )
        if reservation.party_size > capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Party size ({reservation.party_size}) exceeds table capacity ({capacity})",
            )

        # Check availability
        is_available, conflict = ReservationService._check_table_availability(
            db,
            reservation.table_id,
            reservation.merge_group_id,
            reservation.reservation_date,
            reservation.reservation_time,
            reservation.duration_minutes,
        )
        if not is_available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=conflict
            )

        db_reservation = Reservation(**reservation.model_dump())
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

        # Determine the values to validate
        new_date = update_data.get("reservation_date", db_reservation.reservation_date)
        new_time = update_data.get("reservation_time", db_reservation.reservation_time)
        new_duration = update_data.get(
            "duration_minutes", db_reservation.duration_minutes
        )
        new_party_size = update_data.get("party_size", db_reservation.party_size)
        new_table_id = update_data.get("table_id", db_reservation.table_id)
        new_merge_group_id = update_data.get(
            "merge_group_id", db_reservation.merge_group_id
        )
        new_phone = update_data.get("phone_number", db_reservation.phone_number)

        # Validate phone requirement for updated party size
        if new_party_size >= 4 and not new_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is required for party size of 4 or more",
            )

        # Handle table assignment changes
        if "table_id" in update_data or "merge_group_id" in update_data:
            # Ensure exactly one is set
            if new_table_id is not None and new_merge_group_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot assign both table_id and merge_group_id",
                )
            if new_table_id is None and new_merge_group_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Either table_id or merge_group_id must be provided",
                )

        # Validate operating hours if date/time changed
        if "reservation_date" in update_data or "reservation_time" in update_data:
            is_valid, error = HoursValidationService.is_time_within_hours(
                db, new_date, new_time, new_duration
            )
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=error
                )

        # Check capacity if party size or table changed
        if (
            "party_size" in update_data
            or "table_id" in update_data
            or "merge_group_id" in update_data
        ):
            capacity = ReservationService._get_table_capacity(
                db, new_table_id, new_merge_group_id
            )
            if new_party_size > capacity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Party size ({new_party_size}) exceeds table capacity ({capacity})",
                )

        # Check availability if date/time/table changed
        if (
            "reservation_date" in update_data
            or "reservation_time" in update_data
            or "duration_minutes" in update_data
            or "table_id" in update_data
            or "merge_group_id" in update_data
        ):
            is_available, conflict = ReservationService._check_table_availability(
                db,
                new_table_id,
                new_merge_group_id,
                new_date,
                new_time,
                new_duration,
                exclude_reservation_id=reservation_id,
            )
            if not is_available:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=conflict
                )

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
        Find available tables for a given time slot and party size.
        Returns a list of available options (tables and merge groups).
        """
        # First validate the time is within operating hours
        is_valid, error = HoursValidationService.is_time_within_hours(
            db, reservation_date, reservation_time, duration_minutes
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=error
            )

        available = []

        # Check individual tables
        tables = db.query(Table).filter(
            Table.is_active == True,
            Table.current_chairs >= party_size,
        ).all()

        for table in tables:
            is_available, _ = ReservationService._check_table_availability(
                db,
                table.id,
                None,
                reservation_date,
                reservation_time,
                duration_minutes,
            )
            if is_available:
                available.append({
                    "type": "table",
                    "id": table.id,
                    "table_number": table.table_number,
                    "capacity": table.current_chairs,
                    "x_position": table.x_position,
                    "y_position": table.y_position,
                })

        # Check merge groups
        groups = db.query(MergeGroup).filter(MergeGroup.is_active == True).all()
        for group in groups:
            total_capacity = sum(t.current_chairs for t in group.tables)
            if total_capacity >= party_size:
                is_available, _ = ReservationService._check_table_availability(
                    db,
                    None,
                    group.id,
                    reservation_date,
                    reservation_time,
                    duration_minutes,
                )
                if is_available:
                    available.append({
                        "type": "merge_group",
                        "id": group.id,
                        "name": group.name,
                        "capacity": total_capacity,
                        "tables": [
                            {
                                "id": t.id,
                                "table_number": t.table_number,
                                "x_position": t.x_position,
                                "y_position": t.y_position,
                            }
                            for t in group.tables
                        ],
                    })

        return available
