"""Password hashing (bcrypt) and opaque session tokens."""

from __future__ import annotations

import hashlib
import secrets

import bcrypt

# bcrypt truncates at 72 bytes; enforce app-level min length elsewhere.
_BCRYPT_ROUNDS = 12


def hash_password(plain: str) -> str:
    if len(plain.encode("utf-8")) > 72:
        raise ValueError("password too long for bcrypt")
    hashed = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS))
    return hashed.decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def new_session_token() -> str:
    """High-entropy opaque token sent to the browser (never guessable)."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """Store only the hash of the session token in the database."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
