# Aarogya — Design Document

> **One-liner:** Click your prescription → AI reads it, explains it in your language, flags cross-doctor drug interactions, finds cheapest meds nearby, sets WhatsApp reminders, and gives you a voice companion that checks in — deferring every clinical decision to your real doctor.

**Status:** Design locked + **production-hardened via deep research (2026)** — see §19 for verified sources & open questions. Pre-scaffold.
**Region:** India (data localized in-region).
**Positioning:** Caregiver-first / patient-first medication adherence + prescription intelligence. **Not** a telemedicine/diagnosis product — a *navigation + explanation + adherence* product with human (RMP) escalation.

---

## 0. Contents

1. Problem & positioning
2. Product overview (Free vs Pro)
3. Roles
4. System architecture (two systems)
5. Backend agentic brain (LangGraph)
6. Voice agent system (LiveKit) + agent contexts
7. Feature specs (auth, OCR pipeline, prices, reminders, calls, escalation, records)
8. FHIR data modeling (ABDM R4)
9. Data model (tables)
10. Compliance & legal (DPDP, Telemedicine Guidelines)
11. Security
12. Production infrastructure
13. Business model, pricing, unit economics, payments
14. Demo data spec
15. API keys & cost reality
16. Known holes, risks & prototype simplifications
17. Tech stack summary
18. Roadmap / phasing
19. Research provenance & verified sources (2026)

---

## 1. Problem & positioning

Patients — especially the elderly with chronic conditions — juggle multiple prescriptions from **different doctors** who don't see each other's notes. This causes: missed doses, dangerous drug interactions no one catches, confusion about what a report means, overpaying for medicines, and missed follow-ups. Caregivers (often distant, often NRI children) have no visibility.

**What we solve:** parse prescriptions, explain them plainly, **flag cross-doctor interactions**, compare prices, remind via WhatsApp, and proactively check in by voice — while keeping every clinical decision with a real doctor.

**Hard positioning constraint (legal):** Under India's Telemedicine Practice Guidelines 2020 §5.4, an AI/ML platform **may not counsel or prescribe**; only a Registered Medical Practitioner (RMP) may. So the product is explicitly a **non-clinical explainer + navigator + adherence tool**. It never diagnoses, never changes doses, always defers to the patient's doctor.

---

## 2. Product overview (Free vs Pro)

Single premium tier: **₹99/month**.

| Capability                                                      | Free                             | Pro (₹99/mo)                  |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------ |
| Report/prescription upload + OCR parse                          | ✅                               | ✅                             |
| Plain-language explanation (RAG-grounded)                       | ✅                               | ✅                             |
| **Cross-doctor interaction safety flag**                  | ✅ (kept free — safety + trust) | ✅                             |
| Health records timeline                                         | ✅                               | ✅                             |
| **Medicine price comparison** (+ nearby shop + map/route) | 🔒 blurred teaser                | ✅                             |
| **WhatsApp dose reminders**                               | 🔒                               | ✅                             |
| **Follow-up appointment reminders**                       | 🔒                               | ✅                             |
| **Voice check-in calls**                                  | 🔒                               | ✅ (usage-limited — see §13) |
| Adherence tracking + trends                                     | 🔒                               | ✅                             |

Paywall UX: free users **see** the locked feature blurred with an upsell ("1mg ₹██ · PharmEasy ₹██ — Unlock @ ₹99"). Blur+teaser drives conversion.

---

## 3. Roles

**Patient only** (admin removed — see §10 for why a super-admin over all clinical records is unlawful under DPDP).

- **Patient** — owns and sees only their own records. Per-patient data isolation is a hard security boundary.
- **Caregiver** — *deferred* (post-MVP). Consent-gated link to a patient; read-only dashboard + alerts.
- **RMP (Registered Medical Practitioner)** — *not built in prototype*; partnered/on-call at launch. Required in the loop for any clinical escalation (see §7.7). Prototype defers to "your doctor / 108".

---

## 4. System architecture (two systems)

Two systems that share state but run independently. The voice loop needs sub-second latency, so it runs its own process and calls the backend's tools over HTTP — one source of truth, no duplicated logic.

```
┌───────────────────────────────────────────────────────────────┐
│                     PATIENT (Next.js PWA)                        │
│   📷 Upload report   💬 Chat   📞 Talk/Check-in   🗺️ Find shop   │
└───────────────┬───────────────────────────┬────────────────────┘
                │                             │
      ┌─────────▼──────────┐        ┌─────────▼──────────────┐
      │  SYSTEM A           │        │  SYSTEM B               │
      │  Backend Brain      │◄──────►│  Voice Agent System     │
      │  (FastAPI+LangGraph)│  HTTP   │  (LiveKit Agents + SIP) │
      │                     │  shared │  multi-agent handoff    │
      │  - OCR pipeline     │  RAG+DB │  - Saathi (front door)  │
      │  - reconciliation   │        │  - Aarogya Assistant     │
      │  - interaction chk  │        │  - Escalation handler    │
      │  - RAG explain      │        │  - Check-in (outbound)   │
      │  - price compare    │        └─────────────────────────┘
      │  - reminder engine  │
      │  - map/route        │
      └─────────┬───────────┘
                │
   ┌────────────┼───────────┬──────────────┬──────────────┐
   ▼            ▼           ▼              ▼              ▼
 Gemini    pgvector    Postgres      Twilio         OSM/
 (OCR/LLM) (RAG)      (Supabase)    (WA+voice+SIP)  Overpass
                                                    (maps)
        Queue/cache: Redis + Celery   |   Observability: OTel + Sentry
```

Phone-call bridge: `Patient phone ◄PSTN► Twilio number ◄SIP► LiveKit SIP ► voice agent`. Same agents work in-app and on a real phone call.

