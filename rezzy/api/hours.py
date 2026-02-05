from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from rezzy.core.database import get_db
from rezzy.schemas import (
    OperatingHoursCreate,
    OperatingHoursUpdate,
    OperatingHoursResponse,
    SpecialHoursCreate,
    SpecialHoursUpdate,
    SpecialHoursResponse,
)
from rezzy.services import OperatingHoursService, SpecialHoursService

router = APIRouter(prefix="/hours", tags=["Operating Hours"])


# Regular Operating Hours
@router.get("/operating", response_model=list[OperatingHoursResponse])
def get_operating_hours(db: Session = Depends(get_db)):
    """Get all regular operating hours"""
    return OperatingHoursService.get_all_hours(db)


@router.get("/operating/{day_of_week}", response_model=OperatingHoursResponse | None)
def get_operating_hours_for_day(day_of_week: int, db: Session = Depends(get_db)):
    """Get operating hours for a specific day (0=Monday, 6=Sunday)"""
    return OperatingHoursService.get_hours_for_day(db, day_of_week)


@router.post("/operating", response_model=OperatingHoursResponse, status_code=201)
def create_operating_hours(hours: OperatingHoursCreate, db: Session = Depends(get_db)):
    """Create operating hours for a day of the week"""
    return OperatingHoursService.create_hours(db, hours)


@router.post(
    "/operating/bulk", response_model=list[OperatingHoursResponse], status_code=201
)
def bulk_create_operating_hours(
    hours_list: list[OperatingHoursCreate], db: Session = Depends(get_db)
):
    """Create operating hours for multiple days at once"""
    return OperatingHoursService.bulk_create_hours(db, hours_list)


@router.patch("/operating/{day_of_week}", response_model=OperatingHoursResponse)
def update_operating_hours(
    day_of_week: int, hours: OperatingHoursUpdate, db: Session = Depends(get_db)
):
    """Update operating hours for a specific day"""
    return OperatingHoursService.update_hours(db, day_of_week, hours)


# Special Hours (holidays, private events, etc.)
@router.get("/special", response_model=list[SpecialHoursResponse])
def get_special_hours(
    start_date: date | None = Query(None, description="Filter from this date"),
    end_date: date | None = Query(None, description="Filter until this date"),
    db: Session = Depends(get_db),
):
    """Get all special hours, optionally filtered by date range"""
    return SpecialHoursService.get_special_hours(db, start_date, end_date)


@router.get("/special/{target_date}", response_model=SpecialHoursResponse | None)
def get_special_hours_for_date(target_date: date, db: Session = Depends(get_db)):
    """Get special hours for a specific date"""
    return SpecialHoursService.get_special_hours_for_date(db, target_date)


@router.post("/special", response_model=SpecialHoursResponse, status_code=201)
def create_special_hours(hours: SpecialHoursCreate, db: Session = Depends(get_db)):
    """Create special hours for a specific date"""
    return SpecialHoursService.create_special_hours(db, hours)


@router.patch("/special/{target_date}", response_model=SpecialHoursResponse)
def update_special_hours(
    target_date: date, hours: SpecialHoursUpdate, db: Session = Depends(get_db)
):
    """Update special hours for a specific date"""
    return SpecialHoursService.update_special_hours(db, target_date, hours)


@router.delete("/special/{target_date}", status_code=204)
def delete_special_hours(target_date: date, db: Session = Depends(get_db)):
    """Delete special hours for a specific date"""
    SpecialHoursService.delete_special_hours(db, target_date)
