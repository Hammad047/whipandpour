"""
auth.py — Session cookie management and user authentication helpers.
Uses a simple server-side session store backed by an in-memory dict.
Cookie name matches the original: app_session_id
"""

import hashlib
import hmac
import secrets
import json
from datetime import datetime
from typing import Optional
from fastapi import Request, Response
from sqlalchemy.orm import Session
from database import User, SessionLocal

COOKIE_NAME = "app_session_id"
UNAUTHED_ERR_MSG = "Please login (10001)"
NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)"

# In-memory session store: { session_id -> user_id }
# NOTE: this is process-local. Restarting the server logs everyone out.
_sessions: dict[str, int] = {}


# ─── Password hashing ───────────────────────────────────────────────────────
# PBKDF2-HMAC-SHA256 from the standard library — no extra dependency needed.
# Format: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>

_PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    """Hash a plaintext password for storage."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: Optional[str]) -> bool:
    """Constant-time check of a plaintext password against a stored hash."""
    if not stored:
        return False
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(expected, actual)


def create_session(user_id: int) -> str:
    """Create a new session and return the session ID."""
    session_id = secrets.token_urlsafe(32)
    _sessions[session_id] = user_id
    return session_id


def destroy_session(session_id: str) -> None:
    """Remove a session."""
    _sessions.pop(session_id, None)


def get_user_id_from_request(request: Request) -> Optional[int]:
    """Extract user_id from session cookie, or None if not authenticated."""
    session_id = request.cookies.get(COOKIE_NAME)
    if not session_id:
        return None
    return _sessions.get(session_id)


def get_current_user(request: Request, db: Session) -> Optional[User]:
    """Return the User ORM object for the current session, or None."""
    user_id = get_user_id_from_request(request)
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id).first()


def require_user(request: Request, db: Session) -> User:
    """Return the current User or raise a tRPC-style UNAUTHORIZED error."""
    user = get_current_user(request, db)
    if user is None:
        raise TRPCError(code="UNAUTHORIZED", message=UNAUTHED_ERR_MSG)
    return user


def require_admin(request: Request, db: Session) -> User:
    """Return the current User if admin, otherwise raise FORBIDDEN."""
    user = require_user(request, db)
    if user.role != "admin":
        raise TRPCError(code="FORBIDDEN", message=NOT_ADMIN_ERR_MSG)
    return user


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=False,   # Set True in production with HTTPS
        max_age=60 * 60 * 24 * 30,  # 30 days
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME)


# ─── tRPC-style error ───────────────────────────────────────────────────────

class TRPCError(Exception):
    """Mirrors tRPC TRPCError so the batch handler can format it correctly."""
    CODE_TO_HTTP = {
        "PARSE_ERROR": 400,
        "BAD_REQUEST": 400,
        "UNAUTHORIZED": 401,
        "FORBIDDEN": 403,
        "NOT_FOUND": 404,
        "METHOD_NOT_SUPPORTED": 405,
        "TIMEOUT": 408,
        "CONFLICT": 409,
        "PRECONDITION_FAILED": 412,
        "PAYLOAD_TOO_LARGE": 413,
        "TOO_MANY_REQUESTS": 429,
        "INTERNAL_SERVER_ERROR": 500,
        "NOT_IMPLEMENTED": 501,
        "BAD_GATEWAY": 502,
        "SERVICE_UNAVAILABLE": 503,
    }

    def __init__(self, message: str, code: str = "INTERNAL_SERVER_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = self.CODE_TO_HTTP.get(code, 500)
