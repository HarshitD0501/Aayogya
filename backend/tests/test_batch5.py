"""Comprehensive verification suite for Batch 5: Persistent appointment and medication scheduling (ERR-016, ERR-017).

Tests:
1. Due boundary precision (±1 second).
2. Restart past due time (catch-up execution).
3. Concurrent workers & atomic lease claims (no duplicates).
4. Crashed worker lease recovery (expired lease reclaimed).
5. Opt-out between claim and dispatch (consent withdrawn before send).
6. Appointment version changes and task invalidation on reschedule.
7. Quiet hours deferral (nighttime deferral to 09:00 AM) and non-IST timezone / DST handling.
8. Two same-date reports (distinct appointments and tasks, no suppression).
9. Date-only OCR follow-ups (unconfirmed until exact time is supplied).
10. Server outbound killswitch (task safely deferred, no provider dispatch).
"""
import asyncio
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.db import Base
from app.models import Appointment, Patient, ReminderLog, ReminderTask, Report
from app import scheduler as scheduler_svc
from app import telephony as telephony_svc


def _setup_test_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    patient = Patient(
        id="pt_batch5_1",
        name="Sunita Sharma",
        email="sunita@example.com",
        phone="+919876543210",
        plan="free",
        lang="hi",
        timezone="Asia/Kolkata",
        call_reminders_enabled=True,
        whatsapp_reminders_enabled=True,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return db, patient, Session


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def test_due_boundary_precision():
    """Test due boundary ±1 second: task is NOT claimed 1s before due time, IS claimed at exact due time."""
    db, patient, _ = _setup_test_db()

    # Appointment at 2026-11-01 10:00:00 UTC (15:30 IST, daylight hours)
    appt_dt = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    appt, task = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
        offset_minutes=2880,  # 48 hours -> reminder due at 2026-10-30 10:00:00 UTC
    )
    assert task is not None
    due_utc = _as_utc(task.reminder_at_utc)
    assert due_utc == datetime(2026, 10, 30, 10, 0, 0, tzinfo=timezone.utc)

    # 1. Check 1 second before due time -> NOT claimed
    before_1s = due_utc - timedelta(seconds=1)
    claimed_early = scheduler_svc.claim_due_tasks(db, as_of_utc=before_1s)
    assert len(claimed_early) == 0, "Task must NOT be claimed before due instant"

    # 2. Check at exact due time -> Claimed
    claimed_exact = scheduler_svc.claim_due_tasks(db, as_of_utc=due_utc)
    assert len(claimed_exact) == 1, "Task MUST be claimed at exact due instant"
    assert claimed_exact[0].id == task.id
    assert claimed_exact[0].state == "claimed"
    assert claimed_exact[0].lease_until is not None

    print("  [PASS] Due boundary precision ±1 second verified.")


def test_restart_past_due_time_catchup():
    """Test restart past due time: overdue task is picked up for catch-up execution."""
    db, patient, _ = _setup_test_db()

    # Appointment due 48h before: reminder was due at 08:00 UTC
    past_due_utc = datetime(2026, 10, 20, 8, 0, 0, tzinfo=timezone.utc)
    appt_dt = past_due_utc + timedelta(minutes=2880)

    report = Report(
        id=501,
        patient_id=patient.id,
        prescriber_name="Dr. Gupta",
        follow_up_date=appt_dt.date().isoformat(),
        confirmed=True,
    )
    db.add(report)
    db.commit()

    appt, task = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        report_id=report.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
        offset_minutes=2880,
    )

    # Simulate server restarting 2 hours past due time
    restart_time = past_due_utc + timedelta(hours=2)
    claimed = scheduler_svc.claim_due_tasks(db, as_of_utc=restart_time)
    assert len(claimed) == 1
    assert claimed[0].id == task.id

    # Process task and verify truthful dispatch
    orig_token = settings.whatsapp_api_token
    try:
        settings.whatsapp_api_token = ""
        res = asyncio.run(scheduler_svc.process_reminder_task(db, claimed[0], as_of_utc=restart_time))
        assert res["status"] in ("dispatched", "simulated", "call_placed")
        db.refresh(task)
        assert task.state == "dispatched"
        assert task.lease_until is None
    finally:
        settings.whatsapp_api_token = orig_token

    print("  [PASS] Catch-up execution past due time verified.")


