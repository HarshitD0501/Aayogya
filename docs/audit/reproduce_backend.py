"""Audit-only synthetic probes. No real database or external provider requests."""
from __future__ import annotations
import asyncio
from contextlib import ExitStack
from datetime import date, timedelta
import json
import os
from pathlib import Path
import statistics
import sys
import tempfile
import time
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
tmp = tempfile.TemporaryDirectory(prefix="aayogya-audit-probes-")
os.environ.update(DATABASE_URL="sqlite:///" + (Path(tmp.name)/"audit.db").as_posix(),
    ENVIRONMENT="test", ENABLE_DEMO_ACCOUNTS="false", WHATSAPP_API_TOKEN="",
    WHATSAPP_PHONE_NUMBER_ID="", WHATSAPP_APP_SECRET="", LIVEKIT_URL="",
    TWILIO_ACCOUNT_SID="", OLLAMA_URL="", GROQ_API_KEY="", HF_TOKEN="", GEMINI_API_KEY="")
from fastapi.testclient import TestClient
from app.main import app
from app import prices, whatsapp as wa
from app.db import engine, SessionLocal
from app.config import settings
from app.models import Medicine, Report, DoseAdherence

results = {}
raw = {"prescription_date":date.today().isoformat(),"meds":[{
    "brand":"Dolo 500", "strength":"500mg", "dosage_notation":"1-0-1",
    "confidence":0.8}],"raw_ocr":"SYNTHETIC AUDIT FIXTURE"}
with ExitStack() as stack:
    stack.enter_context(patch("app.whatsapp.start_apscheduler"))
    stack.enter_context(patch("app.whatsapp.send_text_message",new=AsyncMock(return_value={"status":"simulated"})))
    stack.enter_context(patch("app.prices._fetch_pharmeasy_live",return_value=None))
    stack.enter_context(patch("app.graph._extract_raw",return_value=(raw,False)))
    with TestClient(app,raise_server_exceptions=False) as client:
        identities=[]
        for i in (1,2):
            r=client.post("/api/auth/register",json={"name":f"Audit Person {i}",
                "email":f"audit-{i}@example.test","phone":f"980000000{i}","password":"audit-password-only"})
            assert r.status_code==201,r.text
            identities.append((r.json()["patient"]["id"],{"Authorization":"Bearer "+r.json()["token"]}))
        pid,headers=identities[0]
        r=client.post("/api/reports/upload",headers=headers,files={"file":("not-image.png",b"INVALID IMAGE BYTES"*3,"image/png")})
        results["invalid_image_reaches_extractor"]={"status":r.status_code,"report_created":bool(r.json().get("id"))}
        report_id=r.json()["id"]
        results["unconfirmed_medicine_gate"]={"report_confirmed":r.json()["confirmed"],
            "active_medicine_count":len(client.get("/api/medicines",headers=headers).json()),
            "scheduled_dose_count":len(client.get("/api/adherence/today",headers=headers).json())}
        with SessionLocal() as db:
            for i,(person,_) in enumerate(identities):
                if i:
                    report=Report(patient_id=person,confirmed=False,follow_up_date=(date.today()+timedelta(days=2)).isoformat())
                    db.add(report);db.flush()
                    db.add(Medicine(patient_id=person,report_id=report.id,brand="Audit medicine",salt="Audit salt",status="active",timing=["morning"]))
                db.add(Medicine(patient_id=person,brand="Audit PRN",status="active",prn=True,timing=[],start_date="2000-01-01",duration_days=1))
            db.commit()
        with SessionLocal() as db:
            doses=wa.sync_today_adherence(db,pid)
            results["prn_expired_dose"]={"sos_doses":sum(d.slot=="sos" for d in doses)}
            payload={"entry":[{"changes":[{"value":{"messages":[{"from":"919800000001","type":"text","text":{"body":"nahi li"}}]}}]}]}
            action=asyncio.run(wa.process_webhook_payload(payload,db))
            results["negative_reply"]={"input":"nahi li","actions":[v["action"] for v in action["results"]]}
        sent=[]
        async def fake_send(db,patient,slot,adherences):
            sent.append(patient.id);return {"status":"AUDIT_MOCK_NO_SEND"}
        dispatch=AsyncMock(return_value={"status":"AUDIT_MOCK_NO_CALL"})
        with patch("app.whatsapp.send_interactive_slot_reminder",new=fake_send),patch("app.telephony.dispatch_doctor_followup_call",new=dispatch):
            r=client.post("/api/reminders/trigger-check",headers=headers)
        results["global_trigger_scope"]={"status":r.status_code,"other_patient_in_send_targets":identities[1][0] in sent,
            "voice_dispatch_attempts":dispatch.await_count}
        old_environment=settings.environment
        settings.environment="production"
        results["unsigned_webhook_production"]=wa.verify_signature(b"{}",None)
        settings.environment=old_environment
        results["missing_v1_contracts"]={path:client.get(path).status_code for path in ["/api/v1/search","/api/v1/stores","/api/v1/routes","/api/v1/cities"]}
        client.post(f"/api/medicines/{client.get('/api/medicines',headers=headers).json()[0]['id']}/stop",headers=headers,json={"reason":"audit"})
        results["report_after_stop_status"]=client.get("/api/reports",headers=headers).status_code
        r=client.post("/api/auth/register",json={"name":"Audit Caregiver","email":"caregiver@example.test","phone":"9800000003","password":"audit-password-only","role":"caregiver"})
        results["new_caregiver"]={"register":r.status_code,"me":client.get("/api/auth/me",headers={"Authorization":"Bearer "+r.json()["token"]}).status_code}
        measurements={}
        for path,h in [("/",{}),("/api/public/stats",{}),("/api/adherence/today",headers)]:
            values=[]
            for _ in range(30):
                start=time.perf_counter();response=client.get(path,headers=h);values.append((time.perf_counter()-start)*1000)
                assert response.status_code==200
            measurements[path]={"n":len(values),"p50_ms":round(statistics.median(values),3),"p95_ms":round(sorted(values)[28],3)}
        results["testclient_benchmarks"]=measurements
engine.dispose()
tmp.cleanup()
(ROOT/"docs/audit/evidence/backend-probes.json").write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