---

## 5. Backend agentic brain (LangGraph)

A graph (not a linear chain) because the flow branches, retries, and has a mandatory human-in-the-loop confirmation.

```
ocr_node → extract_meds → validate_catalog → [HUMAN CONFIRM] →
reconcile_active → interaction_check → explain_rag →
(price_compare | find_pharmacies | schedule_reminders)
```

Each node is also exposed as a **tool** the voice agents call over HTTP, so voice and app share one brain.

- **ocr_node** — Gemini Vision → raw text + confidence. OCR text is treated as **untrusted data** (prompt-injection guard: never interpreted as instructions).
- **extract_meds** — LLM structures into `{brand, salt?, strength, form, dosage_notation, frequency, timing, duration}`. Indian dosage notation parsed (`1-0-1`, `BD`, `TDS`, `SOS`, `HS`, `½ tab`) — see §7.3.
- **validate_catalog** — map brand → salt(s) via an **Indian brand catalog**, because RxNorm is **US-scoped and returns empty for Indian brands** (verified: RxNav `drugs.json?name=Dolo+650` and `name=Ecosprin` both return an empty `drugGroup`; NLM states RxNorm covers US-approved meds, non-US drugs added only "as opportunities allow"). Catalog of record: the open **A-Z Medicines Dataset of India** (~253,973 brand rows, `short_composition1`/`short_composition2` salt fields; MIT-licensed mirror `junioralive/Indian-Medicine-Dataset`). **Two parse guards (measured):** salt fields embed dose strings (`"Amoxycillin (500mg)"` → strip to isolate salt) and only two composition columns exist (3+-ingredient drugs are truncated → flag for manual review). The brand→salt→interaction bridge is **not a verified turnkey join** — treat it as a custom normalization step: exact match → fuzzy → **LLM-assisted mapping with mandatory human confirm** (LLM-to-standard-vocab mapping hit >90% vs 64% embedding-only in the literature, but every mapping still routes through HUMAN CONFIRM). Interactions run on **salts**, not brand strings.
- **HUMAN CONFIRM** — pipeline **halts**. Patient sees parsed meds with confidence flags; nothing schedules or acts until confirmed. Low confidence → manual entry. Both `raw_ocr` and `confirmed` stored; raw never overwritten.
- **reconcile_active** — compute active vs expired per med (`start_date + duration`). Only **active** meds go to interaction check (prevents false alarms from ended courses).
- **interaction_check** — pairwise salt check against a curated `interactions` table loaded from **DDInter 2.0** (2,310 drugs / 302,516 DDI records / 8,398 mechanism + management notes; free, login-free web resource — the strongest open DDI set after the NLM/RxNorm Drug-Interaction API was **discontinued Jan 2, 2024** with no free official replacement). ⚠️ **License is CC BY-NC** — fine for the hackathon/non-commercial demo, but a paid launch needs OUP clearance (`reprints@oup.com`); see §16. Output framed as "checked against N known interactions," never "guaranteed safe."
- **explain_rag** — explanation **only from RAG-grounded** drug-info sheets, not free-form generation. Facts (salt, dose) come from DB, not the LLM. Every explanation carries a "not medical advice" disclaimer.

---

## 6. Voice agent system (LiveKit) + agent contexts

**Framework choice:** LiveKit Agents (open-source, self-host = free; Cloud has free tier). Murf Falcon is *not* an alternative to LiveKit — it's a TTS voice that plugs *into* LiveKit. LiveKit is the only one giving multi-agent handoff + SIP phone bridging, which this design depends on.

Stack under LiveKit (production-pinned): **Deepgram Nova-3 via LiveKit Inference** (STT — hosted in India, auto-routes to the India region, Hindi + 7 other languages; co-located Mumbai `nova-2-general` is English/Hindi-only and falls back to Frankfurt) · **Groq/Gemini** (LLM) · **Cartesia `sonic-3.6`** (TTS — Hindi + 8 Indian languages **plus explicit Hinglish / Latin-script-Hindi support**; do **not** use legacy `sonic-2`, which lacks Hindi and sunsets 2026-10-20). Optional free OSS Hindi TTS fallbacks that also plug into LiveKit: Piper, Coqui XTTS-v2, AI4Bharat Indic-TTS (unverified — treat as backup, not default).

