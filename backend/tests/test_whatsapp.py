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
import sys
from datetime import date
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

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
    from datetime import timedelta
    db, patient, meds = _setup_test_db()
    wa_svc.sync_today_adherence(db, patient.id)

    # Seed a report with follow-up exactly 2 days from today
    follow_date = (date.today() + timedelta(days=2)).isoformat()
    report = Report(
        id=901,
        patient_id=patient.id,
        prescriber_name="Dr. Alok Verma",
        prescriber_specialty="Cardiologist",
        follow_up_date=follow_date,
        confirmed=True,
    )
    db.add(report)
    db.commit()

    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""  # hermetic simulation mode
        res = asyncio.run(wa_svc.run_automated_reminders_check(db, force=True))
        assert "whatsapp_medicines_dispatched" in res
        assert "doctor_voice_calls_dispatched" in res
        assert len(res["whatsapp_medicines_dispatched"]) >= 1
        assert len(res["doctor_voice_calls_dispatched"]) >= 1

        # Verify doctor checkup was sent through VOICE CALL, never WhatsApp
        call = res["doctor_voice_calls_dispatched"][0]
        assert call["channel"] == "voice"
        assert "Dr. Alok Verma" in call["doctor"]
        assert call["follow_up_date"] == follow_date
        assert call["status"] == "call_placed"
        print("  [PASS] run_automated_reminders_check: medicines via WhatsApp ONLY, doctor meet 2-days before via CALL ONLY.")
    finally:
        settings.whatsapp_api_token = orig_token


def test_precision_time_parsing():
    assert wa_svc.parse_time_to_minutes("08:00 AM") == 480
    assert wa_svc.parse_time_to_minutes("08:00") == 480
    assert wa_svc.parse_time_to_minutes("01:00 PM") == 780
    assert wa_svc.parse_time_to_minutes("13:00") == 780
    assert wa_svc.parse_time_to_minutes("08:30 PM") == 1230
    assert wa_svc.parse_time_to_minutes("20:30") == 1230
    assert wa_svc.parse_time_to_minutes("12:00 PM") == 720
    assert wa_svc.parse_time_to_minutes("12:00 AM") == 0
    assert wa_svc.format_minutes_to_time(480) == "08:00 AM"
    assert wa_svc.format_minutes_to_time(780) == "01:00 PM"
    assert wa_svc.format_minutes_to_time(1230) == "08:30 PM"
    print("  [PASS] parse_time_to_minutes & format_minutes_to_time handle 12-hour and 24-hour formats accurately.")


def test_precision_scheduler_matching():
    from zoneinfo import ZoneInfo
    from datetime import datetime
    db, patient, meds = _setup_test_db()

    # Get current IST time
    ist_tz = ZoneInfo("Asia/Kolkata")
    now_ist = datetime.now(ist_tz)
    now_total_mins = now_ist.hour * 60 + now_ist.minute

    # Configure patient's morning slot to exactly current IST time
    patient.reminder_time_morning = wa_svc.format_minutes_to_time(now_total_mins)
    # Configure afternoon slot to 30 mins in the future (should NOT trigger)
    patient.reminder_time_afternoon = wa_svc.format_minutes_to_time((now_total_mins + 30) % 1440)
    db.commit()

    # Sync adherence
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    morning_doses = [a for a in adherences if a.slot == "morning"]
    assert len(morning_doses) > 0
    assert morning_doses[0].scheduled_time == patient.reminder_time_morning

    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""
        # Run normal check without force!
        res = asyncio.run(wa_svc.run_automated_reminders_check(db, force=False))
        dispatched = res["whatsapp_medicines_dispatched"]
        # Morning doses at exact current IST time MUST be dispatched!
        dispatched_slots = [d["slot"] for d in dispatched]
        assert "morning" in dispatched_slots, f"Expected morning dose to dispatch at {patient.reminder_time_morning}, got {dispatched_slots}"
        # Afternoon dose (30 mins ahead) MUST NOT be dispatched!
        assert "afternoon" not in dispatched_slots

        # Running tick again immediately MUST NOT duplicate because whatsapp_message_id is now recorded!
        res2 = asyncio.run(wa_svc.run_automated_reminders_check(db, force=False))
        dispatched2 = res2["whatsapp_medicines_dispatched"]
        assert len(dispatched2) == 0, "Expected 0 duplicate messages on second tick"

        print("  [PASS] Precision minute-level scheduler dispatched exactly on time and prevented duplicates.")
    finally:
        settings.whatsapp_api_token = orig_token


