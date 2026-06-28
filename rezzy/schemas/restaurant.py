import re
from datetime import date, time, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator


PHONE_PATTERN = re.compile(r"^(\d{10}|\d{3}-\d{3}-\d{4})$")


def validate_phone_number(value: str | None) -> str | None:
    if value is None:
        return None

    phone = value.strip()
    if not phone:
        return None
    if not PHONE_PATTERN.fullmatch(phone):
        raise ValueError("phone_number must be 10 digits or in 123-456-7890 format")
    return phone


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8, max_length=200)


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime | None = None
    approved_at: datetime | None = None

    model_config = {"from_attributes": True}


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
    x_position: float = 0
    y_position: float = 0
    default_chairs: int = Field(..., gt=0)
    max_chairs: int = Field(..., gt=0)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_chairs(self):
        if self.max_chairs < self.default_chairs:
            raise ValueError("max_chairs must be >= default_chairs")
        return self


class TableCreate(TableBase):
    model_config = {"extra": "forbid"}


class TableUpdate(BaseModel):
    table_number: Optional[str] = Field(None, min_length=1, max_length=50)
    x_position: Optional[float] = None
    y_position: Optional[float] = None
    default_chairs: Optional[int] = Field(None, gt=0)
    max_chairs: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = None

    model_config = {"extra": "forbid"}


class TableResponse(TableBase):
    id: int
    current_chairs: int

    model_config = {"from_attributes": True}


# Operating Hours Schemas
class OperatingHoursBase(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: bool = False

    @model_validator(mode="after")
    def validate_times(self):
        if not self.is_closed:
            if self.open_time is None or self.close_time is None:
                raise ValueError("open_time and close_time are required when not closed")
            if self.open_time >= self.close_time:
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

    @field_validator("phone_number", mode="before")
    @classmethod
    def validate_phone_format(cls, v):
        return validate_phone_number(v)

    @model_validator(mode="after")
    def validate_phone_for_large_party(self):
        if self.party_size >= 4 and not self.phone_number:
            raise ValueError("phone_number is required for party size of 4 or more")
        return self


class ReservationCreate(ReservationBase):
    table_ids: list[int] = Field(..., min_length=1)


class ReservationUpdate(BaseModel):
    guest_name: Optional[str] = Field(None, min_length=1, max_length=255)
    party_size: Optional[int] = Field(None, gt=0)
    phone_number: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None
    reservation_date: Optional[date] = None
    reservation_time: Optional[time] = None
    duration_minutes: Optional[int] = Field(None, gt=0)
    table_ids: Optional[list[int]] = Field(None, min_length=1)
    status: Optional[str] = None

    @field_validator("phone_number", mode="before")
    @classmethod
    def validate_phone_format(cls, v):
        return validate_phone_number(v)

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
    table_ids: list[int] = []
    tables: list[TableResponse] = []
    status: str
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_table_ids(self):
        if self.tables and not self.table_ids:
            self.table_ids = [t.id for t in self.tables]
        return self


# Chair Rearrangement Schema
class ChairRearrangement(BaseModel):
    table_id: int
    new_chair_count: int = Field(..., ge=0)