**Latency budget:** target **~1.67 s end-to-end** by **co-locating the agent + full STT→LLM→TTS stack in `ap-south`/Mumbai** (LiveKit's own measured example, ~1 s faster than a cross-region stack; independent cascaded benchmarks land ~1.2–1.4 s p95 — treat 1.67 s as a target, not a guarantee). Rule: every agent→model hop is **sequential and dependent**, so each needs the shortest path; user↔agent audio tolerates distance over LiveKit's private network.

**Turn-taking:** LiveKit **turn-detector** (Hindi is in both the 14-language audio model and the text MultilingualModel) — use `v1` on LiveKit Inference (highest accuracy) or `v1-mini` (runs locally on CPU, free; LiveKit Model License, not OSI-open) when self-hosting. Enable **adaptive interruption handling** (acoustic, not transcript-based — distinguishes true barge-ins from backchannel "haan"/"achha"; may skew English-tuned, a Hinglish caveat).

Four agents with shared session state (`patient_id`, report context) so the patient never repeats themselves. **Renamed away from "Dr. Vaidya"** — no "doctor" persona (legal).

**Handoff mechanics (LiveKit Agents — verified gotcha):** durable facts (`patient_id`, active meds, report context) go in **`AgentSession.userdata`** (set in the constructor, read via `session.userdata` / `RunContext`) — these survive handoffs **automatically**. But **conversation history does NOT transfer by default**: each new agent starts with a fresh LLM prompt unless you explicitly pass `chat_ctx=self.chat_ctx.copy()` into the next `Agent`/`AgentTask` constructor. The full raw transcript always stays in `session.history`. Rule: **facts → `userdata` (automatic); conversational continuity → opt-in `chat_ctx`.**

### Agent 1 — Saathi (front door)

```
ROLE: Warm receptionist. First voice heard.
KNOWS: name, active meds, next appointment, today's reminders. Small talk, navigation.
CANNOT: any clinical opinion, lab interpretation, dose changes.
HANDOFF: symptoms/"why"/pain/side-effects/report questions → Aarogya Assistant.
TONE: casual, vernacular, reassuring.
```

### Agent 2 — Aarogya Assistant (explainer — NOT a doctor)

```
ROLE: Non-clinical explainer. Explains what the report/prescription SAYS and what terms MEAN.
KNOWS: RAG over THIS patient's report + drug-info sheets + interaction data.
HARD RULES (non-negotiable, per Telemedicine Guidelines §5.4):
  - Never diagnose, never prescribe, never change a dose.
  - Never say "you have X." Only "your prescription says X; X is used for Y."
  - Always end clinical-adjacent answers with "confirm with your doctor."
  - Red-flag symptoms → Escalation handler immediately.
TONE: calm, precise, patient's language.
```

### Agent 3 — Escalation handler (safety-critical, thin)

```
TRIGGER: red-flag symptoms.
GENUINE EMERGENCY (chest pain, breathing trouble, bleeding, stroke signs):
  → IMMEDIATE universal safety instruction, no wait: "Yeh emergency ho sakti
    hai — abhi 108/112 pe call karein ya kisi ko turant hospital le jaane ko
    kahein." (This is universal first-aid advice, not an AI clinical decision.)
  → also notify caregiver/emergency contact + log event.
NON-EMERGENCY red flag → create urgent Task for an RMP to review (see §7.7).
```

### Agent 4 — Check-in (proactive, outbound — Pro only)

```
ROLE: Scheduled wellness/appointment caller. It DIALS the patient (via Twilio→SIP).
IDENTITY CHECK FIRST: "Kya main Shanti ji se baat kar rahi hoon?" before any info.
CONSENT: "Yeh call aapki care ke liye record ho sakti hai — theek hai?"
TWO REASONS TO CALL:
  (a) follow-up due: relays appointment reminder.
  (b) wellness: "Tabiyat kaisi hai? Dawa time pe le rahe hain?"
OUTCOME: writes structured note (mood, adherence, symptom flags) → FHIR Observation
  (status=preliminary, performer=Patient). Hands off to Escalation if needed.
```

---

## 7. Feature specs

### 7.1 Auth + login page

- **Supabase Auth.** Primary: **Google OAuth**. Fallback: **Phone OTP** (elderly-friendly, reuses Twilio). Email+password enabled for the two seed accounts.
- After first login, one question — "patient or caregiver?" — assigns role (caregiver deferred, so default patient).
- Session: Supabase JWT + refresh. **Account recovery:** email fallback / Google link (elderly change SIMs — OTP-only would orphan accounts).
- **Login page layout** (no "demo" wording):
  ```
  Email/Phone [____]  Password [____]  [Login]   [Continue with Google]
  ┌──────────────────┐  ┌──────────────────┐
  │ Aarav Sharma      │  │ Shanti Devi       │
  │ [ Normal ]        │  │ [ Pro ] ⭐        │
  └──────────────────┘  └──────────────────┘
  ```

  Two horizontal boxes, each shows name + tag chip. **Click → auto-fills credentials** into the login fields; user hits Login. Seed accounts only enabled in demo/staging (disable/rate-limit in prod).

### 7.2 Report OCR → structured meds

Photo → Gemini Vision → extract → **catalog validate** → **human confirm** → store. Handles printed prescriptions well; handwriting is unreliable → confidence flags + manual-entry fallback so a bad read never freezes the flow or auto-schedules a wrong drug.

### 7.3 Dosage notation parser

`1-0-1`→morning+night · `1-1-1`→TDS · `BD`→2×/day · `TDS`→3× · `HS`→bedtime · `SOS`→as-needed (**no auto-reminder**) · `OD`→once · `½ tab`→half dose. Feeds the scheduler. **Safety-critical → has unit tests.**

### 7.4 Cross-doctor interaction check (the moat)

Runs on **salts of active meds** across **all** the patient's prescriptions (not just the latest). Severity + plain explanation + "confirm with your doctor." Never "guaranteed safe." Ideally pharmacist-vetted.

**Data pipeline (open/free, researched & verified):**

```
Indian brand (Dolo 650, Ecosprin, Brufen…)
   │  A-Z Medicines Dataset of India (~253,973 rows, MIT mirror)
   │  short_composition1/2 → strip "(500mg)" dose strings → salt(s)
   ▼
Canonical salt(s)   ── LLM-assisted map + HUMAN CONFIRM on low confidence
   │
   ▼  pairwise over ACTIVE salts only (reconcile_active — §5)
DDInter 2.0 interactions table  (302,516 DDI records, severity + mechanism + management)
   ▼
Severity + mechanism + management note + source cite → "checked against N known interactions"
```

- **Interaction data — DDInter 2.0.** 2,310 drugs / **302,516 DDI records** / 8,398 mechanism + management descriptions; free, **login-free** web resource (`ddinter2.scbdd.com`, paper PMC11701621, *Nucleic Acids Research* 2025). Strongest open DDI set post-NLM-API-shutdown (Jan 2, 2024). Load once into the curated `interactions` table.
  - ⚠️ **License: CC BY-NC** — OK for a non-commercial hackathon/demo; a **paid** launch needs OUP clearance (`reprints@oup.com`). DrugBank (commercial) is the paid upgrade path. Aux/cross-check sources: OpenFDA labels, TWOSIDES/OFFSIDES (Tatonetti). See §16.
  - ⚠️ **Unresolved:** whether DDInter keys are strictly salt-level vs drug-level did **not** survive verification — so the salt→DDI join needs its own validation pass; don't assume a clean 1:1 import.
- **Brand→salt catalog — A-Z Medicines Dataset of India** (`junioralive/Indian-Medicine-Dataset`, MIT). RxNorm is US-scoped and **empty for Dolo 650 / Ecosprin** (verified) — do not depend on it. Parse guards: strip embedded dose strings; only two composition fields, so 3+-ingredient combos truncate → route to manual review. Optional: 14,683-row Drug-Prescription-to-Disease Kaggle set.
- **Normalization is the real work, not the lookup.** The exact brand→salt→DDI bridge is **unverified** — build it as exact-match → fuzzy → LLM-assisted, always ending at **HUMAN CONFIRM**. Never auto-flag or auto-clear an interaction on an unconfirmed salt mapping.
- **Hero example (Shanti Devi):** Ibuprofen (Ortho) + Aspirin/Ecosprin (Cardio) → bleeding risk + reduced cardio-protection. Pre-seed this exact pair in `interactions` so the demo never depends on a live join.

### 7.5 Medicine prices + map/route

- Prefer **official/affiliate APIs** where available; otherwise **indicative cached prices** ("as of <time></time>") with disclaimer — live scraping is fragile + against site ToS, not sustainable as "production."
- Match by **salt + strength + pack size**, not brand string.
- Nearby pharmacies via **OpenStreetMap/Overpass** (free; Google Places costs at scale). Tap shop → directions deep-link. **"Call to confirm stock"** button (no inventory feed — don't imply stock-awareness).

### 7.6 Reminders (WhatsApp) — Pro

```
Dashboard time-chips (pre-filled from report) → scheduler generates every dose
(date+time) in dose_schedule → worker (every min, SELECT ... FOR UPDATE SKIP
LOCKED) → [same txn writes an OUTBOX row] → relay sends Twilio WhatsApp
"dawa kha li?" [✅ Haan][❌ Nahi][⏰ 10 min]
→ inbound webhook (ButtonText) verified via X-Twilio-Signature → ON CONFLICT dedup
→ Haan=taken · snooze=re-ping · 30-min silence=missed → caregiver alert
```

- Visual setup: report auto-selects 🌅/☀️/🌙 chips; patient just confirms (no typing).
- **Quick-reply buttons (verified UX):** a tapped button auto-sends its label back; it arrives in the webhook's **`ButtonText`** param (custom id in `ButtonPayload`) — more reliable than parsing free text. Needs a pre-approved **UTILITY** WhatsApp template (Meta approval ~mins–48h). **Demo fallback:** plain "reply DONE" (Twilio trial only messages *verified* numbers). Buttons in prod, DONE-reply in demo.
- **Webhook security (mandatory):** every inbound "took dose / pressed 1" event is verified with **`X-Twilio-Signature`** (HMAC-SHA1 over the exact URL + alphabetically-sorted params, keyed on the auth token) using the SDK's **`RequestValidator` / `validateRequest()`** — Twilio explicitly says *"don't implement your own signature validation."* Unverified POSTs are dropped. (See §11.)
- **Exactly-once, no double 8 AM ping (verified patterns):**
  - **Transactional outbox** — the dose row and its outbox event are written in **one DB transaction**, so a reminder is never "committed but never sent."
  - **Idempotent scheduling** — `SELECT … FOR UPDATE SKIP LOCKED` lets many workers drain `dose_schedule` with no double-claim.
  - **Idempotent inbound** — `INSERT … ON CONFLICT (provider, event_id) DO NOTHING RETURNING` on the ack; zero rows returned = duplicate, safely ignored (Twilio retries are at-least-once).
- **Delivery fallback:** WhatsApp fail → SMS → voice. Per-patient **timezone** stored (schedule in local time, store UTC).
- **Lifecycle:** reminders editable/pausable; auto-stop at course end; "stopped this med?" option.
- **Cost note (per-message model, post-2025-07):** Twilio WhatsApp is now **per message**, not per conversation — flat **$0.005** Twilio fee (inbound *or* outbound) + Meta per-template pass-through (utility/auth from ~$0.0034/msg **US floor — India rate differs & is unconfirmed**; utility is **free inside the 24 h service window**). Design reminders to ride the free window where possible. See §13/§15.

### 7.7 Appointment reminders + check-in calls + escalation — Pro

- **Appointment reminder:** follow-up date from report → scheduled outbound call, bridged via SIP into the Check-in agent (conversational, not a static recording).
- **Wellness check-in:** proactive outbound call; identity-check-first + recording consent before any info; writes a structured note.
- **Outbound PSTN bridge (verified config):** `Patient phone ◄PSTN► number ◄SIP► LiveKit SIP ► Check-in agent`. Use LiveKit **Elastic SIP Trunking** (recommended over the WebSocket connector), trunk address `<trunk-name>.pstn.twilio.com`, **TCP transport required**; kick calls with `CreateSIPParticipant` (`lk dispatch create … --metadata '<+E164>'`). Point the trunk at LiveKit's **India SIP endpoint** and ask LiveKit to **region-pin** to `ap-south`.
- ⚠️ **India telecom reality (do not skip before real outbound calling):**
  - Twilio's own India Voice Guidelines say outbound-to-India must **originate from a non-Indian number** — so a usable **+91 originating leg likely needs Plivo or Exotel**, not Twilio. A +91 caller-ID lifts pickup rates.
  - A local number is **not** compliance: automated commercial/outreach voice in India needs **DLT registration + TRAI DND-registry scrubbing + 140/160-series numbers** (TCCCPR 2018; complaints via 1909). Wellness/care calls with explicit consent are lower-risk, but the DLT/DND path still applies at scale.
  - Prototype: consented calls to seed/verified numbers only; DLT/DND deferred to launch (see §16).
- **Escalation (human-in-the-loop — legally mandatory):**
  ```
  AI aggregates check-in + report data
     → AI DETECTS red flag  (allowed: "assisting an RMP", §5.4)
        · genuine emergency  → immediate "call 108/112" universal advice (no wait)
        · non-emergency flag → urgent Task queued for an RMP
     → RMP reviews data, exercises professional judgment (§4.1.1)
     → RMP authorizes outbound contact
     → call framed as: "Message on behalf of Dr. [Name], Reg. [No.] — the
        doctor reviewed your check-in and advises you come to [hospital].
        Call [number] to speak with the care team."
  ```

  The AI is a **delivery channel for an RMP's decision**, never the decision-maker. Prototype has no RMP → app defers to "your doctor / 108" and does not itself declare non-emergency escalations.

### 7.8 Health records timeline + trends

- Everything dated & stored → reverse-chronological **"My Health Timeline"** (reports, labs, calls, appointments). Filter by type; search by medicine.
- **Trends** (the longitudinal value paper can't give): lab lines ("HbA1c 8.1→7.6→7.2 ⬇"), med history, adherence over weeks.
- **Immutable records** — append-only; entries never silently overwritten (medical history must be trustworthy). **Cold start:** onboarding invites bulk upload of past prescriptions.

---

## 8. FHIR data modeling (ABDM R4)

ABDM (India's national health stack) uses **HL7 FHIR R4 (4.0.1)**, NRCeS Implementation Guide (`ndhm.in`). Every artifact is a `Composition` inside a `DocumentBundle`. ABHA (14-digit health ID) rides as a `Patient.identifier` — the linkage layer, not required for internal modeling.

| Our use case                                         | FHIR R4 resource                                          | Notes                                                              |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Parsed prescription (what was ordered)               | **MedicationRequest**                               | ABDM`PrescriptionRecord` uses this                               |
| What patient actually takes (self-reported)          | **MedicationStatement**                             | `informationSource = Patient`                                    |
| Dose taken/missed (adherence event)                  | **MedicationAdministration**                        | internal only — not an ABDM HDE profile                           |
| Adherence score over time                            | **Observation**                                     | metric                                                             |
| Check-in call findings ("feeling well / chest pain") | **Observation** (one per finding)                   | `category=survey`, `status=preliminary`, `performer=Patient` |
| The call itself                                      | **Encounter** (`class=virtual`)                   | groups the call                                                    |
| Transcript / recording                               | **Communication** / Media / Binary                  | the raw artifact                                                   |
| Escalation flag                                      | **Task** (urgent, `for`=Patient) + **Flag** | routed to RMP                                                      |
| Follow-up appointment                                | **Appointment**                                     | —                                                                 |
| Lab report                                           | **DiagnosticReport** + **Observation**[]      | —                                                                 |
| Who/what generated a record                          | **Provenance**                                      | AI attribution — key                                              |

**AI-attribution pattern (critical — proves AI assisted, didn't practice medicine):**
AI-generated Observation → `status=preliminary`, `performer=Patient`, linked `Provenance` with `agent.who = Device` (the AI), `entity` = transcript, `onBehalfOf = Organization`. When an **RMP reviews & confirms** → flip to `status=final` + a **second Provenance** with `agent.who = Practitioner`. This cleanly separates AI generation from human verification — exactly what Guideline §5.4 requires.

---

## 9. Data model (core tables)

```
users(id, role, ...)                                    -- patient (caregiver deferred)
patients(id, user_id, name, phone, dob, lang, timezone, emergency_contact, plan)  -- plan: free/pro
consents(id, patient_id, purpose, granted_at, revoked_at)   -- signup, outreach-call, recording
reports(id, patient_id, image_url, raw_ocr, ocr_confidence, parsed_json, confirmed, created_at)
medicines(id, report_id, patient_id, brand, salt, strength, form,
          dosage_notation, timing[], duration_days, start_date, total_doses, status) -- active/expired
drug_catalog(brand, salt, strength, form)               -- Indian brand→salt mapping
interactions(salt_a, salt_b, severity, note, source)    -- curated, sourced
dose_schedule(id, medicine_id, scheduled_at, status)    -- pending/taken/missed
appointments(id, patient_id, doctor_name, appt_at, reminded)
prices(id, salt, strength, pack, source, price, url, fetched_at)   -- cached/indicative
pharmacies(id, name, lat, lng, address, phone)
call_notes(id, patient_id, encounter_ref, mood, adherence, symptom_flag, transcript_ref, at)
escalations(id, patient_id, triggering_obs, rmp_id, decision, decided_at)
audit_log(id, actor_id, patient_id, action, reason, at)  -- immutable, every clinical access
outbox(id, event, payload, status, created_at)           -- reliable delivery
idempotency_keys(key, result, created_at)
subscriptions(id, patient_id, plan, status, current_period_end)   -- no payment gateway; plan set manually/mock
-- FHIR resources (observation/provenance/task/…) persisted per §8
```

---

## 10. Compliance & legal

**Telemedicine Practice Guidelines 2020 (§5.4, §4.1.1, §1.4.2.3):**

- AI/ML platforms **may not counsel or prescribe**; only an RMP may. AI may only *assist* an RMP. → Product is a non-clinical explainer; escalation is human-in-the-loop (§7.7).
- Emergency triage is an RMP act. In all emergencies the patient **must be advised in-person care at the earliest** — delivered as universal "call 108" safety advice, not an AI diagnosis.

**DPDP Act 2023 (Rules notified 14 Nov 2025, in force):** health data = personal data (no separate "sensitive" tier now, but principles apply fully):

- **Consent** — free, specific, informed, unambiguous, limited to necessary; purpose-specific (process prescriptions / call me / record call); revocable.
- **Purpose limitation + data minimization** — this is *why* a super-admin over all clinical records is unlawful, and why admin was removed.
- **Right to erasure** — real "delete my data" cascading delete.
- **Retention** — auto-purge after policy window.
- **Audit log** — every clinical-record access logged immutably (who/when/what/why).
- **Data localization** — host in India region (Supabase/AWS ap-south-1).
- **Breach notification** path; encrypt PII at rest; never log raw PII.
- Likely **Significant Data Fiduciary** at scale → DPO + independent auditor + annual DPIA.

**Population analytics** (if ever built): de-identified store, aggregates only, strip identifiers, generalize (age bands, district), **k-anonymity (k≥5)** + minimum-cell suppression. Deferred (was tied to removed admin).

---

## 11. Security

- **Per-patient data isolation** — every query + every RAG retrieval filters by `patient_id`. Cross-patient leakage = instant disqualification for a health app.
- **OCR text = untrusted** — prompt-injection guard; report text never interpreted as instructions to the LLM.
- **Twilio webhook signature verification** — every inbound event verified via `X-Twilio-Signature` (HMAC-SHA1 over the exact URL + sorted params, keyed on auth token) using the **SDK `RequestValidator`**, never a hand-rolled check (Twilio's explicit instruction). Else anyone can POST fake "patient pressed 1 / took dose" events. (See §7.6.)
- **Voice-call identity check** before sharing any info; recording consent captured.
- **Secrets** in a vault/manager, never in repo.
- **Rate limits per user** (free tier: N reports/month) — prevents OCR/LLM cost-blast abuse.
- Network endpoints authenticated (JWT); no unauthenticated clinical routes.

---

## 12. Production infrastructure

- **Deploy:** India region. Backend containerized (Docker) on Fly.io/Render/AWS; frontend on Vercel. Health checks + graceful shutdown.
- **DB:** managed Postgres + pgvector (Supabase ap-south-1) with automated backups + PITR.
- **Async:** Celery + Redis (Upstash) for OCR, price fetch, calls — never block the API; upload returns "processing", result streams in.
- **Reliability patterns:** transactional **outbox** (reminder job written in same txn as the reminder), **idempotency keys** (safe Twilio retries), scheduler via `SELECT … FOR UPDATE SKIP LOCKED` (exactly-once dose reminders), **circuit breaker + cache fallback** on scrapers/external APIs.
- **Observability:** OpenTelemetry traces (upload→OCR→reminder→call in one trace) + Sentry.
- **Graceful degradation:** OCR fail → manual entry; voice fail → WhatsApp text; price source down → cached.
- **Testing/CI:** unit tests on safety-critical logic (dosage parser, schedule generator, interaction check, reconciliation); lint+test on push. SLOs: reminder delivery, call success.
- **Reliability state machines:**
  ```
  reminder: PENDING → SENT → ACKED  |  no-reply 30m → MISSED → caregiver alert
  call:     SCHEDULED → RINGING → IN_CALL → COMPLETED  |  no-answer → RETRY×2 → NOTIFY
  ```

---

## 13. Business model, pricing, unit economics, payments

**Who pays:** the caregiver — especially **NRI children** (USD/GBP earnings, rupee costs → high willingness-to-pay). Pure Indian B2C freemium WTP is low; NRI + urban professional is the wedge.

**Pricing:** single tier **₹99/month** (see §2 for feature split). Free = parse + explain + interaction flag + timeline. Pro = prices + reminders + follow-ups + check-in calls.

**Unit economics (per active Pro patient/mo, estimate):**

| Cost                                                        | ~₹/mo              |
| ----------------------------------------------------------- | ------------------- |
| WhatsApp utility msgs (~₹0.3–0.4 × 2–3/day)             | 25–40              |
| Voice check-in call (STT+LLM+TTS+telephony, ~₹15–25/call) | 60–100             |
| OCR + LLM (few reports/mo)                                  | 5–10               |
| Infra share                                                 | 10–20              |
| **Total variable**                                    | **~100–170** |

At ₹99, WhatsApp + prices carry healthy margin, but **voice calls are the loss leader** → **cap check-in calls in Pro** (e.g. 2/mo included, top-up beyond) or push heavy callers to a higher tier. Voice-heavy at flat ₹99 = negative margin.

**Payments:** **no payment gateway** — removed from scope. Pro is unlocked via a mock upgrade toggle (plan flag). The ₹99 pricing stays as the monetization model, but no real collection is built.

**Other revenue (roadmap):** pharmacy affiliate/commission on refills (recurring), hospital post-discharge B2B (per-patient/mo), teleconsult referral take-rate (also satisfies the RMP requirement), lab-test booking commission.

---

## 14. Demo data spec

Two synthetic patients (DPDP-safe), one-click credential fill from the login boxes.

**👤 Aarav Sharma — 34, "Normal" (free tier).** Lucknow. One prescription (Dr. Verma): Pantoprazole 40mg `1-0-0` empty-stomach 14d; Digene syrup `SOS`. Shows: parse + explain + "✓ no interaction" + timeline; prices/reminders/calls **locked & blurred** (upsell).
Login: `aarav@demo.in` / `pass1234`.

**⭐ Shanti Devi — 68, "Pro" (full).** Lucknow. **Three prescriptions from three doctors** (the cross-doctor safety demo):

- Dr. Mehta (Cardio): Ecosprin 75 (Aspirin) `0-1-0`; Amlong 5 (Amlodipine) `1-0-0`.
- Dr. Singh (Physician): Glycomet 500 (Metformin) `1-0-1`; Thyronorm 50 (Thyroxine) `1-0-0` empty-stomach.
- Dr. Rao (Ortho, new): Brufen 400 (**Ibuprofen**) `1-0-1` 5d.
- 🚨 **WOW:** adding Ortho triggers cross-doctor flag — Ibuprofen + Aspirin → bleeding risk + reduced cardio-protection.
- Full: prices, live reminder schedule, adherence 94%, rich timeline, lab trend (HbA1c 8.1→7.6→7.2), a check-in call note, upcoming Dr. Mehta appointment.
  Login: `shanti@demo.in` / `pass1234`.

**Seed sources:** structured rows via `seed.py` (Synthea-style + Indian brand overlay); 3–4 clean typed sample prescription images for live OCR; the Aspirin+Ibuprofen pair pre-seeded in `interactions`.

---

## 15. API keys & cost reality

**Free (demo + small scale):** Supabase, Google OAuth, Gemini (AI Studio, rate-limited), Groq, LiveKit (self-host + `turn-detector v1-mini` runs free on CPU), **DDInter 2.0** (DDI data, CC BY-NC — non-commercial only), **A-Z Medicines Dataset of India** (brand→salt, MIT), OpenFDA + RxNorm (aux/cross-check only — RxNorm is US-scoped), OpenStreetMap/Overpass, Upstash Redis, Vercel, Sentry.

**Free trial → then paid:** Deepgram (STT), ElevenLabs/Cartesia/Murf (TTS), LiveKit Cloud minutes.

**Actually paid (be honest):**

- **Twilio** — biggest running cost. Trial: ~$15 credit + trial number (messages to *verified* numbers only). Prod WhatsApp is **per-message** (post-2025-07 Meta shift, not per-conversation): flat **$0.005** Twilio fee inbound *or* outbound + Meta per-template pass-through (utility/auth from ~$0.0034/msg **US floor; India rate differs & is not yet confirmed** — verify before pricing), utility **free** inside the 24 h service window. Plus per-minute voice + number rent. **Outbound calls to India** likely need **Plivo/Exotel** for the +91 leg (§7.7).
- **Google Maps** — avoided; using OpenStreetMap (free).

**Demo = ~₹0:** free tiers + trial credits; **mock/dry-run mode** logs "WhatsApp sent ✓" without spending until real keys added → demo never stalls, credits preserved. Watch free-tier **rate limits** (Gemini/Groq) — keep demo controlled.

**Production paid:** Twilio (WhatsApp+calls), STT/TTS after trial, heavy LLM — the §13 unit-cost drivers.

---

## 16. Known holes, risks & prototype simplifications

Existential (must address before real launch):

1. **No RMP in prototype** → app takes no clinical decision; defers to "your doctor / 108". Real RMP = partnered/on-call at launch.
2. **Emergency latency** → immediate universal "call 108" advice, does not wait for RMP review.
3. **Payments removed from scope** → Pro = mock toggle; no gateway built. Revisit only if/when real charging is needed.

Feature-integrity:
4. **Medication reconciliation** → only active meds enter interaction check (avoid false alarms). Tested.
5. **LLM hallucination** → RAG-grounded explanations only; facts from DB; disclaimers.
6. **Interaction table trust** → DDInter 2.0 rows, "checked against N", never "guaranteed safe"; pharmacist-vet ideal.
6a. **DDInter licensing (legal, real blocker for paid launch)** → DDInter 2.0 is **CC BY-NC**. Fine for the non-commercial hackathon/demo; a paid product needs OUP clearance (`reprints@oup.com`) or a switch to DrugBank/commercial. Decide before charging.
6b. **Brand→salt→DDI bridge is unverified** → the join from the Indian brand catalog to DDInter did **not** survive verification (and DDInter's salt-vs-drug keying is unresolved). Build it as exact→fuzzy→LLM-assisted with **mandatory HUMAN CONFIRM**; validate the join on the seed set; never auto-flag/clear on an unconfirmed mapping. Salt fields also embed dose strings and truncate 3+-ingredient combos.

Production hygiene (mostly deferrable/mockable in prototype):
7. Reminder lifecycle (edit/pause/auto-stop). 8. Cold-start bulk import. 9. OCR prompt-injection guard. 10. Account recovery. 11. WhatsApp→SMS fallback + timezone. 12. Per-user rate limits.
13. **India outbound-voice compliance** → real automated calling needs **DLT registration + TRAI DND scrubbing + 140/160-series numbers**, and Twilio likely can't originate the **+91 leg** (use Plivo/Exotel). Prototype: consented calls to verified numbers only; full compliance at launch (§7.7).
14. **India-specific costs unquantified** → India WhatsApp per-template rates, and the exact caps of Twilio trial / Deepgram free credit / Gemini free tier, are not yet confirmed — verify before committing to ₹99 unit economics (§13).

**None of these kills the idea** — all are fixable, most mockable for the prototype.

---

## 17. Tech stack summary

| Layer           | Choice                                                                |
| --------------- | --------------------------------------------------------------------- |
| Frontend        | Next.js PWA                                                           |
| Backend         | FastAPI + LangGraph                                                   |
| Voice           | LiveKit Agents + LiveKit SIP (ap-south, co-located) + Deepgram Nova-3 (via LiveKit Inference) + Groq/Gemini + Cartesia `sonic-3.6` + turn-detector `v1`/`v1-mini` + adaptive interruption |
| OCR             | Gemini Vision                                                         |
| DB + vectors    | Postgres + pgvector (Supabase, ap-south-1)                            |
| Queue/cache     | Celery + Redis (Upstash)                                              |
| Scheduler       | APScheduler/Celery Beat +`FOR UPDATE SKIP LOCKED`                   |
| Drug data       | A-Z Medicines Dataset of India (brand→salt, MIT) + DDInter 2.0 interactions (CC BY-NC) — OpenFDA/RxNorm aux only |
| Telephony (IN)  | Twilio (WhatsApp + trial voice); Plivo/Exotel for +91 outbound leg at launch; DLT/DND compliance |
| Prices / Maps   | affiliate/cached + OpenStreetMap/Overpass                             |
| Reminders/Calls | Twilio (WhatsApp + Voice + SIP)                                       |
| Payments        | — (out of scope; Pro via mock toggle)                                 |
| Standards       | HL7 FHIR R4 (ABDM/NRCeS IG)                                           |
| Observability   | OpenTelemetry + Sentry                                                |
| Auth            | Supabase Auth (Google OAuth + Phone OTP)                              |

---

## 18. Roadmap / phasing

- **Phase 0 (prototype/hackathon):** auth + demo boxes, OCR→confirm→interaction flag, timeline, WhatsApp reminders (DONE-reply), one demoable check-in/appointment call, mock prices where needed. Pro unlocked via mock toggle (no payments). Depth on 3 features (cross-doctor safety + live reminder + check-in call) beats breadth.
- **Phase 1:** WhatsApp template approval, real Deepgram/TTS, NRI caregiver targeting.
- **Phase 2:** pharmacy affiliate + partnered RMP escalation + teleconsult referral.
- **Phase 3:** hospital post-discharge B2B, ABDM/ABHA integration, caregiver role, de-identified analytics.

---

## 19. Research provenance & verified sources (2026)

Deep-research pass (fan-out search → source fetch → 3-vote adversarial verification). Scope: production-grade path for the 3 hero features on the **kept** free-tier stack (Gemini, LiveKit, Twilio, Deepgram all retained — free tiers judged sufficient). 23/25 top claims confirmed, 2 refuted (below). Confidence = verifier consensus, not ground truth.

**Confirmed (load-bearing) — with primary sources:**

| # | Verified finding | Confidence | Source |
| - | ---------------- | ---------- | ------ |
| F1 | **DDInter 2.0**: 2,310 drugs / 302,516 DDI records / 8,398 mechanism+management notes; free, login-free; **CC BY-NC** (paid use → `reprints@oup.com`) | high | PMC11701621 (NAR 2025); `ddinter2.scbdd.com` |
| F2 | **A-Z Medicines Dataset of India** ~253,973 brands, `short_composition1/2` salt fields, MIT mirror | high | `github.com/junioralive/Indian-Medicine-Dataset`; Kaggle A-Z |
| F3 | **RxNorm is US-scoped** — empty for Dolo 650 / Ecosprin; non-US added only "as opportunities allow" | high | NLM RxNorm docs; RxNav |
| F4 | Verify every inbound webhook with **`X-Twilio-Signature`** via SDK `RequestValidator` — "don't roll your own" | high | Twilio webhooks-security docs |
| F5 | Twilio WhatsApp is **per-message** (post-2025-07): $0.005 flat + Meta per-template pass-through; utility free in 24 h window | high | Twilio WhatsApp/messaging pricing |
| F6 | Dose-confirm **quick-reply buttons** → label arrives in webhook **`ButtonText`** (`ButtonPayload` = id) | high | Twilio WhatsApp buttons docs |
| F7 | **Co-locate agent + STT/LLM/TTS in `ap-south`** → ~1.67 s E2E (~1 s faster than cross-region); target, not guarantee | high | LiveKit India field guide |
| F8 | **Deepgram Nova-3 via LiveKit Inference** — India-hosted, Hindi + 7 langs; co-located Mumbai model is EN/HI-only, falls back to Frankfurt | high | LiveKit field guide; Deepgram Nova-3 |
| F9 | **Cartesia `sonic-3.6`** — Hindi + 8 Indian langs + explicit Hinglish; legacy `sonic-2` lacks Hindi, sunsets 2026-10-20 | high | LiveKit Cartesia plugin; Cartesia docs |
| F10 | **turn-detector** covers Hindi (`v1` on Inference / `v1-mini` free on CPU) + **adaptive interruption** (acoustic) | high | LiveKit turn-detector / adaptive-interruption docs |
| F11 | Handoff: facts → `AgentSession.userdata` (auto-carries); **history does NOT transfer** unless `chat_ctx` passed explicitly | high | LiveKit agents-handoffs docs |
| F12 | Outbound PSTN via LiveKit **Elastic SIP Trunking** (`<trunk>.pstn.twilio.com`, TCP); Twilio can't originate **+91** → Plivo/Exotel; DLT/DND still required | high | LiveKit SIP + Twilio India Voice Guidelines; Exotel |

**Refuted (do NOT treat as fact):**
- "DDInter 2.0 is strictly drug-level, not salt-level" — **unresolved** (1–2). Salt↔DDI keying needs its own validation.
- A specific "exact→fuzzy(0.85)→semantic, 28-salt-vocab" normalization pipeline — **refuted** (0–3, weak source). Design your own brand→salt bridge + human confirm.

**Open questions (verify before real launch):**
1. Exact, validated brand→salt→DDInter join (likely LLM-assisted + human confirm).
2. Actual **India** WhatsApp per-template rates; hard caps of Twilio trial / Deepgram credit / Gemini free tier.
3. Full India outbound-voice checklist: Plivo/Exotel +91 leg + DLT registration + TRAI DND scrubbing + 140/160-series.
4. Lawful use of DDInter under CC BY-NC in a paid product (OUP clearance) + DPDP/Telemedicine constraints on alert wording.

> Sources are LiveKit/Twilio first-party docs and peer-reviewed/open datasets; the 1.67 s figure is a single vendor "example," and India telecom framing is directional — treat both as targets to validate, not guarantees.