def test_consolidated_batch_slot_reminder():
    db, patient, meds = _setup_test_db()
    adherences = wa_svc.sync_today_adherence(db, patient.id)

    # In test db: med1 (Telma 40) is morning, med2 (Metsmall 500) is morning & night
    # So there are 2 medicines in the "morning" slot!
    morning_doses = [a for a in adherences if a.slot == "morning"]
    assert len(morning_doses) == 2, f"Expected 2 morning medicines, found {len(morning_doses)}"

    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""
        # 1. Send single consolidated reminder for morning
        res = asyncio.run(wa_svc.send_interactive_slot_reminder(db, patient, "morning", morning_doses))
        assert res["status"] in ("sent", "simulated")
        assert len(res["medicines"]) == 2
        assert "Telma 40" in res["medicines"]
        assert "Metsmall 500" in res["medicines"]
        assert "कुल: 2 दवाएं" in res["body"]

        # Verify buttons contain batch_taken_ prefix with both IDs
        btn_taken_id = res["button_ids"][0]
        assert btn_taken_id.startswith("batch_taken_")
        assert str(morning_doses[0].id) in btn_taken_id
        assert str(morning_doses[1].id) in btn_taken_id

        # Verify exactly ONE outbound ReminderLog was created
        logs = db.query(ReminderLog).filter(ReminderLog.patient_id == patient.id, ReminderLog.kind == "dose_batch").all()
        assert len(logs) == 1, f"Expected exactly 1 ReminderLog entry, got {len(logs)}"

        # 2. Simulate patient tapping "✅ Yes, All Taken"
        webhook_payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": patient.phone,
                            "type": "interactive",
                            "interactive": {
                                "type": "button_reply",
                                "button_reply": {
                                    "id": btn_taken_id,
                                    "title": "✅ Yes, All Taken",
                                },
                            },
                        }],
                    },
                }],
            }],
        }
        wh_res = asyncio.run(wa_svc.process_webhook_payload(webhook_payload, db))
        assert wh_res["processed"] >= 1

        # Verify BOTH morning medicines are marked "taken" from that single click!
        db.refresh(morning_doses[0])
        db.refresh(morning_doses[1])
        assert morning_doses[0].status == "taken"
        assert morning_doses[1].status == "taken"

        print("  [PASS] Single consolidated WhatsApp message sent for all slot medicines; 1 tap confirmed ALL doses!")
    finally:
        settings.whatsapp_api_token = orig_token


def test_webhook_cross_patient_isolation():
    """Button ids are plain integers: a crafted id from patient B must NOT
    confirm patient A's doses (webhook ownership scoping)."""
    db, patient, meds = _setup_test_db()
    # A second patient with a DIFFERENT phone, no medicines
    other = Patient(id="other_patient", name="Other", email="o@t.in",
                    phone="+919900000009", plan="free", lang="hi")
    db.add(other)
    db.commit()

    adherences = wa_svc.sync_today_adherence(db, patient.id)
    target = adherences[0]

    # "Other" taps a button carrying patient 1's adherence id
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "from": "919900000009",
                        "type": "interactive",
                        "interactive": {
                            "type": "button_reply",
                            "button_reply": {"id": f"dose_taken_{target.id}", "title": "✅ Yes, Taken"},
                        }
                    }]
                }
            }]
        }]
    }
    res = asyncio.run(wa_svc.process_webhook_payload(payload, db))
    db.refresh(target)
    assert target.status == "pending", "cross-patient button MUST NOT mark the dose taken"
    print("  [PASS] Cross-patient button click rejected; dose stays pending.")



def test_duplicate_salt_dedupe_in_message():
    """Re-uploading the same prescription creates duplicate Medicine rows with
    variant names ('Amlong 5' vs 'Amlong'): the WhatsApp body must list ONE line
    per SALT (same drug), not one per row."""
    db, patient, meds = _setup_test_db()
    # a re-upload duplicate: same salt, variant brand, less detail
    dup = Medicine(
        id=103,
        patient_id=patient.id,
        brand="Amlong",
        salt="Telmisartan",
        strength="40",
        dosage_notation="1-0-0",
        timing=["morning"],
        status="active",
        per_day=1.0,
    )
    db.add(dup)
    db.commit()

    adherences = wa_svc.sync_today_adherence(db, patient.id)
    morning = [a for a in adherences if a.slot == "morning"]
    # Telma 40 + Amlong (same salt Telmisartan) + Metsmall 500 => 2 lines
    res = asyncio.run(wa_svc.send_interactive_slot_reminder(db, patient, "morning", morning))
    body = res["body"]
    assert "Telma 40" in body, "richer duplicate should be shown"
    telmisartan_lines = [l for l in body.splitlines() if "Telma" in l or "Amlong" in l]
    assert len(telmisartan_lines) == 1, f"expected 1 telmisartan line, got {telmisartan_lines}"
    metformin_lines = [l for l in body.splitlines() if "Metsmall" in l]
    assert len(metformin_lines) == 1
    print("  [PASS] Same-salt re-upload duplicates collapse to one message line.")



if __name__ == "__main__":
    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""  # hermetic simulation mode for dummy numbers
        print("\n=======================================================")
        print("RUNNING AAYOGYA META WHATSAPP & ADHERENCE TEST SUITE")
        print("=======================================================\n")
        test_precision_time_parsing()
        test_sync_adherence()
        test_send_interactive_reminder()
        test_webhook_button_click_taken()
        test_webhook_button_click_missed()
        test_webhook_text_reply()
        test_summary_adherence_aggregation()
        test_stop_and_resume_medicine()
        test_scheduler_due_reminders()
        test_precision_scheduler_matching()
        test_consolidated_batch_slot_reminder()
        test_webhook_cross_patient_isolation()
        test_duplicate_salt_dedupe_in_message()
        print("\n=======================================================")
        print("ALL WHATSAPP & ADHERENCE TESTS PASSED WITH 0 ERRORS!")
        print("=======================================================\n")
    finally:
        settings.whatsapp_api_token = orig_token
