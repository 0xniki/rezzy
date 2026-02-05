from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from rezzy.core.database import get_db
from rezzy.schemas import (
    RestaurantConfigCreate,
    RestaurantConfigUpdate,
    RestaurantConfigResponse,
)
from rezzy.services import RestaurantConfigService

router = APIRouter(prefix="/config", tags=["Restaurant Configuration"])


@router.get("", response_model=RestaurantConfigResponse | None)
def get_config(db: Session = Depends(get_db)):
    """Get the restaurant configuration"""
    return RestaurantConfigService.get_config(db)


@router.post("", response_model=RestaurantConfigResponse, status_code=201)
def create_config(config: RestaurantConfigCreate, db: Session = Depends(get_db)):
    """Create the restaurant configuration (one-time setup)"""
    return RestaurantConfigService.create_config(db, config)


@router.patch("", response_model=RestaurantConfigResponse)
def update_config(config: RestaurantConfigUpdate, db: Session = Depends(get_db)):
    """Update the restaurant configuration"""
    return RestaurantConfigService.update_config(db, config)
