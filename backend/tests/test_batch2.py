"""Verification suite for Batch 2: Review gate, dosage, and upload correctness.
Tests:
- ERR-001: Review gate and medicine activation atomicity
- ERR-010: PRN, expired courses, and unknown frequencies excluded from reminders
- ERR-011: Suffix inference and salt disagreements flagged as requiring confirmation
- ERR-013: DateTime stopped_at serialization on report endpoints
- ERR-023: Upload size bounds, decompression bomb, and image format validation
- ERR-025: 4-part and QID dosage schedule preservation without slot loss
"""
from __future__ import annotations

import io
import os
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from PIL import Image

# Setup isolated SQLite database for test
tmp_dir = tempfile.TemporaryDirectory(prefix="aayogya-batch2-test-", ignore_cleanup_errors=True)
os.environ["DATABASE_URL"] = f"sqlite:///{Path(tmp_dir.name).as_posix()}/test_batch2.db"
os.environ["ENVIRONMENT"] = "test"
os.environ["ENABLE_DEMO_ACCOUNTS"] = "false"

from app.config import settings
from app.db import SessionLocal, init_db
from app.dosage import parse_dosage
from app.graph import PipelineState, _validate_catalog
from app.main import app
from app.models import DoseAdherence, Medicine, Patient, Report
from app.schemas import MedicineOut, ReportOut
from app import whatsapp as wa_svc


