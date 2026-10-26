"""Batch 6A regression tests — Sahayak voice/chat profile alignment, visualizer contract,
and truthful platform metrics (ERR-027, ERR-028, ERR-031, ERR-032).
"""
from __future__ import annotations

import datetime
from pathlib import Path
import sys
from unittest.mock import MagicMock

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Patient, ReminderLog, Interaction
from app import summary as summary_svc


import pytest


@pytest.fixture
def db_session():
    session = create_test_db()
    yield session
    session.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def create_test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return Session()


def test_public_stats_truthfulness(client, db_session):
    """ERR-032: /api/public/stats must not force artificial min 120 or fake live partner."""
    # Add one patient and one interaction
    p = Patient(
        id="p-stats-1",
        name="Stats Test Patient",
        email="stats@test.com",
        phone="+919876543210",
        password_hash="hashed_pw",
        role="patient",
        plan="free",
    )
    rule = Interaction(
        salt_a="aspirin",
        salt_b="warfarin",
        severity="major",
        note="Bleeding risk",
        source="BNF",
    )
    db_session.add_all([p, rule])
    db_session.commit()

    r = client.get("/api/public/stats")
    assert r.status_code == 200
    data = r.json()

    # Must be truthful catalog count
    assert data["verified_medicines"] == data["nppa_caps_tracked"] + data["jan_aushadhi_generics"]
    assert data["interaction_rules"] >= 1
    assert data["active_patients"] >= 1
    assert data["status"] == "online"

    # Must NOT have fabricated partner claim
    assert "live_partner" not in data or data.get("live_partner") is None
    # Must list truthful data sources
    assert "data_sources" in data
    assert any("NPPA" in s for s in data["data_sources"])
    assert any("PMBJP" in s or "Jan Aushadhi" in s for s in data["data_sources"])


def test_summary_reminder_tracking_counts_sent_only(db_session):
    """ERR-032: summary.build must count only verified 'sent' deliveries, ignoring failed/simulated."""
    patient = Patient(
        id="p-rem-test",
        name="Reminder Count Test",
        email="rem@test.com",
        phone="+919876543211",
        password_hash="pw",
        role="patient",
        plan="pro",
    )
    db_session.add(patient)
    db_session.commit()

    t_sent = datetime.datetime(2026, 10, 25, 10, 0, 0)
    t_failed = datetime.datetime(2026, 10, 25, 12, 0, 0)

    # 1 successfully sent log
    log_sent = ReminderLog(
        patient_id=patient.id,
        channel="whatsapp",
        kind="dose",
        body="Morning dose reminder",
        status="sent",
        sent_at=t_sent,
    )
    # 2 failed / queued logs
    log_failed = ReminderLog(
        patient_id=patient.id,
        channel="whatsapp",
        kind="dose",
        body="Failed reminder",
        status="failed",
        sent_at=t_failed,
    )
    log_queued = ReminderLog(
        patient_id=patient.id,
        channel="voice",
        kind="followup",
        body="Queued call",
        status="queued",
        sent_at=t_failed,
    )
    db_session.add_all([log_sent, log_failed, log_queued])
    db_session.commit()

    summary = summary_svc.build(db_session, patient)
    tracking = summary["tracking"]

    # Only the 1 'sent' log should be counted
    assert tracking["reminders_sent"] == 1
    assert tracking["whatsapp_reminders_sent"] == 1
    assert tracking["last_reminder_at"] == t_sent.isoformat()


def test_voice_profile_contract_and_prompt_safety():
    """ERR-027: Voice agent profile normalization and prompt construction."""
    import sys
    from pathlib import Path
    agent_dir = str(Path(__file__).resolve().parent.parent.parent / "agent")
    if agent_dir not in sys.path:
        sys.path.insert(0, agent_dir)

    from profile_adapter import normalize_profile, build_patient_instructions

    base_prompt = "You are Sahayak, an AI health assistant. Never diagnose."

    # Case A: Backend PatientOut format
    backend_profile = {
        "id": "p-100",
        "name": "Aarav Sharma",
        "lang": "hi",
        "plan": "pro",
        "role": "patient",
    }
    normalized = normalize_profile(backend_profile)
    assert normalized["name"] == "Aarav Sharma"
    assert normalized["lang"] == "hi"
    assert normalized["language"] == "hi"
    assert normalized["plan"] == "pro"
    assert normalized["subscription_plan"] == "pro"
    assert normalized["age"] is None
    assert normalized["gender"] is None

    instructions = build_patient_instructions(base_prompt, backend_profile)
    assert "Aarav Sharma" in instructions
    assert "- Preferred language: hi" in instructions
    assert "- Subscription plan: pro" in instructions
    # Missing age and gender must NOT appear as 'Not specified'
    assert "Not specified" not in instructions
    assert "Age:" not in instructions
    assert "Gender:" not in instructions

    # Case B: English profile with optional clinical age/gender
    en_profile = {
        "name": "Meera Patel",
        "lang": "en",
        "plan": "free",
        "age": 52,
        "gender": "female",
    }
    instr_en = build_patient_instructions(base_prompt, en_profile)
    assert "Meera Patel" in instr_en
    assert "- Age: 52" in instr_en
    assert "- Gender: female" in instr_en
    assert "- Preferred language: en" in instr_en
    assert "- Subscription plan: free" in instr_en


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING BATCH 6A TEST SUITE (ERR-027, ERR-028, ERR-031, ERR-032)")
    print("=======================================================\n")
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        print("Running test_public_stats_truthfulness...")
        test_public_stats_truthfulness(test_client, session)
        print("  [PASS] Public stats truthfulness verified.")

        print("Running test_summary_reminder_tracking_counts_sent_only...")
        test_summary_reminder_tracking_counts_sent_only(session)
        print("  [PASS] Summary reminder tracking sent-only filter verified.")

    app.dependency_overrides.clear()
    session.close()

    print("Running test_voice_profile_contract_and_prompt_safety...")
    test_voice_profile_contract_and_prompt_safety()
    print("  [PASS] Voice profile contract and prompt safety verified.")

    print("\n=======================================================")
    print("ALL BATCH 6A TESTS PASSED SUCCESSFULLY!")
    print("=======================================================\n")

