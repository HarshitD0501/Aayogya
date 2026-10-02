"""FastAPI app: upload a prescription -> LangGraph pipeline -> confirm -> dashboard.

Flow (design §5): upload runs the pipeline to the human-confirm interrupt and
stores the report UNCONFIRMED with its parsed meds; confirm resumes the same
graph run (reconcile_active) and flips the gate. Per-patient isolation (design
§11) is enforced on every query.
"""
from __future__ import annotations

import base64
import json
import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
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
from .auth import authenticate, current_patient, make_token  # noqa: E402
from .config import settings  # noqa: E402
from .db import SessionLocal, get_db, init_db  # noqa: E402
from .extraction import _status  # noqa: E402
from .graph import build_pipeline  # noqa: E402
from .models import Medicine, Patient, Report  # noqa: E402
from .schemas import LoginIn, LoginOut, MedicineOut, PatientOut, ReportOut  # noqa: E402
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
    yield
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


def _med_out(m: Medicine) -> MedicineOut:
    out = MedicineOut.model_validate(m)
    out.prices = price_svc.get_prices(m.salt, m.strength, brand=m.brand)
    return out


def _report_out(r: Report) -> ReportOut:
    return ReportOut(
        id=r.id, patient_id=r.patient_id, filename=r.filename,
        prescriber_name=r.prescriber_name, prescriber_specialty=r.prescriber_specialty,
        prescription_date=r.prescription_date, follow_up_date=r.follow_up_date,
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
    patient: Patient = Depends(current_patient),  # 401s unless a real logged-in patient
):
    """Proxy to the agent service (the shared brain). current_patient enforces auth
    here; we forward the SAME bearer token so the agent's tools read only this
    patient's records (isolation, design §11). One origin => no browser CORS."""
    token = authorization.split(" ", 1)[1]  # current_patient already checked the Bearer prefix
    try:
        async with httpx.AsyncClient(timeout=60.0) as c:
            r = await c.post(settings.agent_chat_url,
                             json={"message": body.message, "history": body.history, "token": token})
        r.raise_for_status()
    except httpx.HTTPError as e:  # agent down, or its LLM errored (e.g. Gemini quota)
        raise HTTPException(502, f"Assistant unavailable: {type(e).__name__}. Is the agent service running on {settings.agent_chat_url}?")
    return r.json()


@app.post("/api/voice/token")
def voice_token(authorization: str = Header(None), patient: Patient = Depends(current_patient)):
    """Mint a LiveKit room-join token for this patient's browser mic. The patient's
    backend bearer token rides in the LiveKit token METADATA so the voice.py worker,
    on joining the room, acts AS this patient (isolation §11) — never demo creds.
    Signing is local (no LiveKit server call); needs LIVEKIT_* configured."""
    if not (settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret):
        raise HTTPException(501, "Voice not configured: set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.")
    from livekit import api  # local import: voice is optional, keep it off the hot path

    backend_token = authorization.split(" ", 1)[1]  # current_patient already checked the Bearer prefix
    room = f"aayogya-{patient.id}-{uuid4().hex[:8]}"  # per-call room, namespaced by patient
    jwt = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(patient.id)
        .with_metadata(json.dumps({"backend_token": backend_token}))
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )
    return {"url": settings.livekit_url, "token": jwt, "room": room}


@app.get("/")
def dashboard():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")


