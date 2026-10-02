"""Env-driven config for the Aayogya voice+chat agent (design §6).

One key note: the LiveKit Google plugin looks up GOOGLE_API_KEY, while the
backend uses GEMINI_API_KEY. We accept either so a single key works across both
systems (System A backend + System B agent).
"""
from __future__ import annotations

import os

try:  # dotenv is optional — env vars work fine without it
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - convenience only
    pass


# --- Gemini (the brain) ---
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", "")
if GOOGLE_API_KEY:
    # The livekit google plugin reads GOOGLE_API_KEY from the environment.
    os.environ.setdefault("GOOGLE_API_KEY", GOOGLE_API_KEY)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")  # ultra-fast, low-latency, active Google model

# --- Backend (System A) — the single source of truth. Tools call it over HTTP. ---
BACKEND_URL = os.getenv("AAYOGYA_BACKEND_URL") or os.getenv("AAROGYA_BACKEND_URL", "http://localhost:8000")

# --- STT (Deepgram) — Hindi / Hinglish per design §6. nova-3 is required: with
# language="multi", nova-2 only code-switches Spanish+English (no Hindi). ---
DEEPGRAM_MODEL = os.getenv("DEEPGRAM_MODEL", "nova-3")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "multi")

# --- TTS (Murf) — Hindi-first for elderly patients. Pick a voice id from the Murf
# console (verify via GET /v1/speech/voices); "Shweta" is a warm hi-IN Falcon voice.
# Blank MURF_MODEL => plugin default "FALCON" (= Falcon 2 streaming, ~100ms TTFB). ---
MURF_VOICE = os.getenv("MURF_VOICE", "Shweta")
MURF_LOCALE = os.getenv("MURF_LOCALE", "hi-IN")
MURF_STYLE = os.getenv("MURF_STYLE", "Conversational")
MURF_MODEL = os.getenv("MURF_MODEL", "")

# --- Standalone/demo: if the frontend didn't pass a patient token, log in with
# these demo creds so the agent runs without a UI (e.g. aarav@demo.in / pass1234). ---
DEMO_IDENTIFIER = os.getenv("AAYOGYA_DEMO_IDENTIFIER") or os.getenv("AAROGYA_DEMO_IDENTIFIER", "")
DEMO_PASSWORD = os.getenv("AAYOGYA_DEMO_PASSWORD") or os.getenv("AAROGYA_DEMO_PASSWORD", "")

# Preferred reply language when the patient's profile doesn't specify: hi | en
DEFAULT_LANG = os.getenv("AAYOGYA_DEFAULT_LANG") or os.getenv("AAROGYA_DEFAULT_LANG", "hi")
