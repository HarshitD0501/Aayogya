"""Structured patient summary (design: one place with condition, schedule, next
visit, and reminder/dose tracking). All queries filter patient_id (isolation,
design 11). Non-clinical: conditions are drug-use info, never a diagnosis.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import conditions as cond_svc
from .models import Medicine, Report, ReminderLog

_SLOTS = ("morning", "afternoon", "night")


def build(db: Session, patient) -> dict:
    meds = (
        db.query(Medicine)
        .filter(Medicine.patient_id == patient.id, Medicine.status == "active")
        .all()
    )

    # Daily schedule: which meds at morning/afternoon/night, plus SOS (as-needed).
    schedule = {slot: [] for slot in _SLOTS}
    schedule["sos"] = []
    for m in meds:
        entry = {"brand": m.brand, "salt": m.salt, "strength": m.strength}
        if m.prn:
            schedule["sos"].append(entry)
        else:
            for t in m.timing or []:
                if t in schedule:
                    schedule[t].append(entry)

    # What each medicine is commonly used for (informational, not a diagnosis).
    conditions = [
        {"medicine": m.brand, "salt": m.salt, "used_for": cond_svc.used_for(m.salt)}
        for m in meds
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
        .filter(ReminderLog.patient_id == patient.id).scalar()
    )

    return {
        "patient": {"name": patient.name, "plan": patient.plan, "lang": patient.lang},
        "conditions": conditions,
        "conditions_disclaimer": cond_svc.DISCLAIMER,
        "schedule": schedule,
        "next_followup": next_followup,
        "tracking": {
            "active_medicines": len(meds),
            "doses_per_day": round(sum(m.per_day or 0 for m in meds), 1),
            "reminders_sent": reminders_sent,
            "whatsapp_reminders_sent": whatsapp_sent,
            "last_reminder_at": last_sent.isoformat() if last_sent else None,
        },
    }
