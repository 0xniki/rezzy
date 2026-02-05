import pytest


class TestRestaurantConfig:
    def test_create_config(self, client):
        response = client.post(
            "/config",
            json={"name": "My Restaurant", "total_extra_chairs": 5},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "My Restaurant"
        assert data["total_extra_chairs"] == 5
        assert data["id"] == 1

    def test_create_config_duplicate_fails(self, client, restaurant_config):
        response = client.post(
            "/config",
            json={"name": "Another Restaurant", "total_extra_chairs": 0},
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_get_config(self, client, restaurant_config):
        response = client.get("/config")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Restaurant"

    def test_get_config_not_found(self, client):
        response = client.get("/config")
        assert response.status_code == 200
        assert response.json() is None

    def test_update_config(self, client, restaurant_config):
        response = client.patch(
            "/config",
            json={"name": "Updated Restaurant"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Restaurant"
        assert data["total_extra_chairs"] == 10  # Unchanged

    def test_update_config_extra_chairs(self, client, restaurant_config):
        response = client.patch(
            "/config",
            json={"total_extra_chairs": 20},
        )
        assert response.status_code == 200
        assert response.json()["total_extra_chairs"] == 20

    def test_update_config_not_found(self, client):
        response = client.patch(
            "/config",
            json={"name": "Test"},
        )
        assert response.status_code == 404

    def test_create_config_negative_chairs_fails(self, client):
        response = client.post(
            "/config",
            json={"name": "Test", "total_extra_chairs": -5},
        )
        assert response.status_code == 422
