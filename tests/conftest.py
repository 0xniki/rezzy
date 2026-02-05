import pytest
from datetime import date, time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from rezzy.core.database import Base, get_db
from rezzy.main import app


# Use SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Create a fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """Create a test client with database dependency override."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def restaurant_config(client):
    """Create a basic restaurant config."""
    response = client.post(
        "/config",
        json={"name": "Test Restaurant", "total_extra_chairs": 10},
    )
    return response.json()


@pytest.fixture
def sample_table(client, restaurant_config):
    """Create a sample table."""
    response = client.post(
        "/tables",
        json={
            "table_number": "T1",
            "x_position": 10.0,
            "y_position": 20.0,
            "default_chairs": 4,
            "max_chairs": 6,
        },
    )
    return response.json()


@pytest.fixture
def sample_tables(client, restaurant_config):
    """Create multiple sample tables."""
    tables = []
    for i in range(1, 4):
        response = client.post(
            "/tables",
            json={
                "table_number": f"T{i}",
                "x_position": 10.0 * i,
                "y_position": 20.0,
                "default_chairs": 4,
                "max_chairs": 6,
                "is_mergeable": True,
            },
        )
        tables.append(response.json())
    return tables


@pytest.fixture
def operating_hours(client):
    """Set up operating hours for all days."""
    hours = []
    for day in range(7):
        response = client.post(
            "/hours/operating",
            json={
                "day_of_week": day,
                "open_time": "11:00:00",
                "close_time": "22:00:00",
                "is_closed": False,
            },
        )
        hours.append(response.json())
    return hours


@pytest.fixture
def full_setup(client, restaurant_config, sample_table, operating_hours):
    """Complete setup with config, table, and hours."""
    return {
        "config": restaurant_config,
        "table": sample_table,
        "hours": operating_hours,
    }
