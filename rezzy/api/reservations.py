from datetime import date, time
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from rezzy.core.database import get_db
from rezzy.schemas import (
    ReservationCreate,
    ReservationUpdate,
    ReservationResponse,
)
from rezzy.services import ReservationService

router = APIRouter(prefix="/reservations", tags=["Reservations"])


@router.get("", response_model=list[ReservationResponse])
def get_reservations(
    start_date: date | None = Query(None, description="Filter from this date"),
    end_date: date | None = Query(None, description="Filter until this date"),
    status: str | None = Query(None, description="Filter by status"),
    table_id: int | None = Query(None, description="Filter by table"),
    db: Session = Depends(get_db),
):
    """Get all reservations with optional filters"""
    return ReservationService.get_reservations(
        db, start_date, end_date, status, table_id
    )


@router.get("/available", response_model=list[dict])
def get_available_tables(
    reservation_date: date,
    reservation_time: time,
    party_size: int,
    duration_minutes: int = Query(90, gt=0),
    db: Session = Depends(get_db),
):
    """Find available tables for a given time slot and party size"""
    return ReservationService.get_available_tables(
        db, reservation_date, reservation_time, party_size, duration_minutes
    )


@router.get("/{reservation_id}", response_model=ReservationResponse)
def get_reservation(reservation_id: int, db: Session = Depends(get_db)):
    """Get a specific reservation by ID"""
    return ReservationService.get_reservation(db, reservation_id)


@router.post("", response_model=ReservationResponse, status_code=201)
def create_reservation(reservation: ReservationCreate, db: Session = Depends(get_db)):
    """
    Create a new reservation.

    Requirements:
    - Must be within operating hours
    - Cannot be made within 30 minutes of closing
    - Phone number required for party size of 4+
    - Table must be assigned and have sufficient capacity
    """
    return ReservationService.create_reservation(db, reservation)


@router.patch("/{reservation_id}", response_model=ReservationResponse)
def update_reservation(
    reservation_id: int, reservation: ReservationUpdate, db: Session = Depends(get_db)
):
    """
    Update a reservation.

    Party size can be adjusted if the table can still accommodate.
    """
    return ReservationService.update_reservation(db, reservation_id, reservation)


@router.post("/{reservation_id}/cancel", response_model=ReservationResponse)
def cancel_reservation(reservation_id: int, db: Session = Depends(get_db)):
    """Cancel a reservation"""
    return ReservationService.cancel_reservation(db, reservation_id)
