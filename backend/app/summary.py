"""Structured patient summary (design: one place with condition, schedule, next
visit, and reminder/dose tracking). All queries filter patient_id (isolation,
design 11). Non-clinical: conditions are drug-use info, never a diagnosis.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import conditions as cond_svc
from . import whatsapp as wa_svc
from .models import Medicine, Report, ReminderLog, DoseAdherence

_SLOTS = ("morning", "afternoon", "night")


def build(db: Session, patient) -> dict:
    all_meds = (
        db.query(Medicine)
        .filter(Medicine.patient_id == patient.id)
        .all()
    )
    active_meds = [m for m in all_meds if m.status == "active"]
    stopped_meds = [m for m in all_meds if m.status == "stopped"]

    # Sync and fetch today's dose adherences for real-time tracking
    today_adherences = wa_svc.sync_today_adherence(db, patient.id)
    adh_map = {(a.medicine_id, a.slot): a for a in today_adherences}

    # Daily schedule: which meds at morning/afternoon/night, plus SOS (as-needed).
    schedule = {slot: [] for slot in _SLOTS}
    schedule["sos"] = []
    for m in active_meds:
        if m.prn:
            adh = adh_map.get((m.id, "sos"))
            entry = {
                "id": m.id,
                "brand": m.brand,
                "salt": m.salt,
                "strength": m.strength,
                "reminders_enabled": m.reminders_enabled is not False,
                "status": m.status,
                "adherence_id": adh.id if adh else None,
                "adherence_status": adh.status if adh else "pending",
                "adherence_time": adh.confirmed_at.strftime("%I:%M %p") if (adh and adh.confirmed_at) else None,
                "scheduled_time": "As needed (SOS)",
            }
            schedule["sos"].append(entry)
        else:
            for t in m.timing or []:
                if t in schedule:
                    adh = adh_map.get((m.id, t))
                    entry = {
                        "id": m.id,
                        "brand": m.brand,
                        "salt": m.salt,
                        "strength": m.strength,
                        "reminders_enabled": m.reminders_enabled is not False,
                        "status": m.status,
                        "adherence_id": adh.id if adh else None,
                        "adherence_status": adh.status if adh else "pending",
                        "adherence_time": adh.confirmed_at.strftime("%I:%M %p") if (adh and adh.confirmed_at) else None,
                        "scheduled_time": adh.scheduled_time if adh else None,
                    }
                    schedule[t].append(entry)

    # What each medicine is commonly used for (informational, not a diagnosis).
    conditions = [
        {"medicine": m.brand, "salt": m.salt, "used_for": cond_svc.used_for(m.salt)}
        for m in active_meds
    ]

    # Next visit / report review: earliest follow-up date that is still upcoming.
    today = date.today().isoformat()
    upcoming = (
        db.query(Report)
        .filter(Report.patient_id == patient.id, Report.follow_up_date.isnot(None),
                Report.follow_up_date >= today)
        .order_by(Report.follow_up_date.asc())
        .first()
    )
    next_followup = None
    if upcoming:
        next_followup = {"date": upcoming.follow_up_date,
                         "doctor": upcoming.prescriber_name, "report_id": upcoming.id}

    # Reminder tracking (kitne WhatsApp messages gaye, last kab).
    base = db.query(ReminderLog).filter(ReminderLog.patient_id == patient.id)
    reminders_sent = base.count()
    whatsapp_sent = base.filter(ReminderLog.channel == "whatsapp").count()
    last_sent = (
        db.query(func.max(ReminderLog.sent_at))
        .filter(ReminderLog.patient_id == patient.id)
        .scalar()
    )
    taken_today = sum(1 for a in today_adherences if a.status == "taken")
    missed_today = sum(1 for a in today_adherences if a.status == "missed")
    pending_today = sum(1 for a in today_adherences if a.status == "pending")
    total_today = len(today_adherences)
    adherence_pct = round((taken_today / total_today) * 100) if total_today > 0 else 100

    auto_rem_active = (patient.auto_reminders_enabled is not False) and (patient.whatsapp_reminders_enabled is not False)

    return {
        "patient": {
            "name": patient.name,
            "plan": patient.plan,
            "lang": patient.lang,
            "auto_reminders_enabled": patient.auto_reminders_enabled is not False,
            "whatsapp_reminders_enabled": patient.whatsapp_reminders_enabled is not False,
            "call_reminders_enabled": bool(patient.call_reminders_enabled),
            "reminder_time_morning": getattr(patient, "reminder_time_morning", "08:00 AM") or "08:00 AM",
            "reminder_time_afternoon": getattr(patient, "reminder_time_afternoon", "01:00 PM") or "01:00 PM",
            "reminder_time_night": getattr(patient, "reminder_time_night", "08:00 PM") or "08:00 PM",
        },
        "conditions": conditions,
        "conditions_disclaimer": cond_svc.DISCLAIMER,
        "schedule": schedule,
        "stopped_medicines": [
            {
                "id": m.id,
                "brand": m.brand,
                "salt": m.salt,
                "strength": m.strength,
                "stopped_reason": m.stopped_reason or "Course finished",
                "stopped_at": m.stopped_at.strftime("%Y-%m-%d") if m.stopped_at else None,
            }
            for m in stopped_meds
        ],
        "next_followup": next_followup,
        "tracking": {
            "active_medicines": len(active_meds),
            "stopped_medicines": len(stopped_meds),
            "doses_per_day": round(sum(m.per_day or 0 for m in active_meds), 1),
            "reminders_sent": reminders_sent,
            "whatsapp_reminders_sent": whatsapp_sent,
            "last_reminder_at": last_sent.isoformat() if last_sent else None,
            "doses_taken_today": taken_today,
            "doses_pending_today": pending_today,
            "doses_missed_today": missed_today,
            "adherence_rate_today_pct": adherence_pct,
            "auto_reminders_active": auto_rem_active,
        },
    }
