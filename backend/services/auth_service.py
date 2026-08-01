import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from services.database import get_db, slug_username, users

# If JWT_SECRET isn't set we fall back to a random per-boot secret: still secure,
# but every restart logs everyone out — set it in .env for real deployments.
JWT_SECRET = os.getenv("JWT_SECRET") or secrets.token_hex(32)
if not os.getenv("JWT_SECRET"):
    print("⚠️ WARNING: JWT_SECRET not set — using an ephemeral secret (tokens die on restart).")

JWT_ALGORITHM = "HS256"
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "24"))

# Reset tokens are signed with the same secret but carry a distinct audience, so
# one can never be replayed as a session token (and vice versa).
RESET_AUDIENCE = "pwreset"
RESET_TTL_MINUTES = 30

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# Google-only accounts have no password. The column is NOT NULL (dropping that
# on SQLite means rebuilding the table), so "no password" is the empty string.
NO_PASSWORD = ""

_bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """One-way bcrypt hash — the plaintext password is never stored and cannot be recovered."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    # Guard the sentinel: a Google-only account must never be loggable with ""
    if not password_hash:
        return False
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    # Only the user id is carried. Email used to be a claim, but it goes stale the
    # moment someone edits their profile — anything else is read from the DB.
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

def _row_to_profile(row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "username": row["username"],
        "bio": row["bio"],
        "has_password": bool(row["password_hash"]),
        "has_google": bool(row["google_id"]),
    }


def load_user(user_id: int) -> Optional[dict]:
    """Full profile straight from the DB — the source of truth for anything the
    token deliberately doesn't carry."""
    with get_db() as conn:
        row = conn.execute(
            text("SELECT id, email, username, bio, password_hash, google_id FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
    return _row_to_profile(row) if row else None


def _unique_username(conn, seed: str) -> str:
    """Turns any seed into a username that isn't taken yet (base, base_2, base_3…)."""
    base = slug_username(seed)
    candidate = base
    suffix = 2
    while conn.execute(
        text("SELECT 1 FROM users WHERE username = :u"), {"u": candidate}
    ).first():
        candidate = f"{base}_{suffix}"[:32]
        suffix += 1
    return candidate


# ---------------------------------------------------------------------------
# Registration / login
# ---------------------------------------------------------------------------

def register_user(email: str, username: str, password: str) -> dict:
    """Creates a user row. Raises ValueError naming whichever field is taken."""
    email = email.strip().lower()
    username = username.strip().lower()
    with get_db() as conn:
        # Pre-check so the error can name the right field; the IntegrityError
        # below is the fallback for the race between this check and the insert.
        if conn.execute(text("SELECT 1 FROM users WHERE email = :e"), {"e": email}).first():
            raise ValueError("An account with this email already exists.")
        if conn.execute(text("SELECT 1 FROM users WHERE username = :u"), {"u": username}).first():
            raise ValueError("That username is already taken.")
        try:
            result = conn.execute(
                users.insert().values(
                    email=email, username=username, password_hash=hash_password(password)
                )
            )
        except IntegrityError:
            raise ValueError("That email or username is already taken.")
        return {"id": result.inserted_primary_key[0], "email": email, "username": username}


def authenticate_user(identifier: str, password: str) -> Optional[dict]:
    """Accepts a username OR an email. Returns the user on valid credentials,
    None otherwise (caller decides the error message)."""
    normalized = identifier.strip().lower()
    with get_db() as conn:
        row = conn.execute(
            text(
                "SELECT id, email, username, password_hash FROM users "
                "WHERE email = :id OR username = :id"
            ),
            {"id": normalized},
        ).mappings().first()

    if row is None or not verify_password(password, row["password_hash"]):
        return None
    return {"id": row["id"], "email": row["email"], "username": row["username"]}


# ---------------------------------------------------------------------------
# Profile management
# ---------------------------------------------------------------------------

def update_profile(
    user_id: int,
    username: Optional[str] = None,
    email: Optional[str] = None,
    bio: Optional[str] = None,
) -> dict:
    """Applies whichever fields were supplied. Raises ValueError on a collision."""
    changes = {}
    if username is not None:
        changes["username"] = username.strip().lower()
    if email is not None:
        changes["email"] = email.strip().lower()
    if bio is not None:
        changes["bio"] = bio.strip() or None

    with get_db() as conn:
        if "username" in changes:
            clash = conn.execute(
                text("SELECT 1 FROM users WHERE username = :u AND id != :id"),
                {"u": changes["username"], "id": user_id},
            ).first()
            if clash:
                raise ValueError("That username is already taken.")
        if "email" in changes:
            clash = conn.execute(
                text("SELECT 1 FROM users WHERE email = :e AND id != :id"),
                {"e": changes["email"], "id": user_id},
            ).first()
            if clash:
                raise ValueError("That email is already in use.")

        if changes:
            try:
                conn.execute(users.update().where(users.c.id == user_id).values(**changes))
            except IntegrityError:
                raise ValueError("That username or email is already taken.")

        row = conn.execute(
            text("SELECT id, email, username, bio, password_hash, google_id FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
    return _row_to_profile(row)


def change_password(user_id: int, current_password: Optional[str], new_password: str) -> None:
    """Sets a new password. Google-only accounts (no password yet) may pass
    current_password=None to set one for the first time."""
    with get_db() as conn:
        row = conn.execute(
            text("SELECT password_hash FROM users WHERE id = :id"), {"id": user_id}
        ).mappings().first()
        if row is None:
            raise ValueError("Account not found.")

        if row["password_hash"]:
            if not current_password or not verify_password(current_password, row["password_hash"]):
                raise ValueError("Your current password is incorrect.")

        conn.execute(
            users.update().where(users.c.id == user_id).values(password_hash=hash_password(new_password))
        )


# ---------------------------------------------------------------------------
# Account recovery
# ---------------------------------------------------------------------------

def _password_version(password_hash: str) -> str:
    """A short digest of the current hash. Embedding it in a reset token makes the
    token single-use for free: once the password changes, the digest no longer
    matches and the link stops working — no extra table needed."""
    return hashlib.sha256((password_hash or NO_PASSWORD).encode("utf-8")).hexdigest()[:16]


def find_user_by_email(email: str) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute(
            text("SELECT id, email, username, password_hash FROM users WHERE email = :e"),
            {"e": email.strip().lower()},
        ).mappings().first()
    if row is None:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "username": row["username"],
        "password_hash": row["password_hash"],
    }


def create_reset_token(user_id: int, password_hash: str) -> str:
    payload = {
        "sub": str(user_id),
        "aud": RESET_AUDIENCE,
        "pwv": _password_version(password_hash),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_TTL_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def reset_password_with_token(token: str, new_password: str) -> None:
    """Validates a reset token and applies the new password. Raises ValueError on
    anything wrong — expired, tampered, wrong audience, or already used."""
    try:
        payload = jwt.decode(
            token, JWT_SECRET, algorithms=[JWT_ALGORITHM], audience=RESET_AUDIENCE
        )
    except jwt.ExpiredSignatureError:
        raise ValueError("That reset link has expired. Please request a new one.")
    except jwt.InvalidTokenError:
        raise ValueError("That reset link isn't valid. Please request a new one.")

    user_id = int(payload["sub"])
    with get_db() as conn:
        row = conn.execute(
            text("SELECT password_hash FROM users WHERE id = :id"), {"id": user_id}
        ).mappings().first()
        if row is None:
            raise ValueError("That reset link isn't valid. Please request a new one.")
        if payload.get("pwv") != _password_version(row["password_hash"]):
            raise ValueError("That reset link has already been used. Please request a new one.")

        conn.execute(
            users.update().where(users.c.id == user_id).values(password_hash=hash_password(new_password))
        )


# ---------------------------------------------------------------------------
# Google sign-in
# ---------------------------------------------------------------------------

def google_sign_in(credential: str) -> dict:
    """Verifies a Google ID token and returns the matching app account, creating
    or linking one as needed. Raises ValueError if it can't be trusted."""
    if not GOOGLE_CLIENT_ID:
        raise ValueError("Google sign-in isn't configured on this server.")

    # Imported lazily so the backend still boots when google-auth isn't installed
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError:
        raise ValueError("Google sign-in isn't available — the server is missing google-auth.")

    try:
        info = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except Exception:
        raise ValueError("Could not verify that Google account. Please try again.")

    if not info.get("email_verified"):
        raise ValueError("That Google account has no verified email address.")

    google_id = str(info["sub"])
    email = info["email"].strip().lower()

    with get_db() as conn:
        # 1. Returning Google user
        row = conn.execute(
            text("SELECT id, email, username FROM users WHERE google_id = :g"), {"g": google_id}
        ).mappings().first()
        if row:
            return {"id": row["id"], "email": row["email"], "username": row["username"]}

        # 2. Existing password account with the same verified email — link them
        row = conn.execute(
            text("SELECT id, email, username FROM users WHERE email = :e"), {"e": email}
        ).mappings().first()
        if row:
            conn.execute(users.update().where(users.c.id == row["id"]).values(google_id=google_id))
            return {"id": row["id"], "email": row["email"], "username": row["username"]}

        # 3. Brand new account — no password, username derived from the profile
        username = _unique_username(conn, info.get("given_name") or email.split("@")[0])
        result = conn.execute(
            users.insert().values(
                email=email, username=username, password_hash=NO_PASSWORD, google_id=google_id
            )
        )
        return {"id": result.inserted_primary_key[0], "email": email, "username": username}


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """FastAPI dependency: validates the Bearer token and returns {id} or raises 401.
    Reset tokens fail here on their audience claim, so they can't be used as sessions."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")

    return {"id": int(payload["sub"])}
