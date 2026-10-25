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

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .config import settings
from .models import DoseAdherence, Medicine, Patient, ReminderLog, Report
from . import telephony as telephony_svc

logger = logging.getLogger("aayogya.whatsapp")

GRAPH_API_BASE = "https://graph.facebook.com/v23.0"
# Version note: Meta deprecates Graph versions ~2 years after release; v21.0
# (Jan 2025) leaves the supported window around early 2027, v23.0 buys runway.
# The /messages surface is stable across these bumps.

# One shared async client for ALL outbound Meta calls: a fresh TCP+TLS handshake
# per message costs ~100-300ms each and the scheduler sends in bursts. Shared
# client = pooled connections. Lazily created; closed on app shutdown.
_http_client: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            base_url=GRAPH_API_BASE,
            timeout=httpx.Timeout(10.0, connect=5.0),
            headers={
                "Authorization": f"Bearer {settings.whatsapp_api_token}",
                "Content-Type": "application/json",
            },
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=10),
        )
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


async def _send_to_meta(payload: dict[str, Any]) -> dict[str, Any]:
    """POST to the Cloud API /messages endpoint with rate-limit handling.
    Meta answers 429 with a Retry-After header — honor it once, then give up
    gracefully (the scheduler will re-offer this dose on the next tick because
    whatsapp_message_id was never written)."""
    url = f"/{settings.whatsapp_phone_number_id}/messages"
    for attempt in range(2):
        try:
            res = await _client().post(url, json=payload)
            if res.status_code == 429 and attempt == 0:
                retry_after = 1.0
                try:
                    retry_after = float(res.headers.get("Retry-After", "1"))
                except ValueError:
                    pass
                logger.warning("[WHATSAPP] rate-limited (429); retrying in %.1fs", retry_after)
                await asyncio.sleep(retry_after)
                continue
            res.raise_for_status()
            data = res.json()
            wamid = data.get("messages", [{}])[0].get("id", "")
            return {"status": "sent", "message_id": wamid, "raw": data}
        except httpx.HTTPStatusError as exc:
            logger.error(
                "[WHATSAPP] Meta API error %s: %s",
                exc.response.status_code,
                exc.response.text[:300],
            )
            return {"status": "failed", "error": f"HTTP {exc.response.status_code}"}
        except httpx.HTTPError as exc:
            logger.error("[WHATSAPP] network error: %s", exc)
            return {"status": "failed", "error": str(exc)}
    return {"status": "failed", "error": "rate_limited"}


_SLOT_TIMES = {
    "morning": "08:00 AM",
    "afternoon": "01:00 PM",
    "evening": "05:00 PM",
    "night": "08:30 PM",
    "sos": "As needed (SOS)",
}

_SLOT_HINDI = {
    "morning": "सुबह",
    "afternoon": "दोपहर",
    "evening": "शाम",
    "night": "रात",
    "sos": "ज़रूरत पड़ने पर",
}



IST = ZoneInfo("Asia/Kolkata")


def _ist_today() -> str:
    """Today's date in IST (Asia/Kolkata), as ISO string. Patients are Indian;
    the dose day must roll over at Indian midnight, not the server's local one
    (a UTC server would be 5.5h off)."""
    return datetime.now(IST).date().isoformat()




def _ist_date() -> date:
    return datetime.now(IST).date()


def parse_time_to_minutes(time_str: str | None, default_slot: str = "morning") -> int:
    """Parse time strings like '08:00 AM', '13:30', '8:00 pm', '08:00' to minutes from midnight (0..1439)."""
    default_map = {"morning": 480, "afternoon": 780, "evening": 1020, "night": 1200, "sos": 720}
    if not time_str or not isinstance(time_str, str):
        return default_map.get(default_slot, 480)

    clean = time_str.strip().upper()
    try:
        if "AM" in clean or "PM" in clean:
            is_pm = "PM" in clean
            clean_digits = clean.replace("AM", "").replace("PM", "").strip()
            parts = clean_digits.split(":")
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            if hour == 12:
                hour = 12 if is_pm else 0
            elif is_pm:
                hour += 12
            return (hour % 24) * 60 + (minute % 60)
        else:
            parts = clean.split(":")
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            return (hour % 24) * 60 + (minute % 60)
    except Exception:
        return default_map.get(default_slot, 480)