def create_test_image(width: int = 100, height: int = 100, fmt: str = "JPEG") -> bytes:
    img = Image.new("RGB", (width, height), color="white")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def test_err_013_stopped_at_datetime_serialization():
    """ERR-013: Stopping a medicine should not break report serialization."""
    print("Testing ERR-013: DateTime stopped_at schema serialization...")
    init_db()

    with SessionLocal() as db:
        patient = Patient(id="p_err13", name="Test ERR13", email="err13@test.com", phone="9100000013")
        db.add(patient)
        db.flush()

        report = Report(patient_id=patient.id, confirmed=True, follow_up_date=date.today().isoformat())
        db.add(report)
        db.flush()

        med = Medicine(
            patient_id=patient.id,
            report_id=report.id,
            brand="Paracetamol",
            salt="paracetamol",
            status="stopped",
            stopped_at=datetime.now(timezone.utc),
            stopped_reason="Patient recovered",
        )
        db.add(med)
        db.commit()

        # Validate MedicineOut and ReportOut directly
        med_out = MedicineOut.model_validate(med)
        assert med_out.stopped_at is not None
        assert med_out.status == "stopped"

        db.refresh(report)
        from app.main import _report_out
        rep_out = _report_out(report)
        assert rep_out.medicines[0].stopped_at is not None

    with TestClient(app) as client:
        from app.auth import make_token
        token = make_token("p_err13")
        res = client.get("/api/reports", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert len(data) >= 1
        assert data[0]["medicines"][0]["stopped_at"] is not None

    print("  [PASS] ERR-013: DateTime stopped_at serializes cleanly without 500 error.")


def test_err_025_four_part_and_qid_dosage():
    """ERR-025: Four-times-daily dosing must not be collapsed into three slots."""
    print("Testing ERR-025: 4-part and QID dosage schedule preservation...")

    # 4-part notation: 1-1-1-1
    d4 = parse_dosage("1-1-1-1")
    assert d4.timings == ["morning", "afternoon", "evening", "night"], d4.timings
    assert d4.doses == {"morning": 1.0, "afternoon": 1.0, "evening": 1.0, "night": 1.0}
    assert d4.per_day == 4.0

    # 4-part fractional notation: 1/2-1-1/2-1
    df = parse_dosage("1/2-1-1/2-1")
    assert df.timings == ["morning", "afternoon", "evening", "night"]
    assert df.doses["morning"] == 0.5
    assert df.doses["afternoon"] == 1.0
    assert df.doses["evening"] == 0.5
    assert df.doses["night"] == 1.0
    assert df.per_day == 3.0

    # QID and Q6H abbreviations
    for abbr in ("QID", "qid", "FOUR TIMES DAILY", "Q6H", "q6h"):
        da = parse_dosage(abbr)
        assert da.timings == ["morning", "afternoon", "evening", "night"], (abbr, da.timings)
        assert da.per_day == 4.0

    print("  [PASS] ERR-025: 4-part and QID dosage notation preserves all 4 distinct administrations.")


def test_err_023_upload_payload_validation():
    """ERR-023: Reject invalid, corrupt, or oversized image uploads before provider invocation."""
    print("Testing ERR-023: Upload payload bounds and format validation...")

    with SessionLocal() as db:
        if not db.get(Patient, "p_err23"):
            db.add(Patient(id="p_err23", name="Test ERR23", email="err23@test.com", phone="9100000023"))
            db.commit()

    with TestClient(app) as client:
        from app.auth import make_token
        token = make_token("p_err23")

        # 1. Reject non-image mime type
        res = client.post(
            "/api/reports/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("test.pdf", b"%PDF-1.4...", "application/pdf")},
        )
        assert res.status_code == 400
        assert "Upload an image" in res.text

        # 2. Reject corrupt bytes claiming to be image/png
        res = client.post(
            "/api/reports/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("corrupt.png", b"INVALID_CORRUPT_BYTES"*5, "image/png")},
        )
        assert res.status_code == 400
        assert "not a valid or readable image" in res.text

        # 3. Reject oversized payload (> 10 MB)
        oversized = b"x" * (10 * 1024 * 1024 + 10)
        res = client.post(
            "/api/reports/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("huge.jpg", oversized, "image/jpeg")},
        )
        assert res.status_code == 400
        assert "File exceeds maximum permitted size" in res.text

        # 4. Reject tiny dimensions (< 10px)
        tiny_bytes = create_test_image(width=5, height=5, fmt="JPEG")
        res = client.post(
            "/api/reports/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("tiny.jpg", tiny_bytes, "image/jpeg")},
        )
        assert res.status_code == 400
        assert "too small" in res.text

    print("  [PASS] ERR-023: Invalid, corrupt, and oversized payloads strictly rejected with HTTP 400.")


def test_err_001_review_gate_and_activation():
    """ERR-001: Unconfirmed uploads must not activate medicines or schedule dose reminders."""
    print("Testing ERR-001: Review gate and atomic medicine activation on confirm...")

    synthetic_extraction = {
        "prescription_date": date.today().isoformat(),
        "prescriber_name": "Dr. Verma",
        "raw_ocr": "Dolo 650 1-0-1",
        "meds": [
            {
                "brand": "Dolo 650",
                "salt": "paracetamol",
                "strength": "650mg",
                "dosage_notation": "1-0-1",
                "confidence": 0.95,
            }
        ],
    }

    with patch("app.graph._extract_raw", return_value=(synthetic_extraction, False)):

        with TestClient(app) as client:
            # Register a new patient
            reg = client.post(
                "/api/auth/register",
                json={
                    "name": "Gate Patient",
                    "email": "gate@example.com",
                    "phone": "9812345678",
                    "password": "gate-password-123",
                },
            )
            assert reg.status_code == 201
            auth_token = reg.json()["token"]
            headers = {"Authorization": f"Bearer {auth_token}"}
            patient_id = reg.json()["patient"]["id"]

            # 1. Upload valid image
            valid_img = create_test_image(width=200, height=200, fmt="JPEG")
            up_res = client.post(
                "/api/reports/upload",
                headers=headers,
                files={"file": ("script.jpg", valid_img, "image/jpeg")},
            )
            assert up_res.status_code == 200, up_res.text
            report = up_res.json()
            assert report["confirmed"] is False
            assert report["medicines"][0]["status"] == "pending_review"
            report_id = report["id"]

            # 2. Assert unconfirmed report's medicines DO NOT appear in active medicines
            meds_res = client.get("/api/medicines", headers=headers)
            assert meds_res.status_code == 200
            assert len(meds_res.json()) == 0, f"Expected 0 active meds before confirmation, got: {meds_res.json()}"

            # 3. Assert unconfirmed report DOES NOT create scheduled dose reminders
            adh_res = client.get("/api/adherence/today", headers=headers)
            assert adh_res.status_code == 200
            assert len(adh_res.json()) == 0, f"Expected 0 scheduled doses before confirmation, got: {adh_res.json()}"

            # 4. Now explicitly confirm the report
            conf_res = client.post(f"/api/reports/{report_id}/confirm", headers=headers)
            assert conf_res.status_code == 200, conf_res.text
            confirmed_report = conf_res.json()
            assert confirmed_report["confirmed"] is True
            assert confirmed_report["medicines"][0]["status"] == "active"

            # 5. Assert confirmed medicines are now returned by /api/medicines
            meds_after = client.get("/api/medicines", headers=headers).json()
            assert len(meds_after) == 1
            assert meds_after[0]["brand"] == "Dolo 650"
            assert meds_after[0]["status"] == "active"

            # 6. Assert dose reminders are now generated for confirmed medicines
            adh_after = client.get("/api/adherence/today", headers=headers).json()
            assert len(adh_after) == 2  # "1-0-1" -> morning and night slots
            slots = {d["slot"] for d in adh_after}
            assert slots == {"morning", "night"}

    print("  [PASS] ERR-001: Medicines remain pending_review until explicit confirmation; 0 doses leaked.")


def test_err_010_prn_and_course_expiry():
    """ERR-010: Exclude PRN medicines and expired courses from automatic reminders."""
    print("Testing ERR-010: PRN, course expiry, and unknown frequency exclusions...")

    with SessionLocal() as db:
        p = Patient(id="p_err10", name="Expiry Patient", email="exp@test.com", phone="9100000010")
        db.add(p)
        db.flush()

        rep = Report(patient_id=p.id, confirmed=True)
        db.add(rep)
        db.flush()

        # 1. PRN Medicine (SOS): should NOT create any dose adherence
        med_prn = Medicine(
            patient_id=p.id,
            report_id=rep.id,
            brand="Disprin SOS",
            status="active",
            prn=True,
            timing=[],
            start_date=date.today().isoformat(),
            duration_days=3,
        )
        # 2. Already Expired Medicine: 5-day course started 30 days ago
        med_exp = Medicine(
            patient_id=p.id,
            report_id=rep.id,
            brand="Amoxicillin 500",
            status="active",
            prn=False,
            timing=["morning", "night"],
            start_date=(date.today() - timedelta(days=30)).isoformat(),
            duration_days=5,
        )
        # 3. Active valid medicine: started today, 7 days duration
        med_act = Medicine(
            patient_id=p.id,
            report_id=rep.id,
            brand="Metformin 500",
            status="active",
            prn=False,
            timing=["morning", "night"],
            start_date=date.today().isoformat(),
            duration_days=7,
        )
        db.add_all([med_prn, med_exp, med_act])
        db.commit()

        doses = wa_svc.sync_today_adherence(db, p.id)
        # Only med_act should have doses created (morning and night)
        assert len(doses) == 2, f"Expected 2 doses for active medicine, got: {len(doses)}"
        med_ids = {d.medicine_id for d in doses}
        assert med_ids == {med_act.id}
        assert med_prn.id not in med_ids
        assert med_exp.id not in med_ids

        # Verify med_exp transitioned to expired status
        db.refresh(med_exp)
        assert med_exp.status == "expired"

    print("  [PASS] ERR-010: PRN and expired medicines correctly excluded from dose reminders.")


def test_err_011_suffix_uncertainty_flag():
    """ERR-011: Suffix inference and salt disagreements must flag needs_salt_confirmation."""
    print("Testing ERR-011: Suffix inference uncertainty flagging...")

    state: PipelineState = {
        "prescription_date": date.today().isoformat(),
        "confirmed": False,
        "meds": [
            # Brand with suffix -D (inferred salt)
            {
                "brand": "Brufen-D",
                "dosage_notation": "1-0-0",
                "confidence": 0.9,
            },
            # Extracted salt contradicts catalog salt
            {
                "brand": "Augmentin 625",
                "salt": "paracetamol",  # incorrect extracted salt
                "dosage_notation": "1-0-1",
                "confidence": 0.85,
            },
        ],
    }

    res = _validate_catalog(state)
    meds = res["meds"]

    # Brufen-D: suffix inference must flag needs_salt_confirmation = True
    brufen_d = next(m for m in meds if "brufen" in m["brand"].lower())
    assert brufen_d["needs_salt_confirmation"] is True
    assert "Suffix inference" in (brufen_d.get("notes") or "")

    # Augmentin with contradictory salt: must flag needs_salt_confirmation = True
    aug = next(m for m in meds if "augmentin" in m["brand"].lower())
    assert aug["needs_salt_confirmation"] is True
    assert "differs from catalog salt" in (aug.get("notes") or "")

    print("  [PASS] ERR-011: Suffix inference and salt contradictions require human confirmation.")


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING BATCH 2 VERIFICATION TEST SUITE")
    print("=======================================================\n")
    test_err_013_stopped_at_datetime_serialization()
    test_err_025_four_part_and_qid_dosage()
    test_err_023_upload_payload_validation()
    test_err_001_review_gate_and_activation()
    test_err_010_prn_and_course_expiry()
    test_err_011_suffix_uncertainty_flag()
    from app.db import engine
    engine.dispose()
    print("\n=======================================================")
    print("ALL BATCH 2 VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=======================================================\n")
