# Aayogya — Production Readiness & Real-Data Roadmap

This document outlines all currently broken/fragile components, dummy/mock data inventories, and the exact architectural requirements to make Aayogya a 100% production-ready healthcare application.

---

## 📌 Table of Contents
1. [Critical Bugs & Fragile Areas (Fix First)](#1-critical-bugs--fragile-areas)
2. [Dummy vs. Real Data Inventory](#2-dummy-vs-real-data-inventory)
3. [Production Readiness Architecture](#3-production-readiness-architecture)
4. [External Services & Credentials Checklist](#4-external-services--credentials-checklist)
5. [Step-by-Step Implementation Sprints](#5-step-by-step-implementation-sprints)

---

## 1. Critical Bugs & Fragile Areas

### 🔴 1.1 Patient Registration (implemented)
* **Current State**: Patient registration is available through `POST /api/auth/register` and the login screen.
* **Implemented**: Registration validates and normalizes email and Indian mobile numbers, requires an 8-character password, stores a PBKDF2 hash, rejects duplicate contacts, and signs the new patient in.
* **Caregiver onboarding**: Caregiver self-registration remains unavailable until patients can issue consent-based links to caregiver accounts. Do not create unlinked caregiver accounts.

### 🔴 1.2 SQLite + In-Memory Checkpointer (State Loss on Restart)
* **Current State**: `config.py` defaults to `sqlite:///./aayogya.db`. LangGraph's checkpointer falls back to `MemorySaver()`.
* **Problem**:
  - When a user uploads a prescription, LangGraph pauses at the `human_confirm` interrupt node.
  - If the backend server restarts, reloads, or scales before the user taps "Confirm", the graph execution state is wiped from memory, causing confirmation errors.
  - SQLite locks the file during concurrent writes (`OperationalError: database is locked`).
* **Fix Required**:
  - Migrate to PostgreSQL.
  - Activate `PostgresSaver` in `backend/app/main.py` (already coded for Postgres).

### 🔴 1.3 Silent Fallback to Fake Mock Prescription on OCR Failure
* **Current State**: In `backend/app/extraction.py` (lines 145–170), if Ollama, Groq, and Gemini fail (quota exhausted, network drop, or invalid key), it silently catches the exception and returns `_MOCK`:
  ```json
  "prescriber_name": "Dr. Rao", "meds": ["Brufen 400", "Pan 40"]
  ```
* **Problem**: Users uploading their real prescriptions will see fake medicines if an API key fails, leading to clinical confusion.
* **Fix Required**:
  - Catch API errors and return an explicit HTTP 502 error with a clear message: `"Prescription extraction service is temporarily unavailable. Please verify API keys or try again."`
  - Only allow mock data when an explicit `?mock=true` query parameter or development flag is passed.

### 🔴 1.4 LiveKit Agent Windows Thread Concurrency / GIL Freezing
* **Current State**: On Windows, `livekit-agents` defaults to `JobExecutorType.THREAD`. When reminder checks run, multiple calls are dispatched simultaneously.
* **Problem**:
  - 6–10 threads initialize inside a single Python process, concurrently loading PyTorch/ONNX runtime and Silero VAD weights.
  - CPU usage spikes, freezing the Python event loop for ~1 second, generating:
    `WARNING livekit.agents - job executor is unresponsive {"delay": 948}`
  - Initialization of each runner balloons to 30–47 seconds.
* **Fix Required**:
  - In `backend/app/whatsapp.py` & `telephony.py`: Throttle/stagger outbound dispatches (e.g. 5-second delay between calls or concurrency queue).
  - In `agent/voice.py`: Cache the Silero VAD ONNX model as a process-level singleton so threads don't reload it 10 times in parallel.
  - Pre-warm 1 or 2 idle processes: set `num_idle_processes=2` in `WorkerOptions`.

### 🔴 1.5 Default Insecure Secret Key
* **Current State**: `settings.secret_key` defaults to `"dev-insecure-change-me"`.
* **Problem**: Anyone knowing this default can forge HMAC session tokens and access any patient's records.
* **Fix Required**:
  - Enforce in `config.py` that if `ENVIRONMENT == "production"` and `secret_key` is the default, the backend refuses to boot.
  - Generate a secure 64-char key in `.env` using `openssl rand -hex 32`.

### 🔴 1.6 Agent Chat Service Hard Dependency & Failure Handling
* **Current State**: `backend/app/main.py` proxies `/api/chat` to `http://localhost:8081/chat` via HTTPX.
* **Problem**: If `agent/chat.py` is not running on port 8081, the chat widget crashes with a generic 502 Bad Gateway.
* **Fix Required**:
  - Add graceful health check and user-friendly error response in the chat widget if the chat service is restarting or down.

---

## 2. Dummy vs. Real Data Inventory

| Data Component | Current Mock / Dummy State | Real Data Required | How to Replace / Ingest |
| :--- | :--- | :--- | :--- |
| **Patient Accounts** | 5 seeded synthetic accounts (`ramesh`, `shanti`, `aarav`, `meera`, `sunita`) with fixed password `pass1234`. | Real user profiles: Name, Real Indian Phone (`+91`), Email, Age, Gender, Primary Conditions. | Build `POST /api/auth/register` + CSV bulk-import script for initial patient onboarding. |
| **Drug Interactions** | Only 3–14 hardcoded interaction pairs in `seed.py` / `interactions.py`. | Comprehensive Indian Clinical Drug Interaction dataset (e.g. DrugBank / CDSCO / Janaushadhi open data). | Ingest interactions CSV into the `interactions` database table with indexed `salt_a` and `salt_b`. |
| **Medicine Pricing (NPPA & Jan Aushadhi)** | ~35 NPPA caps and ~25 Jan Aushadhi medicines in `prices.py`. Unmatched medicines fall back to a SHA-256 fake price generator (`_seed_price`). | Official PMBJP Jan Aushadhi price list (~1,800 medicines) and NPPA DPCO ceiling price list (~900 formulations). | Ingest PMBJP & NPPA government datasets into a SQLite/Postgres `medicine_prices` table with indexed salt/strength matching. |
| **Prescription Scans** | Test images (`prescription.jpg`, `prescription_test.jpg`). | High-resolution real handwritten and printed Indian doctor prescriptions. | Upload real prescriptions through the UI/API. |
| **Landing Page Metrics** | Hardcoded text in `Landing.js` ("250K+ medicines mapped", "300K+ interactions", static reviews). | Real live database counts. | Connect `Landing.js` to dynamic backend endpoint `/api/public/stats`. |

---

## 3. Production Readiness Architecture

```
                                  +-----------------------+
                                  |   Nginx / Cloudflare  | (SSL / Reverse Proxy)
                                  +-----------+-----------+
                                              |
                   +--------------------------+--------------------------+
                   |                                                     |
         Port 3000 (HTTPS)                                     Port 8000 (HTTPS)
   +---------------+---------------+                     +---------------+---------------+
   |      Next.js Frontend         |                     |        FastAPI Backend        |
   | (Landing, Dash, Caregiver)    |                     | (Auth, Reports, Prices, Meta) |
   +-------------------------------+                     +-------+---------------+-------+
                                                                 |               |
                                              +------------------+               +------------------+
                                              |                                                     |
                                    Port 8081 |                                           WebSocket |
                        +---------------------+-----------------+                 +-----------------+-----------------+
                        |        Sahayak Agent Service          |                 |     LiveKit Voice Telephony       |
                        |      (chat.py - Gemini + Tools)       |                 | (voice.py - STT + VAD + TTS + SIP)|
                        +---------------------------------------+                 +-----------------------------------+
                                              |                                                     |
                                              +------------------+---------------+------------------+
                                                                 |
                                              +------------------v------------------+
                                              |       PostgreSQL + S3 Storage       |
                                              |   (Patient Data, Reports, Vectors)  |
                                              +-------------------------------------+
```

### 3.1 Database & Checkpoint Persistence
1. **Switch to PostgreSQL**:
   - Set `DATABASE_URL=postgresql+psycopg://user:password@host:5432/aayogya_db`.
   - Run initial migrations: `alembic upgrade head`.
2. **LangGraph PostgresSaver**:
   - Automatically engaged when `DATABASE_URL` starts with `postgres`. Checkpoints and multi-turn confirm states persist across restarts.

### 3.2 Persistent Cloud Storage for Prescriptions
- Currently, prescriptions are received in memory and saved nowhere permanently.
- Configure S3-compatible object storage (AWS S3, Cloudflare R2, or Supabase Storage).
- Workflow: User uploads image -> Upload to secure encrypted S3 bucket (`/prescriptions/{patient_id}/{uuid}.jpg`) -> Store S3 URI in `Report.filename`.

### 3.3 Security & DPDP Act Compliance
- **Data Protection**: Store phone numbers and sensitive health details with encryption at rest.
- **Per-Patient Isolation**: Ensure every DB query strictly filters by `current_patient.id`.
- **CORS Hardening**: Change `allow_origins=["*"]` in `main.py` to only allowed frontend domains (e.g., `["https://aayogya.in", "https://app.aayogya.in"]`).
- **Rate Limiting**: Protect `/api/auth/*` and `/api/reports/upload` against brute force / spam using `slowapi` or Redis rate limiters.

---

## 4. External Services & Credentials Checklist

To move out of `simulated` mode into `live` mode, ensure the following credentials are provided in `.env`:

### 1. Vision & LLM Extraction
- [ ] `GEMINI_API_KEY`: Google AI Studio API key with billing enabled.
- [ ] `GEMINI_MODEL`: `gemini-2.0-flash` or `gemini-1.5-flash`.
- [ ] *(Optional)* `GROQ_API_KEY`: High-speed fallback vision (`qwen/qwen3.8-27b`).

### 2. WhatsApp Meta Cloud API
- [ ] `WHATSAPP_API_TOKEN`: Permanent System User Access Token from Meta Business Suite.
- [ ] `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp Business Account Phone Number ID.
- [ ] `WHATSAPP_VERIFY_TOKEN`: Random verification secret for webhook challenge.
- [ ] `WHATSAPP_APP_SECRET`: App secret for incoming HMAC SHA-256 signature verification.

### 3. Telephony & LiveKit SIP
- [ ] `LIVEKIT_URL`: `wss://<project>.livekit.cloud`
- [ ] `LIVEKIT_API_KEY`: LiveKit project API Key.
- [ ] `LIVEKIT_API_SECRET`: LiveKit project API Secret.
- [ ] `LIVEKIT_SIP_TRUNK_ID` or `TWILIO_SIP_DOMAIN`: Active outbound SIP trunk credentials for doctor follow-up phone calls.

### 4. Voice Pipeline (STT & TTS)
- [ ] `DEEPGRAM_API_KEY`: High-accuracy Hindi/Indian-English streaming transcription.
- [ ] `MURF_API_KEY`: Natural conversational Hindi voice (`hi-IN-kabir` or similar).

---

## 5. Step-by-Step Implementation Sprints

### Sprint 1: Auth & User Onboarding (Immediate)
- [x] Implement patient `POST /api/auth/register` and the registration UI in Next.js.
- [ ] Add consent-based patient-to-caregiver linking before enabling caregiver self-registration.
- [x] Eliminate `dev-insecure-change-me` secret key fallback.

### Sprint 2: Real Data Ingestion & Error Fixes
- [ ] Remove silent mock fallback in `extraction.py`; return proper 502/400 errors when vision extraction fails.
- [ ] Implement batch throttle in `whatsapp.py` and `telephony.py` to prevent simultaneous call flooding.
- [ ] Cache Silero VAD singleton in `agent/voice.py` to fix Windows thread freeze.
- [ ] Provide dataset ingestion script (`scripts/seed_real_data.py`) for:
  - Real drug interaction rules.
  - Jan Aushadhi & NPPA price lists.

### Sprint 3: Database & Cloud Storage
- [ ] Spin up PostgreSQL instance (local Docker or Cloud managed).
- [ ] Connect `PostgresSaver` connection pool.
- [ ] Add S3/R2 upload handler for prescription images.

### Sprint 4: Live Integrations & Deployment
- [ ] Connect real Meta WhatsApp Business account and verify webhooks.
- [ ] Connect LiveKit SIP trunk for outbound telephony.
- [ ] Create `docker-compose.prod.yml` to orchestrate Backend, Frontend, Agent, and Worker with Nginx reverse proxy.
