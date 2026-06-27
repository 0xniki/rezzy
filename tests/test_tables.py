import pytest


class TestTables:
    def test_create_table(self, client, restaurant_config):
        response = client.post(
            "/tables",
            json={
                "table_number": "A1",
                "x_position": 100.0,
                "y_position": 200.0,
                "default_chairs": 4,
                "max_chairs": 8,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["table_number"] == "A1"
        assert data["x_position"] == 100.0
        assert data["y_position"] == 200.0
        assert data["default_chairs"] == 4
        assert data["max_chairs"] == 8
        assert data["current_chairs"] == 4  # Defaults to default_chairs
        assert data["is_active"] is True

    def test_create_table_duplicate_number_fails(self, client, sample_table):
        response = client.post(
            "/tables",
            json={
                "table_number": "T1",  # Same as sample_table
                "x_position": 50.0,
                "y_position": 50.0,
                "default_chairs": 2,
                "max_chairs": 4,
            },
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_table_max_less_than_default_fails(self, client, restaurant_config):
        response = client.post(
            "/tables",
            json={
                "table_number": "B1",
                "x_position": 0,
                "y_position": 0,
                "default_chairs": 6,
                "max_chairs": 4,  # Less than default
            },
        )
        assert response.status_code == 422

    def test_get_tables(self, client, sample_tables):
        response = client.get("/tables")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    def test_get_tables_active_only(self, client, sample_table):
        # Deactivate the table
        client.patch(f"/tables/{sample_table['id']}", json={"is_active": False})

        # Active only (default)
        response = client.get("/tables")
        assert response.status_code == 200
        assert len(response.json()) == 0

        # Include inactive
        response = client.get("/tables?active_only=false")
        assert response.status_code == 200
        assert len(response.json()) == 1

    def test_get_table(self, client, sample_table):
        response = client.get(f"/tables/{sample_table['id']}")
        assert response.status_code == 200
        assert response.json()["table_number"] == "T1"

    def test_get_table_not_found(self, client, restaurant_config):
        response = client.get("/tables/999")
        assert response.status_code == 404

    def test_update_table(self, client, sample_table):
        response = client.patch(
            f"/tables/{sample_table['id']}",
            json={"x_position": 50.0, "y_position": 100.0},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["x_position"] == 50.0
        assert data["y_position"] == 100.0

    def test_update_table_current_chairs_rejected(self, client, sample_table):
        response = client.patch(
            f"/tables/{sample_table['id']}",
            json={"current_chairs": 6},
        )
        assert response.status_code == 422

    def test_update_table_duplicate_number_fails(self, client, sample_tables):
        response = client.patch(
            f"/tables/{sample_tables[1]['id']}",
            json={"table_number": sample_tables[0]["table_number"]},
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_update_table_max_below_current_fails(self, client, sample_table):
        client.post(
            "/tables/rearrange-chairs",
            json=[{"table_id": sample_table["id"], "new_chair_count": 6}],
        )

        response = client.patch(
            f"/tables/{sample_table['id']}",
            json={"max_chairs": 5},
        )
        assert response.status_code == 400
        assert "cannot exceed" in response.json()["detail"]

    def test_delete_table(self, client, sample_table):
        response = client.delete(f"/tables/{sample_table['id']}")
        assert response.status_code == 204

        # Verify deleted
        response = client.get(f"/tables/{sample_table['id']}")
        assert response.status_code == 404


class TestChairRearrangement:
    def test_rearrange_chairs(self, client, sample_tables):
        # Move chairs: T1 gets 6 (needs 2 extra), T2 gets 2 (releases 2)
        response = client.post(
            "/tables/rearrange-chairs",
            json=[
                {"table_id": sample_tables[0]["id"], "new_chair_count": 6},
                {"table_id": sample_tables[1]["id"], "new_chair_count": 2},
            ],
        )
        assert response.status_code == 200
        data = response.json()
        assert data[0]["current_chairs"] == 6
        assert data[1]["current_chairs"] == 2

    def test_rearrange_chairs_from_pool(self, client, sample_table):
        # Add chairs from extra pool (restaurant has 10 extra)
        response = client.post(
            "/tables/rearrange-chairs",
            json=[{"table_id": sample_table["id"], "new_chair_count": 6}],
        )
        assert response.status_code == 200
        assert response.json()[0]["current_chairs"] == 6

        # Verify pool was reduced
        config = client.get("/config").json()
        assert config["total_extra_chairs"] == 8  # 10 - 2

    def test_rearrange_chairs_exceeds_max_fails(self, client, sample_table):
        response = client.post(
            "/tables/rearrange-chairs",
            json=[{"table_id": sample_table["id"], "new_chair_count": 10}],  # Max is 6
        )
        assert response.status_code == 400
        assert "cannot exceed" in response.json()["detail"]

    def test_rearrange_chairs_insufficient_pool_fails(self, client, sample_tables):
        # Try to add more chairs than available in pool
        # Each table has 4 chairs, max 6. Pool has 10.
        # Trying to add 2 chairs to each of 3 tables = 6 extra needed
        # Then try to add even more
        response = client.post(
            "/tables/rearrange-chairs",
            json=[
                {"table_id": sample_tables[0]["id"], "new_chair_count": 6},
                {"table_id": sample_tables[1]["id"], "new_chair_count": 6},
                {"table_id": sample_tables[2]["id"], "new_chair_count": 6},
            ],
        )
        assert response.status_code == 200  # This uses 6 chairs, pool has 10

        # Now pool has 4 left, try to use 6 more
        # First create a new table
        new_table = client.post(
            "/tables",
            json={
                "table_number": "T4",
                "x_position": 40.0,
                "y_position": 20.0,
                "default_chairs": 2,
                "max_chairs": 10,
            },
        ).json()

        response = client.post(
            "/tables/rearrange-chairs",
            json=[{"table_id": new_table["id"], "new_chair_count": 10}],  # Needs 8, pool has 4
        )
        assert response.status_code == 400
        assert "Not enough extra chairs" in response.json()["detail"]
