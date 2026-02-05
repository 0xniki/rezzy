import pytest
from datetime import date


class TestOperatingHours:
    def test_create_operating_hours(self, client):
        response = client.post(
            "/hours/operating",
            json={
                "day_of_week": 0,  # Monday
                "open_time": "09:00:00",
                "close_time": "21:00:00",
                "is_closed": False,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["day_of_week"] == 0
        assert data["open_time"] == "09:00:00"
        assert data["close_time"] == "21:00:00"
        assert data["is_closed"] is False

    def test_create_operating_hours_closed_day(self, client):
        response = client.post(
            "/hours/operating",
            json={
                "day_of_week": 6,  # Sunday
                "open_time": "00:00:00",
                "close_time": "00:00:00",
                "is_closed": True,
            },
        )
        assert response.status_code == 201
        assert response.json()["is_closed"] is True

    def test_create_operating_hours_duplicate_fails(self, client, operating_hours):
        response = client.post(
            "/hours/operating",
            json={
                "day_of_week": 0,  # Already exists
                "open_time": "10:00:00",
                "close_time": "20:00:00",
            },
        )
        assert response.status_code == 400
        assert "already exist" in response.json()["detail"]

    def test_create_operating_hours_invalid_day_fails(self, client):
        response = client.post(
            "/hours/operating",
            json={
                "day_of_week": 7,  # Invalid
                "open_time": "09:00:00",
                "close_time": "21:00:00",
            },
        )
        assert response.status_code == 422

    def test_create_operating_hours_open_after_close_fails(self, client):
        response = client.post(
            "/hours/operating",
            json={
                "day_of_week": 0,
                "open_time": "21:00:00",
                "close_time": "09:00:00",  # Before open
            },
        )
        assert response.status_code == 422

    def test_get_all_operating_hours(self, client, operating_hours):
        response = client.get("/hours/operating")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 7  # All days

    def test_get_operating_hours_for_day(self, client, operating_hours):
        response = client.get("/hours/operating/0")  # Monday
        assert response.status_code == 200
        data = response.json()
        assert data["day_of_week"] == 0
        assert data["open_time"] == "11:00:00"

    def test_get_operating_hours_not_found(self, client):
        response = client.get("/hours/operating/0")
        assert response.status_code == 200
        assert response.json() is None

    def test_update_operating_hours(self, client, operating_hours):
        response = client.patch(
            "/hours/operating/0",
            json={"open_time": "08:00:00"},
        )
        assert response.status_code == 200
        assert response.json()["open_time"] == "08:00:00"
        assert response.json()["close_time"] == "22:00:00"  # Unchanged

    def test_bulk_create_operating_hours(self, client):
        hours_data = [
            {"day_of_week": i, "open_time": "10:00:00", "close_time": "20:00:00"}
            for i in range(5)  # Monday-Friday
        ]
        response = client.post("/hours/operating/bulk", json=hours_data)
        assert response.status_code == 201
        assert len(response.json()) == 5


class TestSpecialHours:
    def test_create_special_hours(self, client):
        response = client.post(
            "/hours/special",
            json={
                "date": "2026-12-25",
                "is_closed": True,
                "reason": "Christmas Day",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["date"] == "2026-12-25"
        assert data["is_closed"] is True
        assert data["reason"] == "Christmas Day"

    def test_create_special_hours_modified_hours(self, client):
        response = client.post(
            "/hours/special",
            json={
                "date": "2026-12-24",
                "open_time": "11:00:00",
                "close_time": "18:00:00",
                "reason": "Christmas Eve - Early Close",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["close_time"] == "18:00:00"
        assert data["is_closed"] is False

    def test_create_special_hours_duplicate_fails(self, client):
        client.post(
            "/hours/special",
            json={"date": "2026-07-04", "is_closed": True, "reason": "July 4th"},
        )
        response = client.post(
            "/hours/special",
            json={"date": "2026-07-04", "is_closed": False, "open_time": "12:00:00", "close_time": "20:00:00"},
        )
        assert response.status_code == 400
        assert "already exist" in response.json()["detail"]

    def test_create_special_hours_missing_times_fails(self, client):
        response = client.post(
            "/hours/special",
            json={
                "date": "2026-03-15",
                "is_closed": False,
                # Missing open_time and close_time
            },
        )
        assert response.status_code == 422

    def test_get_special_hours(self, client):
        # Create some special hours
        client.post("/hours/special", json={"date": "2026-12-25", "is_closed": True})
        client.post("/hours/special", json={"date": "2026-12-31", "open_time": "11:00:00", "close_time": "02:00:00"})

        response = client.get("/hours/special")
        assert response.status_code == 200
        # Note: second entry will fail validation (close before open)

    def test_get_special_hours_date_range(self, client):
        client.post("/hours/special", json={"date": "2026-12-25", "is_closed": True})
        client.post("/hours/special", json={"date": "2026-01-01", "is_closed": True})

        response = client.get("/hours/special?start_date=2026-12-01&end_date=2026-12-31")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["date"] == "2026-12-25"

    def test_get_special_hours_for_date(self, client):
        client.post(
            "/hours/special",
            json={"date": "2026-11-26", "is_closed": True, "reason": "Thanksgiving"},
        )

        response = client.get("/hours/special/2026-11-26")
        assert response.status_code == 200
        assert response.json()["reason"] == "Thanksgiving"

    def test_update_special_hours(self, client):
        client.post(
            "/hours/special",
            json={"date": "2026-02-14", "open_time": "17:00:00", "close_time": "23:00:00"},
        )

        response = client.patch(
            "/hours/special/2026-02-14",
            json={"reason": "Valentine's Day - Dinner Only"},
        )
        assert response.status_code == 200
        assert response.json()["reason"] == "Valentine's Day - Dinner Only"

    def test_delete_special_hours(self, client):
        client.post("/hours/special", json={"date": "2026-05-01", "is_closed": True})

        response = client.delete("/hours/special/2026-05-01")
        assert response.status_code == 204

        # Verify deleted
        response = client.get("/hours/special/2026-05-01")
        assert response.json() is None
