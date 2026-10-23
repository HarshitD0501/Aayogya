"""Local auth: pbkdf2 password hashing + HMAC-signed session token (stdlib only,
no PyJWT/bcrypt dep). Swap for Supabase Auth (design §7.1) later — the
`current_patient` dependency is the seam. Per-patient isolation (design §11) is
enforced by every data query filtering on current_patient.id.

Caregiver flow: a role='caregiver' token acts on a LINKED patient named by the
X-Patient-Id header (link-checked, 403 otherwise). Patient tokens ignore the
header entirely — they can only ever be themselves.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
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
_DEMO_ACCOUNT_IDS = frozenset({"aarav", "shanti", "ramesh", "sunita", "meera"})


def _demo_account_blocked(patient_id: str) -> bool:
    return patient_id in _DEMO_ACCOUNT_IDS and not settings.enable_demo_accounts


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


def normalize_indian_phone(value: str) -> str:
    """Normalize common Indian mobile formats to a unique +91 E.164 value."""
    compact = re.sub(r"[\s().-]", "", value)
    if compact.startswith("00"):
        compact = "+" + compact[2:]
    if compact.startswith("+91"):
        digits = compact[3:]
    elif compact.startswith("91") and len(compact) == 12:
        digits = compact[2:]
    elif len(compact) == 10:
        digits = compact
    else:
        raise ValueError("Enter a valid 10-digit Indian mobile number.")

    if (
        len(digits) != 10
        or not digits.isascii()
        or not digits.isdigit()
        or digits[0] not in "6789"
    ):
        raise ValueError("Enter a valid 10-digit Indian mobile number.")
    return f"+91{digits}"


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
    """Look up by email OR phone (elderly-friendly, design §7.1), verify password.
    Returns patients and caregivers alike; role decides the dashboard."""
    normalized_identifier = identifier.strip()
    phone_identifier = normalized_identifier
    try:
        phone_identifier = normalize_indian_phone(normalized_identifier)
    except ValueError:
        pass

    patient = (
        db.query(Patient)
        .filter(
            (Patient.email == normalized_identifier.lower())
            | (Patient.phone == phone_identifier)
        )
        .first()
    )
    if patient and not _demo_account_blocked(patient.id) and verify_password(
        password, patient.password_hash or ""
    ):
        return patient
    return None


def _linked_patient_ids(db: Session, caregiver_id: str) -> list[str]:
    """Linked patient ids in link order (matches /api/caregiver/patients cards)."""
    from .models import CaregiverLink  # local import: avoid circular module load

    rows = (
        db.query(CaregiverLink.patient_id)
        .filter(CaregiverLink.caregiver_id == caregiver_id)
        .order_by(CaregiverLink.id.asc())
        .all()
    )
    return [r[0] for r in rows]


def resolve_actor(
    authorization: str = Header(None),
    x_patient_id: str = Header(None, alias="X-Patient-Id"),
    db: Session = Depends(get_db),
) -> tuple[Patient, Patient]:
    """Auth + caregiver routing. Returns (actor, patient):
    actor = the logged-in row (patient or caregiver), patient = the row whose
    data is acted on. For patients: actor is patient, X-Patient-Id is IGNORED
    (no self-impersonation escape hatch). For caregivers: patient must be a
    linked, consented patient — defaulting to the first link when no header.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    pid = _verify_token(authorization.split(" ", 1)[1])
    actor = db.get(Patient, pid)
    if not actor:
        raise HTTPException(401, "Unknown account")
    if _demo_account_blocked(actor.id):
        raise HTTPException(401, "Demo accounts are disabled")

    if (actor.role or "patient") != "caregiver":
        return actor, actor  # patient role: always self

    linked = _linked_patient_ids(db, actor.id)
    if not linked:
        raise HTTPException(403, "No patients linked to this caregiver yet")

    target_id = x_patient_id or linked[0]  # default: first linked patient
    if target_id not in linked:
        raise HTTPException(403, "Not a linked patient of this caregiver")
    patient = db.get(Patient, target_id)
    if not patient:
        raise HTTPException(404, "Linked patient no longer exists")
    return actor, patient


def current_patient(
    authorization: str = Header(None),
    x_patient_id: str = Header(None, alias="X-Patient-Id"),
    db: Session = Depends(get_db),
) -> Patient:
    """Same object as before (the resolved patient), so every existing route
    keeps working. Caregiver tokens resolve to their linked target."""
    return resolve_actor(authorization, x_patient_id, db)[1]


def current_caregiver(
    authorization: str = Header(None), db: Session = Depends(get_db)
) -> Patient:
    """403 unless the token belongs to a caregiver. For caregiver-only routes."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    pid = _verify_token(authorization.split(" ", 1)[1])
    actor = db.get(Patient, pid)
    if not actor:
        raise HTTPException(401, "Unknown account")
    if _demo_account_blocked(actor.id):
        raise HTTPException(401, "Demo accounts are disabled")
    if (actor.role or "patient") != "caregiver":
        raise HTTPException(403, "Caregiver login required")
    return actor
