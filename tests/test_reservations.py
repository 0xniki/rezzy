import pytest
from datetime import date, timedelta


def get_next_weekday(start_date: date, weekday: int) -> date:
    """Get the next occurrence of a weekday (0=Monday, 6=Sunday)."""
    days_ahead = weekday - start_date.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return start_date + timedelta(days=days_ahead)


class TestReservations:
    def test_create_reservation(self, client, full_setup):
        # Get a valid date (next Monday)
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "John Doe",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["guest_name"] == "John Doe"
        assert data["party_size"] == 2
        assert data["status"] == "confirmed"
        assert data["duration_minutes"] == 90  # Default 1.5 hours

    def test_create_reservation_with_phone(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "Jane Smith",
                "party_size": 4,
                "phone_number": "555-1234",
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "19:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 201
        assert response.json()["phone_number"] == "555-1234"

    def test_create_reservation_large_party_no_phone_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "Big Group",
                "party_size": 4,  # Requires phone
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 422
        assert "phone" in response.text.lower()

    def test_create_reservation_with_notes(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "Special Guest",
                "party_size": 2,
                "notes": "Birthday celebration, please prepare cake",
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "19:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 201
        assert "Birthday" in response.json()["notes"]

    def test_create_reservation_no_table_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "No Table",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                # No table_id or merge_group_id
            },
        )
        assert response.status_code == 422

    def test_create_reservation_party_exceeds_capacity_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "Too Big",
                "party_size": 10,  # Table only has 4 chairs
                "phone_number": "555-0000",
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 400
        assert "capacity" in response.json()["detail"].lower()

    def test_create_reservation_before_open_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "Early Bird",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "09:00:00",  # Opens at 11:00
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 400
        assert "before opening" in response.json()["detail"].lower()

    def test_create_reservation_too_close_to_close_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.post(
            "/reservations",
            json={
                "guest_name": "Late Arrival",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "21:45:00",  # Closes at 22:00, cutoff is 30 min before
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 400
        assert "30 minutes" in response.json()["detail"]

    def test_create_reservation_on_closed_day_fails(self, client, full_setup):
        # Create a special closed day
        reservation_date = get_next_weekday(date.today(), 0)
        client.post(
            "/hours/special",
            json={
                "date": reservation_date.isoformat(),
                "is_closed": True,
                "reason": "Closed for maintenance",
            },
        )

        response = client.post(
            "/reservations",
            json={
                "guest_name": "Unlucky Guest",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 400
        assert "closed" in response.json()["detail"].lower()

    def test_create_reservation_conflict_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        # First reservation
        client.post(
            "/reservations",
            json={
                "guest_name": "First Guest",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )

        # Overlapping reservation
        response = client.post(
            "/reservations",
            json={
                "guest_name": "Second Guest",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:30:00",  # Overlaps with first
                "table_id": full_setup["table"]["id"],
            },
        )
        assert response.status_code == 400
        assert "conflict" in response.json()["detail"].lower()

    def test_get_reservations(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        # Create a few reservations
        for i, time_slot in enumerate(["12:00:00", "14:00:00", "18:00:00"]):
            client.post(
                "/reservations",
                json={
                    "guest_name": f"Guest {i+1}",
                    "party_size": 2,
                    "reservation_date": reservation_date.isoformat(),
                    "reservation_time": time_slot,
                    "table_id": full_setup["table"]["id"],
                },
            )

        response = client.get("/reservations")
        assert response.status_code == 200
        assert len(response.json()) == 3

    def test_get_reservations_by_date(self, client, full_setup):
        date1 = get_next_weekday(date.today(), 0)
        date2 = get_next_weekday(date.today(), 1)  # Next Tuesday

        client.post(
            "/reservations",
            json={
                "guest_name": "Monday Guest",
                "party_size": 2,
                "reservation_date": date1.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )
        client.post(
            "/reservations",
            json={
                "guest_name": "Tuesday Guest",
                "party_size": 2,
                "reservation_date": date2.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )

        response = client.get(f"/reservations?start_date={date1}&end_date={date1}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["guest_name"] == "Monday Guest"

    def test_get_reservation(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        created = client.post(
            "/reservations",
            json={
                "guest_name": "Test Guest",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        ).json()

        response = client.get(f"/reservations/{created['id']}")
        assert response.status_code == 200
        assert response.json()["guest_name"] == "Test Guest"

    def test_update_reservation_party_size(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        created = client.post(
            "/reservations",
            json={
                "guest_name": "Growing Party",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        ).json()

        response = client.patch(
            f"/reservations/{created['id']}",
            json={"party_size": 3},
        )
        assert response.status_code == 200
        assert response.json()["party_size"] == 3

    def test_update_reservation_party_size_exceeds_capacity_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        created = client.post(
            "/reservations",
            json={
                "guest_name": "Growing Party",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        ).json()

        response = client.patch(
            f"/reservations/{created['id']}",
            json={"party_size": 10, "phone_number": "555-0000"},  # Exceeds table capacity
        )
        assert response.status_code == 400
        assert "capacity" in response.json()["detail"].lower()

    def test_update_reservation_requires_phone_for_large_party(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        created = client.post(
            "/reservations",
            json={
                "guest_name": "Small Party",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        ).json()

        # Try to increase to 4 without phone
        response = client.patch(
            f"/reservations/{created['id']}",
            json={"party_size": 4},
        )
        assert response.status_code == 400
        assert "phone" in response.json()["detail"].lower()

        # Should work with phone
        response = client.patch(
            f"/reservations/{created['id']}",
            json={"party_size": 4, "phone_number": "555-9999"},
        )
        assert response.status_code == 200

    def test_update_reservation_status(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        created = client.post(
            "/reservations",
            json={
                "guest_name": "Status Test",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        ).json()

        response = client.patch(
            f"/reservations/{created['id']}",
            json={"status": "seated"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "seated"

    def test_cancel_reservation(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        created = client.post(
            "/reservations",
            json={
                "guest_name": "Cancel Me",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        ).json()

        response = client.post(f"/reservations/{created['id']}/cancel")
        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"

    def test_cancel_already_cancelled_fails(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        created = client.post(
            "/reservations",
            json={
                "guest_name": "Double Cancel",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        ).json()

        client.post(f"/reservations/{created['id']}/cancel")
        response = client.post(f"/reservations/{created['id']}/cancel")
        assert response.status_code == 400


class TestAvailableTables:
    def test_get_available_tables(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        response = client.get(
            "/reservations/available",
            params={
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "party_size": 2,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["type"] == "table"
        assert data[0]["table_number"] == "T1"

    def test_get_available_tables_excludes_booked(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        # Book the table
        client.post(
            "/reservations",
            json={
                "guest_name": "Booked",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "table_id": full_setup["table"]["id"],
            },
        )

        response = client.get(
            "/reservations/available",
            params={
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "party_size": 2,
            },
        )
        assert response.status_code == 200
        assert len(response.json()) == 0

    def test_get_available_tables_party_size_filter(self, client, full_setup):
        reservation_date = get_next_weekday(date.today(), 0)

        # Table has 4 chairs, party of 6 won't fit
        response = client.get(
            "/reservations/available",
            params={
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "party_size": 6,
            },
        )
        assert response.status_code == 200
        assert len(response.json()) == 0


class TestMergeGroupReservations:
    def test_create_reservation_on_merge_group(self, client, restaurant_config, operating_hours):
        # Create tables and merge them
        table1 = client.post(
            "/tables",
            json={
                "table_number": "M1",
                "x_position": 10.0,
                "y_position": 10.0,
                "default_chairs": 4,
                "max_chairs": 6,
            },
        ).json()
        table2 = client.post(
            "/tables",
            json={
                "table_number": "M2",
                "x_position": 20.0,
                "y_position": 10.0,
                "default_chairs": 4,
                "max_chairs": 6,
            },
        ).json()

        merge_group = client.post(
            "/merge-groups",
            json={"name": "Large Section", "table_ids": [table1["id"], table2["id"]]},
        ).json()

        reservation_date = get_next_weekday(date.today(), 0)

        # Book for party of 6 (needs merged tables)
        response = client.post(
            "/reservations",
            json={
                "guest_name": "Large Party",
                "party_size": 6,
                "phone_number": "555-LARGE",
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "merge_group_id": merge_group["id"],
            },
        )
        assert response.status_code == 201
        assert response.json()["merge_group_id"] == merge_group["id"]

    def test_merge_group_blocks_individual_tables(self, client, restaurant_config, operating_hours):
        # Create and merge tables
        table1 = client.post(
            "/tables",
            json={
                "table_number": "B1",
                "x_position": 10.0,
                "y_position": 10.0,
                "default_chairs": 4,
                "max_chairs": 6,
            },
        ).json()
        table2 = client.post(
            "/tables",
            json={
                "table_number": "B2",
                "x_position": 20.0,
                "y_position": 10.0,
                "default_chairs": 4,
                "max_chairs": 6,
            },
        ).json()

        merge_group = client.post(
            "/merge-groups",
            json={"table_ids": [table1["id"], table2["id"]]},
        ).json()

        reservation_date = get_next_weekday(date.today(), 0)

        # Book the merge group
        client.post(
            "/reservations",
            json={
                "guest_name": "Group Booking",
                "party_size": 6,
                "phone_number": "555-0000",
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:00:00",
                "merge_group_id": merge_group["id"],
            },
        )

        # Try to book individual table in the group - should fail
        response = client.post(
            "/reservations",
            json={
                "guest_name": "Individual Booking",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "reservation_time": "18:30:00",
                "table_id": table1["id"],
            },
        )
        assert response.status_code == 400
        assert "conflict" in response.json()["detail"].lower()
