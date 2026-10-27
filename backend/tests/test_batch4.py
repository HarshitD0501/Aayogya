"""Test suite for Batch 4: Outbound action authorization, truthful status, and provider contracts.

Covers:
- ERR-002: Cross-patient trigger isolation (/api/reminders/trigger-check scoping)
- ERR-008: Adherence NLP negation-first matching and webhook deduplication
- ERR-009: Webhook signature security in production vs development
- ERR-018: WhatsApp STOP opt-out and START opt-in protocol
- ERR-019: Server killswitch, destination allowlist, consent gate, and 60s cooldown
- ERR-020: Truthful simulated status and report-scoped telephony history
- ERR-029: Reschedule tool truthful preference recording
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Bootstrap backend and root import path
backend_dir = str(Path(__file__).resolve().parent.parent)
root_dir = str(Path(__file__).resolve().parent.parent.parent)
for p in [backend_dir, root_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import Base
from app.models import Patient, Report, Medicine, DoseAdherence, ReminderLog
import app.whatsapp as wa_svc
import app.telephony as tel_svc


# Ensure tests run in safe simulation mode (no external Meta or LiveKit calls)
settings.whatsapp_api_token = ""
settings.whatsapp_phone_number_id = ""
settings.livekit_url = ""
settings.livekit_api_key = ""
settings.livekit_api_secret = ""
settings.livekit_sip_trunk_id = ""
settings.twilio_sip_domain = ""


def create_test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, TestingSessionLocal


def test_err_002_cross_patient_trigger_isolation():
    """ERR-002: Patient A triggering reminder check must never evaluate or dispatch Patient B's reminders."""
    engine, TestingSessionLocal = create_test_db()
    db = TestingSessionLocal()

    # Create Patient A and Patient B
    p_a = Patient(
        id="pat_A",
        phone="919876543210",
        name="Patient Alpha",
        auto_reminders_enabled=True,
        whatsapp_reminders_enabled=True,
    )
    p_b = Patient(
        id="pat_B",
        phone="919876543211",
        name="Patient Beta",
        auto_reminders_enabled=True,
        whatsapp_reminders_enabled=True,
    )
    db.add_all([p_a, p_b])
    db.commit()

    # Create confirmed reports and medicines for both
    rep_a = Report(
        id=101,
        patient_id="pat_A",
        confirmed=True,
        follow_up_date=(datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d"),
    )
    rep_b = Report(
        id=102,
        patient_id="pat_B",
        confirmed=True,
        follow_up_date=(datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d"),
    )
    db.add_all([rep_a, rep_b])
    db.commit()

    med_a = Medicine(
        id=201,
        patient_id="pat_A",
        report_id=101,
        brand="Amox A",
        status="active",
        reminders_enabled=True,
    )
    med_b = Medicine(
        id=202,
        patient_id="pat_B",
        report_id=102,
        brand="Cipro B",
        status="active",
        reminders_enabled=True,
    )
    db.add_all([med_a, med_b])
    db.commit()

    # Trigger with target_patient_id="pat_A"
    res = asyncio.run(wa_svc.run_automated_reminders_check(db, force=True, target_patient_id="pat_A"))

    # Assert Patient B is NOT in any dispatched records
    dispatched_patients = [d["patient_id"] for d in res.get("whatsapp_medicines_dispatched", [])]
    call_patients = [c["patient_id"] for c in res.get("doctor_voice_calls_dispatched", [])]

    assert "pat_B" not in dispatched_patients, "Patient B's medicines were triggered during Patient A check!"
    assert "pat_B" not in call_patients, "Patient B's calls were triggered during Patient A check!"
    print("  [PASS] ERR-002: Reminders check strictly scoped to target patient")
    db.close()


def test_err_008_nlp_negation_before_positive_and_deduplication():
    """ERR-008: 'nahi li' must mark missed (not taken), and replaying message ID is deduplicated."""
    engine, TestingSessionLocal = create_test_db()
    db = TestingSessionLocal()

    patient = Patient(
        id="pat_nlp",
        phone="919111111111",
        name="NLP Test Patient",
        auto_reminders_enabled=True,
    )
    db.add(patient)
    db.commit()

    med = Medicine(id=301, patient_id=patient.id, brand="Metformin", status="active")
    db.add(med)
    db.commit()

    today_str = wa_svc._ist_today()
    adh = DoseAdherence(
        id=401,
        patient_id=patient.id,
        medicine_id=med.id,
        dose_date=today_str,
        slot="morning",
        status="pending",
    )
    db.add(adh)
    db.commit()

    # Webhook with 'nahi li' (previously matched 'li' and marked taken!)
    payload_neg = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "wamid_unique_001",
                                    "from": "919111111111",
                                    "type": "text",
                                    "text": {"body": "maine dawai nahi li"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }

    res_neg = asyncio.run(wa_svc.process_webhook_payload(payload_neg, db))
    db.refresh(adh)
    assert adh.status == "missed", f"Expected status 'missed' for 'nahi li', got '{adh.status}'"
    print("  [PASS] ERR-008: 'nahi li' correctly parsed as missed adherence")

    # Replay same message ID — should be skipped as duplicate
    res_replay = asyncio.run(wa_svc.process_webhook_payload(payload_neg, db))
    assert res_replay["processed"] == 0, "Duplicate webhook message ID was not skipped!"
    print("  [PASS] ERR-008: Webhook message replay successfully deduplicated")

    # Reset to pending and test positive 'le li'
    adh.status = "pending"
    db.commit()

    payload_pos = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "wamid_unique_002",
                                    "from": "919111111111",
                                    "type": "text",
                                    "text": {"body": "le li maine"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    res_pos = asyncio.run(wa_svc.process_webhook_payload(payload_pos, db))
    db.refresh(adh)
    assert adh.status == "taken", f"Expected status 'taken' for 'le li', got '{adh.status}'"
    print("  [PASS] ERR-008: 'le li' correctly parsed as taken adherence")

    db.close()


def test_err_009_webhook_signature_security():
    """ERR-009: In production, missing secret must reject webhook validation; dev mode passes."""
    orig_env = settings.environment
    orig_secret = settings.whatsapp_app_secret

    try:
        # 1. Production with no secret -> verify_signature returns False
        settings.environment = "production"
        settings.whatsapp_app_secret = ""
        valid_prod = wa_svc.verify_signature(b'{"test": 1}', None)
        assert valid_prod is False, "Production with missing secret should reject webhook signature!"
        print("  [PASS] ERR-009: Production rejects webhook without secret")

        # 2. Development with no secret -> verify_signature returns True
        settings.environment = "development"
        settings.whatsapp_app_secret = ""
        valid_dev = wa_svc.verify_signature(b'{"test": 1}', None)
        assert valid_dev is True, "Development mode should permit testing without secret"
        print("  [PASS] ERR-009: Development allows local testing without secret")
    finally:
        settings.environment = orig_env
        settings.whatsapp_app_secret = orig_secret


def test_err_018_whatsapp_stop_opt_out_and_start():
    """ERR-018: Inbound 'STOP' withdraws consent, 'START' restores it."""
    engine, TestingSessionLocal = create_test_db()
    db = TestingSessionLocal()

    patient = Patient(
        id="pat_consent",
        phone="919222222222",
        name="Consent Patient",
        auto_reminders_enabled=True,
        whatsapp_reminders_enabled=True,
    )
    db.add(patient)
    db.commit()

    payload_stop = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "wamid_stop_001",
                                    "from": "919222222222",
                                    "type": "text",
                                    "text": {"body": "STOP"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }

    res_stop = asyncio.run(wa_svc.process_webhook_payload(payload_stop, db))
    db.refresh(patient)
    assert patient.whatsapp_reminders_enabled is False, "STOP command did not disable whatsapp_reminders_enabled!"
    assert patient.auto_reminders_enabled is False, "STOP command did not disable auto_reminders_enabled!"
    print("  [PASS] ERR-018: Inbound STOP correctly withdraws WhatsApp consent")

    # Inbound START to re-subscribe
    payload_start = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "wamid_start_001",
                                    "from": "919222222222",
                                    "type": "text",
                                    "text": {"body": "START"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    res_start = asyncio.run(wa_svc.process_webhook_payload(payload_start, db))
    db.refresh(patient)
    assert patient.whatsapp_reminders_enabled is True, "START command did not restore whatsapp_reminders_enabled!"
    assert patient.auto_reminders_enabled is True, "START command did not restore auto_reminders_enabled!"
    print("  [PASS] ERR-018: Inbound START successfully re-enables WhatsApp reminders")
    db.close()


def test_err_019_telephony_safety_killswitch_allowlist_cooldown():
    """ERR-019: Telephony respects kill switch, allowlist, consent, and 60-second cooldown."""
    engine, TestingSessionLocal = create_test_db()
    db = TestingSessionLocal()

    patient = Patient(
        id="pat_safety",
        phone="919333333333",
        name="Safety Patient",
        call_reminders_enabled=True,
    )
    db.add(patient)
    db.commit()

    report = Report(
        id=501,
        patient_id=patient.id,
        confirmed=True,
        follow_up_date="2026-11-01",
    )
    db.add(report)
    db.commit()

    # 1. Kill Switch
    settings.outbound_dispatch_enabled = False
    res_kill = asyncio.run(tel_svc.dispatch_doctor_followup_call(db, patient, report, force=True))
    assert res_kill["status"] == "blocked"
    assert res_kill["reason"] == "outbound_dispatch_disabled_by_killswitch"
    settings.outbound_dispatch_enabled = True
    print("  [PASS] ERR-019: Server killswitch blocks outbound voice calls")

    # 2. Allowlist
    settings.outbound_phone_allowlist = "+919444444444"  # different from patient.phone
    res_allow = asyncio.run(tel_svc.dispatch_doctor_followup_call(db, patient, report, force=True))
    assert res_allow["status"] == "blocked"
    assert res_allow["reason"] == "destination_phone_not_in_allowlist"
    settings.outbound_phone_allowlist = ""  # reset
    print("  [PASS] ERR-019: Destination allowlist enforces recipient restriction")

    # 3. Patient Consent Gate
    patient.call_reminders_enabled = False
    db.commit()
    res_consent = asyncio.run(tel_svc.dispatch_doctor_followup_call(db, patient, report, force=True))
    assert res_consent["status"] == "skipped"
    assert res_consent["reason"] == "call_reminders_disabled_by_patient"
    patient.call_reminders_enabled = True
    db.commit()
    print("  [PASS] ERR-019: Patient consent rejection respected")

    # 4. Successful Dispatch & 60s Cooldown
    res_success = asyncio.run(tel_svc.dispatch_doctor_followup_call(db, patient, report, force=True))
    assert res_success["status"] == "simulated", f"Expected 'simulated', got {res_success['status']}"
    assert report.last_call_at is not None

    # Immediate second call -> must trigger 60s cooldown
    res_cooldown = asyncio.run(tel_svc.dispatch_doctor_followup_call(db, patient, report, force=True))
    assert res_cooldown["status"] == "rate_limited"
    assert res_cooldown["reason"] == "call_cooldown_active_60s"
    print("  [PASS] ERR-019: 60-second cooldown prevents repeated immediate dialing")
    db.close()


def test_err_020_truthful_status_and_report_scoping():
    """ERR-020: Report 2 status endpoint must never display Report 1's call logs."""
    engine, TestingSessionLocal = create_test_db()
    db = TestingSessionLocal()

    patient = Patient(id="pat_scope", phone="919555555555", name="Scope Patient", call_reminders_enabled=True)
    db.add(patient)
    db.commit()

    rep1 = Report(id=601, patient_id=patient.id, confirmed=True, follow_up_date="2026-11-01")
    rep2 = Report(id=602, patient_id=patient.id, confirmed=True, follow_up_date="2026-11-05")
    db.add_all([rep1, rep2])
    db.commit()

    # Dispatch call for Report 1
    asyncio.run(tel_svc.dispatch_doctor_followup_call(db, patient, rep1, force=True))

    # Check logs for Report 1 vs Report 2 using main.py query pattern
    rep1_logs = (
        db.query(ReminderLog)
        .filter(
            ReminderLog.patient_id == patient.id,
            ReminderLog.channel == "voice",
            ReminderLog.kind == "followup",
            ReminderLog.body.like(f"%(report #{rep1.id},%"),
        )
        .all()
    )
    rep2_logs = (
        db.query(ReminderLog)
        .filter(
            ReminderLog.patient_id == patient.id,
            ReminderLog.channel == "voice",
            ReminderLog.kind == "followup",
            ReminderLog.body.like(f"%(report #{rep2.id},%"),
        )
        .all()
    )

    assert len(rep1_logs) == 1, "Report 1 call log was not found"
    assert len(rep2_logs) == 0, "Report 2 should have 0 call logs, but Report 1's logs leaked!"
    print("  [PASS] ERR-020: Call history strictly scoped to report ID")
    db.close()


def test_err_029_reschedule_tool_truthful_wording():
    """ERR-029: Voice reschedule tool does not claim false clinic notification."""
    import subprocess

    venv_dir = Path(root_dir) / "agent" / ".venv"
    agent_python = venv_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    script = (
        "import asyncio\n"
        "import voice\n"
        "class MockClient:\n"
        "    async def request_reschedule(self, r_id, pref, reason):\n"
        "        return {'status': 'rescheduled'}\n"
        "assistant = voice.DoctorFollowupAssistant(client=MockClient(), call_meta={'report_id': 999})\n"
        "res = asyncio.run(assistant.reschedule_appointment(None, 'Tomorrow at 4 PM', 'Work'))\n"
        "assert 'clinic has been notified' not in res.lower(), f'Falsely claims notification: {res}'\n"
        "assert 'not yet confirmed' in res.lower(), f'Does not clarify pending confirmation: {res}'\n"
        "print('VERIFIED_TRUTHFUL')\n"
    )
    proc = subprocess.run(
        [str(agent_python), "-c", script],
        capture_output=True,
        text=True,
        cwd=str(Path(root_dir) / "agent"),
    )
    assert "VERIFIED_TRUTHFUL" in proc.stdout, (
        f"ERR-029 verification failed:\nSTDOUT: {proc.stdout}\nSTDERR: {proc.stderr}"
    )
    print("  [PASS] ERR-029: Voice reschedule tool response is truthful")


if __name__ == "__main__":
    print("\n--- Running Batch 4 Safety & Scoping Regression Suite ---")
    test_err_002_cross_patient_trigger_isolation()
    test_err_008_nlp_negation_before_positive_and_deduplication()
    test_err_009_webhook_signature_security()
    test_err_018_whatsapp_stop_opt_out_and_start()
    test_err_019_telephony_safety_killswitch_allowlist_cooldown()
    test_err_020_truthful_status_and_report_scoping()
    test_err_029_reschedule_tool_truthful_wording()
    print("\n[ALL BATCH 4 TESTS PASSED SUCCESSFULLY!]")
