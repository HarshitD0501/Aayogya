"""FastAPI app: upload a prescription -> LangGraph pipeline -> confirm -> dashboard.

Flow (design §5): upload runs the pipeline to the human-confirm interrupt and
stores the report UNCONFIRMED with its parsed meds; confirm resumes the same
graph run (reconcile_active) and flips the gate. Per-patient isolation (design
§11) is enforced on every query.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from langgraph.types import Command
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from starlette.concurrency import run_in_threadpool
import httpx

load_dotenv()

from . import interactions as interaction_svc  # noqa: E402
from . import prices as price_svc  # noqa: E402
from . import summary as summary_svc  # noqa: E402
from . import telephony as telephony_svc  # noqa: E402
from . import whatsapp as wa_svc  # noqa: E402
from . import caregiver as caregiver_svc  # noqa: E402
from .auth import authenticate, current_patient, make_token, resolve_actor  # noqa: E402
from .config import settings  # noqa: E402
from .db import SessionLocal, get_db, init_db  # noqa: E402
from .extraction import _status  # noqa: E402
from .graph import build_pipeline  # noqa: E402
from .models import DoseAdherence, Medicine, Patient, ReminderLog, Report  # noqa: E402
from .schemas import (  # noqa: E402
    LoginIn, LoginOut, MedicineOut, PatientOut, ReminderPrefsIn,
    ReminderPrefsOut, ReportOut, RescheduleIn, StopMedicineIn,
    TelephonyDispatchIn,
)
from .seed import seed  # noqa: E402

STATIC = Path(__file__).parent / "static"

logger = logging.getLogger(__name__)


def _make_checkpointer():
    """PostgresSaver (persistent, multi-worker safe) on Postgres; in-memory on
    sqlite so local/dev needs no setup. Returns (checkpointer, pool_or_None)."""
    if settings.is_postgres:
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        pool = ConnectionPool(
            conninfo=settings.pg_conninfo(),
            max_size=settings.db_pool_size + settings.db_max_overflow,
            kwargs={"autocommit": True, "row_factory": dict_row, "prepare_threshold": 0},
            open=False,
        )
        pool.open()
        cp = PostgresSaver(pool)
        cp.setup()  # idempotent: creates checkpoint tables if absent
        return cp, pool
    from langgraph.checkpoint.memory import MemorySaver

    return MemorySaver(), None


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    cp, pool = _make_checkpointer()
    app.state.pipeline = build_pipeline(cp)
    app.state.pool = pool
    wa_svc.start_apscheduler()
    yield
    wa_svc.stop_apscheduler()
    await wa_svc.close_http_client()
    if pool is not None:
        pool.close()


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Aayogya - extraction backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(caregiver_svc.router)


def _med_out(m: Medicine) -> MedicineOut:
    out = MedicineOut.model_validate(m)
    out.prices = price_svc.get_prices(m.salt, m.strength, brand=m.brand)
    return out


def _report_out(r: Report) -> ReportOut:
    return ReportOut(
        id=r.id, patient_id=r.patient_id, filename=r.filename,
        prescriber_name=r.prescriber_name, prescriber_specialty=r.prescriber_specialty,
        prescription_date=r.prescription_date, follow_up_date=r.follow_up_date,
        follow_up_status=r.follow_up_status or "scheduled",
        reschedule_preferred_date=r.reschedule_preferred_date,
        reschedule_notes=r.reschedule_notes,
        last_call_at=r.last_call_at.isoformat() if r.last_call_at else None,
        ocr_confidence=r.ocr_confidence,
        confirmed=r.confirmed,
        created_at=r.created_at.isoformat() if r.created_at else None,
        medicines=[_med_out(m) for m in r.medicines],
    )


def _persist_meds(report: Report, meds: list[dict], patient_id: str, prescriber: str | None) -> None:
    for m in meds:
        report.medicines.append(Medicine(
            patient_id=patient_id, brand=m["brand"], salt=m.get("salt"),
            strength=m.get("strength"), form=m.get("form"),
            dosage_notation=m.get("dosage_notation"), timing=m.get("timing") or [],
            per_day=m.get("per_day") or 0.0, prn=m.get("prn", False),
            duration_days=m.get("duration_days"), start_date=m.get("start_date"),
            status=m.get("status", "active"), confidence=m.get("confidence"),
            needs_salt_confirmation=m.get("needs_salt_confirmation", False),
            prescriber_name=prescriber,
        ))


@app.get("/api/prices")
def get_public_prices(
    brand: str | None = Query(None),
    salt: str | None = Query(None),
    strength: str | None = Query(None),
):
    """Public real-time price discovery endpoint combining PharmEasy, NPPA, and Jan Aushadhi."""
    return price_svc.get_prices(salt=salt, strength=strength, brand=brand)


@app.get("/api/public/stats")
def get_public_stats(db: Session = Depends(get_db)):
    """Public platform stats for landing page trust metrics and live indicators."""
    nppa_count = len(getattr(price_svc, "_NPPA_CEILING_PRICES", {}))
    jan_count = len(getattr(price_svc, "_JAN_AUSHADHI_PRICES", {}))
    total_meds = max(120, nppa_count + jan_count)
    patient_count = db.query(Patient).count()
    return {
        "verified_medicines": total_meds,
        "nppa_caps_tracked": nppa_count,
        "jan_aushadhi_generics": jan_count,
        "interaction_rules": 14,
        "active_patients": patient_count,
        "live_partner": "PharmEasy India",
        "status": "online",
    }


@app.post("/api/auth/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    patient = authenticate(db, body.identifier, body.password)
    if not patient:
        raise HTTPException(401, "Invalid email/phone or password.")
    return LoginOut(token=make_token(patient.id), patient=PatientOut.model_validate(patient))


@app.get("/api/auth/me", response_model=PatientOut)
def me(patient: Patient = Depends(current_patient)):
    return PatientOut.model_validate(patient)


@app.post("/api/reports/upload", response_model=ReportOut)
async def upload_report(
    file: UploadFile = File(...),
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Upload an image of the prescription.")
    image = await file.read()
    if not image:
        raise HTTPException(400, "Empty file.")

    # Run the pipeline to the human-confirm interrupt; offloaded to a worker thread
    # so the async event loop stays responsive during the ~15s VLM extraction.
    thread_id = uuid4().hex
    config = {"configurable": {"thread_id": thread_id}}
    try:
        await run_in_threadpool(
            app.state.pipeline.invoke,
            {"image_b64": base64.b64encode(image).decode(),
             "mime": file.content_type, "patient_id": patient.id},
            config,
        )
    except Exception as e:  # OCR/Gemini/HF failure (bad key, 429 quota, network)
        logger.exception("Extraction pipeline failed (patient=%s)", patient.id)
        raise HTTPException(502, f"Extraction service error: {type(e).__name__}: {str(e)[:200]}")

    try:
        snap = app.state.pipeline.get_state(config).values

        report = Report(
            patient_id=patient.id, thread_id=thread_id, filename=file.filename,
            raw_ocr=snap.get("raw_ocr", ""), ocr_confidence=snap.get("overall_confidence"),
            prescriber_name=snap.get("prescriber_name"),
            prescriber_specialty=snap.get("prescriber_specialty"),
            prescription_date=snap.get("prescription_date"),
            follow_up_date=snap.get("follow_up_date"),
            parsed_json=snap, confirmed=False,
        )
        _persist_meds(report, snap.get("meds", []), patient.id, snap.get("prescriber_name"))
        db.add(report)
        db.commit()
        db.refresh(report)

        out = _report_out(report)
        out.mock = snap.get("mock", False)
        return out
    except Exception as e:
        db.rollback()
        logger.exception("Failed to save extracted prescription (patient=%s)", patient.id)
        raise HTTPException(500, f"Error saving extracted prescription: {type(e).__name__}: {str(e)}")


@app.post("/api/reports/{report_id}/confirm", response_model=ReportOut)
def confirm_report(
    report_id: int,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    report = db.get(Report, report_id)
    if not report or report.patient_id != patient.id:  # isolation: no cross-patient access
        raise HTTPException(404, "Report not found.")

    if not report.confirmed and report.thread_id:
        # Resume the paused graph run: human_confirm -> reconcile_active.
        config = {"configurable": {"thread_id": report.thread_id}}
        try:
            app.state.pipeline.invoke(Command(resume={"confirmed": True}), config)
            final = app.state.pipeline.get_state(config).values.get("meds", [])
            # rows were persisted in graph-med order; ids ascend in that order.
            for med, fm in zip(sorted(report.medicines, key=lambda x: x.id), final):
                med.status = fm.get("status", med.status)
        except Exception:
            # Checkpoint gone (server restarted; sqlite MemorySaver is volatile) ->
            # reconcile straight from the persisted rows. Same result as the graph node.
            today = date.today().isoformat()
            for med in report.medicines:
                med.status = _status(med.start_date or today, med.duration_days)

    report.confirmed = True
    db.commit()
    db.refresh(report)
    return _report_out(report)


@app.get("/api/reports", response_model=list[ReportOut])
def list_reports(patient: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    rows = (
        db.query(Report)
        .options(selectinload(Report.medicines))  # avoid N+1 on medicines
        .filter(Report.patient_id == patient.id)
        .order_by(Report.created_at.desc())
        .all()
    )
    return [_report_out(r) for r in rows]


@app.get("/api/medicines", response_model=list[MedicineOut])
def list_medicines(patient: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    rows = (
        db.query(Medicine)
        .filter(Medicine.patient_id == patient.id, Medicine.status == "active")
        .all()
    )
    return [_med_out(m) for m in rows]


@app.get("/api/interactions")
def get_interactions(patient: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    return interaction_svc.check(db, patient.id)


@app.get("/api/summary")
def get_summary(patient: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    """Structured profile: conditions, daily schedule, next visit, dose/reminder tracking."""
    return summary_svc.build(db, patient)


class ChatIn(BaseModel):
    message: str
    history: list[dict] = []  # [{"role": "user"|"model", "text": "..."}]


@app.post("/api/chat")
async def chat(
    body: ChatIn,
    authorization: str = Header(None),
    x_patient_id: str = Header(None, alias="X-Patient-Id"),
    db: Session = Depends(get_db),
):
    """Proxy to the agent service (the shared brain). resolve_actor enforces auth
    here; the agent's tools read only the resolved patient's records (isolation,
    design §11). A caregiver's own token would 401 inside the agent's tools
    (patient-only), so when a caregiver acts we mint a fresh patient-scoped
    token — they can only reach linked patients, so isolation holds.
    One origin => no browser CORS."""
    actor, patient = resolve_actor(authorization, x_patient_id, db)
    token = (
        authorization.split(" ", 1)[1]
        if actor.id == patient.id
        else make_token(patient.id)
    )
    try:
        async with httpx.AsyncClient(timeout=60.0) as c:
            r = await c.post(settings.agent_chat_url,
                             json={"message": body.message, "history": body.history, "token": token})
        r.raise_for_status()
    except httpx.HTTPError as e:  # agent down, or its LLM errored (e.g. Gemini quota)
        raise HTTPException(502, f"Assistant unavailable: {type(e).__name__}. Is the agent service running on {settings.agent_chat_url}?")
    return r.json()


@app.post("/api/voice/token")
def voice_token(
    authorization: str = Header(None),
    x_patient_id: str = Header(None, alias="X-Patient-Id"),
    db: Session = Depends(get_db),
):
    """Mint a LiveKit room-join token for this patient's browser mic. The patient's
    backend bearer token rides in the LiveKit token METADATA so the voice.py worker,
    on joining the room, acts AS this patient (isolation §11) — never demo creds.
    Caregivers get a freshly minted PATIENT token (they can only reach linked
    patients — same rule as /api/chat). The token also carries a room_config
    dispatch targeting the named agent worker (settings.livekit_agent_name) —
    required now that the worker registers with an explicit agent_name and no
    longer auto-joins rooms. Room names are unique per request, so the token
    dispatch fires at room creation as documented.
    Signing is local (no LiveKit server call); needs LIVEKIT_* configured."""
    if not (settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret):
        raise HTTPException(501, "Voice not configured: set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.")
    from livekit import api  # local import: voice is optional, keep it off the hot path
    from livekit.protocol.agent_dispatch import RoomAgentDispatch
    from livekit.protocol.room import RoomConfiguration

    actor, patient = resolve_actor(authorization, x_patient_id, db)
    backend_token = (
        authorization.split(" ", 1)[1] if actor.id == patient.id else make_token(patient.id)
    )
    room = f"aayogya-{patient.id}-{uuid4().hex[:8]}"  # per-call room, namespaced by patient
    jwt = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(patient.id)
        .with_metadata(json.dumps({"backend_token": backend_token}))
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .with_room_config(
            RoomConfiguration(
                agents=[
                    RoomAgentDispatch(
                        agent_name=settings.livekit_agent_name,
                        metadata=json.dumps({"backend_token": backend_token}),
                    )
                ]
            )
        )
        .to_jwt()
    )
    return {"url": settings.livekit_url, "token": jwt, "room": room}


# --- WhatsApp Meta Cloud API & Adherence Endpoints ---

class SendReminderIn(BaseModel):
    adherence_id: int


class SimulateReplyIn(BaseModel):
    adherence_id: int
    action: str  # "taken" | "missed"


@app.get("/api/whatsapp/webhook")
def whatsapp_webhook_verify(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
):
    """Meta Webhook Challenge Verification (GET).
    Meta tests connectivity by sending hub.mode=subscribe and hub.verify_token.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        logger.info("Meta WhatsApp Webhook successfully verified with challenge: %s", hub_challenge)
        return Response(content=hub_challenge or "", media_type="text/plain")
    logger.warning("WhatsApp Webhook verify mismatch: received token %s", hub_verify_token)
    raise HTTPException(403, "Verification token mismatch")


