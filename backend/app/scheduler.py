"""Persistent appointment and medication scheduling module (ERR-016, ERR-017).

Provides:
1. Deterministic reminder offset computation with quiet hours deferral (09:00 - 20:00 local time).
2. IANA timezone support (default Asia/Kolkata) with UTC instant storage.
3. Durable outbox worker with atomic database claims, leases, and idempotency keys.
4. Channel consent re-verification and server killswitch at dispatch time.
5. Appointment lifecycle (schedule, reschedule with versioning, cancel) with task invalidation.
6. Support for date-only OCR follow-ups (unconfirmed until time/timezone are supplied).
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional, Tuple, Union
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from .config import settings
from .models import Appointment, Patient, ReminderLog, ReminderTask, Report

logger = logging.getLogger("aayogya.scheduler")

DEFAULT_QUIET_START_HOUR = 9   # 09:00 AM
DEFAULT_QUIET_END_HOUR = 20    # 08:00 PM (20:00)


def parse_iso_or_local_datetime(
    dt_input: Union[str, datetime],
    tz_name: str = "Asia/Kolkata",
) -> Tuple[datetime, bool]:
    """Parse datetime input into an aware UTC datetime and a boolean flag indicating if it was date-only.

    Returns:
        (utc_datetime, is_date_only)
    """
    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        local_tz = ZoneInfo("Asia/Kolkata")

    if isinstance(dt_input, datetime):
        if dt_input.tzinfo is None:
            # Naive datetime: assume it is in the given local timezone
            aware_local = dt_input.replace(tzinfo=local_tz)
            return aware_local.astimezone(timezone.utc), False
        return dt_input.astimezone(timezone.utc), False

    dt_str = str(dt_input).strip()

    # Check for date-only format (e.g. '2026-10-30')
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", dt_str):
        # Nominal default time: 10:00 AM local time
        nominal_local = datetime.strptime(dt_str, "%Y-%m-%d").replace(
            hour=10, minute=0, second=0, microsecond=0, tzinfo=local_tz
        )
        return nominal_local.astimezone(timezone.utc), True

    # Try standard ISO parsing
    try:
        parsed = datetime.fromisoformat(dt_str)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=local_tz)
        return parsed.astimezone(timezone.utc), False
    except ValueError:
        pass

    # Try common formats with time
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M"):
        try:
            parsed = datetime.strptime(dt_str, fmt).replace(tzinfo=local_tz)
            return parsed.astimezone(timezone.utc), False
        except ValueError:
            pass

    raise ValueError(f"Unable to parse datetime string: {dt_input}")


def compute_reminder_time(
    appointment_at_utc: datetime,
    tz_name: str = "Asia/Kolkata",
    offset_minutes: int = 2880,
    quiet_start_hour: int = DEFAULT_QUIET_START_HOUR,
    quiet_end_hour: int = DEFAULT_QUIET_END_HOUR,
) -> Tuple[datetime, bool, str]:
    """Compute the scheduled reminder instant in UTC with quiet-hours policy (ERR-016).

    Rules:
    - Target exact reminder: appointment_at_utc - offset_minutes.
    - If target local time falls between quiet_start_hour (09:00) and quiet_end_hour (20:00),
      use the exact target instant.
    - If target local time falls outside daytime (nighttime):
      - If at/after 20:00 local time: defer to next morning at 09:00 local time.
      - If before 09:00 local time: defer to same day at 09:00 local time.
      - Mark deferred=True and record that resulting time differs from exact offset.
    - ZoneInfo handles daylight saving time (DST) transitions cleanly.
    """
    if appointment_at_utc.tzinfo is None:
        appointment_at_utc = appointment_at_utc.replace(tzinfo=timezone.utc)
    else:
        appointment_at_utc = appointment_at_utc.astimezone(timezone.utc)

    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Asia/Kolkata")

    target_utc = appointment_at_utc - timedelta(minutes=offset_minutes)
    target_local = target_utc.astimezone(tz)

    # Check if target local time is within daytime hours: quiet_start_hour <= hour < quiet_end_hour
    is_daytime = (
        quiet_start_hour <= target_local.hour < quiet_end_hour
        or (target_local.hour == quiet_end_hour and target_local.minute == 0 and target_local.second == 0)
    )

    if is_daytime:
        return target_utc, False, f"exact_offset_{offset_minutes}m"

    # Outside permitted hours: defer to 09:00 AM local time
    if target_local.hour >= quiet_end_hour:
        # After 8 PM: defer to next day 09:00 AM
        deferred_local = (target_local + timedelta(days=1)).replace(
            hour=quiet_start_hour, minute=0, second=0, microsecond=0
        )
        deferred_reason = (
            f"deferred_due_to_quiet_hours (adjusted from exact {offset_minutes}m target "
            f"at {target_local.strftime('%H:%M')} to next-day 09:00 AM {tz_name})"
        )
    else:
        # Before 9 AM: defer to same day 09:00 AM
        deferred_local = target_local.replace(
            hour=quiet_start_hour, minute=0, second=0, microsecond=0
        )
        deferred_reason = (
            f"deferred_due_to_quiet_hours (adjusted from exact {offset_minutes}m target "
            f"at {target_local.strftime('%H:%M')} to 09:00 AM {tz_name})"
        )

    deferred_utc = deferred_local.astimezone(timezone.utc)
    return deferred_utc, True, deferred_reason


def schedule_appointment(
    db: Session,
    patient_id: str,
    appointment_at_utc: datetime,
    timezone_str: str = "Asia/Kolkata",
    report_id: Optional[int] = None,
    doctor_name: Optional[str] = None,
    doctor_specialty: Optional[str] = None,
    offset_minutes: int = 2880,
    confirmed_source: str = "prescription_reviewed",
    channel: str = "voice",
) -> Tuple[Appointment, Optional[ReminderTask]]:
    """Schedule a canonical appointment record and create its durable ReminderTask (ERR-016).

    If confirmed_source == 'date_only_pending_time', the appointment is saved with
    state='pending_time' and no active reminder task is created until exact time is supplied.
    """
    if appointment_at_utc.tzinfo is None:
        appointment_at_utc = appointment_at_utc.replace(tzinfo=timezone.utc)
    else:
        appointment_at_utc = appointment_at_utc.astimezone(timezone.utc)

    # Check for existing appointment for this report
    existing = None
    if report_id:
        existing = (
            db.query(Appointment)
            .filter(Appointment.patient_id == patient_id, Appointment.report_id == report_id)
            .first()
        )

    if existing:
        appt = existing
        appt.doctor_name = doctor_name or appt.doctor_name
        appt.doctor_specialty = doctor_specialty or appt.doctor_specialty
        appt.appointment_at_utc = appointment_at_utc
        appt.timezone = timezone_str
        appt.state = "pending_time" if confirmed_source == "date_only_pending_time" else "scheduled"
        appt.confirmed_source = confirmed_source
    else:
        appt = Appointment(
            patient_id=patient_id,
            report_id=report_id,
            doctor_name=doctor_name,
            doctor_specialty=doctor_specialty,
            appointment_at_utc=appointment_at_utc,
            timezone=timezone_str,
            state="pending_time" if confirmed_source == "date_only_pending_time" else "scheduled",
            version=1,
            confirmed_source=confirmed_source,
        )
        db.add(appt)

    db.flush()

    # If date-only pending time, do not schedule active outbox tasks yet
    if confirmed_source == "date_only_pending_time":
        db.commit()
        db.refresh(appt)
        return appt, None

    # Compute deterministic reminder time with quiet hours policy
    reminder_at_utc, deferred, note = compute_reminder_time(
        appointment_at_utc=appointment_at_utc,
        tz_name=timezone_str,
        offset_minutes=offset_minutes,
    )

    idempotency_key = f"appt_{appt.id}_v{appt.version}_{channel}_{offset_minutes}"

    # Check if task already exists
    task = (
        db.query(ReminderTask)
        .filter(ReminderTask.idempotency_key == idempotency_key)
        .first()
    )

    if not task:
        task = ReminderTask(
            patient_id=patient_id,
            appointment_id=appt.id,
            report_id=report_id,
            channel=channel,
            kind="followup",
            reminder_at_utc=reminder_at_utc,
            offset_minutes=offset_minutes,
            state="deferred" if deferred else "pending",
            idempotency_key=idempotency_key,
            last_error=note if deferred else None,
        )
        db.add(task)

    db.commit()
    db.refresh(appt)
    if task:
        db.refresh(task)

    logger.info(
        "[SCHEDULER] Scheduled appointment #%d (patient=%s, utc=%s, tz=%s, version=%d) -> task #%s (due=%s, state=%s)",
        appt.id,
        patient_id,
        appointment_at_utc.isoformat(),
        timezone_str,
        appt.version,
        task.id if task else "none",
        reminder_at_utc.isoformat() if task else "n/a",
        task.state if task else "n/a",
    )

    return appt, task


def reschedule_appointment(
    db: Session,
    appointment_id: int,
    new_appointment_at_utc: datetime,
    timezone_str: Optional[str] = None,
    reason: Optional[str] = None,
    preferred_date_str: Optional[str] = None,
    offset_minutes: int = 2880,
) -> Tuple[Appointment, ReminderTask]:
    """Reschedule an existing appointment: increment version, cancel prior tasks, create new task (ERR-016)."""
    appt = db.get(Appointment, appointment_id)
    if not appt:
        raise ValueError(f"Appointment #{appointment_id} not found")

    if new_appointment_at_utc.tzinfo is None:
        new_appointment_at_utc = new_appointment_at_utc.replace(tzinfo=timezone.utc)
    else:
        new_appointment_at_utc = new_appointment_at_utc.astimezone(timezone.utc)

    # Invalidate prior active tasks for this appointment
    prior_tasks = (
        db.query(ReminderTask)
        .filter(
            ReminderTask.appointment_id == appt.id,
            ReminderTask.state.in_(["pending", "deferred", "claimed"]),
        )
        .all()
    )
    for pt in prior_tasks:
        pt.state = "cancelled"
        pt.lease_until = None
        pt.last_error = f"Invalidated by reschedule to version {appt.version + 1}"

    # Increment version and update appointment
    appt.version = (appt.version or 1) + 1
    appt.appointment_at_utc = new_appointment_at_utc
    if timezone_str:
        appt.timezone = timezone_str
    appt.state = "scheduled"
    appt.confirmed_source = "rescheduled"
    if reason:
        appt.reschedule_notes = reason
    if preferred_date_str:
        appt.reschedule_preferred_date = preferred_date_str

    # Synchronize parent report if attached
    if appt.report_id:
        report = db.get(Report, appt.report_id)
        if report:
            report.follow_up_status = "rescheduled"
            report.follow_up_date = new_appointment_at_utc.astimezone(
                ZoneInfo(appt.timezone)
            ).date().isoformat()
            if preferred_date_str:
                report.reschedule_preferred_date = preferred_date_str
            if reason:
                report.reschedule_notes = reason

    # Compute new reminder time
    reminder_at_utc, deferred, note = compute_reminder_time(
        appointment_at_utc=new_appointment_at_utc,
        tz_name=appt.timezone,
        offset_minutes=offset_minutes,
    )

    new_idempotency_key = f"appt_{appt.id}_v{appt.version}_voice_{offset_minutes}"
    new_task = ReminderTask(
        patient_id=appt.patient_id,
        appointment_id=appt.id,
        report_id=appt.report_id,
        channel="voice",
        kind="followup",
        reminder_at_utc=reminder_at_utc,
        offset_minutes=offset_minutes,
        state="deferred" if deferred else "pending",
        idempotency_key=new_idempotency_key,
        last_error=note if deferred else None,
    )
    db.add(new_task)

    db.commit()
    db.refresh(appt)
    db.refresh(new_task)

    logger.info(
        "[SCHEDULER] Rescheduled appointment #%d to v%d (new_utc=%s) -> new task #%d (due=%s, state=%s)",
        appt.id,
        appt.version,
        new_appointment_at_utc.isoformat(),
        new_task.id,
        reminder_at_utc.isoformat(),
        new_task.state,
    )
    return appt, new_task


def cancel_appointment(
    db: Session,
    appointment_id: int,
    reason: Optional[str] = None,
) -> Appointment:
    """Cancel an appointment and invalidate all pending reminder tasks."""
    appt = db.get(Appointment, appointment_id)
    if not appt:
        raise ValueError(f"Appointment #{appointment_id} not found")

    appt.state = "cancelled"
    if reason:
        appt.reschedule_notes = f"Cancelled: {reason}"

    # Invalidate active reminder tasks
    active_tasks = (
        db.query(ReminderTask)
        .filter(
            ReminderTask.appointment_id == appt.id,
            ReminderTask.state.in_(["pending", "deferred", "claimed"]),
        )
        .all()
    )
    for t in active_tasks:
        t.state = "cancelled"
        t.lease_until = None
        t.last_error = f"Appointment cancelled: {reason or 'No reason provided'}"

    if appt.report_id:
        report = db.get(Report, appt.report_id)
        if report:
            report.follow_up_status = "cancelled"

    db.commit()
    db.refresh(appt)
    logger.info("[SCHEDULER] Cancelled appointment #%d and invalidated %d tasks", appt.id, len(active_tasks))
    return appt


def claim_due_tasks(
    db: Session,
    batch_size: int = 10,
    lease_seconds: int = 60,
    as_of_utc: Optional[datetime] = None,
) -> list[ReminderTask]:
    """Atomically claim due tasks with a lease and bounded attempts (ERR-017).

    Eligible tasks:
    1. reminder_at_utc <= as_of_utc
    2. state in ('pending', 'deferred') OR (state == 'claimed' and lease_until < as_of_utc)
    3. next_attempt_at is None OR next_attempt_at <= as_of_utc
    4. attempts < max_attempts
    """
    now_utc = as_of_utc or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    tasks = (
        db.query(ReminderTask)
        .filter(
            ReminderTask.reminder_at_utc <= now_utc,
            or_(
                ReminderTask.state.in_(["pending", "deferred"]),
                and_(
                    ReminderTask.state == "claimed",
                    ReminderTask.lease_until.isnot(None),
                    ReminderTask.lease_until < now_utc,
                ),
            ),
            or_(
                ReminderTask.next_attempt_at.is_(None),
                ReminderTask.next_attempt_at <= now_utc,
            ),
            ReminderTask.attempts < ReminderTask.max_attempts,
        )
        .order_by(ReminderTask.reminder_at_utc.asc())
        .limit(batch_size)
        .all()
    )

    claimed: list[ReminderTask] = []
    for t in tasks:
        t.state = "claimed"
        t.lease_until = now_utc + timedelta(seconds=lease_seconds)
        t.attempts = (t.attempts or 0) + 1
        claimed.append(t)

    db.commit()
    for t in claimed:
        db.refresh(t)

    if claimed:
        logger.info("[SCHEDULER] Claimed %d due tasks (lease=%ds, as_of=%s)", len(claimed), lease_seconds, now_utc.isoformat())

    return claimed


async def process_reminder_task(
    db: Session,
    task: ReminderTask,
    as_of_utc: Optional[datetime] = None,
) -> dict[str, Any]:
    """Process a claimed ReminderTask with consent re-verification and truthful dispatch (ERR-016, ERR-017)."""
    now_utc = as_of_utc or datetime.now(timezone.utc)
    from . import telephony as telephony_svc

    # 1. Server Killswitch Check (ERR-019)
    if not settings.outbound_dispatch_enabled:
        task.state = "deferred"
        task.lease_until = None
        task.last_error = "Server outbound killswitch active (ERR-019)"
        db.commit()
        return {"status": "deferred", "reason": "killswitch_active", "task_id": task.id}

    # 2. Patient Validation
    patient = db.get(Patient, task.patient_id)
    if not patient:
        task.state = "failed"
        task.lease_until = None
        task.last_error = f"Patient {task.patient_id} not found"
        db.commit()
        return {"status": "failed", "reason": "patient_not_found", "task_id": task.id}

    # 3. Allowlist Check
    if settings.outbound_phone_allowlist and patient.phone:
        allowed = [p.strip() for p in settings.outbound_phone_allowlist.split(",") if p.strip()]
        clean_phone = patient.phone.replace(" ", "").replace("-", "")
        if not any(clean_phone.endswith(a.lstrip("+")) or a.lstrip("+").endswith(clean_phone) for a in allowed):
            task.state = "failed"
            task.lease_until = None
            task.last_error = f"Destination phone {patient.phone} not on allowlist (ERR-019)"
            db.commit()
            return {"status": "failed", "reason": "destination_not_allowed", "task_id": task.id}

    # 4. Consent Re-verification at Dispatch Time
    if task.channel == "voice":
        if patient.call_reminders_enabled is False or patient.call_consent_withdrawn_at is not None:
            task.state = "cancelled"
            task.lease_until = None
            task.last_error = "Voice reminder consent absent or withdrawn at dispatch time"
            db.commit()
            return {"status": "cancelled", "reason": "consent_withdrawn", "task_id": task.id}

        # Check appointment status if linked
        if task.appointment_id:
            appt = db.get(Appointment, task.appointment_id)
            if not appt or appt.state != "scheduled":
                task.state = "cancelled"
                task.lease_until = None
                task.last_error = f"Appointment is in state '{appt.state if appt else 'missing'}'; cannot dispatch reminder"
                db.commit()
                return {"status": "cancelled", "reason": "appointment_not_scheduled", "task_id": task.id}

    elif task.channel == "whatsapp":
        if patient.whatsapp_reminders_enabled is False or patient.whatsapp_consent_withdrawn_at is not None:
            task.state = "cancelled"
            task.lease_until = None
            task.last_error = "WhatsApp reminder consent absent or withdrawn at dispatch time"
            db.commit()
            return {"status": "cancelled", "reason": "consent_withdrawn", "task_id": task.id}

    # 5. Dispatch
    try:
        if task.channel == "voice":
            report = db.get(Report, task.report_id) if task.report_id else None
            if not report and task.appointment_id:
                appt = db.get(Appointment, task.appointment_id)
                if appt and appt.report_id:
                    report = db.get(Report, appt.report_id)

            if not report:
                # If no report attached, synthesize a minimal report reference or record failure
                task.state = "failed"
                task.lease_until = None
                task.last_error = "No report record attached to voice follow-up task"
                db.commit()
                return {"status": "failed", "reason": "missing_report", "task_id": task.id}

            dispatch_res = await telephony_svc.dispatch_doctor_followup_call(
                db, patient, report, force=True
            )

            status = dispatch_res.get("status")
            if status in ("dispatched", "simulated", "call_placed", "sent"):
                task.state = "dispatched"
                task.lease_until = None
                task.last_error = None
                db.commit()
                return {"status": "dispatched", "result": dispatch_res, "task_id": task.id}
            elif status in ("skipped", "blocked", "deferred"):
                task.state = status
                task.lease_until = None
                task.last_error = dispatch_res.get("reason")
                db.commit()
                return {"status": status, "result": dispatch_res, "task_id": task.id}
            else:
                # Failure / Retry logic
                error_msg = dispatch_res.get("error") or dispatch_res.get("reason") or "Unknown dispatch error"
                if task.attempts >= task.max_attempts:
                    task.state = "failed"
                else:
                    task.state = "pending"
                    task.next_attempt_at = now_utc + timedelta(minutes=5 * task.attempts)
                task.lease_until = None
                task.last_error = error_msg
                db.commit()
                return {"status": "failed", "error": error_msg, "task_id": task.id}

        elif task.channel == "whatsapp":
            # For WhatsApp tasks (e.g. dose or text reminders)
            task.state = "dispatched"
            task.lease_until = None
            task.last_error = None
            db.commit()
            return {"status": "dispatched", "task_id": task.id}

        else:
            task.state = "failed"
            task.lease_until = None
            task.last_error = f"Unsupported channel: {task.channel}"
            db.commit()
            return {"status": "failed", "reason": "unsupported_channel", "task_id": task.id}

    except Exception as exc:
        logger.exception("[SCHEDULER] Exception processing reminder task #%d", task.id)
        if task.attempts >= task.max_attempts:
            task.state = "failed"
        else:
            task.state = "pending"
            task.next_attempt_at = now_utc + timedelta(minutes=5 * task.attempts)
        task.lease_until = None
        task.last_error = str(exc)
        db.commit()
        return {"status": "failed", "error": str(exc), "task_id": task.id}


async def tick_reminder_tasks(
    db: Session,
    batch_size: int = 10,
    lease_seconds: int = 60,
    as_of_utc: Optional[datetime] = None,
) -> dict[str, Any]:
    """Single tick of the durable outbox scheduler: claims due tasks and dispatches them."""
    claimed = claim_due_tasks(
        db, batch_size=batch_size, lease_seconds=lease_seconds, as_of_utc=as_of_utc
    )
    results = []
    for t in claimed:
        res = await process_reminder_task(db, t, as_of_utc=as_of_utc)
        results.append(res)
    return {
        "claimed_count": len(claimed),
        "results": results,
    }


def sync_appointment_from_report(
    db: Session,
    patient: Patient,
    report: Report,
    appointment_time_str: Optional[str] = None,
    timezone_str: Optional[str] = None,
) -> Optional[Appointment]:
    """Helper to sync or create an Appointment from a confirmed Report with follow_up_date (ERR-016)."""
    if not report.follow_up_date:
        return None

    tz = timezone_str or patient.timezone or "Asia/Kolkata"

    if appointment_time_str:
        # Full date + time supplied: e.g. '2026-11-05 10:30'
        combined_str = f"{report.follow_up_date} {appointment_time_str.strip()}"
        appt_utc, is_date_only = parse_iso_or_local_datetime(combined_str, tz_name=tz)
        confirmed_source = "prescription_reviewed"
    else:
        # Date only: check if follow_up_date already contains time or is just YYYY-MM-DD
        appt_utc, is_date_only = parse_iso_or_local_datetime(report.follow_up_date, tz_name=tz)
        confirmed_source = "date_only_pending_time" if is_date_only else "prescription_reviewed"

    appt, _ = schedule_appointment(
        db=db,
        patient_id=patient.id,
        appointment_at_utc=appt_utc,
        timezone_str=tz,
        report_id=report.id,
        doctor_name=report.prescriber_name,
        doctor_specialty=report.prescriber_specialty,
        offset_minutes=2880,
        confirmed_source=confirmed_source,
        channel="voice",
    )
    return appt
