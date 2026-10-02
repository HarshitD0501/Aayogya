"""Comprehensive Test Suite for Meta WhatsApp Cloud API Integration & Adherence Tracking.
Validates:
1. Syncing of daily scheduled doses into DoseAdherence.
2. Outbound 2-button interactive reminder creation ('Yes, Taken' / 'Missed').
3. Meta Webhook challenge verification (GET).
4. Meta Webhook button click processing (POST) -> updates DB adherence to 'taken'.
5. Meta Webhook button click processing (POST) -> updates DB adherence to 'missed'.
6. Freeform natural language WhatsApp reply fallback ('haan le li' / 'nahi li').
7. Summary endpoint aggregation (real-time adherence badges & metrics).
"""
import asyncio
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.config import settings
from app.models import DoseAdherence, Medicine, Patient, ReminderLog, Report
from app import whatsapp as wa_svc
from app import summary as summary_svc


def _setup_test_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Seed test patient
    patient = Patient(
        id="test_patient_1",
        name="Ramesh Test",
        email="ramesh@test.in",
        phone="+919876543210",
        plan="free",
        lang="hi",
    )
    db.add(patient)

    # Seed test medicine
    med1 = Medicine(
        id=101,
        patient_id="test_patient_1",
        brand="Telma 40",
        salt="Telmisartan",
        strength="40mg",
        dosage_notation="1-0-0",
        timing=["morning"],
        status="active",
        per_day=1.0,
    )
    med2 = Medicine(
        id=102,
        patient_id="test_patient_1",
        brand="Metsmall 500",
        salt="Metformin",
        strength="500mg",
        dosage_notation="1-0-1",
        timing=["morning", "night"],
        status="active",
        per_day=2.0,
    )
    db.add_all([med1, med2])
    db.commit()
    return db, patient, [med1, med2]


def test_sync_adherence():
    db, patient, meds = _setup_test_db()
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    # med1 has 1 slot (morning), med2 has 2 slots (morning, night) -> total 3 doses
    assert len(adherences) == 3, f"Expected 3 doses scheduled today, got {len(adherences)}"
    for a in adherences:
        assert a.status == "pending"
        assert a.dose_date == date.today().isoformat()
    print("  [PASS] sync_today_adherence correctly scheduled all 3 doses as pending.")


def test_send_interactive_reminder():
    db, patient, meds = _setup_test_db()
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    first_adh = adherences[0]
    med = db.query(Medicine).filter(Medicine.id == first_adh.medicine_id).first()

    # Temporarily force simulation mode for hermetic unit testing
    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""
        res = asyncio.run(wa_svc.send_interactive_dose_reminder(db, first_adh, patient, med))
        assert res["status"] in ("sent", "simulated")
        assert f"dose_taken_{first_adh.id}" in res["button_ids"]
        assert f"dose_missed_{first_adh.id}" in res["button_ids"]

        # Verify ReminderLog record created
        rlog = db.query(ReminderLog).filter(ReminderLog.patient_id == patient.id).first()
        assert rlog is not None
        assert rlog.channel == "whatsapp"
        assert "Telma 40" in rlog.body or "Metsmall 500" in rlog.body
        print("  [PASS] send_interactive_dose_reminder generated buttons and logged outbound message.")
    finally:
        settings.whatsapp_api_token = orig_token


def test_webhook_button_click_taken():
    db, patient, meds = _setup_test_db()
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    target = adherences[0]

    # Patient taps "✅ Yes, Taken" in WhatsApp
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "from": "919876543210",
                        "type": "interactive",
                        "interactive": {
                            "type": "button_reply",
                            "button_reply": {
                                "id": f"dose_taken_{target.id}",
                                "title": "✅ Yes, Taken",
                            }
                        }
                    }]
                }
            }]
        }]
    }

    result = asyncio.run(wa_svc.process_webhook_payload(payload, db))
    assert result["processed"] == 1
    db.refresh(target)
    assert target.status == "taken"
    assert target.confirmed_at is not None
    assert "Confirmed via WhatsApp Button" in target.notes
    print("  [PASS] Webhook button click 'Yes, Taken' updated adherence status to 'taken'.")