def format_minutes_to_time(minutes: int) -> str:
    """Format minutes from midnight into 12-hour AM/PM string, e.g. 480 -> '08:00 AM'."""
    minutes = minutes % 1440
    hour = minutes // 60
    minute = minutes % 60
    suffix = "AM" if hour < 12 else "PM"
    h12 = hour % 12
    if h12 == 0:
        h12 = 12
    return f"{h12:02d}:{minute:02d} {suffix}"


def get_patient_slot_time(patient: Patient | None, slot: str) -> str:
    """Retrieve patient's configured reminder time for a slot, falling back to defaults."""
    if patient:
        if slot == "morning" and patient.reminder_time_morning:
            return patient.reminder_time_morning
        if slot == "afternoon" and patient.reminder_time_afternoon:
            return patient.reminder_time_afternoon
        if slot == "night" and patient.reminder_time_night:
            return patient.reminder_time_night
    return _SLOT_TIMES.get(slot, "08:00 AM")


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
    today_dt = _ist_date()
    today_str = today_dt.isoformat()
    dirty = False

    # ERR-001: Only medicines from confirmed reports (or manual entry) are eligible
    active_meds = (
        db.query(Medicine)
        .outerjoin(Report, Medicine.report_id == Report.id)
        .filter(
            Medicine.patient_id == patient_id,
            Medicine.status == "active",
            Medicine.reminders_enabled.isnot(False),
            or_(Medicine.report_id.is_(None), Report.confirmed.is_(True)),
        )
        .all()
    )

    # ERR-010: Exclude PRN medicines, expired courses, and unknown frequencies
    valid_active_meds = []
    for m in active_meds:
        # Check course duration expiry
        is_expired = False
        if m.start_date and m.duration_days is not None and m.duration_days > 0:
            try:
                start_dt = date.fromisoformat(m.start_date)
                end_dt = start_dt + timedelta(days=m.duration_days)
                if today_dt > end_dt:
                    is_expired = True
                    m.status = "expired"
                    dirty = True
            except (ValueError, TypeError):
                pass

        if not is_expired and not m.prn:
            # PRN medicines are SOS/as-needed and never auto-scheduled for reminders.
            # Medicines without explicit timings are unreviewed and must not default to morning.
            if m.timing and isinstance(m.timing, list) and len(m.timing) > 0:
                valid_active_meds.append(m)

    existing = (
        db.query(DoseAdherence)
        .filter(
            DoseAdherence.patient_id == patient_id,
            DoseAdherence.dose_date == today_str,
        )
        .all()
    )
    existing_map = {(d.medicine_id, d.slot): d for d in existing}

    # Cancel pending doses for stopped, paused, expired, or non-active medicines
    valid_active_med_ids = {m.id for m in valid_active_meds}
    for d in existing:
        if d.medicine_id not in valid_active_med_ids and d.status == "pending":
            d.status = "stopped"
            d.notes = "Medicine stopped, expired, or reminders paused by patient"
            dirty = True

    patient = db.get(Patient, patient_id)

    created = []
    for m in valid_active_meds:
        for slot in m.timing:
            if (m.id, slot) not in existing_map:
                slot_time = get_patient_slot_time(patient, slot)
                rec = DoseAdherence(
                    patient_id=patient_id,
                    medicine_id=m.id,
                    dose_date=today_str,
                    slot=slot,
                    status="pending",
                    scheduled_time=slot_time,
                    channel="whatsapp",
                    notes="Awaiting patient confirmation",
                )
                db.add(rec)
                created.append(rec)
            else:
                # Keep scheduled_time in sync with patient preference for pending unsent doses
                ex = existing_map[(m.id, slot)]
                if ex.status == "pending" and not ex.whatsapp_message_id:
                    expected_time = get_patient_slot_time(patient, slot)
                    if ex.scheduled_time != expected_time:
                        ex.scheduled_time = expected_time
                        dirty = True

    # The scheduler calls this every 30s per patient: commit only when rows were
    # created/changed — a no-op tick must not take a write lock or re-query.
    if dirty or created:
        db.commit()
        for r in created:
            db.refresh(r)

    doses = [d for d in existing + created if d.status != "stopped"]
    doses.sort(key=lambda d: d.id)
    return doses


