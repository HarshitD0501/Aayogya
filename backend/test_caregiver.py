"""Caregiver auth/isolation self-check (assert-based, no pytest, no network).

Covers the security-critical matrix:
  1. patient token + X-Patient-Id      -> header IGNORED, sees self
  2. caregiver + linked id             -> resolves that patient
  3. caregiver, no header              -> defaults to FIRST linked patient
  4. caregiver + unlinked id           -> 403
  5. caregiver with zero links         -> 403
  6. patient calling caregiver route   -> 403
  7. contact update: link enforced, E.164 normalization, uniqueness
Run: .venv/Scripts/python.exe test_caregiver.py
"""
from __future__ import annotations

import os
import sys
import tempfile

os.environ.setdefault("DATABASE_URL", "")  # ensure sqlite default before imports
os.environ["ENVIRONMENT"] = "test"
os.environ["ENABLE_DEMO_ACCOUNTS"] = "true"

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

# Fresh sqlite file DB per run: migrations run via init_db(), seed populates.
_fd, _path = tempfile.mkstemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite:///{_path.replace(os.sep, '/')}"

from app.main import app  # noqa: E402
from app.auth import resolve_actor  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import CaregiverLink, Patient  # noqa: E402

PASS = 0


def check(label: str, cond: bool) -> None:
    global PASS
    assert cond, f"FAILED: {label}"
    PASS += 1
    print(f"  [PASS] {label}")


print("CAREGIVER AUTH & ISOLATION TEST")
print("=" * 50)

with TestClient(app) as client:
    # --- login as caregiver & patient ---
    r = client.post("/api/auth/login", json={"identifier": "meera@demo.in", "password": "pass1234"})
    meera_tok = r.json()["token"]
    check("caregiver login returns role=caregiver", r.json()["patient"]["role"] == "caregiver")

    r = client.post("/api/auth/login", json={"identifier": "ramesh@demo.in", "password": "pass1234"})
    ramesh_tok = r.json()["token"]
    check("patient login returns role=patient", r.json()["patient"]["role"] == "patient")

    r = client.post("/api/auth/login", json={"identifier": "ram@demo.in", "password": "pass1234"})
    check("Ram demo logs in as a patient", r.status_code == 200 and r.json()["patient"]["role"] == "patient")

    r = client.post("/api/auth/login", json={"identifier": "ramesh.caregiver@demo.in", "password": "pass1234"})
    ramesh_caregiver_tok = r.json()["token"]
    check("Ramesh demo logs in as a caregiver", r.status_code == 200 and r.json()["patient"]["role"] == "caregiver")
    r = client.get("/api/caregiver/patients", headers={"Authorization": f"Bearer {ramesh_caregiver_tok}"})
    check("Ramesh caregiver demo sees Ram", r.status_code == 200 and [p["name"] for p in r.json()["patients"]] == ["Ram Sharma"])

    H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731

    # 1. patient token ignores X-Patient-Id (no self-impersonation hatch)
    r = client.get("/api/medicines", headers={**H(ramesh_tok), "X-Patient-Id": "shanti"})
    brands = {m["brand"] for m in r.json()}
    check("patient token + forged header -> still own meds only", "Digene" not in brands and "Glycomet 500" in brands)

    # 2. caregiver + linked header resolves that patient
    r = client.get("/api/medicines", headers={**H(meera_tok), "X-Patient-Id": "shanti"})
    brands = {m["brand"] for m in r.json()}
    check("caregiver + shanti header -> shanti's meds", "Brufen 400" in brands)

    # 3. caregiver without header defaults to FIRST linked patient (ramesh)
    r = client.get("/api/medicines", headers=H(meera_tok))
    brands = {m["brand"] for m in r.json()}
    check("caregiver default -> first link (ramesh's meds)", "Amlong 5" in brands and "Brufen 400" not in brands)

    # 4. caregiver + unlinked id -> 403
    r = client.get("/api/medicines", headers={**H(meera_tok), "X-Patient-Id": "ghost"})
    check("caregiver + unlinked patient -> 403", r.status_code == 403)

    # 5. caregiver with zero links -> 403
    db = SessionLocal()
    db.add(Patient(id="lonely", name="No Links", email="lonely@demo.in", phone="+919000000009",
                   password_hash="x", role="caregiver"))
    db.commit()
    from app.auth import make_token
    r = client.get("/api/medicines", headers=H(make_token("lonely")))
    check("caregiver with zero links -> 403", r.status_code == 403)
    r_me = client.get("/api/auth/me", headers=H(make_token("lonely")))
    check("caregiver with zero links calling /api/auth/me -> 200", r_me.status_code == 200 and r_me.json()["role"] == "caregiver")

    # 6. patient token on caregiver route -> 403
    r = client.get("/api/caregiver/patients", headers=H(ramesh_tok))
    check("patient on caregiver route -> 403", r.status_code == 403)

    # 7. family overview: four cards with relations and days_until
    r = client.get("/api/caregiver/patients", headers=H(meera_tok))
    fam = r.json()["patients"]
    check("family overview lists 4 linked patients", len(fam) == 4)
    check("cards carry relations", {p["relation"] for p in fam} == {"father", "grandmother", "brother", "mother"})
    check("cards carry days_until", all(p["next_followup"] and p["next_followup"]["days_until"] is not None for p in fam))

    # 8. contact update: link guard + normalization
    r = client.post("/api/caregiver/patients/shanti/contact", headers=H(meera_tok),
                    json={"phone": "98765 43210"})
    check("contact update normalizes to +91 E.164", r.json().get("phone") == "+919876543210")
    r = client.get("/api/caregiver/patients", headers=H(meera_tok))
    shanti = next(p for p in r.json()["patients"] if p["id"] == "shanti")
    check("overview reflects new phone", shanti["phone"] == "+919876543210")
    r = client.post("/api/caregiver/patients/ghost/contact", headers=H(meera_tok),
                    json={"phone": "+919876543210"})
    check("contact update on unlinked patient -> 403", r.status_code == 403)
    r = client.post("/api/caregiver/patients/aarav/contact", headers=H(meera_tok),
                    json={"phone": "919876543210"})
    check("duplicate phone on another patient -> 409", r.status_code == 409)
    r = client.post("/api/caregiver/patients/aarav/contact", headers=H(meera_tok),
                    json={"phone": "123"})
    check("invalid phone rejected 422", r.status_code == 422)

    # 9. caregiver chat proxy mints patient-scoped token (agent isolation)
    #    -> verified via resolver contract, not a live agent call.
    db2 = SessionLocal()
    from app.auth import resolve_actor as ra
    actor, patient = ra(f"Bearer {meera_tok}", "shanti", db2)
    check("resolver returns actor=caregiver, patient=shanti", actor.id == "meera" and patient.id == "shanti")
    actor, patient = ra(f"Bearer {ramesh_tok}", "shanti", db2)
    check("patient resolves to self regardless of header", actor.id == "ramesh" and patient.id == "ramesh")
    db2.close()

    # restore shanti's phone so re-runs stay consistent
    db.query(Patient).filter(Patient.id == "shanti").update({"phone": "+919000000002"})
    db.commit()
    db.close()

print("=" * 50)
print(f"ALL {PASS} CAREGIVER TESTS PASSED")
try:
    os.close(_fd)
    os.unlink(_path)  # Windows may hold the sqlite file via the engine pool — best-effort
except OSError:
    pass
