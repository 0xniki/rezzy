from fastapi import FastAPI

from rezzy.api import (
    config_router,
    tables_router,
    merge_router,
    hours_router,
    reservations_router,
)

app = FastAPI(
    title="Rezzy",
    description="Restaurant Reservation System API",
    version="0.1.0",
)

# Include routers
app.include_router(config_router)
app.include_router(tables_router)
app.include_router(merge_router)
app.include_router(hours_router)
app.include_router(reservations_router)


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


def main():
    import uvicorn

    uvicorn.run("rezzy.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