def test_concurrent_workers_and_atomic_lease():
    """Test that two concurrent workers cannot claim or process the same task."""
    db1, patient, SessionFactory = _setup_test_db()
    db2 = SessionFactory()

    appt_dt = datetime(2026, 11, 2, 10, 0, 0, tzinfo=timezone.utc)
    appt, task = scheduler_svc.schedule_appointment(
        db=db1,
        patient_id=patient.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
        offset_minutes=2880,
    )

    due_utc = _as_utc(task.reminder_at_utc)

    # Worker 1 claims task
    claimed_w1 = scheduler_svc.claim_due_tasks(db1, batch_size=10, lease_seconds=60, as_of_utc=due_utc)
    assert len(claimed_w1) == 1
    assert claimed_w1[0].state == "claimed"

    # Worker 2 simultaneously queries for due tasks with active lease
    claimed_w2 = scheduler_svc.claim_due_tasks(db2, batch_size=10, lease_seconds=60, as_of_utc=due_utc)
    assert len(claimed_w2) == 0, "Worker 2 MUST NOT claim task while Worker 1 holds active lease"

    print("  [PASS] Concurrent worker atomic lease claiming verified; zero duplicate claims.")


def test_crashed_worker_lease_recovery():
    """Test that an expired lease from a crashed worker is reclaimed by another worker."""
    db1, patient, SessionFactory = _setup_test_db()
    db2 = SessionFactory()

    appt_dt = datetime(2026, 11, 2, 10, 0, 0, tzinfo=timezone.utc)
    appt, task = scheduler_svc.schedule_appointment(
        db=db1,
        patient_id=patient.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
        offset_minutes=2880,
    )
    due_utc = _as_utc(task.reminder_at_utc)

    # Worker 1 claims with 30-second lease, then 'crashes' (does nothing further)
    claimed_w1 = scheduler_svc.claim_due_tasks(db1, batch_size=10, lease_seconds=30, as_of_utc=due_utc)
    assert len(claimed_w1) == 1
    assert claimed_w1[0].attempts == 1

    # At 20s (lease still active), Worker 2 sees nothing
    claimed_early = scheduler_svc.claim_due_tasks(db2, as_of_utc=due_utc + timedelta(seconds=20))
    assert len(claimed_early) == 0

    # At 35s (lease expired), Worker 2 successfully reclaims the task
    claimed_w2 = scheduler_svc.claim_due_tasks(db2, as_of_utc=due_utc + timedelta(seconds=35))
    assert len(claimed_w2) == 1
    assert claimed_w2[0].id == task.id
    assert claimed_w2[0].attempts == 2, "Attempts counter must be incremented upon reclaim"

    print("  [PASS] Crashed worker lease recovery verified.")


def test_opt_out_between_claim_and_dispatch():
    """Test opt-out race: if patient withdraws consent after claim but before dispatch, call is cancelled."""
    db, patient, _ = _setup_test_db()

    appt_dt = datetime(2026, 11, 3, 10, 0, 0, tzinfo=timezone.utc)
    report = Report(
        id=502,
        patient_id=patient.id,
        prescriber_name="Dr. Verma",
        follow_up_date=appt_dt.date().isoformat(),
        confirmed=True,
    )
    db.add(report)
    db.commit()

    appt, task = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        report_id=report.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
        offset_minutes=2880,
    )
    due_utc = _as_utc(task.reminder_at_utc)

    # Worker claims task
    claimed = scheduler_svc.claim_due_tasks(db, as_of_utc=due_utc)
    assert len(claimed) == 1

    # Patient opts out right after task was claimed!
    patient.call_reminders_enabled = False
    patient.call_consent_withdrawn_at = datetime.now(timezone.utc)
    db.commit()

    # Worker attempts dispatch -> must verify consent at dispatch time and abort!
    res = asyncio.run(scheduler_svc.process_reminder_task(db, claimed[0], as_of_utc=due_utc))
    assert res["status"] == "cancelled"
    assert "consent" in res["reason"]

    db.refresh(task)
    assert task.state == "cancelled"
    assert "consent" in task.last_error.lower()

    print("  [PASS] Opt-out between claim and dispatch verified: aborted before provider contact.")