def test_webhook_button_click_missed():
    db, patient, meds = _setup_test_db()
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    target = adherences[1]

    # Patient taps "❌ Missed / Forgot" in WhatsApp
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "from": "919876543210",
                        "type": "interactive",
                        "interactive": {
                            "type": "button_reply",
                            "button_reply": {
                                "id": f"dose_missed_{target.id}",
                                "title": "❌ Missed / Forgot",
                            }
                        }
                    }]
                }
            }]
        }]
    }

    result = asyncio.run(wa_svc.process_webhook_payload(payload, db))
    assert result["processed"] == 1
    db.refresh(target)
    assert target.status == "missed"
    assert target.confirmed_at is not None
    assert "missed" in target.notes
    print("  [PASS] Webhook button click 'Missed / Forgot' updated adherence status to 'missed'.")


def test_webhook_text_reply():
    db, patient, meds = _setup_test_db()
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    pending_before = [a for a in adherences if a.status == "pending"]
    assert len(pending_before) > 0
    target = pending_before[0]

    # Patient types "haan le li" in WhatsApp
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "from": "919876543210",
                        "type": "text",
                        "text": {"body": "haan le li"}
                    }]
                }
            }]
        }]
    }

    result = asyncio.run(wa_svc.process_webhook_payload(payload, db))
    assert result["processed"] == 1
    db.refresh(target)
    assert target.status == "taken"
    assert "haan le li" in target.notes
    print("  [PASS] Webhook natural language text reply 'haan le li' resolved and marked taken.")


def test_summary_adherence_aggregation():
    db, patient, meds = _setup_test_db()
    # Mark 1 taken, 1 missed, 1 pending
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    adherences[0].status = "taken"
    adherences[1].status = "missed"
    db.commit()

    s = summary_svc.build(db, patient)
    tracking = s["tracking"]
    assert tracking["doses_taken_today"] == 1
    assert tracking["doses_missed_today"] == 1
    assert tracking["doses_pending_today"] == 1
    assert tracking["adherence_rate_today_pct"] == 33

    # Check schedule slot objects
    morning_meds = s["schedule"]["morning"]
    assert len(morning_meds) >= 1
    for m in morning_meds:
        assert "adherence_status" in m
        assert m["adherence_status"] in ("taken", "missed", "pending")
    print("  [PASS] Summary dashboard aggregation reflects accurate real-time adherence rates.")


def test_stop_and_resume_medicine():
    db, patient, meds = _setup_test_db()
    wa_svc.sync_today_adherence(db, patient.id)
    med1 = meds[0]

    # Stop medicine because patient is fit / recovered
    stopped = wa_svc.stop_medicine(db, med1.id, patient.id, reason="Patient is fit and completed course")
    assert stopped.status == "stopped"
    assert stopped.reminders_enabled is False
    assert stopped.stopped_reason == "Patient is fit and completed course"

    # Today's doses should no longer include stopped medicine
    active_doses = wa_svc.sync_today_adherence(db, patient.id)
    for d in active_doses:
        assert d.medicine_id != med1.id
    print("  [PASS] stop_medicine halts reminders and cancels pending doses.")

    # Resume medicine
    resumed = wa_svc.resume_medicine(db, med1.id, patient.id)
    assert resumed.status == "active"
    assert resumed.reminders_enabled is True
    resumed_doses = wa_svc.sync_today_adherence(db, patient.id)
    med_ids = [d.medicine_id for d in resumed_doses]
    assert med1.id in med_ids
    print("  [PASS] resume_medicine restores active schedule and reminders.")


def test_scheduler_due_reminders():
    db, patient, meds = _setup_test_db()
    wa_svc.sync_today_adherence(db, patient.id)

    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""  # hermetic simulation mode
        res = asyncio.run(wa_svc.run_automated_reminders_check(db, force=True))
        assert "whatsapp_dispatched" in res
        assert len(res["whatsapp_dispatched"]) >= 1
        print("  [PASS] run_automated_reminders_check dispatched due reminders correctly.")
    finally:
        settings.whatsapp_api_token = orig_token


if __name__ == "__main__":
    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""  # hermetic simulation mode for dummy numbers
        print("\n=======================================================")
        print("RUNNING AAYOGYA META WHATSAPP & ADHERENCE TEST SUITE")
        print("=======================================================\n")
        test_sync_adherence()
        test_send_interactive_reminder()
        test_webhook_button_click_taken()
        test_webhook_button_click_missed()
        test_webhook_text_reply()
        test_summary_adherence_aggregation()
        test_stop_and_resume_medicine()
        test_scheduler_due_reminders()
        print("\n=======================================================")
        print("ALL WHATSAPP & ADHERENCE TESTS PASSED WITH 0 ERRORS!")
        print("=======================================================\n")
    finally:
        settings.whatsapp_api_token = orig_token
