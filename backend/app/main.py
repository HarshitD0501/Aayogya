"""FastAPI app: upload a prescription -> LangGraph pipeline -> confirm -> dashboard.

Flow (design §5): upload runs the pipeline to the human-confirm interrupt and
stores the report UNCONFIRMED with its parsed meds; confirm resumes the same
graph run (reconcile_active) and flips the gate. Per-patient isolation (design
§11) is enforced on every query.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile
from langgraph.types import Command
from PIL import Image
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
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
from . import scheduler as scheduler_svc  # noqa: E402
from .v1_router import router as v1_router  # noqa: E402
from .auth import authenticate, current_patient, hash_password, make_token, resolve_actor  # noqa: E402
from .config import settings  # noqa: E402
from .db import SessionLocal, get_db, init_db  # noqa: E402
from .dosage import parse_dosage  # noqa: E402
from .extraction import _status  # noqa: E402
from .graph import build_pipeline  # noqa: E402
from .models import Appointment, DoseAdherence, Interaction, Medicine, Patient, ReminderLog, ReminderTask, Report  # noqa: E402
from .schemas import (  # noqa: E402
    AppointmentCreateIn, AppointmentOut, AppointmentRescheduleIn,
    GoogleAuthIn, LoginIn, LoginOut, MedicineOut, PatientOut, RegisterIn, ReminderPrefsIn,
    ReminderPrefsOut, ReminderTaskOut, ReportOut, RescheduleIn, StopMedicineIn,
    TelephonyDispatchIn,
)
from .seed import seed, seed_interactions  # noqa: E402

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
        seed_interactions(db)
        if settings.enable_demo_accounts:
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


def _get_pipeline():
    """Returns the compiled LangGraph extraction pipeline, initializing on-demand if needed."""
    pipeline = getattr(app.state, "pipeline", None)
    if pipeline is None:
        cp, pool = _make_checkpointer()
        pipeline = build_pipeline(cp)
        app.state.pipeline = pipeline
        app.state.pool = pool
    return pipeline

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(caregiver_svc.router)
app.include_router(v1_router)


def _med_out(m: Medicine, include_prices: bool = True) -> MedicineOut:
    out = MedicineOut.model_validate(m)
    if include_prices:
        out.prices = price_svc.get_prices(m.salt, m.strength, brand=m.brand)
    return out


def _report_out(r: Report, include_prices: bool = True) -> ReportOut:
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
        medicines=[_med_out(m, include_prices=include_prices) for m in r.medicines],
    )


def _persist_meds(report: Report, meds: list[dict], patient_id: str, prescriber: str | None) -> None:
    # ERR-001: Unconfirmed prescriptions persist as pending_review until explicit confirmation
    initial_status = "active" if report.confirmed else "pending_review"
    for m in meds:
        d = parse_dosage(m.get("dosage_notation") or "")
        timing = m.get("timing") if m.get("timing") is not None else d.timings
        per_day = m.get("per_day") if m.get("per_day") is not None else d.per_day
        prn = m.get("prn", d.prn)
        report.medicines.append(Medicine(
            patient_id=patient_id, brand=m["brand"], salt=m.get("salt"),
            strength=m.get("strength"), form=m.get("form"),
            dosage_notation=m.get("dosage_notation"), timing=timing or [],
            per_day=per_day or 0.0, prn=prn,
            duration_days=m.get("duration_days"), start_date=m.get("start_date"),
            status=initial_status, confidence=m.get("confidence"),
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
    catalog_counts = price_svc.get_catalog_counts()
    nppa_count = catalog_counts["nppa"]
    jan_count = catalog_counts["jan_aushadhi"]
    total_meds = nppa_count + jan_count
    patient_count = db.query(Patient).count()
    interaction_count = db.query(Interaction).count()
    return {
        "verified_medicines": total_meds,
        "nppa_caps_tracked": nppa_count,
        "jan_aushadhi_generics": jan_count,
        "interaction_rules": interaction_count,
        "active_patients": patient_count,
        "data_sources": ["NPPA Ceiling Prices", "PMBJP Jan Aushadhi"],
        "status": "online",
    }


@app.post("/api/auth/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    patient = authenticate(db, body.identifier, body.password)
    if not patient:
        raise HTTPException(401, "Invalid email/phone or password.")
    if body.role and patient.role != body.role:
        raise HTTPException(403, f"This account is registered as a {patient.role}.")
    return LoginOut(token=make_token(patient.id), patient=PatientOut.model_validate(patient))


@app.post("/api/auth/register", response_model=LoginOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    existing = (
        db.query(Patient)
        .filter((Patient.email == body.email) | (Patient.phone == body.phone))
        .first()
    )
    if existing:
        raise HTTPException(409, "Email or phone number is already registered.")

    patient = Patient(
        id=f"patient-{uuid4().hex}",
        name=body.name,
        email=body.email,
        phone=body.phone,
        password_hash=hash_password(body.password),
        plan="free",
        role=body.role,
    )
    db.add(patient)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Email or phone number is already registered.") from exc
    db.refresh(patient)
    return LoginOut(token=make_token(patient.id), patient=PatientOut.model_validate(patient))


@app.post("/api/auth/google", response_model=LoginOut)
def google_auth(body: GoogleAuthIn, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(503, "Google sign-in is not configured on this server.")

    try:
        from google.auth import exceptions as google_auth_errors
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token
    except ImportError as exc:
        raise HTTPException(503, "Google sign-in dependencies are not installed.") from exc

    try:
        claims = id_token.verify_oauth2_token(
            body.credential,
            GoogleRequest(),
            audience=settings.google_client_id,
        )
    except (ValueError, google_auth_errors.GoogleAuthError) as exc:
        raise HTTPException(401, "Google credential is invalid or expired.") from exc
    except Exception as exc:  # Google certificate/network errors are temporary service failures.
        logger.warning("Google credential verification is unavailable.")
        raise HTTPException(503, "Google sign-in is temporarily unavailable.") from exc

    google_sub = claims.get("sub")
    email = str(claims.get("email") or "").strip().lower()
    email_verified = claims.get("email_verified") is True
    if not google_sub or not email or not email_verified:
        raise HTTPException(401, "Google must provide a verified email address.")

    patient = db.query(Patient).filter(Patient.google_sub == google_sub).first()
    if patient:
        if body.mode == "register":
            raise HTTPException(409, "This Google account already exists. Choose sign in.")
        if patient.role != body.role:
            raise HTTPException(403, f"This account is registered as a {patient.role}.")
    else:
        existing = db.query(Patient).filter(Patient.email == email).first()
        if existing:
            if body.mode == "register":
                raise HTTPException(409, "An account with this email already exists. Choose sign in.")
            google_domain = str(claims.get("hd") or "").strip().lower()
            google_is_authoritative = email.endswith("@gmail.com") or (
                google_domain and email.endswith(f"@{google_domain}")
            )
            if not google_is_authoritative:
                raise HTTPException(409, "Sign in with your password before linking this Google account.")
            if existing.google_sub and existing.google_sub != google_sub:
                raise HTTPException(409, "This email is linked to a different Google account.")
            if existing.role != body.role:
                raise HTTPException(403, f"This account is registered as a {existing.role}.")
            existing.google_sub = google_sub
            patient = existing
        elif body.mode == "login":
            raise HTTPException(401, "No account found for this Google account. Choose register.")
        else:
            patient = Patient(
                id=f"patient-{uuid4().hex}",
                name=str(claims.get("name") or email.split("@", 1)[0])[:100],
                email=email,
                password_hash=None,
                google_sub=google_sub,
                plan="free",
                role=body.role,
            )
            db.add(patient)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This Google account or email is already linked.") from exc
    db.refresh(patient)
    return LoginOut(token=make_token(patient.id), patient=PatientOut.model_validate(patient))


@app.get("/api/auth/me", response_model=PatientOut)
def me(
    authorization: str = Header(None),
    x_patient_id: str = Header(None, alias="X-Patient-Id"),
    db: Session = Depends(get_db),
):
    """Who am I — the LOGGED-IN ACCOUNT, not the patient being acted on.
    current_patient would resolve a caregiver to their linked patient, so a
    caregiver reloading the page would lose their caregiver identity (or 403
    on a stale X-Patient-Id) and the caregiver dashboard would never load.
    resolve_actor[0] is the account; data routes keep using the patient."""
    actor, _patient = resolve_actor(authorization, x_patient_id, db, require_linked=False)
    return PatientOut.model_validate(actor)


MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB limit
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


@app.post("/api/reports/upload", response_model=ReportOut)
async def upload_report(
    file: UploadFile = File(...),
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    if not file.content_type or file.content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, "Upload an image of the prescription in JPEG, PNG, or WebP format.")
    image = await file.read(MAX_UPLOAD_BYTES + 1)
    if not image:
        raise HTTPException(400, "Empty file.")
    if len(image) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "File exceeds maximum permitted size of 10 MB.")

    # ERR-023: Verify image format, dimension bounds, and protect against decompression bombs
    Image.MAX_IMAGE_PIXELS = 25_000_000
    try:
        with Image.open(io.BytesIO(image)) as img:
            img.verify()
            fmt = (img.format or "").upper()
            if fmt not in ALLOWED_FORMATS:
                raise HTTPException(400, f"Unsupported image format ({fmt}). Allowed: JPEG, PNG, WebP.")
        with Image.open(io.BytesIO(image)) as img:
            w, h = img.size
            if w < 10 or h < 10:
                raise HTTPException(400, "Image dimensions are too small to be a legible prescription.")
            if w > 10000 or h > 10000:
                raise HTTPException(400, "Image dimensions exceed maximum safe limit (10000x10000).")
    except HTTPException:
        raise
    except Image.DecompressionBombError:
        raise HTTPException(400, "Image exceeds maximum safe pixel dimensions (decompression bomb protection).")
    except Exception as exc:
        logger.warning("Invalid or corrupt image uploaded (patient=%s): %s", patient.id, exc)
        raise HTTPException(400, "The uploaded file is not a valid or readable image.")

    # Run the pipeline to the human-confirm interrupt; offloaded to a worker thread
    # so the async event loop stays responsive during the ~15s VLM extraction.
    thread_id = uuid4().hex
    config = {"configurable": {"thread_id": thread_id}}
    pipe = _get_pipeline()
    try:
        await run_in_threadpool(
            pipe.invoke,
            {"image_b64": base64.b64encode(image).decode(),
             "mime": file.content_type, "patient_id": patient.id},
            config,
        )
    except Exception as e:  # OCR/Gemini/HF failure (bad key, 429 quota, network)
        logger.exception("Extraction pipeline failed (patient=%s)", patient.id)
        raise HTTPException(502, f"Extraction service error: {type(e).__name__}: {str(e)[:200]}")

    try:
        snap = pipe.get_state(config).values

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

    today = date.today().isoformat()
    if not report.confirmed and report.thread_id:
        # Resume the paused graph run: human_confirm -> reconcile_active.
        config = {"configurable": {"thread_id": report.thread_id}}
        pipe = _get_pipeline()
        try:
            pipe.invoke(Command(resume={"confirmed": True}), config)
            final = pipe.get_state(config).values.get("meds", [])
            # rows were persisted in graph-med order; ids ascend in that order.
            for med, fm in zip(sorted(report.medicines, key=lambda x: x.id), final):
                med.status = fm.get("status") or _status(med.start_date or today, med.duration_days)
        except Exception:
            # Checkpoint gone (server restarted; sqlite MemorySaver is volatile) ->
            # reconcile straight from the persisted rows. Same result as the graph node.
            for med in report.medicines:
                med.status = _status(med.start_date or today, med.duration_days)
    else:
        for med in report.medicines:
            if med.status == "pending_review":
                med.status = _status(med.start_date or today, med.duration_days)

    report.confirmed = True
    if report.follow_up_date:
        scheduler_svc.sync_appointment_from_report(db, patient, report)
    db.commit()
    db.refresh(report)
    return _report_out(report)


@app.get("/api/reports", response_model=list[ReportOut])
def list_reports(
    include_prices: bool = Query(False),
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Report)
        .options(selectinload(Report.medicines))  # avoid N+1 on medicines
        .filter(Report.patient_id == patient.id)
        .order_by(Report.created_at.desc())
        .all()
    )
    return [_report_out(r, include_prices=include_prices) for r in rows]


@app.get("/api/medicines", response_model=list[MedicineOut])
def list_medicines(
    include_prices: bool = Query(True),
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Medicine)
        .outerjoin(Report, Medicine.report_id == Report.id)
        .filter(
            Medicine.patient_id == patient.id,
            Medicine.status == "active",
            or_(Medicine.report_id.is_(None), Report.confirmed.is_(True)),
        )
        .all()
    )
    return [_med_out(m, include_prices=include_prices) for m in rows]


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


@app.get("/api/chat/health")
async def chat_health(
    authorization: str = Header(None),
    x_patient_id: str = Header(None, alias="X-Patient-Id"),
    db: Session = Depends(get_db),
):
    """Check agent availability without exposing upstream errors or URLs."""
    resolve_actor(authorization, x_patient_id, db)
    agent_url = httpx.URL(settings.agent_chat_url)
    health_url = str(agent_url.copy_with(path="/health", query=None, fragment=None))
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(health_url)
        available = response.is_success
    except httpx.HTTPError:
        available = False
    return {"available": available}


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
    except httpx.HTTPError as exc:
        logger.warning("Text assistant upstream request failed (%s).", type(exc).__name__)
        raise HTTPException(
            503,
            "The text assistant is temporarily unavailable. Please try again shortly or use Live Voice.",
        ) from exc
    try:
        return r.json()
    except ValueError as exc:
        logger.warning("Text assistant returned an invalid response body.")
        raise HTTPException(
            503,
            "The text assistant is temporarily unavailable. Please try again shortly or use Live Voice.",
        ) from exc


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
    try:
        from livekit import api  # local import: voice is optional, keep it off the hot path
        from livekit.protocol.agent_dispatch import RoomAgentDispatch
        from livekit.protocol.room import RoomConfiguration
    except ImportError:
        raise HTTPException(
            501,
            "Voice runtime dependencies missing: install livekit-api and livekit-protocol."
        )

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
    logger.warning("WhatsApp Webhook verify mismatch: invalid or missing verification token")
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

    if patient.whatsapp_reminders_enabled is False:
        raise HTTPException(400, "WhatsApp reminders are disabled in patient preferences")

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
    """Manually test or trigger the automated reminder scheduler immediately for the authenticated patient (ERR-002)."""
    res = await wa_svc.run_automated_reminders_check(db, force=True, target_patient_id=patient.id)
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
            ReminderLog.body.like(f"%(report #{report.id},%"),
        )
        .order_by(ReminderLog.sent_at.desc())
        .limit(5)
        .all()
    )

    latest_call = logs[0] if logs else None
    current_status = latest_call.call_status if latest_call else (report.follow_up_status or "scheduled")

    return {
        "report_id": report.id,
        "follow_up_date": report.follow_up_date,
        "follow_up_status": report.follow_up_status or "scheduled",
        "status": current_status,
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


@app.get("/api/appointments", response_model=list[AppointmentOut])
def list_appointments(
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """List all appointments for the authenticated patient with per-patient isolation (ERR-016)."""
    return (
        db.query(Appointment)
        .filter(Appointment.patient_id == patient.id)
        .order_by(Appointment.appointment_at_utc.desc())
        .all()
    )


@app.post("/api/appointments", response_model=AppointmentOut)
def create_appointment_endpoint(
    payload: AppointmentCreateIn,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Schedule or confirm an appointment with exact timezone and instant (ERR-016)."""
    tz = payload.timezone or patient.timezone or "Asia/Kolkata"
    appt_utc, is_date_only = scheduler_svc.parse_iso_or_local_datetime(payload.appointment_at, tz_name=tz)
    confirmed_source = "date_only_pending_time" if is_date_only else "manual"

    appt, _ = scheduler_svc.schedule_appointment(
        db=db,
        patient_id=patient.id,
        appointment_at_utc=appt_utc,
        timezone_str=tz,
        report_id=payload.report_id,
        doctor_name=payload.doctor_name,
        doctor_specialty=payload.doctor_specialty,
        offset_minutes=payload.offset_minutes or 2880,
        confirmed_source=confirmed_source,
    )
    return appt


