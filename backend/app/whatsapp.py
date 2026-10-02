"""Meta WhatsApp Cloud API integration for medication reminders & interactive adherence.

Architecture:
1. Outbound: Sends Interactive Button Messages ('✅ Yes, Taken' / '❌ Missed / Forgot')
   using the official Meta WhatsApp Business Cloud API (v21.0).
2. Inbound: Handles webhook callbacks when patient taps a button or replies with text.
3. Fallback / Dev Mode: Operates smoothly in simulation mode when Meta credentials
   are not yet provisioned, allowing instant local testing without failures.
4. Adherence State: Automatically syncs and updates DoseAdherence records in the DB,
   which reflect instantly on the patient's dashboard.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import date, datetime, timezone
from typing import Any, Optional
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from .config import settings
from .models import DoseAdherence, Medicine, Patient, ReminderLog

logger = logging.getLogger("aayogya.whatsapp")

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"

_SLOT_TIMES = {
    "morning": "08:00 AM",
    "afternoon": "01:00 PM",
    "night": "08:30 PM",
    "sos": "As needed (SOS)",
}

_SLOT_HINDI = {
    "morning": "सुबह",
    "afternoon": "दोपहर",
    "night": "रात",
    "sos": "ज़रूरत पड़ने पर",
}


def _clean_phone(phone: str | None) -> str:
    """Normalize phone number to international E.164 format without '+' or spaces.
    e.g. '+91 9454535137' -> '919454535137'.
    Defaults to Indian country code (91) if 10 digits provided.
    """
    if not phone:
        return "919000000001"
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 10:
        return f"91{digits}"
    return digits


def verify_signature(payload_bytes: bytes, signature_header: Optional[str]) -> bool:
    """Validate Meta's X-Hub-Signature-256 header using the app secret.
    If no app secret is configured, passes validation in development mode.
    """
    if not settings.whatsapp_app_secret:
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.whatsapp_app_secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()
    actual = signature_header.split("sha256=", 1)[1]
    return hmac.compare_digest(expected, actual)


def sync_today_adherence(db: Session, patient_id: str) -> list[DoseAdherence]:
    """Ensure today's dose adherence records exist for all active medicines.
    Idempotent: will not duplicate if records already exist for today.
    """
    today_str = date.today().isoformat()
    active_meds = (
        db.query(Medicine)
        .filter(
            Medicine.patient_id == patient_id,
            Medicine.status == "active",
            Medicine.reminders_enabled.isnot(False),
        )
        .all()
    )

    existing = (
        db.query(DoseAdherence)
        .filter(
            DoseAdherence.patient_id == patient_id,
            DoseAdherence.dose_date == today_str,
        )
        .all()
    )
    existing_map = {(d.medicine_id, d.slot): d for d in existing}

    # Cancel pending doses for stopped/paused medicines
    active_med_ids = {m.id for m in active_meds}
    for d in existing:
        if d.medicine_id not in active_med_ids and d.status == "pending":
            d.status = "stopped"
            d.notes = "Medicine stopped or reminders paused by patient"

    created = []
    for m in active_meds:
        slots = m.timing if (m.timing and not m.prn) else (["sos"] if m.prn else ["morning"])
        for slot in slots:
            if (m.id, slot) not in existing_map:
                rec = DoseAdherence(
                    patient_id=patient_id,
                    medicine_id=m.id,
                    dose_date=today_str,
                    slot=slot,
                    status="pending",
                    scheduled_time=_SLOT_TIMES.get(slot, "08:00 AM"),
                    channel="whatsapp",
                    notes="Awaiting patient confirmation",
                )
                db.add(rec)
                created.append(rec)

    db.commit()
    for r in created:
        db.refresh(r)

    return (
        db.query(DoseAdherence)
        .filter(
            DoseAdherence.patient_id == patient_id,
            DoseAdherence.dose_date == today_str,
            DoseAdherence.status != "stopped",
        )
        .order_by(DoseAdherence.id.asc())
        .all()
    )


async def send_text_message(to_phone: str, text: str) -> dict[str, Any]:
    """Send a plain text message via Meta Cloud API or mock simulator."""
    clean_to = _clean_phone(to_phone)
    if not (settings.whatsapp_api_token and settings.whatsapp_phone_number_id):
        logger.info("[MOCK WHATSAPP] Outbound text to %s: %s", clean_to, text)
        return {"status": "simulated", "to": clean_to, "message_id": f"mock_txt_{uuid4().hex[:10]}"}

    url = f"{GRAPH_API_BASE}/{settings.whatsapp_phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_api_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_to,
        "type": "text",
        "text": {"preview_url": False, "body": text},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            res.raise_for_status()
            data = res.json()
            wamid = data.get("messages", [{}])[0].get("id", "")
            return {"status": "sent", "to": clean_to, "message_id": wamid, "raw": data}
    except Exception as exc:
        logger.error("Failed to send WhatsApp text to %s: %s", clean_to, exc)
        return {"status": "failed", "error": str(exc)}


async def send_interactive_dose_reminder(
    db: Session,
    adherence: DoseAdherence,
    patient: Patient,
    medicine: Medicine,
) -> dict[str, Any]:
    """Send a 2-button interactive WhatsApp reminder for a specific scheduled dose.
    Buttons: '✅ Yes, Taken' and '❌ Missed / Forgot'.
    """
    clean_to = _clean_phone(patient.phone)
    slot_label = _SLOT_HINDI.get(adherence.slot, adherence.slot)
    timing_str = adherence.scheduled_time or _SLOT_TIMES.get(adherence.slot, "")
    dosage_note = medicine.dosage_notation or "डॉक्टर के निर्देशानुसार"

    # Friendly Hindi message body
    body_text = (
        f"नमस्ते {patient.name}! 🔔\n\n"
        f"आपकी *{slot_label} ({timing_str})* की दवा का समय हो गया है:\n\n"
        f"💊 *{medicine.brand}* ({medicine.strength or ''})\n"
        f"• खुराक: {dosage_note}\n\n"
        f"क्या आपने यह दवा ले ली है?"
    )

    btn_taken_id = f"dose_taken_{adherence.id}"
    btn_missed_id = f"dose_missed_{adherence.id}"

    interactive_payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_to,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "header": {"type": "text", "text": "🔔 Aayogya Dawa Reminder"},
            "body": {"text": body_text},
            "footer": {"text": "सहायक (Aayogya Health Companion)"},
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": btn_taken_id,
                            "title": "✅ Yes, Taken",
                        },
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": btn_missed_id,
                            "title": "❌ Missed / Forgot",
                        },
                    },
                ]
            },
        },
    }

    wamid = f"mock_wamid_{uuid4().hex[:12]}"
    status = "sent"

    if settings.whatsapp_api_token and settings.whatsapp_phone_number_id:
        url = f"{GRAPH_API_BASE}/{settings.whatsapp_phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {settings.whatsapp_api_token}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers, json=interactive_payload)
                res.raise_for_status()
                data = res.json()
                wamid = data.get("messages", [{}])[0].get("id", wamid)
        except Exception as exc:
            logger.error("Meta WhatsApp Cloud API error: %s", exc)
            status = "failed"
    else:
        logger.info(
            "[MOCK WHATSAPP] Interactive Reminder sent to %s for %s (%s). Buttons: [%s, %s]",
            clean_to,
            medicine.brand,
            adherence.slot,
            btn_taken_id,
            btn_missed_id,
        )

    # Record outbound in reminder_logs
    adherence.whatsapp_message_id = wamid
    db.add(
        ReminderLog(
            patient_id=patient.id,
            medicine_id=medicine.id,
            channel="whatsapp",
            kind="dose",
            body=body_text,
            status=status,
        )
    )
    db.commit()

    return {
        "status": status,
        "adherence_id": adherence.id,
        "recipient": clean_to,
        "message_id": wamid,
        "button_ids": [btn_taken_id, btn_missed_id],
    }


async def process_webhook_payload(payload: dict[str, Any], db: Session) -> dict[str, Any]:
    """Parse Meta Cloud API incoming webhook and update adherence states in database."""
    results: list[dict[str, Any]] = []

    entries = payload.get("entry", [])
    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})
            messages = value.get("messages", [])

            for msg in messages:
                from_number = msg.get("from", "")
                msg_type = msg.get("type", "")

                # 1. Interactive Button Reply
                if msg_type == "interactive":
                    btn = msg.get("interactive", {}).get("button_reply", {})
                    btn_id = btn.get("id", "")
                    title = btn.get("title", "")
                    logger.info("WhatsApp Button Click received: %s (%s) from %s", btn_id, title, from_number)

                    if btn_id.startswith("dose_taken_"):
                        try:
                            adh_id = int(btn_id.replace("dose_taken_", ""))
                        except ValueError:
                            adh_id = 0
                        adh = db.query(DoseAdherence).filter(DoseAdherence.id == adh_id).first()
                        if adh:
                            adh.status = "taken"
                            adh.confirmed_at = datetime.now(timezone.utc)
                            adh.notes = f"Confirmed via WhatsApp Button ({title})"
                            db.commit()

                            med = adh.medicine
                            med_name = med.brand if med else "दवा"
                            patient = adh.patient
                            p_name = patient.name if patient else "जी"
                            ack = f"शाबाश {p_name}! आपकी दवा *{med_name}* ({adh.slot}) समय पर लेने के लिए दर्ज कर ली गई है। 🌟 अपना ख्याल रखें!"
                            await send_text_message(from_number, ack)
                            results.append({"action": "marked_taken", "adherence_id": adh_id, "medicine": med_name})

                    elif btn_id.startswith("dose_missed_"):
                        try:
                            adh_id = int(btn_id.replace("dose_missed_", ""))
                        except ValueError:
                            adh_id = 0
                        adh = db.query(DoseAdherence).filter(DoseAdherence.id == adh_id).first()
                        if adh:
                            adh.status = "missed"
                            adh.confirmed_at = datetime.now(timezone.utc)
                            adh.notes = f"Patient marked missed via WhatsApp Button ({title})"
                            db.commit()

                            med = adh.medicine
                            med_name = med.brand if med else "दवा"
                            advice = (
                                f"नोट कर लिया गया है कि *{med_name}* की खुराक छूट गई है।\n"
                                f"कृपया अपने डॉक्टर की सलाह का पालन करें और अगली खुराक सामान्य समय पर लें। "
                                f"कभी भी छूटी हुई खुराक के लिए दोहरी (double) दवा ना लें।"
                            )
                            await send_text_message(from_number, advice)
                            results.append({"action": "marked_missed", "adherence_id": adh_id, "medicine": med_name})

                # 2. Text Message Reply (Natural Language)
                elif msg_type == "text":
                    body = msg.get("text", {}).get("body", "").strip().lower()
                    logger.info("WhatsApp Text Message received: '%s' from %s", body, from_number)

                    # Simple intent check for affirmative / negative
                    positive_terms = ["yes", "taken", "haa", "haan", "le li", "kha li", "done", "li", "1"]
                    negative_terms = ["no", "nahi", "missed", "forgot", "bhool", "nahi li", "skip", "2"]

                    # Find patient by phone
                    clean = _clean_phone(from_number)
                    patient = (
                        db.query(Patient)
                        .filter(
                            (Patient.phone.like(f"%{clean[-10:]}%"))
                        )
                        .first()
                    )

                    if patient:
                        today_str = date.today().isoformat()
                        # Find the most recent pending adherence
                        pending = (
                            db.query(DoseAdherence)
                            .filter(
                                DoseAdherence.patient_id == patient.id,
                                DoseAdherence.dose_date == today_str,
                                DoseAdherence.status == "pending",
                            )
                            .order_by(DoseAdherence.id.asc())
                            .first()
                        )

                        if pending:
                            med = pending.medicine
                            med_name = med.brand if med else "दवा"
                            if any(p in body for p in positive_terms):
                                pending.status = "taken"
                                pending.confirmed_at = datetime.now(timezone.utc)
                                pending.notes = f"Confirmed via text reply: '{body}'"
                                db.commit()
                                await send_text_message(
                                    from_number,
                                    f"नमस्ते {patient.name}! आपकी दवा *{med_name}* दर्ज कर ली गई है। 🌟",
                                )
                                results.append({"action": "marked_taken_via_text", "adherence_id": pending.id})
                            elif any(n in body for n in negative_terms):
                                pending.status = "missed"
                                pending.confirmed_at = datetime.now(timezone.utc)
                                pending.notes = f"Marked missed via text reply: '{body}'"
                                db.commit()
                                await send_text_message(
                                    from_number,
                                    f"नोट कर लिया गया है। अगली खुराक अपने सही समय पर लें।",
                                )
                                results.append({"action": "marked_missed_via_text", "adherence_id": pending.id})
                            else:
                                await send_text_message(
                                    from_number,
                                    f"नमस्ते! दवा की स्थिति दर्ज करने के लिए कृपया 'Yes' (ले ली) या 'No' (छूट गई) लिखें, या ऊपर दिए गए बटन दबाएँ।",
                                )

    return {"processed": len(results), "results": results}


def stop_medicine(
    db: Session,
    medicine_id: int,
    patient_id: str,
    reason: str = "Patient completed course / feeling fit",
) -> Medicine:
    """Mark a medicine as stopped/completed. Cancels today's pending reminders
    so the patient does not receive unnecessary messages.
    """
    med = (
        db.query(Medicine)
        .filter(Medicine.id == medicine_id, Medicine.patient_id == patient_id)
        .first()
    )
    if not med:
        raise ValueError("Medicine not found")

    med.status = "stopped"
    med.reminders_enabled = False
    med.stopped_at = datetime.now(timezone.utc)
    med.stopped_reason = reason or "Patient completed course / feeling fit"

    # Cancel today's pending adherence records for this medicine
    today_str = date.today().isoformat()
    pending_adhs = (
        db.query(DoseAdherence)
        .filter(
            DoseAdherence.medicine_id == medicine_id,
            DoseAdherence.patient_id == patient_id,
            DoseAdherence.dose_date == today_str,
            DoseAdherence.status == "pending",
        )
        .all()
    )
    for a in pending_adhs:
        a.status = "stopped"
        a.notes = f"Medicine stopped by patient: {med.stopped_reason}"

    db.commit()
    db.refresh(med)
    return med


def resume_medicine(db: Session, medicine_id: int, patient_id: str) -> Medicine:
    """Reactivate a previously stopped medicine and resume reminder schedule."""
    med = (
        db.query(Medicine)
        .filter(Medicine.id == medicine_id, Medicine.patient_id == patient_id)
        .first()
    )
    if not med:
        raise ValueError("Medicine not found")

    med.status = "active"
    med.reminders_enabled = True
    med.stopped_at = None
    med.stopped_reason = None

    # Un-cancel today's stopped adherence records for this medicine
    today_str = date.today().isoformat()
    stopped_adhs = (
        db.query(DoseAdherence)
        .filter(
            DoseAdherence.medicine_id == medicine_id,
            DoseAdherence.patient_id == patient_id,
            DoseAdherence.dose_date == today_str,
            DoseAdherence.status == "stopped",
        )
        .all()
    )
    for a in stopped_adhs:
        a.status = "pending"
        a.notes = "Resumed by patient"

    db.commit()
    db.refresh(med)

    # Re-sync today's doses
    sync_today_adherence(db, patient_id)
    return med


def toggle_medicine_reminders(
    db: Session, medicine_id: int, patient_id: str
) -> Medicine:
    """Pause or unpause automated reminders for an active medicine."""
    med = (
        db.query(Medicine)
        .filter(Medicine.id == medicine_id, Medicine.patient_id == patient_id)
        .first()
    )
    if not med:
        raise ValueError("Medicine not found")

    med.reminders_enabled = not bool(med.reminders_enabled)
    db.commit()
    db.refresh(med)

    sync_today_adherence(db, patient_id)
    return med


async def run_automated_reminders_check(
    db: Session, force: bool = False
) -> dict[str, Any]:
    """Automated scheduler worker. Checks all patients with active auto-reminders
    and dispatches WhatsApp (and queues Call) reminders for due doses.
    """
    from datetime import timedelta

    # Determine current slot in Indian Standard Time (Asia/Kolkata: UTC+5:30)
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    hour = ist_now.hour

    current_slot = None
    if 6 <= hour < 11:
        current_slot = "morning"
    elif 11 <= hour < 16:
        current_slot = "afternoon"
    elif 18 <= hour < 23:
        current_slot = "night"

    patients = (
        db.query(Patient)
        .filter(Patient.auto_reminders_enabled.isnot(False))
        .all()
    )

    dispatched = []
    calls_queued = []

    for p in patients:
        today_adherences = sync_today_adherence(db, p.id)
        pending_doses = [a for a in today_adherences if a.status == "pending"]

        for adh in pending_doses:
            med = adh.medicine
            if not med or med.status != "active" or not med.reminders_enabled:
                continue

            # In normal mode, only dispatch for the active time window
            if not force and current_slot and adh.slot != current_slot:
                continue

            # Prevent duplicate sending if already sent recently
            if adh.whatsapp_message_id and not force:
                continue

            # 1. WhatsApp Automated Reminder
            if p.whatsapp_reminders_enabled is not False:
                res = await send_interactive_dose_reminder(db, adh, p, med)
                dispatched.append({
                    "patient_id": p.id,
                    "patient_name": p.name,
                    "medicine": med.brand,
                    "slot": adh.slot,
                    "status": res.get("status"),
                })

            # 2. Automated Call Reminder Queue
            if p.call_reminders_enabled:
                call_body = (
                    f"नमस्ते {p.name}, सहायक से आपकी {adh.slot} की दवा {med.brand} "
                    f"लेने का समय हो गया है।"
                )
                call_log = ReminderLog(
                    patient_id=p.id,
                    medicine_id=med.id,
                    channel="voice",
                    kind="dose",
                    body=call_body,
                    status="queued",
                )
                db.add(call_log)
                db.commit()
                calls_queued.append({
                    "patient_id": p.id,
                    "patient_name": p.name,
                    "medicine": med.brand,
                    "slot": adh.slot,
                })

    logger.info(
        "[SCHEDULER] Check complete. Slot: %s, WhatsApp sent: %d, Calls queued: %d",
        current_slot or ("FORCE_ALL" if force else "OFF_HOURS"),
        len(dispatched),
        len(calls_queued),
    )

    return {
        "ist_time": ist_now.strftime("%Y-%m-%d %I:%M %p"),
        "current_slot": current_slot,
        "whatsapp_dispatched": dispatched,
        "calls_queued": calls_queued,
    }


async def start_reminder_scheduler_loop():
    """Background asyncio worker loop that runs every 60s to check dose schedules."""
    import asyncio
    from .db import SessionLocal

    logger.info("Starting Aayogya Automated Medication Reminder Scheduler loop...")
    while True:
        try:
            await asyncio.sleep(60)
            db = SessionLocal()
            try:
                await run_automated_reminders_check(db, force=False)
            finally:
                db.close()
        except asyncio.CancelledError:
            logger.info("Reminder scheduler loop cancelled.")
            break
        except Exception as exc:
            logger.error("Error in reminder scheduler loop: %s", exc)

