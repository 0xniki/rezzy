from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from rezzy.models import RestaurantConfig, Table, MergeGroup
from rezzy.schemas import (
    RestaurantConfigCreate,
    RestaurantConfigUpdate,
    TableCreate,
    TableUpdate,
    MergeGroupCreate,
    MergeGroupUpdate,
    ChairRearrangement,
)


class RestaurantConfigService:
    @staticmethod
    def get_config(db: Session) -> RestaurantConfig | None:
        return db.query(RestaurantConfig).first()

    @staticmethod
    def create_config(db: Session, config: RestaurantConfigCreate) -> RestaurantConfig:
        existing = db.query(RestaurantConfig).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Restaurant config already exists. Use update instead.",
            )
        db_config = RestaurantConfig(**config.model_dump())
        db.add(db_config)
        db.commit()
        db.refresh(db_config)
        return db_config

    @staticmethod
    def update_config(db: Session, config: RestaurantConfigUpdate) -> RestaurantConfig:
        db_config = db.query(RestaurantConfig).first()
        if not db_config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Restaurant config not found. Create one first.",
            )
        update_data = config.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_config, field, value)
        db.commit()
        db.refresh(db_config)
        return db_config


class TableService:
    @staticmethod
    def get_tables(db: Session, active_only: bool = True) -> list[Table]:
        query = db.query(Table)
        if active_only:
            query = query.filter(Table.is_active == True)
        return query.all()

    @staticmethod
    def get_table(db: Session, table_id: int) -> Table:
        table = db.query(Table).filter(Table.id == table_id).first()
        if not table:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Table {table_id} not found",
            )
        return table

    @staticmethod
    def create_table(db: Session, table: TableCreate) -> Table:
        # Check for duplicate table number
        existing = db.query(Table).filter(Table.table_number == table.table_number).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Table with number '{table.table_number}' already exists",
            )

        db_table = Table(
            **table.model_dump(),
            current_chairs=table.default_chairs,
        )
        db.add(db_table)
        db.commit()
        db.refresh(db_table)
        return db_table

    @staticmethod
    def update_table(db: Session, table_id: int, table: TableUpdate) -> Table:
        db_table = TableService.get_table(db, table_id)

        update_data = table.model_dump(exclude_unset=True)

        # Validate chair constraints if updating
        new_default = update_data.get("default_chairs", db_table.default_chairs)
        new_max = update_data.get("max_chairs", db_table.max_chairs)
        new_current = update_data.get("current_chairs", db_table.current_chairs)

        if new_max < new_default:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="max_chairs cannot be less than default_chairs",
            )
        if new_current > new_max:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="current_chairs cannot exceed max_chairs",
            )

        for field, value in update_data.items():
            setattr(db_table, field, value)
        db.commit()
        db.refresh(db_table)
        return db_table

    @staticmethod
    def delete_table(db: Session, table_id: int) -> None:
        db_table = TableService.get_table(db, table_id)
        db.delete(db_table)
        db.commit()

    @staticmethod
    def rearrange_chairs(
        db: Session, rearrangements: list[ChairRearrangement]
    ) -> list[Table]:
        """
        Rearrange chairs across tables, validating against restaurant's extra chairs pool.
        """
        config = db.query(RestaurantConfig).first()
        if not config:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Restaurant config must be set up first",
            )

        tables_to_update = []
        total_chairs_needed = 0
        total_chairs_released = 0

        for rearrangement in rearrangements:
            table = TableService.get_table(db, rearrangement.table_id)

            if rearrangement.new_chair_count > table.max_chairs:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Table {table.table_number} cannot exceed {table.max_chairs} chairs",
                )

            chair_diff = rearrangement.new_chair_count - table.current_chairs
            if chair_diff > 0:
                total_chairs_needed += chair_diff
            else:
                total_chairs_released += abs(chair_diff)

            tables_to_update.append((table, rearrangement.new_chair_count))

        # Calculate net chair movement
        net_chairs_from_pool = total_chairs_needed - total_chairs_released

        if net_chairs_from_pool > config.total_extra_chairs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Not enough extra chairs. Need {net_chairs_from_pool}, have {config.total_extra_chairs}",
            )

        # Apply changes
        for table, new_count in tables_to_update:
            table.current_chairs = new_count

        config.total_extra_chairs -= net_chairs_from_pool
        db.commit()

        return [t[0] for t in tables_to_update]


class MergeGroupService:
    @staticmethod
    def get_merge_groups(db: Session, active_only: bool = True) -> list[MergeGroup]:
        query = db.query(MergeGroup)
        if active_only:
            query = query.filter(MergeGroup.is_active == True)
        return query.all()

    @staticmethod
    def get_merge_group(db: Session, group_id: int) -> MergeGroup:
        group = db.query(MergeGroup).filter(MergeGroup.id == group_id).first()
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Merge group {group_id} not found",
            )
        return group

    @staticmethod
    def create_merge_group(db: Session, group: MergeGroupCreate) -> MergeGroup:
        # Validate all tables exist and are mergeable
        tables = []
        for table_id in group.table_ids:
            table = db.query(Table).filter(Table.id == table_id).first()
            if not table:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Table {table_id} not found",
                )
            if not table.is_mergeable:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Table {table.table_number} is not mergeable",
                )
            if table.merge_group_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Table {table.table_number} is already in a merge group",
                )
            tables.append(table)

        db_group = MergeGroup(name=group.name)
        db.add(db_group)
        db.flush()

        for table in tables:
            table.merge_group_id = db_group.id

        db.commit()
        db.refresh(db_group)
        return db_group

    @staticmethod
    def update_merge_group(
        db: Session, group_id: int, group: MergeGroupUpdate
    ) -> MergeGroup:
        db_group = MergeGroupService.get_merge_group(db, group_id)
        update_data = group.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_group, field, value)
        db.commit()
        db.refresh(db_group)
        return db_group

    @staticmethod
    def delete_merge_group(db: Session, group_id: int) -> None:
        """Unmerge tables and delete the group"""
        db_group = MergeGroupService.get_merge_group(db, group_id)

        # Remove tables from group
        for table in db_group.tables:
            table.merge_group_id = None

        db.delete(db_group)
        db.commit()

    @staticmethod
    def get_total_capacity(db: Session, group_id: int) -> int:
        """Get total chair capacity of a merge group"""
        group = MergeGroupService.get_merge_group(db, group_id)
        return sum(t.current_chairs for t in group.tables)