@app.post("/api/appointments/{appointment_id}/reschedule", response_model=AppointmentOut)
def reschedule_appointment_by_id(
    appointment_id: int,
    payload: AppointmentRescheduleIn,
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Reschedule an appointment by ID with version increment and task invalidation (ERR-016)."""
    appt = db.get(Appointment, appointment_id)
    if not appt or appt.patient_id != patient.id:
        raise HTTPException(404, "Appointment not found.")

    tz = payload.timezone or appt.timezone or patient.timezone or "Asia/Kolkata"
    new_utc, _ = scheduler_svc.parse_iso_or_local_datetime(payload.new_appointment_at, tz_name=tz)

    updated_appt, _ = scheduler_svc.reschedule_appointment(
        db=db,
        appointment_id=appointment_id,
        new_appointment_at_utc=new_utc,
        timezone_str=tz,
        reason=payload.reason,
        preferred_date_str=payload.preferred_date_str,
    )
    return updated_appt


@app.post("/api/appointments/{appointment_id}/cancel", response_model=AppointmentOut)
def cancel_appointment_by_id(
    appointment_id: int,
    reason: Optional[str] = Query(None),
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Cancel an appointment by ID and invalidate all pending reminder tasks (ERR-016)."""
    appt = db.get(Appointment, appointment_id)
    if not appt or appt.patient_id != patient.id:
        raise HTTPException(404, "Appointment not found.")

    return scheduler_svc.cancel_appointment(db=db, appointment_id=appointment_id, reason=reason)


@app.get("/api/appointments/tasks", response_model=list[ReminderTaskOut])
def list_reminder_tasks(
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """List reminder outbox tasks for the authenticated patient with per-patient isolation (ERR-017)."""
    return (
        db.query(ReminderTask)
        .filter(ReminderTask.patient_id == patient.id)
        .order_by(ReminderTask.reminder_at_utc.desc())
        .all()
    )


@app.post("/api/appointments/tick")
async def trigger_scheduler_tick(
    patient: Patient = Depends(current_patient),
    db: Session = Depends(get_db),
):
    """Trigger an immediate durable outbox scheduler tick scoped safely (ERR-017)."""
    return await scheduler_svc.tick_reminder_tasks(db=db)


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Aayogya Backend API",
        "version": "1.0.0",
        "docs": "/docs",
    }



