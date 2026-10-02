# Aarogya Agent (System B) — voice + text, one brain

A non-clinical health **companion** for the Aarogya app: it explains a patient's
prescriptions, lists their current medicines and timings, runs the cross-doctor
drug-interaction check, and shares indicative prices — in Hindi / Hinglish / English.
It **never diagnoses, prescribes, or changes a dose** (India Telemedicine Practice
Guidelines 2020 §5.4). See `../DESIGN.md` §6.

This folder is **standalone** — it is merged into the backend repo later. It never
touches the database directly; the only way it reaches patient data is the backend
HTTP API, as that patient's bearer token (per-patient isolation, design §11).

## One brain, two frontends

```
              prompt.py  (SYSTEM_PROMPT — the shared rules/persona)
              backend_client.py  (the shared tools → backend HTTP API)
                     │                         │
        voice.py (LiveKit)              chat.py (FastAPI)
   Deepgram STT → Gemini → Murf TTS     text in → Gemini → text out
```

- `prompt.py` — the single source of truth for behaviour (both frontends import it).
- `backend_client.py` — per-patient `BackendClient`; `get_profile / get_medicines /
  check_interactions / list_reports` map 1:1 to backend endpoints.
- `voice.py` — LiveKit Agents worker (cascading STT→LLM→TTS + VAD + turn detection).
- `chat.py` — FastAPI `POST /chat`; same prompt + tools via google-genai automatic
  function calling.

## Setup

```bash
cd Aayogya/agent
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # fill in the keys
```

Keys needed: `GOOGLE_API_KEY` (Gemini), `DEEPGRAM_API_KEY`, `MURF_API_KEY`, and
`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` for voice. The backend
(System A) must be running at `AAROGYA_BACKEND_URL` (default `http://localhost:8000`).

## Run

```bash
# Text chatbot
uvicorn chat:app --reload --port 8080
curl -s localhost:8080/chat -H 'content-type: application/json' \
  -d '{"message":"मेरी दवाइयाँ कौन सी हैं?","token":"<patient-token>"}'

# Voice agent (LiveKit worker)
python voice.py dev      # dev/hot-reload   ·   python voice.py start  # prod
```

**Auth.** The `token` is the patient's own backend token (from app login) and IS the
authorization — every tool call runs as that patient and the backend enforces
isolation. `/chat` has no auth of its own, so keep it behind your app's origin/gateway;
don't expose it publicly unauthenticated. With no token it falls back to demo creds
(`AAROGYA_DEMO_*`) so you can run it headless: seeded `aarav@demo.in` / `pass1234`.

For voice, the app passes the token in LiveKit **job metadata** when it dispatches the
agent: `{"backend_token": "<token>"}` (a bare token string is also accepted).

## Demo UI (local hand-testing)

A one-page UI to try both frontends in the browser — **localhost only, no auth**.

```bash
uvicorn demo:app --port 8080      # then open http://localhost:8080
```

- **Chat** works with just the backend running + `GOOGLE_API_KEY`. Leave the token box
  blank to talk as the demo patient (needs `AAROGYA_DEMO_*`), or paste a patient token.
- **Voice** additionally needs `LIVEKIT_URL/API_KEY/API_SECRET` set and a worker running
  in another terminal (`python voice.py dev`). Click **Start call** and speak — the
  worker auto-joins the room and logs in with demo creds. (BVC needs LiveKit Cloud.)

## Test

```bash
python test_agent.py      # prompt safety rules + BackendClient auth/routing (no network)
```

## SDK surface (verified 2026-09-26)

Checked against live docs + installed packages: **livekit-agents 1.8.x** (extras
`[deepgram,google,murf,silero,turn-detector]` and the `@function_tool` / `AgentSession`
/ `google.LLM("gemini-2.5-flash")` / `generate_reply(instructions=)` calls are current),
the `turn_detector.multilingual.MultilingualModel` import path, and **google-genai 1.67**
(async automatic function calling via `client.aio` with async tool callables — correct).

Two things were corrected here as a result:
- **Deepgram** `nova-2` → `nova-3`: with `language="multi"`, nova-2 only code-switches
  Spanish+English — it would not transcribe Hindi at all.
- **Murf** default voice `Gordon` (English) → `Shweta` (hi-IN) + `MURF_LOCALE`; and
  there is no `FALCON_2` model id — blank `MURF_MODEL` already gives Falcon 2 streaming
  (~100ms). Confirm the exact Murf voice id against `GET /v1/speech/voices`.

Note: `turn_detection=` on `AgentSession` is deprecated on newer 1.x (removed in v2.0)
but works across the whole 1.x line; kept as-is for compatibility with `~=1.8`.

## Latency & audio quality

Tuned for a snappy spoken feel (patterns from a reference LiveKit health agent):
- `preemptive_generation=True` — the LLM starts on the partial transcript.
- VAD is loaded once in `prewarm_fnc` (warm before the call), tuned `min_silence_duration=0.5`.
- Murf TTS streams per short sentence (`SentenceTokenizer(min_sentence_len=2)`, `text_pacing=True`) so the first words play sooner.
- **Noise cancellation (BVC)** via `RoomInputOptions` — cancels background voices/noise.
  BVC runs on **LiveKit Cloud**; on a self-hosted SFU it's a no-op. Use
  `noise_cancellation.BVCTelephony()` if you route over SIP/phone. Degrades gracefully
  if the plugin isn't installed.
- For lower first-token latency, set `GEMINI_MODEL` to a `-flash-lite` tier in `.env`
  (verify the exact id against your key).
