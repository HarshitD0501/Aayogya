"""System B — the LiveKit voice agent (design §6).

Pipeline: Deepgram STT  ->  Gemini 2.5 (brain)  ->  Murf TTS, with Silero VAD and
multilingual turn detection. The Agent's tools are thin wrappers over BackendClient,
so voice and the text chatbot (chat.py) share ONE brain + ONE set of tools.

Run a worker:
    python voice.py dev      # dev mode, hot reload
    python voice.py start    # production

The patient's backend token is read from the job metadata that your app sets when
it dispatches the agent (JSON: {"backend_token": "..."}). For standalone runs it
falls back to demo creds (set AAYOGYA_DEMO_IDENTIFIER / AAYOGYA_DEMO_PASSWORD).
"""
from __future__ import annotations

import json
import logging

from livekit.agents import (
    Agent, AgentSession, JobContext, JobProcess, RunContext, WorkerOptions,
    cli, function_tool, tokenize,
)
from livekit.agents.voice import room_io
from livekit.plugins import deepgram, google, murf, silero

import config
import prompt
from backend_client import BackendClient, login_demo, safe

logger = logging.getLogger("aayogya.agent")

# Turn detection: uses Silero VAD by default for snappy, instant (<100ms) turns.
# The heavy multilingual turn-detector ONNX model is optional and can be enabled via ENABLE_TURN_DETECTOR=1.
_turn_detection = None
try:
    import os
    if os.getenv("ENABLE_TURN_DETECTOR", "0") == "1":
        from livekit.plugins.turn_detector.multilingual import MultilingualModel
        _turn_detection = MultilingualModel()
except Exception:  # noqa: BLE001
    logger.info("turn-detector plugin not available; falling back to Silero VAD")
    _turn_detection = None


# Enhanced noise + background-voice cancellation (BVC): keeps a family member talking
# nearby or a noisy room from garbling the patient's speech (cleaner STT => fewer
# retries => snappier turns). BVC runs on LiveKit Cloud; on a self-hosted SFU it's a
# no-op. Optional plugin — degrade gracefully if it isn't installed (design §12).
try:
    from livekit.plugins import noise_cancellation
except Exception:  # noqa: BLE001
    logger.info("noise-cancellation plugin not available; running without it")
    noise_cancellation = None


class SahayakAssistant(Agent):
    """The brain, wearing its voice frontend. Instructions + tools are shared."""

    def __init__(self, client: BackendClient, profile: dict | None = None) -> None:
        p = profile or {}
        name = p.get("name", "")
        lang = p.get("language", config.DEFAULT_LANG or "hi")
        age = p.get("age", "")
        gender = p.get("gender", "")
        plan = p.get("subscription_plan", "free")
        
        instructions = prompt.SYSTEM_PROMPT
        if name:
            instructions += (
                f"\n\n# PATIENT CONTEXT\n"
                f"You are speaking directly with patient {name}.\n"
                f"- Age: {age or 'Not specified'}, Gender: {gender or 'Not specified'}\n"
                f"- Preferred language: {lang}\n"
                f"- Subscription plan: {plan}\n"
                f"Always address them warmly by name in their language ({lang})."
            )
        super().__init__(instructions=instructions)
        self._client = client

    @function_tool
    async def get_my_medicines(self, context: RunContext) -> str:
        """List the patient's current active medicines with how and when to take them and indicative prices."""
        meds = await safe(self._client.get_medicines())
        if not meds:
            return "No active medicines found in patient records."
        return json.dumps(meds, ensure_ascii=False)

    @function_tool
    async def check_drug_interactions(self, context: RunContext) -> str:
        """Check for dangerous interactions across ALL the patient's active medicines (the cross-doctor safety check)."""
        data = await safe(self._client.check_interactions())
        if not data:
            return "No drug interactions found."
        return json.dumps(data, ensure_ascii=False)

    @function_tool
    async def get_prescription_history(self, context: RunContext) -> str:
        """List the patient's past prescriptions and reports, newest first."""
        reports = await safe(self._client.list_reports())
        if not reports:
            return "No past prescriptions or reports found."
        return json.dumps(reports, ensure_ascii=False)


AayogyaAssistant = SahayakAssistant  # backward-compatibility alias


