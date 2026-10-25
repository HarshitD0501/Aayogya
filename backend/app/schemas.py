"""Pydantic shapes for extraction output and API responses (Pydantic v2)."""
from __future__ import annotations

from datetime import datetime
import re
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, computed_field, field_validator

from . import confidence as _conf
from .auth import normalize_indian_phone


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
    mock: bool = False  # True only when explicit development mock extraction is used


class MedicineOut(BaseModel):
    id: int
    brand: str
    salt: Optional[str]
    strength: Optional[str]
    form: Optional[str]
    dosage_notation: Optional[str]
    timing: Optional[list[str]] = Field(default_factory=list)
    per_day: Optional[float] = 0.0
    prn: bool = False
    duration_days: Optional[int]
    start_date: Optional[str]
    status: str
    confidence: Optional[float] = None
    needs_salt_confirmation: bool = False
    prescriber_name: Optional[str] = None
    reminders_enabled: bool = True

    @field_validator("timing", mode="before")
    @classmethod
    def _normalize_timing(cls, v):
        return v if v is not None else []
    stopped_at: Optional[Union[datetime, str]] = None
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
    follow_up_status: Optional[str] = "scheduled"
    reschedule_preferred_date: Optional[str] = None
    reschedule_notes: Optional[str] = None
    last_call_at: Optional[Union[datetime, str]] = None
    ocr_confidence: Optional[float]
    confirmed: bool
    created_at: Optional[Union[datetime, str]] = None
    mock: bool = False
    medicines: list[MedicineOut] = []


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    phone: str
    password: str = Field(min_length=8, max_length=128)
    role: Literal["patient", "caregiver"] = "patient"

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Enter your name.")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        return normalize_indian_phone(value)


class LoginIn(BaseModel):
    identifier: str  # email or phone
    password: str
    role: Optional[Literal["patient", "caregiver"]] = None


class GoogleAuthIn(BaseModel):
    credential: str = Field(min_length=100, max_length=8192)
    mode: Literal["login", "register"]
    role: Literal["patient", "caregiver"]


class PatientOut(BaseModel):
    id: str
    name: Optional[str]
    plan: str
    role: str = "patient"
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


class RescheduleIn(BaseModel):
    report_id: int
    preferred_date_or_time: str
    reason: Optional[str] = None


class TelephonyDispatchIn(BaseModel):
    report_id: int
    force: bool = False
