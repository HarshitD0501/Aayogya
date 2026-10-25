"""Outbound doctor-followup telephony for Aayogya (System A side).

Architecture (per LiveKit outbound-calling docs, docs.livekit.io/telephony/making-calls):
    backend scheduler -> CreateAgentDispatch (new room, agent_name, call metadata)
                      -> voice.py worker accepts the job, dials the patient's phone
                         from INSIDE the entrypoint (wait_until_answered=True),
                         waits for the SIP participant, then starts the session.

The agent (not the backend) performs the dial. This guarantees the agent is in
the room and listening the moment the patient answers, and SIP errors (busy /
no-answer / failed) are handled where the conversation lives.

If LiveKit keys are not configured, runs in zero-key simulation mode: no room,
no dispatch, just a ReminderLog row and a logged payload for local testing.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from . import auth
from .config import settings
from .models import Patient, ReminderLog, Report

logger = logging.getLogger("aayogya.telephony")
IST = ZoneInfo("Asia/Kolkata")


def is_call_time_window(force: bool = False) -> bool:
    """Daytime calling only (09:00-20:00 IST) — patient-friendly hours."""
    if force:
        return True
    now_ist = datetime.now(IST)
    total_mins = now_ist.hour * 60 + now_ist.minute
    return 540 <= total_mins <= 1200


def _call_metadata(patient: Patient, report: Report, backend_token: str) -> dict[str, Any]:
    """Everything the telephony agent needs, JSON-serialized into the dispatch metadata."""
    doc_name = report.prescriber_name or "आपके चिकित्सक"
    return {
        "call_type": "outbound_doctor_reminder",
        "patient_id": patient.id,
        "patient_name": patient.name or "",
        "patient_phone": patient.phone,
        "patient_lang": patient.lang or "hi",
        "doctor_name": doc_name,
        "doctor_specialty": report.prescriber_specialty or "",
        "follow_up_date": report.follow_up_date,
        "report_id": report.id,
        "backend_token": backend_token,
        # dial settings for the agent-side create_sip_participant call
        "sip_trunk_id": settings.livekit_sip_trunk_id,
        "twilio_sip_domain": settings.twilio_sip_domain,
        "twilio_sip_username": settings.twilio_sip_username,
        "twilio_sip_password": settings.twilio_sip_password,
    }


async def dispatch_doctor_followup_call(
    db: Session,
    patient: Patient,
    report: Report,
    *,
    force: bool = False,
    auth_token: Optional[str] = None,
) -> dict[str, Any]:
    """Dispatch an outbound reminder call: agent job first, phone dial happens in
    the agent. Returns the dispatch result; ReminderLog records the attempt."""
    if not report.follow_up_date:
        raise ValueError(f"Report #{report.id} does not have a follow_up_date set.")

    if not patient.phone:
        raise ValueError(f"Patient {patient.name} ({patient.id}) has no phone number recorded.")

    if not settings.outbound_dispatch_enabled:
        logger.warning("[TELEPHONY] Outbound dispatch disabled by server kill switch (ERR-019).")
        return {
            "status": "blocked",
            "reason": "outbound_dispatch_disabled_by_killswitch",
            "patient_id": patient.id,
            "report_id": report.id,
        }

    if settings.outbound_phone_allowlist:
        allowed = [p.strip() for p in settings.outbound_phone_allowlist.split(",") if p.strip()]
        clean_phone = patient.phone.replace(" ", "").replace("-", "")
        if not any(clean_phone.endswith(a.lstrip("+")) or a.lstrip("+").endswith(clean_phone) for a in allowed):
            logger.warning("[TELEPHONY] Destination phone %s not in allowlist (ERR-019).", patient.phone)
            return {
                "status": "blocked",
                "reason": "destination_phone_not_in_allowlist",
                "patient_id": patient.id,
                "report_id": report.id,
            }

    if patient.call_reminders_enabled is False:
        logger.info("[TELEPHONY] Voice call reminders disabled by patient %s; skipping (ERR-019).", patient.id)
        return {
            "status": "skipped",
            "reason": "call_reminders_disabled_by_patient",
            "patient_id": patient.id,
            "report_id": report.id,
        }

    if not is_call_time_window(force):
        logger.info("[TELEPHONY] Current IST time is outside 09:00-20:00 window; deferring call.")
        return {
            "status": "deferred",
            "reason": "outside_calling_hours_window",
            "window": "09:00-20:00 IST",
        }

    if report.last_call_at:
        last_dt = report.last_call_at
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
        if elapsed < 60:
            logger.warning(
                "[TELEPHONY] Rate limit: call cooldown active for report #%s (%d seconds remaining).",
                report.id,
                int(60 - elapsed),
            )
            return {
                "status": "rate_limited",
                "reason": "call_cooldown_active_60s",
                "elapsed_seconds": int(elapsed),
                "report_id": report.id,
            }

    # The agent calls the backend as this patient — a fresh token is minted here
    # so scheduled calls (no HTTP request in flight) carry valid credentials.
    token = auth_token or auth.make_token(patient.id)

    metadata = _call_metadata(patient, report, token)
    room_name = f"followup-{patient.id}-{report.id}-{int(datetime.now(timezone.utc).timestamp())}"

    livekit_configured = bool(
        settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret
    )
    # A dial route: stored LiveKit trunk id, or an inline Twilio SIP-domain config.
    dial_configured = bool(settings.livekit_sip_trunk_id or settings.twilio_sip_domain)

    mode = "live" if (livekit_configured and dial_configured) else "simulated"
    dispatch_id: str | None = None

    if mode == "live":
        try:
            from livekit import api

            lkapi = api.LiveKitAPI(
                url=settings.livekit_url,
                api_key=settings.livekit_api_key,
                api_secret=settings.livekit_api_secret,
            )
            try:
                # One call: create the room AND launch the agent job in it.
                # The worker (voice.py, registered as livekit_agent_name) accepts
                # the dispatch, dials the phone from its entrypoint, and runs the
                # conversation. Room metadata carries the same call info so the
                # agent can re-read it from the room if job metadata is stripped.
                await lkapi.agent_dispatch.create_dispatch(
                    api.CreateAgentDispatchRequest(
                        agent_name=settings.livekit_agent_name,
                        room=room_name,
                        metadata=json.dumps(metadata, ensure_ascii=False),
                    )
                )
                dispatch_id = room_name
                logger.info(
                    "[TELEPHONY] Agent dispatched for outbound call: room=%s patient=%s",
                    room_name,
                    patient.phone,
                )
            finally:
                await lkapi.aclose()
        except Exception as exc:  # noqa: BLE001 - degrade to simulation, never crash the scheduler
            logger.error("[TELEPHONY] Live dispatch failed (%s); logging a failed call.", exc)
            mode = "failed"
            db.add(
                ReminderLog(
                    patient_id=patient.id,
                    channel="voice",
                    kind="followup",
                    body=f"Outbound follow-up call to {patient.phone} failed at dispatch: {exc}",
                    status="failed",
                    call_status="failed",
                )
            )
            db.commit()
            return {
                "status": "dispatch_failed",
                "mode": "failed",
                "error": str(exc),
                "patient_id": patient.id,
                "report_id": report.id,
            }
    else:
        logger.info(
            "[TELEPHONY] LiveKit/Twilio dial keys not configured; simulated outbound call "
            "logged for %s (report #%s, follow-up %s).",
            patient.phone,
            report.id,
            report.follow_up_date,
        )

    report.last_call_at = datetime.now(timezone.utc)
    db.add(
        ReminderLog(
            patient_id=patient.id,
            channel="voice",
            kind="followup",
            body=(
                f"Outbound doctor follow-up call dispatched to {patient.phone} "
                f"(report #{report.id}, follow-up {report.follow_up_date}, mode {mode})."
            ),
            status="sent" if mode == "live" else "simulated",
            call_status="dispatched" if mode == "live" else "simulated",
        )
    )
    db.commit()

    return {
        "status": "dispatched" if mode == "live" else "simulated",
        "channel": "voice",
        "mode": mode,
        "call_id": room_name or f"sim-{report.id}-{int(datetime.now(timezone.utc).timestamp())}",
        "room_name": room_name if mode == "live" else None,
        "agent_name": settings.livekit_agent_name if mode == "live" else None,
        "patient_id": patient.id,
        "patient_name": patient.name,
        "patient_phone": patient.phone,
        "doctor": report.prescriber_name,
        "follow_up_date": report.follow_up_date,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def handle_reschedule_request(
    db: Session,
    patient_id: str,
    report_id: int,
    preferred_date_or_time: str,
    reason: Optional[str] = None,
) -> dict[str, Any]:
    """Record the patient's preferred alternative time (tool call from the agent,
    or POST from the dashboard). Sets follow_up_status=reschedule_requested."""
    report = (
        db.query(Report)
        .filter(Report.id == report_id, Report.patient_id == patient_id)
        .first()
    )
    if not report:
        raise ValueError(f"Report #{report_id} not found for patient {patient_id}.")

    if not preferred_date_or_time or not preferred_date_or_time.strip():
        raise ValueError("preferred_date_or_time must not be empty.")

    report.follow_up_status = "reschedule_requested"
    report.reschedule_preferred_date = preferred_date_or_time.strip()
    report.reschedule_notes = (reason or "").strip() or "Requested via Sahayak Voice Call"

    db.add(
        ReminderLog(
            patient_id=patient_id,
            channel="voice",
            kind="followup",
            body=(
                f"Patient requested reschedule for checkup with "
                f"{report.prescriber_name or 'Doctor'}. Preferred new time: "
                f"{report.reschedule_preferred_date}. Reason: {report.reschedule_notes}"
            ),
            status="reschedule_requested",
            call_status="rescheduled",
        )
    )
    db.commit()
    db.refresh(report)

    logger.info(
        "[TELEPHONY] Reschedule recorded for patient %s (Report #%d) -> %s",
        patient_id,
        report_id,
        preferred_date_or_time,
    )

    return {
        "status": "rescheduled",
        "report_id": report.id,
        "patient_id": patient_id,
        "follow_up_status": report.follow_up_status,
        "reschedule_preferred_date": report.reschedule_preferred_date,
        "reschedule_notes": report.reschedule_notes,
        "original_date": report.follow_up_date,
    }
