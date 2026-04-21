import os
import hmac
import hashlib
from werkzeug.security import generate_password_hash, check_password_hash
from .models import User
from .db import SessionLocal

# Token signing secret
_SECRET = os.getenv('SECRET_KEY', 'dev-secret').encode()


def make_token(username: str) -> str:
    sig = hmac.new(_SECRET, username.encode(), hashlib.sha256).hexdigest()
    return f"{username}:{sig}"


def verify_token(token: str) -> str | None:
    try:
        username, sig = token.rsplit(':', 1)
    except Exception:
        return None
    expected = hmac.new(_SECRET, username.encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, sig):
        return username
    return None


def register_user(username: str, password: str):
    db = SessionLocal()
    try:
        if db.query(User).filter_by(username=username).first():
            return False, "User exists"
        # If no users exist, make the first one admin
        is_first = db.query(User).count() == 0
        user = User(username=username, password_hash=generate_password_hash(password), is_admin=is_first)
        db.add(user)
        db.commit()
        return True, "OK"
    finally:
        db.close()


def authenticate_user(username: str, password: str) -> bool:
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            return True
        return False
    finally:
        db.close()


def get_user_by_username(username: str):
    db = SessionLocal()
    try:
        return db.query(User).filter_by(username=username).first()
    finally:
        db.close()


def get_user_by_id(user_id: int):
    db = SessionLocal()
    try:
        return db.get(User, user_id)
    finally:
        db.close()


def set_admin(user_id: int, value: bool):
    db = SessionLocal()
    try:
        #if value:
          #  db.query(User).update({User.is_admin: False})
        u = db.get(User, user_id)
        if not u:
            return False
        u.is_admin = bool(value)
        db.commit()
        return True
    finally:
        db.close()


def delete_user(user_id: int):
    db = SessionLocal()
    try:
        u = db.get(User, user_id)
        if not u:
            return False
        db.delete(u)
        db.commit()
        return True
    finally:
        db.close()


def get_all_users():
    db = SessionLocal()
    try:
        return db.query(User).order_by(User.id).all()
    finally:
        db.close()


def update_user(user_id: int, username: str = None, password: str = None):
    db = SessionLocal()
    try:
        u = db.get(User, user_id)
        if not u:
            return False
        if username:
            u.username = username
        if password:
            u.password_hash = generate_password_hash(password)
        db.commit()
        return True
    finally:
        db.close()
