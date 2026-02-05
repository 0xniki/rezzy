from datetime import date, time
from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator


# Restaurant Config Schemas
class RestaurantConfigBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    total_extra_chairs: int = Field(default=0, ge=0)


class RestaurantConfigCreate(RestaurantConfigBase):
    pass


class RestaurantConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    total_extra_chairs: Optional[int] = Field(None, ge=0)


class RestaurantConfigResponse(RestaurantConfigBase):
    id: int

    model_config = {"from_attributes": True}


# Table Schemas
class TableBase(BaseModel):
    table_number: str = Field(..., min_length=1, max_length=50)
    x_position: float
    y_position: float
    default_chairs: int = Field(..., gt=0)
    max_chairs: int = Field(..., gt=0)
    is_mergeable: bool = True
    is_active: bool = True

    @model_validator(mode="after")
    def validate_chairs(self):
        if self.max_chairs < self.default_chairs:
            raise ValueError("max_chairs must be >= default_chairs")
        return self


class TableCreate(TableBase):
    pass


class TableUpdate(BaseModel):
    table_number: Optional[str] = Field(None, min_length=1, max_length=50)
    x_position: Optional[float] = None
    y_position: Optional[float] = None
    default_chairs: Optional[int] = Field(None, gt=0)
    max_chairs: Optional[int] = Field(None, gt=0)
    current_chairs: Optional[int] = Field(None, ge=0)
    is_mergeable: Optional[bool] = None
    is_active: Optional[bool] = None


class TableResponse(TableBase):
    id: int
    current_chairs: int
    merge_group_id: Optional[int] = None

    model_config = {"from_attributes": True}


# Merge Group Schemas
class MergeGroupBase(BaseModel):
    name: Optional[str] = Field(None, max_length=100)


class MergeGroupCreate(MergeGroupBase):
    table_ids: list[int] = Field(..., min_length=2)


class MergeGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None


class MergeGroupResponse(MergeGroupBase):
    id: int
    is_active: bool
    tables: list[TableResponse] = []

    model_config = {"from_attributes": True}


# Operating Hours Schemas
class OperatingHoursBase(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    open_time: time
    close_time: time
    is_closed: bool = False

    @model_validator(mode="after")
    def validate_times(self):
        if not self.is_closed and self.open_time >= self.close_time:
            raise ValueError("open_time must be before close_time when not closed")
        return self


class OperatingHoursCreate(OperatingHoursBase):
    pass


class OperatingHoursUpdate(BaseModel):
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: Optional[bool] = None


class OperatingHoursResponse(OperatingHoursBase):
    id: int

    model_config = {"from_attributes": True}


# Special Hours Schemas
class SpecialHoursBase(BaseModel):
    date: date
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: bool = False
    reason: Optional[str] = Field(None, max_length=255)

    @model_validator(mode="after")
    def validate_times(self):
        if not self.is_closed:
            if self.open_time is None or self.close_time is None:
                raise ValueError("open_time and close_time required when not closed")
            if self.open_time >= self.close_time:
                raise ValueError("open_time must be before close_time")
        return self


class SpecialHoursCreate(SpecialHoursBase):
    pass


class SpecialHoursUpdate(BaseModel):
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: Optional[bool] = None
    reason: Optional[str] = Field(None, max_length=255)


class SpecialHoursResponse(SpecialHoursBase):
    id: int

    model_config = {"from_attributes": True}


# Reservation Schemas
class ReservationBase(BaseModel):
    guest_name: str = Field(..., min_length=1, max_length=255)
    party_size: int = Field(..., gt=0)
    phone_number: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None
    reservation_date: date
    reservation_time: time
    duration_minutes: int = Field(default=90, gt=0)

    @model_validator(mode="after")
    def validate_phone_for_large_party(self):
        if self.party_size >= 4 and not self.phone_number:
            raise ValueError("phone_number is required for party size of 4 or more")
        return self


class ReservationCreate(ReservationBase):
    table_id: Optional[int] = None
    merge_group_id: Optional[int] = None

    @model_validator(mode="after")
    def validate_table_assignment(self):
        if self.table_id is None and self.merge_group_id is None:
            raise ValueError("Either table_id or merge_group_id must be provided")
        if self.table_id is not None and self.merge_group_id is not None:
            raise ValueError("Cannot assign both table_id and merge_group_id")
        return self


class ReservationUpdate(BaseModel):
    guest_name: Optional[str] = Field(None, min_length=1, max_length=255)
    party_size: Optional[int] = Field(None, gt=0)
    phone_number: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None
    reservation_date: Optional[date] = None
    reservation_time: Optional[time] = None
    duration_minutes: Optional[int] = Field(None, gt=0)
    table_id: Optional[int] = None
    merge_group_id: Optional[int] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None:
            valid_statuses = ["confirmed", "seated", "completed", "cancelled", "no_show"]
            if v not in valid_statuses:
                raise ValueError(f"status must be one of: {', '.join(valid_statuses)}")
        return v


class ReservationResponse(ReservationBase):
    id: int
    table_id: Optional[int] = None
    merge_group_id: Optional[int] = None
    status: str
    table: Optional[TableResponse] = None

    model_config = {"from_attributes": True}


# Chair Rearrangement Schema
class ChairRearrangement(BaseModel):
    table_id: int
    new_chair_count: int = Field(..., ge=0)
