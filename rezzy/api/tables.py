from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from rezzy.core.database import get_db
from rezzy.schemas import (
    TableCreate,
    TableUpdate,
    TableResponse,
    MergeGroupCreate,
    MergeGroupUpdate,
    MergeGroupResponse,
    ChairRearrangement,
)
from rezzy.services import TableService, MergeGroupService

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
    """
    Rearrange chairs across multiple tables.
    Validates against restaurant's extra chair pool.
    """
    return TableService.rearrange_chairs(db, rearrangements)


# Merge Group endpoints
merge_router = APIRouter(prefix="/merge-groups", tags=["Merge Groups"])


@merge_router.get("", response_model=list[MergeGroupResponse])
def get_merge_groups(
    active_only: bool = Query(True, description="Filter to active groups only"),
    db: Session = Depends(get_db),
):
    """Get all merge groups"""
    return MergeGroupService.get_merge_groups(db, active_only)


@merge_router.get("/{group_id}", response_model=MergeGroupResponse)
def get_merge_group(group_id: int, db: Session = Depends(get_db)):
    """Get a specific merge group"""
    return MergeGroupService.get_merge_group(db, group_id)


@merge_router.post("", response_model=MergeGroupResponse, status_code=201)
def create_merge_group(group: MergeGroupCreate, db: Session = Depends(get_db)):
    """Create a new merge group from existing tables"""
    return MergeGroupService.create_merge_group(db, group)


@merge_router.patch("/{group_id}", response_model=MergeGroupResponse)
def update_merge_group(
    group_id: int, group: MergeGroupUpdate, db: Session = Depends(get_db)
):
    """Update a merge group"""
    return MergeGroupService.update_merge_group(db, group_id, group)


@merge_router.delete("/{group_id}", status_code=204)
def delete_merge_group(group_id: int, db: Session = Depends(get_db)):
    """Unmerge tables and delete the group"""
    MergeGroupService.delete_merge_group(db, group_id)