async def send_text_message(to_phone: str, text: str) -> dict[str, Any]:
    """Send a plain text message via Meta Cloud API or mock simulator."""
    clean_to = _clean_phone(to_phone)
    if not (settings.whatsapp_api_token and settings.whatsapp_phone_number_id):
        logger.info("[MOCK WHATSAPP] Outbound text to %s: %s", clean_to, text)
        return {"status": "simulated", "to": clean_to, "message_id": f"mock_txt_{uuid4().hex[:10]}"}

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_to,
        "type": "text",
        "text": {"preview_url": False, "body": text},
    }
    res = await _send_to_meta(payload)
    res["to"] = clean_to
    res.setdefault("message_id", "")
    return res




def _med_detail_score(med: Medicine) -> int:
    """Rank duplicate-salt rows so the richest (strength + dosage) is shown."""
    score = 0
    if med.strength:
        score += 1
    if med.dosage_notation:
        score += 2
    if med.brand and med.salt and med.brand.strip().lower() != med.salt.strip().lower():
        score += 0  # brand vs salt name carries no extra info for ranking
    return score


async def send_interactive_slot_reminder(
    db: Session,
    patient: Patient,
    slot: str,
    adherences: list[DoseAdherence],
) -> dict[str, Any]:
    """Send a SINGLE consolidated 2-button interactive WhatsApp reminder containing ALL
    medicines scheduled for this patient at this exact slot time.
    Prevents spamming the patient with multiple separate messages.
    """
    if not adherences:
        return {"status": "skipped", "reason": "no_adherences"}

    clean_to = _clean_phone(patient.phone)
    slot_label = _SLOT_HINDI.get(slot, slot)
    timing_str = adherences[0].scheduled_time or get_patient_slot_time(patient, slot)

    # Format single message body with all medicines of that slot
    if len(adherences) == 1:
        adh = adherences[0]
        med = adh.medicine
        brand = med.brand if med else "दवा"
        strength = f" ({med.strength})" if (med and med.strength) else ""
        dosage = med.dosage_notation if (med and med.dosage_notation) else "डॉक्टर के निर्देशानुसार"
        body_text = (
            f"नमस्ते {patient.name}! 🔔\n\n"
            f"आपकी *{slot_label} ({timing_str})* की दवा का समय हो गया है:\n\n"
            f"💊 *{brand}*{strength}\n"
            f"• खुराक: {dosage}\n\n"
            f"क्या आपने यह दवा ले ली है?"
        )
        btn_taken_title = "✅ Yes, Taken"
        btn_missed_title = "❌ Missed / Forgot"
    else:
        # Dedupe by SALT: the same drug re-uploaded across reports (e.g. "Amlong 5"
        # and "Amlong") is ONE medicine to the patient — one line, not two. Prefer
        # the row with the most detail (strength + dosage notation).
        med_lines = []
        seen_salts: dict[str, Medicine] = {}
        for adh in adherences:
            med = adh.medicine
            if not med:
                continue
            salt_key = (med.salt or med.brand).strip().lower()
            best = seen_salts.get(salt_key)
            if best is None or _med_detail_score(med) > _med_detail_score(best):
                seen_salts[salt_key] = med
        for med in seen_salts.values():
            str_info = f" ({med.strength})" if med.strength else ""
            dosage = f" — खुराक: {med.dosage_notation}" if med.dosage_notation else ""
            med_lines.append(f"{len(med_lines) + 1}. 💊 *{med.brand}*{str_info}{dosage}")
        meds_formatted = "\n".join(med_lines)

        body_text = (
            f"नमस्ते {patient.name}! 🔔\n\n"
            f"आपकी *{slot_label} ({timing_str})* की सभी दवाओं का समय हो गया है (कुल: {len(med_lines)} दवाएं):\n\n"
            f"{meds_formatted}\n\n"
            f"क्या आपने ये सभी दवाएं ले ली हैं?"
        )
        btn_taken_title = "✅ Yes, All Taken"
        btn_missed_title = "❌ Missed / Forgot"

    # Button IDs containing adherence IDs (dose_ for single, batch_ for multiple)
    ids_str = ",".join(str(a.id) for a in adherences)
    if len(adherences) == 1:
        btn_taken_id = f"dose_taken_{adherences[0].id}"
        btn_missed_id = f"dose_missed_{adherences[0].id}"
    else:
        btn_taken_id = f"batch_taken_{ids_str}"
        btn_missed_id = f"batch_missed_{ids_str}"

    interactive_payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_to,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "header": {"type": "text", "text": "🔔 Aayogya Dawa Checklist"},
            "body": {"text": body_text},
            "footer": {"text": "सहायक (Aayogya Health Companion)"},
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": btn_taken_id,
                            "title": btn_taken_title[:20],
                        },
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": btn_missed_id,
                            "title": btn_missed_title[:20],
                        },
                    },
                ]
            },
        },
    }

    wamid = f"mock_wamid_{uuid4().hex[:12]}"
    status = "simulated"

    if settings.whatsapp_api_token and settings.whatsapp_phone_number_id:
        res = await _send_to_meta(interactive_payload)
        status = res["status"]
        if status == "sent":
            wamid = res["message_id"] or wamid
    else:
        med_names = ", ".join(a.medicine.brand for a in adherences if a.medicine)
        logger.info(
            "[MOCK WHATSAPP] Single Consolidated Reminder sent to %s for slot %s (%s). Meds: [%s]. Buttons: [%s, %s]",
            clean_to,
            slot,
            timing_str,
            med_names,
            btn_taken_id,
            btn_missed_id,
        )

    # Mark all adherences in this batch with the single WhatsApp message ID and
    # scheduled time. ONLY on success: a failed/rate-limited send leaves the
    # whatsapp_message_id unset, so the next scheduler tick can retry the dose.
    if status in ("sent", "simulated"):
        for adh in adherences:
            adh.whatsapp_message_id = wamid
            if adh.scheduled_time != timing_str:
                adh.scheduled_time = timing_str

    # Record single outbound reminder log
    primary_med_id = adherences[0].medicine_id if len(adherences) == 1 else None
    db.add(
        ReminderLog(
            patient_id=patient.id,
            medicine_id=primary_med_id,
            channel="whatsapp",
            kind="dose_batch" if len(adherences) > 1 else "dose",
            body=body_text,
            status=status,
        )
    )
    db.commit()

    return {
        "status": status,
        "slot": slot,
        "adherence_ids": [a.id for a in adherences],
        "recipient": clean_to,
        "message_id": wamid,
        "medicines": [a.medicine.brand for a in adherences if a.medicine],
        "medicine": ", ".join(a.medicine.brand for a in adherences if a.medicine),
        "button_ids": [btn_taken_id, btn_missed_id],
        "body": body_text,
    }


