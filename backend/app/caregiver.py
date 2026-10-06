"""Caregiver portal endpoints (family member / trusted friend — NOT hospital).

One resolver (auth.resolve_actor) makes every patient route caregiver-capable
via X-Patient-Id; this module adds the caregiver-specific surface:
  GET  /api/caregiver/patients           — family overview cards (light KPIs)
  POST /api/caregiver/patients/{id}/contact — update a linked patient's phone

The overview is deliberately LIGHT (a few indexed counts), not summary.build()
per patient — the full profile loads on card click via the normal /api routes.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from .auth import current_caregiver
from .db import get_db
from .models import CaregiverLink, DoseAdherence, Medicine, Patient, Report

router = APIRouter(prefix="/api/caregiver", tags=["caregiver"])


class ContactIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _e164ish(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) == 10:  # assume India
            digits = f"91{digits}"
        if len(digits) < 11 or len(digits) > 15:
            raise ValueError("Enter a valid phone number (10-digit Indian or full international).")
        return f"+{digits}"


def _days_until(follow_up_date: str | None) -> int | None:
    if not follow_up_date:
        return None
    try:
        return (date.fromisoformat(follow_up_date) - date.today()).days
    except ValueError:
        return None


@router.get("/patients")
def list_family(
    caregiver: Patient = Depends(current_caregiver),
    db: Session = Depends(get_db),
):
    """Linked patients + light KPIs for the family card grid."""
    links = (
        db.query(CaregiverLink)
        .filter(CaregiverLink.caregiver_id == caregiver.id)
        .order_by(CaregiverLink.id.asc())
        .all()
    )
    if not links:
        return {"caregiver": {"id": caregiver.id, "name": caregiver.name}, "patients": []}

    today = date.today().isoformat()
    cards = []
    for link in links:
        p = db.get(Patient, link.patient_id)
        if not p:
            continue  # stale link
        active_meds = (
            db.query(func.count(Medicine.id))
            .filter(Medicine.patient_id == p.id, Medicine.status == "active")
            .scalar()
        )
        upcoming = (
            db.query(Report)
            .filter(
                Report.patient_id == p.id,
                Report.follow_up_date.isnot(None),
                Report.follow_up_date >= today,
            )
            .order_by(Report.follow_up_date.asc())
            .first()
        )
        doses_today = db.query(func.count(DoseAdherence.id)).filter(
            DoseAdherence.patient_id == p.id, DoseAdherence.dose_date == today
        ).scalar()
        taken_today = db.query(func.count(DoseAdherence.id)).filter(
            DoseAdherence.patient_id == p.id,
            DoseAdherence.dose_date == today,
            DoseAdherence.status == "taken",
        ).scalar()
        cards.append({
            "id": p.id,
            "name": p.name,
            "relation": link.relation,
            "phone": p.phone,
            "plan": p.plan,
            "active_medicines": active_meds or 0,
            "doses_today": doses_today or 0,
            "taken_today": taken_today or 0,
            "next_followup": (
                {
                    "date": upcoming.follow_up_date,
                    "doctor": upcoming.prescriber_name,
                    "report_id": upcoming.id,
                    "days_until": _days_until(upcoming.follow_up_date),
                    "follow_up_status": upcoming.follow_up_status or "scheduled",
                    "reschedule_preferred_date": upcoming.reschedule_preferred_date,
                }
                if upcoming
                else None
            ),
        })
    return {"caregiver": {"id": caregiver.id, "name": caregiver.name}, "patients": cards}


@router.post("/patients/{patient_id}/contact")
def update_contact(
    patient_id: str,
    body: ContactIn,
    caregiver: Patient = Depends(current_caregiver),
    db: Session = Depends(get_db),
):
    """Update a linked patient's phone — the number tel:/wa.me/telephony use."""
    link = (
        db.query(CaregiverLink)
        .filter(
            CaregiverLink.caregiver_id == caregiver.id,
            CaregiverLink.patient_id == patient_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(403, "Not a linked patient of this caregiver")

    # phone is unique across patients — clear collision before writing
    clash = (
        db.query(Patient)
        .filter(Patient.phone == body.phone, Patient.id != patient_id)
        .first()
    )
    if clash:
        raise HTTPException(409, f"This number is already used by {clash.name}.")

    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(404, "Linked patient no longer exists")
    p.phone = body.phone
    db.commit()
    return {"status": "updated", "patient_id": p.id, "phone": p.phone}


# ponytail: 4 light KPI queries per card; a single grouped query if family
# ever grows past ~10 linked patients.
