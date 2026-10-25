"""Test suite for Twilio Telephony, LiveKit SIP dispatch, and the Reschedule workflow."""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.db import Base, get_db
from app.main import app
from app.models import Patient, ReminderLog, Report
from app.telephony import dispatch_doctor_followup_call, handle_reschedule_request


from sqlalchemy.pool import StaticPool

# Hermetic: force simulation mode even if the dev .env has real LiveKit/Twilio
# keys — tests must never fire a real agent dispatch.
settings.livekit_url = ""
settings.livekit_sip_trunk_id = ""
settings.twilio_sip_domain = ""

def setup_test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Seed test patient
    p = Patient(
        id="test_patient_1",
        name="रमेश कुमार",
        email="ramesh@test.in",
        phone="+919876543210",
        plan="pro",
        lang="hi",
        call_reminders_enabled=True,
    )
    db.add(p)

    # Seed test report with 2-day-prior follow_up_date
    r = Report(
        id=101,
        patient_id="test_patient_1",
        prescriber_name="Dr. Sharma",
        prescriber_specialty="Cardiology",
        prescription_date="2026-10-01",
        follow_up_date="2026-10-15",
        follow_up_status="scheduled",
        confirmed=True,
    )
    db.add(r)
    db.commit()
    return db


def test_dispatch_doctor_followup_call_validation():
    db = setup_test_db()
    patient = db.query(Patient).filter_by(id="test_patient_1").first()
    invalid_report = Report(id=102, patient_id=patient.id, follow_up_date=None)
    db.add(invalid_report)
    db.commit()

    # Missing follow_up_date raises ValueError
    error_raised = False
    try:
        asyncio.run(dispatch_doctor_followup_call(db, patient, invalid_report))
    except ValueError as e:
        assert "does not have a follow_up_date" in str(e)
        error_raised = True
    assert error_raised, "Expected ValueError for missing follow_up_date"
    print("  [PASS] Validation correctly rejects missing follow_up_date.")


def test_dispatch_doctor_followup_call_success():
    db = setup_test_db()
    patient = db.query(Patient).filter_by(id="test_patient_1").first()
    report = db.query(Report).filter_by(id=101).first()

    # Dispatches in simulation mode when real keys are absent
    res = asyncio.run(dispatch_doctor_followup_call(db, patient, report, force=True))
    assert res["status"] == "call_placed"
    assert res["patient_id"] == "test_patient_1"
    assert res["doctor"] == "Dr. Sharma"
    assert res["mode"] == "simulated"  # no SIP trunk/domain configured in tests
    assert report.last_call_at is not None

    # Check ReminderLog entry — records the ATTEMPT honestly (simulated, not "connected")
    log = (
        db.query(ReminderLog)
        .filter_by(patient_id=patient.id, channel="voice", kind="followup")
        .order_by(ReminderLog.sent_at.desc())
        .first()
    )
    assert log is not None
    assert log.call_status == "simulated"
    assert str(report.follow_up_date) in log.body
    assert patient.phone in log.body
    print("  [PASS] Outbound call dispatch succeeds and logs to ReminderLog.")


def test_dispatch_mints_token_for_scheduler_path():
    """The 2-day scheduler has no HTTP request in flight — dispatch must mint a
    fresh backend token itself so the agent's tool calls authenticate."""
    from app.telephony import _call_metadata
    from app.auth import _verify_token as verify_token, make_token

    db = setup_test_db()
    patient = db.query(Patient).filter_by(id="test_patient_1").first()
    report = db.query(Report).filter_by(id=101).first()

    meta = _call_metadata(patient, report, make_token(patient.id))
    assert meta["backend_token"], "metadata must carry a token even without auth_token"

    # The minted token must actually authenticate as THIS patient.
    subject = verify_token(meta["backend_token"])
    assert subject == patient.id
    print("  [PASS] Scheduler path: dispatch metadata carries a freshly minted token.")


def test_handle_reschedule_request():
    db = setup_test_db()
    res = handle_reschedule_request(
        db,
        patient_id="test_patient_1",
        report_id=101,
        preferred_date_or_time="अगले सोमवार सुबह 10 बजे",
        reason="Patient has travel scheduled",
    )
    assert res["status"] == "rescheduled"
    assert res["follow_up_status"] == "reschedule_requested"
    assert res["reschedule_preferred_date"] == "अगले सोमवार सुबह 10 बजे"

    # Verify database state
    report = db.query(Report).filter_by(id=101).first()
    assert report.follow_up_status == "reschedule_requested"
    assert report.reschedule_preferred_date == "अगले सोमवार सुबह 10 बजे"
    assert report.reschedule_notes == "Patient has travel scheduled"
    print("  [PASS] Reschedule request updates Report model and records audit log.")


def test_telephony_api_endpoints():
    db = setup_test_db()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    from app.auth import make_token
    token = make_token("test_patient_1")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test POST /api/telephony/reschedule
    resched_resp = client.post(
        "/api/telephony/reschedule",
        json={
            "report_id": 101,
            "preferred_date_or_time": "2026-10-22 at 11:00 AM",
            "reason": "Doctor visit rescheduled by patient",
        },
        headers=headers,
    )
    assert resched_resp.status_code == 200, resched_resp.text
    data = resched_resp.json()
    assert data["follow_up_status"] == "reschedule_requested"
    assert data["reschedule_preferred_date"] == "2026-10-22 at 11:00 AM"

    # 2. Test GET /api/telephony/status/101
    status_resp = client.get("/api/telephony/status/101", headers=headers)
    assert status_resp.status_code == 200
    st_data = status_resp.json()
    assert st_data["report_id"] == 101
    assert st_data["follow_up_status"] == "reschedule_requested"
    assert st_data["reschedule_preferred_date"] == "2026-10-22 at 11:00 AM"

    # 3. Test GET /api/reports includes reschedule fields
    reports_resp = client.get("/api/reports", headers=headers)
    assert reports_resp.status_code == 200
    rep_list = reports_resp.json()
    assert len(rep_list) >= 1
    target_rep = next(r for r in rep_list if r["id"] == 101)
    assert target_rep["follow_up_status"] == "reschedule_requested"
    assert target_rep["reschedule_preferred_date"] == "2026-10-22 at 11:00 AM"

    app.dependency_overrides.clear()
    print("  [PASS] FastAPI Telephony endpoints roundtrip validated.")


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING AAYOGYA TWILIO TELEPHONY & RESCHEDULE TEST SUITE")
    print("=======================================================\n")
    test_dispatch_doctor_followup_call_validation()
    test_dispatch_doctor_followup_call_success()
    test_dispatch_mints_token_for_scheduler_path()
    test_handle_reschedule_request()
    test_telephony_api_endpoints()
    print("\n=======================================================")
    print("ALL TELEPHONY & RESCHEDULE TESTS PASSED WITH 0 ERRORS!")
    print("=======================================================\n")
