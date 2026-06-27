from datetime import datetime, timezone

from rezzy.core.security import hash_password
from rezzy.models.user import User


class TestAccounts:
    def test_signup_creates_pending_user(self, client):
        response = client.post(
            "/auth/signup",
            json={"username": "server", "password": "password123"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "server"
        assert data["role"] == "user"
        assert data["is_active"] is False

    def test_login_pending_user_fails(self, client):
        client.post(
            "/auth/signup",
            json={"username": "pending", "password": "password123"},
        )

        response = client.post(
            "/auth/login",
            data={"username": "pending", "password": "password123"},
        )
        assert response.status_code == 403
        assert "approval" in response.json()["detail"].lower()

    def test_admin_can_approve_user(self, client):
        user = client.post(
            "/auth/signup",
            json={"username": "host", "password": "password123"},
        ).json()

        response = client.post(f"/auth/users/{user['id']}/approve")

        assert response.status_code == 200
        approved = response.json()["user"]
        assert approved["is_active"] is True
        assert approved["approved_at"] is not None

    def test_approved_user_can_login(self, client):
        user = client.post(
            "/auth/signup",
            json={"username": "runner", "password": "password123"},
        ).json()
        client.post(f"/auth/users/{user['id']}/approve")

        response = client.post(
            "/auth/login",
            data={"username": "runner", "password": "password123"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["access_token"]
        assert data["user"]["role"] == "user"

    def test_admin_login_returns_admin_role(self, db, client):
        admin = User(
            username="owner",
            hashed_password=hash_password("password123"),
            role="admin",
            is_active=True,
            approved_at=datetime.now(timezone.utc),
        )
        db.add(admin)
        db.commit()

        response = client.post(
            "/auth/login",
            data={"username": "owner", "password": "password123"},
        )

        assert response.status_code == 200
        assert response.json()["user"]["role"] == "admin"
