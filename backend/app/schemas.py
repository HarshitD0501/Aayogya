"""Pydantic shapes for extraction output and API responses (Pydantic v2)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, computed_field

from . import confidence as _conf


class ExtractedMed(BaseModel):
    brand: str
    salt: Optional[str] = None
    strength: Optional[str] = None
    form: Optional[str] = None
    dosage_notation: Optional[str] = None
    duration_days: Optional[int] = None
    confidence: float = 0.7
    notes: Optional[str] = None
    # filled by post-processing (not the LLM):
    timing: list[str] = []
    per_day: float = 0.0
    prn: bool = False
    needs_salt_confirmation: bool = False
    start_date: Optional[str] = None
    status: str = "active"


class ExtractionResult(BaseModel):
    prescriber_name: Optional[str] = None
    prescriber_specialty: Optional[str] = None
    prescription_date: Optional[str] = None
    follow_up_date: Optional[str] = None
    raw_ocr: str = ""
    overall_confidence: float = 0.7
    meds: list[ExtractedMed] = []
    mock: bool = False  # True when GEMINI_API_KEY absent


class MedicineOut(BaseModel):
    id: int
    brand: str
    salt: Optional[str]
    strength: Optional[str]
    form: Optional[str]
    dosage_notation: Optional[str]
    timing: list[str] = []
    per_day: Optional[float] = 0.0
    prn: bool = False
    duration_days: Optional[int]
    start_date: Optional[str]
    status: str
    confidence: Optional[float]
    needs_salt_confirmation: bool
    prescriber_name: Optional[str]
    reminders_enabled: bool = True
    stopped_at: Optional[str] = None
    stopped_reason: Optional[str] = None
    prices: Optional[dict] = None

    @computed_field  # derived, not stored: "the UI should ask the human to confirm this"
    @property
    def needs_review(self) -> bool:
        return _conf.needs_review(self.confidence or 0.0, self.needs_salt_confirmation)

    class Config:
        from_attributes = True


class ReportOut(BaseModel):
    id: int
    patient_id: str
    filename: Optional[str]
    prescriber_name: Optional[str]
    prescriber_specialty: Optional[str]
    prescription_date: Optional[str]
    follow_up_date: Optional[str] = None
    ocr_confidence: Optional[float]
    confirmed: bool
    created_at: Optional[str] = None
    mock: bool = False
    medicines: list[MedicineOut] = []


class LoginIn(BaseModel):
    identifier: str  # email or phone
    password: str


class PatientOut(BaseModel):
    id: str
    name: Optional[str]
    plan: str
    lang: Optional[str] = None
    timezone: Optional[str] = None
    auto_reminders_enabled: bool = True
    whatsapp_reminders_enabled: bool = True
    call_reminders_enabled: bool = False
    reminder_time_morning: Optional[str] = "08:00 AM"
    reminder_time_afternoon: Optional[str] = "01:00 PM"
    reminder_time_night: Optional[str] = "08:00 PM"

    class Config:
        from_attributes = True


class ReminderPrefsIn(BaseModel):
    auto_reminders_enabled: Optional[bool] = None
    whatsapp_reminders_enabled: Optional[bool] = None
    call_reminders_enabled: Optional[bool] = None
    reminder_time_morning: Optional[str] = None
    reminder_time_afternoon: Optional[str] = None
    reminder_time_night: Optional[str] = None


class ReminderPrefsOut(BaseModel):
    auto_reminders_enabled: bool
    whatsapp_reminders_enabled: bool
    call_reminders_enabled: bool
    reminder_time_morning: str
    reminder_time_afternoon: str
    reminder_time_night: str


class StopMedicineIn(BaseModel):
    reason: Optional[str] = "Patient recovered / finished course"


class LoginOut(BaseModel):
    token: str
    patient: PatientOut
