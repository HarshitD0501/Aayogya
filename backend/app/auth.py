"""Local auth: pbkdf2 password hashing + HMAC-signed session token (stdlib only,
no PyJWT/bcrypt dep). Swap for Supabase Auth (design §7.1) later — the
`current_patient` dependency is the seam. Per-patient isolation (design §11) is
enforced by every data query filtering on current_patient.id.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Patient

# ponytail: dev default secret — MUST set SECRET_KEY in prod (tokens forgeable otherwise).
_SECRET = settings.secret_key.encode()
_TTL = 60 * 60 * 24 * 7  # 7 days
_ITER = 200_000


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, _ITER)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt_hex), _ITER)
    return hmac.compare_digest(dk.hex(), dk_hex)


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(patient_id: str) -> str:
    body = json.dumps({"sub": patient_id, "exp": int(time.time()) + _TTL})
    payload = _b64(body.encode())
    sig = _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def _verify_token(token: str) -> str:
    try:
        payload, sig = token.split(".", 1)
    except ValueError:
        raise HTTPException(401, "Malformed token")
    expected = _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(401, "Bad token signature")
    data = json.loads(_unb64(payload))
    if data.get("exp", 0) < time.time():
        raise HTTPException(401, "Token expired — log in again")
    return data["sub"]


def authenticate(db: Session, identifier: str, password: str) -> Patient | None:
    """Look up by email OR phone (elderly-friendly, design §7.1), verify password."""
    patient = (
        db.query(Patient)
        .filter((Patient.email == identifier) | (Patient.phone == identifier))
        .first()
    )
    if patient and verify_password(password, patient.password_hash or ""):
        return patient
    return None


def current_patient(
    authorization: str = Header(None), db: Session = Depends(get_db)
) -> Patient:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    pid = _verify_token(authorization.split(" ", 1)[1])
    patient = db.get(Patient, pid)
    if not patient:
        raise HTTPException(401, "Unknown patient")
    return patient