def _token_from_metadata(ctx: JobContext) -> str | None:
    """Pull the patient's backend token from job metadata set by the app."""
    raw = getattr(ctx.job, "metadata", None)
    if not raw:
        return None
    try:
        return json.loads(raw).get("backend_token")
    except (ValueError, TypeError):
        return raw or None  # allow passing the bare token as metadata too


def _token_from_participant(participant) -> str | None:
    """Pull the backend token from the browser's join-token metadata. The web app's
    /api/voice/token embeds the patient's bearer token here so the agent acts AS
    that patient (isolation §11) — this is the path used by the website."""
    raw = getattr(participant, "metadata", None)
    if not raw:
        return None
    try:
        return json.loads(raw).get("backend_token")
    except (ValueError, TypeError):
        return raw or None


def prewarm(proc: JobProcess) -> None:
    """Prewarm models and clients once per worker process (not per call), so model-load
    and SSL/Pydantic initialization latency is kept off the live call path.
    Minimizes loop stalls on Windows."""
    proc.userdata["vad"] = silero.VAD.load(min_silence_duration=0.5)
    proc.userdata["llm"] = google.LLM(model=config.GEMINI_MODEL)
    proc.userdata["stt"] = deepgram.STT(model=config.DEEPGRAM_MODEL, language=config.STT_LANGUAGE)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    vad = ctx.proc.userdata.get("vad") or silero.VAD.load(min_silence_duration=0.5)
    llm = ctx.proc.userdata.get("llm") or google.LLM(model=config.GEMINI_MODEL)
    stt = ctx.proc.userdata.get("stt") or deepgram.STT(model=config.DEEPGRAM_MODEL, language=config.STT_LANGUAGE)

    # Token source, in order: explicit dispatch job metadata -> the browser's join-token
    # metadata (website path) -> demo creds (standalone). Each binds the agent to ONE
    # patient so its tools read only that patient's records (isolation §11).
    token = _token_from_metadata(ctx)
    if not token:
        participant = await ctx.wait_for_participant()
        token = _token_from_participant(participant)
    token = token or await login_demo()
    if not token:
        raise RuntimeError(
            "No patient token. The website sets it via /api/voice/token metadata; "
            "for a standalone run set AAYOGYA_DEMO_IDENTIFIER/PASSWORD."
        )
    client = BackendClient(token)
    ctx.add_shutdown_callback(client.aclose)

    # Stream TTS as soon as a short sentence is ready (min_sentence_len=2) and pace it,
    # so the patient hears the first words sooner instead of after the whole reply.
    murf_kwargs: dict = {
        "voice": config.MURF_VOICE,
        "style": config.MURF_STYLE,
        "tokenizer": tokenize.basic.SentenceTokenizer(min_sentence_len=2),
        "text_pacing": True,
    }
    if config.MURF_LOCALE:
        murf_kwargs["locale"] = config.MURF_LOCALE
    if config.MURF_MODEL:
        murf_kwargs["model"] = config.MURF_MODEL

    turn_opts = {
        "turn_detection": _turn_detection if _turn_detection else "vad",
        "preemptive_generation": {"preemptive_tts": True},
    }

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=murf.TTS(**murf_kwargs),
        vad=vad,
        turn_handling=turn_opts,
    )

    # Fetch profile to greet patient by their name in their preferred language
    profile = await safe(client.get_profile()) or {}
    patient_name = profile.get("name", "")
    preferred_lang = profile.get("language", config.DEFAULT_LANG or "hi")
    first_name = patient_name.split()[0] if patient_name else ""

    # Modern RoomOptions replaces deprecated RoomInputOptions
    room_options = room_io.RoomOptions(
        audio_input=room_io.AudioInputOptions(
            noise_cancellation=noise_cancellation.BVC() if noise_cancellation else None
        )
    )
    await session.start(
        agent=SahayakAssistant(client, profile=profile),
        room=ctx.room,
        room_options=room_options,
    )

    if not preferred_lang or preferred_lang == "hi" or preferred_lang.startswith("hi"):
        greeting_msg = (
            f"नमस्ते {first_name or patient_name}! मैं सहायक हूँ, आयोग्या से आपकी सेहत का साथी। "
            f"आज मैं आपकी दवाओं या सेहत के बारे में क्या मदद कर सकता हूँ?"
        )
    else:
        greeting_msg = (
            f"Namaste {first_name or patient_name}! I am Sahayak, your health companion from Aayogya. "
            f"How can I help you with your medicines or prescription today?"
        )

    await session.say(greeting_msg)



if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