@app.post("/api/whatsapp/webhook")
async def whatsapp_webhook_receive(
    request: Request,
    db: Session = Depends(get_db),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
):
    """Meta Webhook Notifications (POST).
    Receives interactive button clicks ('✅ Yes, Taken' / '❌ Missed') and text replies.
    """
    body_bytes = await request.body()
    if not wa_svc.verify_signature(body_bytes, x_hub_signature_256):
        raise HTTPException(401, "Invalid webhook HMAC signature")
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")
    res = await wa_svc.process_webhook_payload(payload, db)
    return {"status": "ok", "details": res}


@app.post("/api/whatsapp/send-reminder")
async def send_dose_reminder(
    req: SendReminderIn,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Trigger sending an interactive WhatsApp reminder for all medicines in this slot."""
    adh = db.query(DoseAdherence).filter(
        DoseAdherence.id == req.adherence_id,
        DoseAdherence.patient_id == patient.id,
    ).first()
    if not adh:
        raise HTTPException(404, "Scheduled dose adherence record not found")

    # Group all pending medicines for this patient in this same slot so a single message is sent
    slot_doses = (
        db.query(DoseAdherence)
        .filter(
            DoseAdherence.patient_id == patient.id,
            DoseAdherence.dose_date == adh.dose_date,
            DoseAdherence.slot == adh.slot,
            DoseAdherence.status == "pending",
        )
        .all()
    )
    if not slot_doses:
        slot_doses = [adh]

    return await wa_svc.send_interactive_slot_reminder(db, patient, adh.slot, slot_doses)


@app.post("/api/whatsapp/simulate-reply")
async def simulate_whatsapp_reply(
    req: SimulateReplyIn,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Simulate patient tapping '✅ Yes, Taken' or '❌ Missed / Forgot' in WhatsApp.
    Allows end-to-end testing of the exact webhook flow from the dashboard.
    """
    adh = db.query(DoseAdherence).filter(
        DoseAdherence.id == req.adherence_id,
        DoseAdherence.patient_id == patient.id,
    ).first()
    if not adh:
        raise HTTPException(404, "Scheduled dose adherence record not found")

    action_type = "taken" if "take" in req.action.lower() else "missed"

    # Find all matching doses in this slot to mark all together
    slot_doses = (
        db.query(DoseAdherence)
        .filter(
            DoseAdherence.patient_id == patient.id,
            DoseAdherence.dose_date == adh.dose_date,
            DoseAdherence.slot == adh.slot,
            DoseAdherence.status == "pending",
        )
        .all()
    )
    if not slot_doses:
        slot_doses = [adh]

    ids_str = ",".join(str(a.id) for a in slot_doses)
    btn_id = f"batch_{action_type}_{ids_str}"
    mock_payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "from": patient.phone or "919454535137",
                        "type": "interactive",
                        "interactive": {
                            "type": "button_reply",
                            "button_reply": {
                                "id": btn_id,
                                "title": "✅ Yes, Taken" if action_type == "taken" else "❌ Missed / Forgot",
                            },
                        },
                    }],
                },
            }],
        }],
    }
    return await wa_svc.process_webhook_payload(mock_payload, db)