def test_appointment_versioning_and_reschedule():
    """Test appointment versioning: reschedule increments version, cancels old tasks, schedules new task."""
    db, patient, _ = _setup_test_db()

    # Original appointment on 2026-11-05 10:00 UTC (version 1)
    appt_dt_v1 = datetime(2026, 11, 5, 10, 0, 0, tzinfo=timezone.utc)
    report = Report(
        id=503,
        patient_id=patient.id,
        prescriber_name="Dr. Sen",
        follow_up_date=appt_dt_v1.date().isoformat(),
        confirmed=True,
    )
    db.add(report)
    db.commit()

    appt, task_v1 = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        report_id=report.id,
        appointment_at_utc=appt_dt_v1,
        timezone_str="Asia/Kolkata",
    )
    assert appt.version == 1
    assert task_v1.idempotency_key == f"appt_{appt.id}_v1_voice_2880"
    assert task_v1.state == "pending"

    # Reschedule appointment to 2026-11-10 11:00 UTC
    appt_dt_v2 = datetime(2026, 11, 10, 11, 0, 0, tzinfo=timezone.utc)
    updated_appt, task_v2 = scheduler_svc.reschedule_appointment(
        db=db,
        appointment_id=appt.id,
        new_appointment_at_utc=appt_dt_v2,
        reason="Patient traveling",
        preferred_date_str="2026-11-10 04:30 PM",
    )

    assert updated_appt.version == 2
    assert updated_appt.state == "scheduled"
    assert updated_appt.confirmed_source == "rescheduled"

    # Verify task v1 was cancelled
    db.refresh(task_v1)
    assert task_v1.state == "cancelled"
    assert "version 2" in task_v1.last_error

    # Verify task v2 was created
    assert task_v2.idempotency_key == f"appt_{appt.id}_v2_voice_2880"
    assert task_v2.state == "pending"
    assert _as_utc(task_v2.reminder_at_utc) == appt_dt_v2 - timedelta(minutes=2880)

    # When v1 due time arrives, worker claims 0 tasks
    claimed_v1 = scheduler_svc.claim_due_tasks(db, as_of_utc=_as_utc(task_v1.reminder_at_utc))
    assert len(claimed_v1) == 0, "Cancelled v1 task must never be claimed"

    # When v2 due time arrives, worker claims exactly v2 task
    claimed_v2 = scheduler_svc.claim_due_tasks(db, as_of_utc=_as_utc(task_v2.reminder_at_utc))
    assert len(claimed_v2) == 1
    assert claimed_v2[0].id == task_v2.id

    print("  [PASS] Appointment versioning and task invalidation on reschedule verified.")


