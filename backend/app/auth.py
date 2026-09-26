import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .config import JWT_SECRET
from .models import User


JWT_ALGORITHM = "HS256"
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, rounds, salt_b64, digest_b64 = encoded.split("$", 3)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(rounds))
        return hmac.compare_digest(actual, base64.b64decode(digest_b64))
    except (ValueError, TypeError):
        return False


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user.id), "email": user.email, "type": "access", "iat": now, "exp": now + timedelta(hours=12)}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:24]


def create_password_reset_token(user: User, expire_minutes: int) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user.id), "type": "password_reset", "pwd": password_fingerprint(user.password_hash), "iat": now, "exp": now + timedelta(minutes=expire_minutes)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def decode_password_reset_token(token: str) -> tuple[int, str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "password_reset" or not payload.get("pwd"):
            raise ValueError
        return int(payload["sub"]), str(payload["pwd"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired") from exc


def decode_user_id(token: str) -> int:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type", "access") != "access":
            raise ValueError
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = db.get(User, decode_user_id(credentials.credentials))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been suspended")
    return user


def current_admin(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user