@app.get("/api/adherence/today")
def get_today_adherence(
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Return all scheduled doses and adherence states for today."""
    adherences = wa_svc.sync_today_adherence(db, patient.id)
    return [
        {
            "id": a.id,
            "medicine_id": a.medicine_id,
            "brand": a.medicine.brand if a.medicine else "",
            "strength": a.medicine.strength if a.medicine else "",
            "slot": a.slot,
            "scheduled_time": a.scheduled_time,
            "status": a.status,
            "confirmed_at": a.confirmed_at.isoformat() if a.confirmed_at else None,
            "notes": a.notes,
        }
        for a in adherences
    ]


@app.get("/api/reminders/preferences", response_model=ReminderPrefsOut)
def get_reminder_preferences(
    patient: Patient = Depends(current_patient),
):
    """Get the patient's automated reminder settings (WhatsApp & Call)."""
    return ReminderPrefsOut(
        auto_reminders_enabled=patient.auto_reminders_enabled is not False,
        whatsapp_reminders_enabled=patient.whatsapp_reminders_enabled is not False,
        call_reminders_enabled=bool(patient.call_reminders_enabled),
        reminder_time_morning=getattr(patient, "reminder_time_morning", "08:00 AM") or "08:00 AM",
        reminder_time_afternoon=getattr(patient, "reminder_time_afternoon", "01:00 PM") or "01:00 PM",
        reminder_time_night=getattr(patient, "reminder_time_night", "08:00 PM") or "08:00 PM",
    )


@app.post("/api/reminders/preferences", response_model=ReminderPrefsOut)
def update_reminder_preferences(
    body: ReminderPrefsIn,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Update master auto-reminder controls so the patient is not spammed."""
    p = db.get(Patient, patient.id)
    if not p:
        raise HTTPException(404, "Patient not found")
    if body.auto_reminders_enabled is not None:
        p.auto_reminders_enabled = body.auto_reminders_enabled
    if body.whatsapp_reminders_enabled is not None:
        p.whatsapp_reminders_enabled = body.whatsapp_reminders_enabled
    if body.call_reminders_enabled is not None:
        p.call_reminders_enabled = body.call_reminders_enabled
    if body.reminder_time_morning is not None:
        p.reminder_time_morning = body.reminder_time_morning
    if body.reminder_time_afternoon is not None:
        p.reminder_time_afternoon = body.reminder_time_afternoon
    if body.reminder_time_night is not None:
        p.reminder_time_night = body.reminder_time_night
    db.commit()
    db.refresh(p)
    wa_svc.sync_today_adherence(db, p.id)
    return ReminderPrefsOut(
        auto_reminders_enabled=p.auto_reminders_enabled is not False,
        whatsapp_reminders_enabled=p.whatsapp_reminders_enabled is not False,
        call_reminders_enabled=bool(p.call_reminders_enabled),
        reminder_time_morning=p.reminder_time_morning or "08:00 AM",
        reminder_time_afternoon=p.reminder_time_afternoon or "01:00 PM",
        reminder_time_night=p.reminder_time_night or "08:00 PM",
    )


@app.post("/api/medicines/{medicine_id}/stop")
def stop_patient_medicine(
    medicine_id: int,
    body: StopMedicineIn = StopMedicineIn(),
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Patient is fit / completed course -> stops medicine and halts all reminders."""
    try:
        med = wa_svc.stop_medicine(db, medicine_id, patient.id, reason=body.reason)
        return {
            "status": "stopped",
            "medicine_id": med.id,
            "brand": med.brand,
            "reason": med.stopped_reason,
        }
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/medicines/{medicine_id}/resume")
def resume_patient_medicine(
    medicine_id: int,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Resume a previously stopped medicine and restore dose reminder schedule."""
    try:
        med = wa_svc.resume_medicine(db, medicine_id, patient.id)
        return {"status": "resumed", "medicine_id": med.id, "brand": med.brand}
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/medicines/{medicine_id}/toggle-reminders")
def toggle_medicine_reminders_endpoint(
    medicine_id: int,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Pause or unpause reminders for a specific active medicine."""
    try:
        med = wa_svc.toggle_medicine_reminders(db, medicine_id, patient.id)
        return {
            "status": "updated",
            "medicine_id": med.id,
            "brand": med.brand,
            "reminders_enabled": med.reminders_enabled,
        }
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/reminders/trigger-check")
async def trigger_automated_reminders(
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Manually test or trigger the automated reminder scheduler immediately."""
    res = await wa_svc.run_automated_reminders_check(db, force=True)
    return {"status": "triggered", "details": res}


@app.post("/api/reports/{report_id}/trigger-call-reminder")
async def trigger_report_call_reminder(
    report_id: int,
    request: Request,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Simulate or place an automated 2-day doctor follow-up voice call from Sahayak."""
    try:
        report = (
            db.query(Report)
            .filter(Report.id == report_id, Report.patient_id == patient.id)
            .first()
        )
        if not report:
            raise HTTPException(404, "Report not found")
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "").strip() if auth_header else ""
        return await telephony_svc.dispatch_doctor_followup_call(
            db, patient, report, force=True, auth_token=token
        )
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/telephony/dispatch")
async def dispatch_telephony_call(
    payload: TelephonyDispatchIn,
    request: Request,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Dispatches an outbound phone call via Twilio + LiveKit SIP trunk to remind
    the patient of their doctor review 2 days prior."""
    report = (
        db.query(Report)
        .filter(Report.id == payload.report_id, Report.patient_id == patient.id)
        .first()
    )
    if not report:
        raise HTTPException(404, f"Report #{payload.report_id} not found.")

    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip() if auth_header else ""
    try:
        res = await telephony_svc.dispatch_doctor_followup_call(
            db, patient, report, force=payload.force, auth_token=token
        )
        return res
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/telephony/reschedule")
def reschedule_appointment_endpoint(
    payload: RescheduleIn,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Tool-facing and API endpoint: records patient's preferred reschedule date/time
    and immediately updates report status and dashboard."""
    try:
        res = telephony_svc.handle_reschedule_request(
            db,
            patient_id=patient.id,
            report_id=payload.report_id,
            preferred_date_or_time=payload.preferred_date_or_time,
            reason=payload.reason,
        )
        return res
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.get("/api/telephony/status/{report_id}")
def get_telephony_status_endpoint(
    report_id: int,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Returns current follow-up status, reschedule details, and call history for a report."""
    report = (
        db.query(Report)
        .filter(Report.id == report_id, Report.patient_id == patient.id)
        .first()
    )
    if not report:
        raise HTTPException(404, f"Report #{report_id} not found.")

    logs = (
        db.query(ReminderLog)
        .filter(
            ReminderLog.patient_id == patient.id,
            ReminderLog.channel == "voice",
            ReminderLog.kind == "followup",
        )
        .order_by(ReminderLog.sent_at.desc())
        .limit(5)
        .all()
    )

    return {
        "report_id": report.id,
        "follow_up_date": report.follow_up_date,
        "follow_up_status": report.follow_up_status or "scheduled",
        "reschedule_preferred_date": report.reschedule_preferred_date,
        "reschedule_notes": report.reschedule_notes,
        "last_call_at": report.last_call_at.isoformat() if report.last_call_at else None,
        "recent_calls": [
            {
                "id": l.id,
                "sent_at": l.sent_at.isoformat() if l.sent_at else None,
                "status": l.status,
                "call_status": l.call_status,
                "body": l.body,
            }
            for l in logs
        ],
    }


@app.get("/")
def dashboard():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")