def test_quiet_hours_and_dst_handling():
    """Test quiet hours deferral (09:00 - 20:00 local time) and non-IST timezones with DST."""
    ist_tz = ZoneInfo("Asia/Kolkata")

    # Case 1: Target reminder lands at 23:00 IST (11:00 PM - night)
    # Appointment at 23:00 IST on 2026-11-04 -> 48h prior is 23:00 IST on 2026-11-02
    appt_local_night = datetime(2026, 11, 4, 23, 0, 0, tzinfo=ist_tz)
    appt_utc_night = appt_local_night.astimezone(timezone.utc)

    rem_utc, deferred, note = scheduler_svc.compute_reminder_time(
        appointment_at_utc=appt_utc_night,
        tz_name="Asia/Kolkata",
        offset_minutes=2880,
    )
    rem_local = rem_utc.astimezone(ist_tz)
    assert deferred is True
    assert rem_local.hour == 9
    assert rem_local.minute == 0
    assert rem_local.date() == date(2026, 11, 3), "Deferred from 23:00 on Nov 2 to 09:00 on Nov 3"
    assert "deferred_due_to_quiet_hours" in note

    # Case 2: Target reminder lands at 05:00 AM IST (early morning - night)
    appt_local_early = datetime(2026, 11, 4, 5, 0, 0, tzinfo=ist_tz)
    appt_utc_early = appt_local_early.astimezone(timezone.utc)

    rem_utc2, deferred2, note2 = scheduler_svc.compute_reminder_time(
        appointment_at_utc=appt_utc_early,
        tz_name="Asia/Kolkata",
        offset_minutes=2880,
    )
    rem_local2 = rem_utc2.astimezone(ist_tz)
    assert deferred2 is True
    assert rem_local2.hour == 9
    assert rem_local2.minute == 0
    assert rem_local2.date() == date(2026, 11, 2), "Deferred from 05:00 on Nov 2 to 09:00 on Nov 2"

    # Case 3: Target reminder lands at 14:00 IST (2:00 PM - daytime permitted)
    appt_local_day = datetime(2026, 11, 4, 14, 0, 0, tzinfo=ist_tz)
    appt_utc_day = appt_local_day.astimezone(timezone.utc)

    rem_utc3, deferred3, note3 = scheduler_svc.compute_reminder_time(
        appointment_at_utc=appt_utc_day,
        tz_name="Asia/Kolkata",
        offset_minutes=2880,
    )
    assert deferred3 is False
    assert rem_utc3 == appt_utc_day - timedelta(minutes=2880)

    # Case 4: Non-IST timezone with DST: America/New_York
    # Test during EDT (UTC-4)
    ny_tz = ZoneInfo("America/New_York")
    appt_ny = datetime(2026, 10, 15, 14, 0, 0, tzinfo=ny_tz)  # 2 PM NY time
    appt_ny_utc = appt_ny.astimezone(timezone.utc)

    rem_ny_utc, deferred_ny, _ = scheduler_svc.compute_reminder_time(
        appointment_at_utc=appt_ny_utc,
        tz_name="America/New_York",
        offset_minutes=2880,
    )
    rem_ny_local = rem_ny_utc.astimezone(ny_tz)
    assert deferred_ny is False
    assert rem_ny_local.hour == 14

    print("  [PASS] Quiet hours deferral and non-IST timezone / DST handling verified.")


def test_two_same_date_reports_isolated_tasks():
    """Test two same-date reports: distinct appointments and tasks generated, no suppression or collision."""
    db, patient, _ = _setup_test_db()

    # Report 1
    rep1 = Report(
        id=601,
        patient_id=patient.id,
        prescriber_name="Dr. Mehta",
        follow_up_date="2026-11-20",
        confirmed=True,
    )
    # Report 2 (same patient, same follow up date!)
    rep2 = Report(
        id=602,
        patient_id=patient.id,
        prescriber_name="Dr. Kapoor",
        follow_up_date="2026-11-20",
        confirmed=True,
    )
    db.add_all([rep1, rep2])
    db.commit()

    # Create appointments for both reports
    appt_dt = datetime(2026, 11, 20, 10, 0, 0, tzinfo=timezone.utc)
    appt1, task1 = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        report_id=rep1.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
    )
    appt2, task2 = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        report_id=rep2.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
    )

    assert appt1.id != appt2.id
    assert task1.id != task2.id
    assert task1.idempotency_key != task2.idempotency_key
    assert task1.idempotency_key == f"appt_{appt1.id}_v1_voice_2880"
    assert task2.idempotency_key == f"appt_{appt2.id}_v1_voice_2880"

    # Claim due tasks -> both must be claimed independently without collision!
    claimed = scheduler_svc.claim_due_tasks(db, batch_size=10, as_of_utc=_as_utc(task1.reminder_at_utc))
    assert len(claimed) == 2, "Both tasks MUST be claimed independently without collision"

    print("  [PASS] Two same-date reports have isolated appointments and tasks; no suppression.")


