"""Tables for the upload -> extract -> confirm slice.

Single demo patient for now (patient_id string, default "demo") — the full
patients/users tables (design §9) come with auth. prescriber_name lives on both
report and medicine so the cross-doctor interaction flag (the moat) can name
which doctor prescribed what.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String,
)
from sqlalchemy.orm import relationship

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Report(Base):
    __tablename__ = "reports"
    # hot path: list a patient's reports newest-first
    __table_args__ = (Index("ix_reports_patient_created", "patient_id", "created_at"),)

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, ForeignKey("patients.id"), index=True)
    thread_id = Column(String, index=True)  # LangGraph checkpoint id (resume on confirm)
    filename = Column(String)
    raw_ocr = Column(String)  # untrusted text — never fed back as instructions
    ocr_confidence = Column(Float)
    prescriber_name = Column(String)
    prescriber_specialty = Column(String)
    prescription_date = Column(String)  # as read from the script (may be null)
    follow_up_date = Column(String)  # next visit / review date (design: "kab jana hai")
    parsed_json = Column(JSON)  # full extraction, kept immutable alongside confirmed
    confirmed = Column(Boolean, default=False)  # human-confirm gate (design §5)
    created_at = Column(DateTime, default=_now)

    medicines = relationship(
        "Medicine", back_populates="report", cascade="all, delete-orphan"
    )


class Medicine(Base):
    __tablename__ = "medicines"
    # hot path: active meds for a patient (list_medicines + interaction check)
    __table_args__ = (Index("ix_medicines_patient_status", "patient_id", "status"),)

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), index=True)
    patient_id = Column(String, ForeignKey("patients.id"), index=True)
    brand = Column(String)
    salt = Column(String)  # None => needs_salt_confirmation
    strength = Column(String)
    form = Column(String)
    dosage_notation = Column(String)
    timing = Column(JSON)  # ["morning","night"]
    per_day = Column(Float)
    prn = Column(Boolean, default=False)
    duration_days = Column(Integer)
    start_date = Column(String)
    status = Column(String, default="active")  # active | stopped | expired
    confidence = Column(Float)
    needs_salt_confirmation = Column(Boolean, default=False)
    prescriber_name = Column(String)
    reminders_enabled = Column(Boolean, default=True)  # can be paused by patient
    stopped_at = Column(DateTime, nullable=True)
    stopped_reason = Column(String, nullable=True)

    report = relationship("Report", back_populates="medicines")


class Patient(Base):
    """Patient + auth fields. Design §3 is patient-only (caregiver deferred), so
    no separate users table yet. Per-patient isolation keys off `id`.
    """
    __tablename__ = "patients"

    id = Column(String, primary_key=True)  # readable demo ids: "aarav", "shanti"
    name = Column(String)
    email = Column(String, unique=True, index=True)
    phone = Column(String, unique=True, index=True)
    password_hash = Column(String)
    plan = Column(String, default="free")  # free | pro
    lang = Column(String, default="hi")
    timezone = Column(String, default="Asia/Kolkata")
    emergency_contact = Column(String)
    created_at = Column(DateTime, default=_now)

    # Automated reminder preferences (patient controls message frequency)
    auto_reminders_enabled = Column(Boolean, default=True)
    whatsapp_reminders_enabled = Column(Boolean, default=True)
    call_reminders_enabled = Column(Boolean, default=False)
    reminder_time_morning = Column(String, default="08:00 AM")
    reminder_time_afternoon = Column(String, default="01:00 PM")
    reminder_time_night = Column(String, default="08:00 PM")


class Interaction(Base):
    """Curated salt-pair interactions (design §7.4). salt_a/salt_b stored
    normalized (lowercased, sorted) so lookup is order-independent. Every row
    cites a source; output is never framed as 'guaranteed safe'.
    """
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True)
    salt_a = Column(String, index=True)
    salt_b = Column(String, index=True)
    severity = Column(String)  # major | moderate | minor
    note = Column(String)
    source = Column(String)


class ReminderLog(Base):
    """Append-only log of reminders pushed to the patient (WhatsApp/voice). Counts
    ('kitne messages gaye', doses reminded) are derived from these rows, so there's
    one source of truth.
    """
    __tablename__ = "reminder_logs"
    __table_args__ = (Index("ix_reminder_logs_patient_sent", "patient_id", "sent_at"),)

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, ForeignKey("patients.id"), index=True)
    medicine_id = Column(Integer, ForeignKey("medicines.id"))  # null => general reminder
    channel = Column(String, default="whatsapp")  # whatsapp | voice | sms
    kind = Column(String, default="dose")  # dose | followup | refill
    body = Column(String)
    status = Column(String, default="sent")  # sent | failed | queued
    sent_at = Column(DateTime, default=_now)


class DoseAdherence(Base):
    """Daily dose adherence tracking for medicines.
    Records interactive WhatsApp confirmation states ('Yes, Taken' / 'Missed').
    """
    __tablename__ = "dose_adherences"
    __table_args__ = (
        Index("ix_dose_adherence_patient_date", "patient_id", "dose_date"),
        Index("ix_dose_adherence_patient_slot", "patient_id", "dose_date", "slot"),
    )

    id = Column(Integer, primary_key=True)
    patient_id = Column(String, ForeignKey("patients.id"), index=True)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), index=True)
    dose_date = Column(String, index=True)  # YYYY-MM-DD
    slot = Column(String, index=True)  # morning | afternoon | night | sos
    status = Column(String, default="pending")  # pending | taken | missed | unconfirmed
    scheduled_time = Column(String, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    channel = Column(String, default="whatsapp")  # whatsapp | web | voice
    whatsapp_message_id = Column(String, nullable=True, index=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=_now)

    medicine = relationship("Medicine")
    patient = relationship("Patient")