async def send_interactive_dose_reminder(
    db: Session,
    adherence: DoseAdherence,
    patient: Patient,
    medicine: Medicine,
) -> dict[str, Any]:
    """Compatibility wrapper that routes single dose to send_interactive_slot_reminder."""
    return await send_interactive_slot_reminder(db, patient, adherence.slot, [adherence])




def _sender_patient(db: Session, from_number: str) -> Patient | None:
    """Resolve the webhook sender (E.164 digits) to a patient by phone suffix match."""
    clean = _clean_phone(from_number)
    return (
        db.query(Patient)
        .filter(Patient.phone.like(f"%{clean[-10:]}%"))
        .first()
    )


def _sender_scoped(db: Session, adh_ids: list[int], sender: Patient | None) -> list[DoseAdherence]:
    """Fetch dose adherences by id, scoped to the SENDER's patient id. Button ids
    are just integers — without this, a crafted id could confirm another patient's
    doses. Unknown sender => no rows acted on."""
    if not adh_ids or sender is None:
        return []
    return (
        db.query(DoseAdherence)
        .filter(DoseAdherence.id.in_(adh_ids), DoseAdherence.patient_id == sender.id)
        .all()
    )


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

                    # A) Batch taken (Multiple medicines or single)
                    if btn_id.startswith("batch_taken_") or btn_id.startswith("dose_taken_"):
                        if btn_id.startswith("batch_taken_"):
                            raw_ids = btn_id.replace("batch_taken_", "").split(",")
                        else:
                            raw_ids = [btn_id.replace("dose_taken_", "")]

                        adh_ids = []
                        for rid in raw_ids:
                            try:
                                adh_ids.append(int(rid.strip()))
                            except ValueError:
                                pass

                        sender = _sender_patient(db, from_number)
                        adherences = _sender_scoped(db, adh_ids, sender)
                        med_names = []
                        slot_name = "इस समय"
                        patient_name = "जी"
                        for adh in adherences:
                            adh.status = "taken"
                            adh.confirmed_at = datetime.now(timezone.utc)
                            adh.notes = f"Confirmed via WhatsApp Button ({title})"
                            if adh.medicine:
                                med_names.append(adh.medicine.brand)
                            if adh.slot:
                                slot_name = _SLOT_HINDI.get(adh.slot, adh.slot)
                            if adh.patient:
                                patient_name = adh.patient.name
                        db.commit()

                        names_str = ", ".join(med_names) if med_names else "सभी दवाएं"
                        ack = (
                            f"शाबाश {patient_name}! 🌟\n\n"
                            f"आपकी *{slot_name}* की दवाएं ({names_str}) समय पर लेने के लिए सफलतापूर्वक दर्ज कर ली गई हैं।\n"
                            f"स्वस्थ रहें और अपना ख्याल रखें!"
                        )
                        await send_text_message(from_number, ack)
                        results.append({
                            "action": "marked_taken",
                            "adherence_ids": adh_ids,
                            "medicines": med_names,
                        })

                    # B) Batch missed
                    elif btn_id.startswith("batch_missed_") or btn_id.startswith("dose_missed_"):
                        if btn_id.startswith("batch_missed_"):
                            raw_ids = btn_id.replace("batch_missed_", "").split(",")
                        else:
                            raw_ids = [btn_id.replace("dose_missed_", "")]

                        adh_ids = []
                        for rid in raw_ids:
                            try:
                                adh_ids.append(int(rid.strip()))
                            except ValueError:
                                pass

                        sender = _sender_patient(db, from_number)
                        adherences = _sender_scoped(db, adh_ids, sender)
                        med_names = []
                        slot_name = "इस समय"
                        for adh in adherences:
                            adh.status = "missed"
                            adh.confirmed_at = datetime.now(timezone.utc)
                            adh.notes = f"Patient marked missed via WhatsApp Button ({title})"
                            if adh.medicine:
                                med_names.append(adh.medicine.brand)
                            if adh.slot:
                                slot_name = _SLOT_HINDI.get(adh.slot, adh.slot)
                        db.commit()

                        names_str = ", ".join(med_names) if med_names else "दवाएं"
                        advice = (
                            f"नोट कर लिया गया है कि *{slot_name}* की दवाएं ({names_str}) छूट गई हैं।\n\n"
                            f"कृपया घबराएं नहीं, अगली खुराक अपने नियमित समय पर लें। "
                            f"कभी भी छूटी हुई खुराक के लिए दोहरी (double) खुराक ना लें।"
                        )
                        await send_text_message(from_number, advice)
                        results.append({
                            "action": "marked_missed",
                            "adherence_ids": adh_ids,
                            "medicines": med_names,
                        })

                # 2. Text Message Reply (Natural Language)
                elif msg_type == "text":
                    body = msg.get("text", {}).get("body", "").strip().lower()
                    logger.info("WhatsApp Text Message received: '%s' from %s", body, from_number)

                    positive_terms = ["yes", "taken", "haa", "haan", "le li", "kha li", "done", "li", "1", "sab", "all"]
                    negative_terms = ["no", "nahi", "missed", "forgot", "bhool", "nahi li", "skip", "2"]

                    clean = _clean_phone(from_number)
                    patient = (
                        db.query(Patient)
                        .filter(
                            (Patient.phone.like(f"%{clean[-10:]}%"))
                        )
                        .first()
                    )

                    if patient:
                        today_str = _ist_today()
                        pending_list = (
                            db.query(DoseAdherence)
                            .filter(
                                DoseAdherence.patient_id == patient.id,
                                DoseAdherence.dose_date == today_str,
                                DoseAdherence.status == "pending",
                            )
                            .order_by(DoseAdherence.id.asc())
                            .all()
                        )

                        if pending_list:
                            # Group by first pending slot to update all medicines of that slot together
                            first_slot = pending_list[0].slot
                            slot_doses = [a for a in pending_list if a.slot == first_slot]

                            if any(p in body for p in positive_terms):
                                med_names = []
                                for a in slot_doses:
                                    a.status = "taken"
                                    a.confirmed_at = datetime.now(timezone.utc)
                                    a.notes = f"Confirmed via text reply: '{body}'"
                                    if a.medicine:
                                        med_names.append(a.medicine.brand)
                                db.commit()
                                names_str = ", ".join(med_names) if med_names else "सभी दवाएं"
                                await send_text_message(
                                    from_number,
                                    f"नमस्ते {patient.name}! आपकी *{_SLOT_HINDI.get(first_slot, first_slot)}* की दवाएं ({names_str}) दर्ज कर ली गई हैं। 🌟",
                                )
                                results.append({"action": "marked_taken_via_text", "adherence_ids": [a.id for a in slot_doses]})
                            elif any(n in body for n in negative_terms):
                                for a in slot_doses:
                                    a.status = "missed"
                                    a.confirmed_at = datetime.now(timezone.utc)
                                    a.notes = f"Marked missed via text reply: '{body}'"
                                db.commit()
                                await send_text_message(
                                    from_number,
                                    f"नोट कर लिया गया है कि आपकी खुराक छूट गई है। कृपया अगली खुराक सामान्य समय पर लें।",
                                )
                                results.append({"action": "marked_missed_via_text", "adherence_ids": [a.id for a in slot_doses]})
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
    today_str = _ist_today()
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
    today_str = _ist_today()
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
    """Automated precision scheduler worker. Checks all patients with active auto-reminders
    and dispatches:
    1. Daily Medicines: Dispatched via WHATSAPP ONLY when the current IST minute matches
       the patient's scheduled dose time (within a 5-minute precision window).
    2. Doctor Meet / Checkup / Test Follow-ups: Dispatched via SAHAYAK VOICE CALL ONLY,
       strictly 2 days before the scheduled appointment during daylight hours (09:00 AM - 08:00 PM IST).
    """
    from datetime import timedelta

    ist_tz = ZoneInfo("Asia/Kolkata")
    ist_now = datetime.now(ist_tz)
    current_total_mins = ist_now.hour * 60 + ist_now.minute

    # Broad slot identifier for diagnostic dashboard reporting
    current_slot = "off_hours"
    if 360 <= current_total_mins < 660:  # 06:00 AM - 11:00 AM
        current_slot = "morning"
    elif 660 <= current_total_mins < 1020:  # 11:00 AM - 05:00 PM
        current_slot = "afternoon"
    elif 1020 <= current_total_mins < 1410:  # 05:00 PM - 11:30 PM
        current_slot = "night"

    patients = (
        db.query(Patient)
        .filter(Patient.auto_reminders_enabled.isnot(False))
        .all()
    )

    dispatched = []
    doctor_calls = []

    two_days_later = (_ist_date() + timedelta(days=2)).isoformat()
    today_str = _ist_today()

    # One batched query for ALL due follow-ups this tick (was: one query per patient).
    if force:
        due_reports = (
            db.query(Report)
            .filter(Report.follow_up_date.isnot(None), Report.follow_up_date >= today_str)
            .all()
        )
    else:
        due_reports = (
            db.query(Report)
            .filter(Report.follow_up_date == two_days_later)
            .all()
        )
    due_reports_by_patient: dict[str, list[Report]] = {}
    for r in due_reports:
        due_reports_by_patient.setdefault(r.patient_id, []).append(r)

    for p in patients:
        # 1. MEDICINES: Dispatched via WHATSAPP ONLY (single consolidated message per time slot)
        today_adherences = sync_today_adherence(db, p.id)
        pending_doses = [a for a in today_adherences if a.status == "pending"]

        # Group pending active doses by slot so patient gets exactly ONE message at that time
        slot_groups: dict[str, list[DoseAdherence]] = {}
        for adh in pending_doses:
            med = adh.medicine
            if not med or med.status != "active" or not med.reminders_enabled:
                continue

            # Prevent duplicate sending if already dispatched today
            if adh.whatsapp_message_id and not force:
                continue

            slot_groups.setdefault(adh.slot, []).append(adh)

        for slot, slot_adherences in slot_groups.items():
            if not slot_adherences:
                continue

            # Parse scheduled time for this slot in Indian Standard Time (Asia/Kolkata / Lucknow)
            slot_time_str = slot_adherences[0].scheduled_time or get_patient_slot_time(p, slot)
            scheduled_mins = parse_time_to_minutes(slot_time_str, default_slot=slot)

            # Precision matching: active if current minute is within 5 minutes after scheduled dose time
            time_diff = current_total_mins - scheduled_mins
            is_time_due = (0 <= time_diff <= 5)

            if not force and not is_time_due:
                continue

            if p.whatsapp_reminders_enabled is not False:
                # SEND ONLY ONE SINGLE CONSOLIDATED MESSAGE FOR ALL MEDICINES AT THIS TIME!
                res = await send_interactive_slot_reminder(db, p, slot, slot_adherences)
                dispatched.append({
                    "patient_id": p.id,
                    "patient_name": p.name,
                    "slot": slot,
                    "medicines_count": len(slot_adherences),
                    "medicines": [a.medicine.brand for a in slot_adherences if a.medicine],
                    "medicine": ", ".join(a.medicine.brand for a in slot_adherences if a.medicine),
                    "scheduled_time": slot_time_str,
                    "scheduled_mins": scheduled_mins,
                    "current_ist_mins": current_total_mins,
                    "time_diff_mins": time_diff,
                    "status": res.get("status"),
                })

        # 2. DOCTOR MEET / CHECKUP / TEST: Dispatched via CALL ONLY (2 days prior, daytime 09:00 - 20:00)
        reports = due_reports_by_patient.get(p.id, [])
        # Voice call window: 09:00 AM (540 mins) to 08:00 PM (1200 mins) IST
        is_call_window = (540 <= current_total_mins <= 1200)

        for r in reports:
            # Check if review/checkup is exactly 2 days away (or earliest upcoming if force=True)
            is_due = (r.follow_up_date == two_days_later) or (force and r.follow_up_date and r.follow_up_date >= today_str)
            if not is_due:
                continue

            if not force and not is_call_window:
                continue

            # Check if patient was already called for this follow-up
            already_called = (
                db.query(ReminderLog)
                .filter(
                    ReminderLog.patient_id == p.id,
                    ReminderLog.channel == "voice",
                    ReminderLog.kind == "followup",
                    ReminderLog.body.contains(r.follow_up_date),
                )
                .first()
            )
            if already_called and not force:
                continue

            call_res = await telephony_svc.dispatch_doctor_followup_call(
                db, p, r, force=force
            )
            if call_res.get("status") in ("call_placed", "sent"):
                doctor_calls.append(call_res)

    logger.info(
        "[SCHEDULER] Precision check completed at %s IST (%d mins). WhatsApp meds sent: %d. Doctor voice calls: %d",
        ist_now.strftime("%I:%M %p"),
        current_total_mins,
        len(dispatched),
        len(doctor_calls),
    )

    return {
        "ist_time": ist_now.strftime("%Y-%m-%d %I:%M %p"),
        "current_total_mins": current_total_mins,
        "current_slot": current_slot,
        "whatsapp_medicines_dispatched": dispatched,
        "doctor_voice_calls_dispatched": doctor_calls,
    }


