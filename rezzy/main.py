from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from rezzy.api import (
    auth_router,
    config_router,
    tables_router,
    hours_router,
    reservations_router,
)
from rezzy.core.security import get_current_user

app = FastAPI(
    title="Rezzy",
    description="Restaurant Reservation System API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth router is public (login endpoint lives here)
app.include_router(auth_router)

# All other routers require a valid JWT
_auth = [Depends(get_current_user)]
app.include_router(config_router, dependencies=_auth)
app.include_router(tables_router, dependencies=_auth)
app.include_router(hours_router, dependencies=_auth)
app.include_router(reservations_router, dependencies=_auth)


@app.get("/health")
def health_check():
    return {"status": "healthy"}


def main():
    import uvicorn
    uvicorn.run("rezzy.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
