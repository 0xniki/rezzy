from rezzy.api.config import router as config_router
from rezzy.api.tables import router as tables_router, merge_router
from rezzy.api.hours import router as hours_router
from rezzy.api.reservations import router as reservations_router

__all__ = [
    "config_router",
    "tables_router",
    "merge_router",
    "hours_router",
    "reservations_router",
]
