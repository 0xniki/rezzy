from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from rezzy.core.database import get_db
from rezzy.schemas import (
    TableCreate,
    TableUpdate,
    TableResponse,
    ChairRearrangement,
)
from rezzy.services import TableService

router = APIRouter(prefix="/tables", tags=["Tables"])


@router.get("", response_model=list[TableResponse])
def get_tables(
    active_only: bool = Query(True, description="Filter to active tables only"),
    db: Session = Depends(get_db),
):
    """Get all tables"""
    return TableService.get_tables(db, active_only)


@router.get("/{table_id}", response_model=TableResponse)
def get_table(table_id: int, db: Session = Depends(get_db)):
    """Get a specific table by ID"""
    return TableService.get_table(db, table_id)


@router.post("", response_model=TableResponse, status_code=201)
def create_table(table: TableCreate, db: Session = Depends(get_db)):
    """Create a new table"""
    return TableService.create_table(db, table)


@router.patch("/{table_id}", response_model=TableResponse)
def update_table(table_id: int, table: TableUpdate, db: Session = Depends(get_db)):
    """Update a table"""
    return TableService.update_table(db, table_id, table)


@router.delete("/{table_id}", status_code=204)
def delete_table(table_id: int, db: Session = Depends(get_db)):
    """Delete a table"""
    TableService.delete_table(db, table_id)


@router.post("/rearrange-chairs", response_model=list[TableResponse])
def rearrange_chairs(
    rearrangements: list[ChairRearrangement], db: Session = Depends(get_db)
):
    """Rearrange chairs across multiple tables."""
    return TableService.rearrange_chairs(db, rearrangements)
