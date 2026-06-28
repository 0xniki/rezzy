from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from rezzy.core.database import get_db
from rezzy.schemas import DailyEventsContext
from rezzy.services.events_service import get_daily_events_context


router = APIRouter(prefix="/events", tags=["Events and Weather"])


@router.get("/daily-context", response_model=DailyEventsContext)
def get_daily_context(
    target_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    return get_daily_events_context(db, target_date)