def test_date_only_ocr_followup_unconfirmed():
    """Test that date-only OCR follow-ups are marked date_only_pending_time without active tasks (ERR-016)."""
    db, patient, _ = _setup_test_db()

    rep = Report(
        id=701,
        patient_id=patient.id,
        prescriber_name="Dr. Joshi",
        follow_up_date="2026-11-25",  # Date only, no time
        confirmed=False,
    )
    db.add(rep)
    db.commit()

    # Sync from report
    appt = scheduler_svc.sync_appointment_from_report(db, patient, rep)
    assert appt is not None
    assert appt.confirmed_source == "date_only_pending_time"
    assert appt.state == "pending_time"

    # Verify no active reminder tasks were created for date-only pending time
    tasks = db.query(ReminderTask).filter(ReminderTask.appointment_id == appt.id).all()
    assert len(tasks) == 0, "No active reminder task should be created while appointment time is pending"

    # Confirm appointment with exact time
    confirmed_dt = datetime(2026, 11, 25, 11, 30, 0, tzinfo=timezone.utc)
    appt_confirmed, task = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        report_id=rep.id,
        appointment_at_utc=confirmed_dt,
        timezone_str="Asia/Kolkata",
        confirmed_source="prescription_reviewed",
    )
    assert appt_confirmed.state == "scheduled"
    assert appt_confirmed.confirmed_source == "prescription_reviewed"
    assert task is not None
    assert task.state in ("pending", "deferred")

    print("  [PASS] Date-only OCR follow-up unconfirmed status and subsequent confirmation verified.")


def test_server_killswitch_deferral():
    """Test server outbound killswitch: task is safely deferred without provider call (ERR-019)."""
    db, patient, _ = _setup_test_db()

    appt_dt = datetime(2026, 11, 30, 10, 0, 0, tzinfo=timezone.utc)
    report = Report(
        id=801,
        patient_id=patient.id,
        prescriber_name="Dr. Gill",
        follow_up_date=appt_dt.date().isoformat(),
        confirmed=True,
    )
    db.add(report)
    db.commit()

    appt, task = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        report_id=report.id,
        appointment_at_utc=appt_dt,
        timezone_str="Asia/Kolkata",
    )
    due_utc = _as_utc(task.reminder_at_utc)

    claimed = scheduler_svc.claim_due_tasks(db, as_of_utc=due_utc)
    assert len(claimed) == 1

    # Activate server killswitch
    orig_killswitch = settings.outbound_dispatch_enabled
    try:
        settings.outbound_dispatch_enabled = False
        res = asyncio.run(scheduler_svc.process_reminder_task(db, claimed[0], as_of_utc=due_utc))
        assert res["status"] == "deferred"
        assert "killswitch" in res["reason"]

        db.refresh(task)
        assert task.state == "deferred"
        assert task.lease_until is None
        assert "killswitch" in task.last_error
    finally:
        settings.outbound_dispatch_enabled = orig_killswitch

    print("  [PASS] Server outbound killswitch deferral verified.")


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING BATCH 5 PERSISTENT SCHEDULING TEST SUITE")
    print("=======================================================\n")
    test_due_boundary_precision()
    test_restart_past_due_time_catchup()
    test_concurrent_workers_and_atomic_lease()
    test_crashed_worker_lease_recovery()
    test_opt_out_between_claim_and_dispatch()
    test_appointment_versioning_and_reschedule()
    test_quiet_hours_and_dst_handling()
    test_two_same_date_reports_isolated_tasks()
    test_date_only_ocr_followup_unconfirmed()
    test_server_killswitch_deferral()
    print("\n=======================================================")
    print("ALL BATCH 5 TESTS PASSED WITH 0 ERRORS!")
    print("=======================================================\n")