# Enterprise-grade APScheduler singleton (AsyncIOScheduler)
scheduler = AsyncIOScheduler(timezone=ZoneInfo("Asia/Kolkata"))


async def _scheduled_tick():
    """Periodic tick called by APScheduler every 30 seconds."""
    from .db import SessionLocal
    db = SessionLocal()
    try:
        await run_automated_reminders_check(db, force=False)
    except Exception as exc:
        logger.error("[APSCHEDULER] Exception during precision reminder tick: %s", exc)
    finally:
        db.close()


def start_apscheduler():
    """Start the APScheduler background scheduler ticking every 30 seconds in Asia/Kolkata."""
    global scheduler
    if not scheduler.running:
        scheduler.add_job(
            _scheduled_tick,
            IntervalTrigger(seconds=30, timezone=ZoneInfo("Asia/Kolkata")),
            id="aayogya_precision_reminder_tick",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.start()
        logger.info("[APSCHEDULER] Precision medication reminder scheduler started (30s interval, Asia/Kolkata).")


def stop_apscheduler():
    """Stop the APScheduler background scheduler."""
    global scheduler
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[APSCHEDULER] Precision medication reminder scheduler stopped.")


async def start_reminder_scheduler_loop():
    """Backward compatibility wrapper: starts the APScheduler."""
    start_apscheduler()


async def trigger_doctor_call_reminder(
    db: Session, patient: Patient, report_id: int
) -> dict[str, Any]:
    """Trigger an on-demand or scheduled Sahayak voice call reminder for an upcoming doctor checkup."""
    report = (
        db.query(Report)
        .filter(Report.id == report_id, Report.patient_id == patient.id)
        .first()
    )
    if not report:
        raise ValueError("Prescription / Medical Report not found")
    if not report.follow_up_date:
        raise ValueError("No follow-up review date found on this report")

    return await telephony_svc.dispatch_doctor_followup_call(
        db, patient, report, force=True
    )

