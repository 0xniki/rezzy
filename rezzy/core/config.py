from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost:5432/rezzy"

    # Reservation settings
    reservation_cutoff_minutes: int = 30  # Can't book within 30 min of closing
    default_reservation_duration_minutes: int = 90

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
