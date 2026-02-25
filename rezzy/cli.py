"""
CLI utilities for Rezzy administration.

Usage:
    uv run python -m rezzy.cli create-user <username> <password>
"""
import sys
from rezzy.core.database import SessionLocal
from rezzy.core.security import hash_password
from rezzy.models.user import User


def create_user(username: str, password: str) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"Error: user '{username}' already exists.")
            sys.exit(1)
        user = User(username=username, hashed_password=hash_password(password))
        db.add(user)
        db.commit()
        print(f"User '{username}' created successfully.")
    finally:
        db.close()


def main():
    args = sys.argv[1:]
    if len(args) == 3 and args[0] == "create-user":
        _, username, password = args
        create_user(username, password)
    else:
        print("Usage: python -m rezzy.cli create-user <username> <password>")
        sys.exit(1)


if __name__ == "__main__":
    main()
