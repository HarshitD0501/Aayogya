"""System B — the LiveKit voice agent (design §6).

Pipeline: Deepgram STT  ->  Gemini (brain)  ->  Murf TTS, with Silero VAD and
optional multilingual turn detection. The Agent's tools are thin wrappers over BackendClient,
so voice and the text chatbot (chat.py) share ONE brain + ONE set of tools.

Run a worker:
    python voice.py start    # production (use this; `dev` is deprecated in
                             # livekit-agents 1.8 and prints warnings)

The patient's backend token is read from the job metadata that your app sets when
it dispatches the agent (JSON: {"backend_token": "..."}). For standalone runs it
falls back to demo creds (set AAYOGYA_DEMO_IDENTIFIER / AAYOGYA_DEMO_PASSWORD).
"""
from __future__ import annotations

import json
import logging
import ssl

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobExecutorType,
    JobProcess,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
    tokenize,
)
from livekit.agents.voice import room_io
from livekit.plugins import deepgram, google, murf, silero

import config
import followup_prompt
import prompt
from backend_client import BackendClient, login_demo, safe

logger = logging.getLogger("aayogya.agent")

# Windows cold-start: loading the certifi CA bundle into an SSL context is a
# one-shot ~0.2-5s blocking read the SDK does on the event loop at startup.
# Touch it here, BEFORE the loop exists, so the loop monitor never sees it.
ssl.create_default_context()

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
        """Check for dangerous interactions across ALL the patient's active medicines."""
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


class DoctorFollowupAssistant(Agent):
    """Outbound telephony agent: 2-day doctor follow-up reminder and rescheduling."""

    def __init__(self, client: BackendClient, call_meta: dict) -> None:
        patient_name = call_meta.get("patient_name", "मरीज़")
        doctor_name = call_meta.get("doctor_name", "डॉक्टर")
        doctor_specialty = call_meta.get("doctor_specialty", "सामान्य चिकित्सा")
        follow_up_date = call_meta.get("follow_up_date", "")
        report_id = call_meta.get("report_id", 0)

        instructions = followup_prompt.FOLLOWUP_SYSTEM_PROMPT.format(
            patient_name=patient_name,
            doctor_name=doctor_name,
            doctor_specialty=doctor_specialty or "सामान्य चिकित्सा",
            follow_up_date=follow_up_date,
            lead_time=_lead_time_text(follow_up_date),
            report_id=report_id,
        )
        super().__init__(instructions=instructions)
        self._client = client
        self._report_id = report_id

    @function_tool
    async def reschedule_appointment(
        self, context: RunContext, preferred_date_or_time: str, reason: str = ""
    ) -> str:
        """Call this tool immediately when the patient specifies when they will be free to reschedule their doctor checkup."""
        logger.info("[AGENT] Calling reschedule_appointment tool: %s (reason: %s)", preferred_date_or_time, reason)
        res = await safe(self._client.request_reschedule(self._report_id, preferred_date_or_time, reason))
        if isinstance(res, dict) and "error" in res:
            return "Unable to save reschedule preference at this moment."
        return (
            f"Preference recorded for {preferred_date_or_time}. "
            f"Please note that the appointment is not yet confirmed with the clinic."
        )

    @function_tool
    async def get_my_medicines(self, context: RunContext) -> str:
        """List the patient's current active medicines with how and when to take them."""
        meds = await safe(self._client.get_medicines())
        if not meds:
            return "No active medicines found in patient records."
        return json.dumps(meds, ensure_ascii=False)

    @function_tool
    async def check_drug_interactions(self, context: RunContext) -> str:
        """Check for dangerous interactions across ALL the patient's active medicines."""
        data = await safe(self._client.check_interactions())
        if not data:
            return "No drug interactions found."
        return json.dumps(data, ensure_ascii=False)


AayogyaAssistant = SahayakAssistant  # backward-compatibility alias

_HI_DAYS = ("आज", "कल", "परसों")


def _lead_time_text(follow_up_date: str) -> str:
    """Human lead-time in Hindi ('कल', '2 दिन बाद', '7 दिन बाद') from an ISO-ish date.

    Blank/unparseable dates fall back to the date string itself, so the greeting
    never lies about when the visit is.
    """
    date = _parse_date(follow_up_date)
    if date is None:
        return follow_up_date or "जल्द"
    days = (date - _today()).days
    if days < 0:
        return follow_up_date
    if days < len(_HI_DAYS):
        return _HI_DAYS[days]
    return f"{days} दिन बाद, {follow_up_date} को"


def _parse_date(s: str):
    from datetime import datetime

    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _today():
    from datetime import date

    return date.today()


def _parse_metadata(ctx: JobContext) -> dict:
    """Pull job or room metadata passed when dispatching the agent."""
    raw = getattr(ctx.job, "metadata", None)
    if not raw and getattr(ctx, "room", None):
        raw = getattr(ctx.room, "metadata", None)
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return {"backend_token": raw}


def _token_from_metadata(ctx: JobContext) -> str | None:
    """Pull the patient's backend token from job or room metadata."""
    meta = _parse_metadata(ctx)
    return meta.get("backend_token")


def _token_from_participant(participant) -> str | None:
    """Pull the backend token from the browser's join-token metadata."""
    raw = getattr(participant, "metadata", None)
    if not raw:
        return None
    try:
        return json.loads(raw).get("backend_token")
    except (ValueError, TypeError):
        return raw or None


def _make_llm() -> google.LLM:
    """Build the Gemini LLM. For Gemini 3+ models, thinking is pinned to "minimal":
    voice needs first-token speed, not chain-of-thought. Older models accept no
    thinking_level (it would raise), so it's passed only where it's supported."""
    if "gemini-3" in config.GEMINI_MODEL.lower():
        return google.LLM(
            model=config.GEMINI_MODEL,
            thinking_config={"thinking_level": "minimal"},
        )
    return google.LLM(model=config.GEMINI_MODEL)


def prewarm(proc: JobProcess) -> None:
    """Prewarm models and clients once per worker process (not per call), so model-load
    and SSL/Pydantic initialization latency is kept off the live call path.
    Minimizes loop stalls on Windows."""
    import asyncio

    # The SDK runs prewarm synchronously on the job process's event loop; the
    # ONNX model read in VAD.load() blocks it, ping messages queue behind, and
    # "job executor is unresponsive" fires. Off-load the blocking reads to a
    # thread so the loop stays responsive.
    async def _warm():
        loop = asyncio.get_running_loop()
        vad = await loop.run_in_executor(
            None, lambda: silero.VAD.load(min_silence_duration=0.55)
        )
        proc.userdata["vad"] = vad
        proc.userdata["llm"] = _make_llm()
        proc.userdata["stt"] = deepgram.STT(model=config.DEEPGRAM_MODEL, language=config.STT_LANGUAGE)

    try:
        asyncio.get_event_loop_policy()
        asyncio.run(_warm())
    except RuntimeError:
        # Fallback if no loop can be spun up here (shouldn't happen post-init).
        proc.userdata["vad"] = silero.VAD.load(min_silence_duration=0.55)
        proc.userdata["llm"] = _make_llm()
        proc.userdata["stt"] = deepgram.STT(model=config.DEEPGRAM_MODEL, language=config.STT_LANGUAGE)


async def _dial_patient(ctx: JobContext, call_meta: dict) -> str:
    """Outbound telephony: dial the patient's phone from inside the agent job
    (official LiveKit pattern — docs.livekit.io/telephony/making-calls).

    Waits until the callee answers, so the greeting plays only once the call is
    actually connected. SIP failure codes (busy/no-answer/failed) raise
    SipCallError, which the caller maps to a shutdown.
    """
    from livekit import api

    phone = call_meta.get("patient_phone", "")
    trunk_id = call_meta.get("sip_trunk_id") or config.LIVEKIT_SIP_TRUNK_ID
    sip_domain = call_meta.get("twilio_sip_domain") or config.TWILIO_SIP_DOMAIN

    req_kwargs: dict = {
        "room_name": ctx.room.name,
        "sip_call_to": phone,
        "participant_identity": f"sip-{call_meta.get('patient_id', 'patient')}",
        "participant_name": call_meta.get("patient_name") or "Patient",
        "wait_until_answered": True,
    }
    if trunk_id:
        req_kwargs["sip_trunk_id"] = trunk_id
    elif sip_domain:
        from livekit.protocol.sip import SIPOutboundConfig

        req_kwargs["trunk"] = SIPOutboundConfig(
            hostname=sip_domain,
            auth_username=call_meta.get("twilio_sip_username") or config.TWILIO_SIP_USERNAME,
            auth_password=call_meta.get("twilio_sip_password") or config.TWILIO_SIP_PASSWORD,
        )

    sip_info = await ctx.api.sip.create_sip_participant(
        api.CreateSIPParticipantRequest(**req_kwargs)
    )
    logger.info("[AGENT] Outbound SIP participant created: %s -> room %s", phone, ctx.room.name)

    # Wait for the phone leg to fully join before speaking, so the patient
    # hears the greeting from its very first word.
    await ctx.wait_for_participant(identity=req_kwargs["participant_identity"])
    return req_kwargs["participant_identity"]


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    vad = ctx.proc.userdata.get("vad") or silero.VAD.load(min_silence_duration=0.55)
    llm = ctx.proc.userdata.get("llm") or _make_llm()
    stt = ctx.proc.userdata.get("stt") or deepgram.STT(model=config.DEEPGRAM_MODEL, language=config.STT_LANGUAGE)

    call_meta = _parse_metadata(ctx)
    is_outbound_followup = call_meta.get("call_type") == "outbound_doctor_reminder"

    token = call_meta.get("backend_token")
    if not is_outbound_followup:
        # Browser flow: the patient's token arrives via participant metadata.
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

    if is_outbound_followup:
        # The agent dials the phone itself and waits for the answer. Any SIP
        # failure (busy / no answer / rejected) ends the job cleanly — the
        # backend already logged the dispatch attempt.
        try:
            await _dial_patient(ctx, call_meta)
        except Exception as exc:  # noqa: BLE001 - SipCallError or API error
            logger.error("[AGENT] Outbound dial failed: %s", exc)
            ctx.shutdown()
            return

    # For outbound telephony, min_sentence_len=1 provides sub-300ms speech onset
    min_len = 1 if is_outbound_followup else 2
    murf_kwargs: dict = {
        "voice": config.MURF_VOICE,
        "style": config.MURF_STYLE,
        "tokenizer": tokenize.basic.SentenceTokenizer(min_sentence_len=min_len),
        "text_pacing": True,
    }
    if config.MURF_LOCALE:
        murf_kwargs["locale"] = config.MURF_LOCALE
    if config.MURF_MODEL:
        murf_kwargs["model"] = config.MURF_MODEL

    # Turn handling — the "listen, don't talk over" fix:
    # - min_duration 0.8s: a cough/"अच्छा" no longer registers as an interruption,
    #   but real speech does.
    # - min_words 2: STT must see at least 2 words before an interruption counts.
    # - resume_false_interruption=False: when the patient DOES interrupt, the agent
    #   stops and listens instead of resuming its abandoned sentence over them
    #   after ~2s (the old default caused the talk-over-then-silence symptom).
    # - endpointing min_delay 0.3: starts generating the reply as soon as the
    #   patient pauses (lower perceived latency) without cutting them off.
    turn_opts = {
        "turn_detection": _turn_detection if _turn_detection else "vad",
        "endpointing": {"min_delay": 0.3},
        "interruption": {
            "min_duration": 0.8,
            "min_words": 2,
            "resume_false_interruption": False,
            "discard_audio_if_uninterruptible": False,
        },
        "preemptive_generation": {"preemptive_tts": True},
    }

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=murf.TTS(**murf_kwargs),
        vad=vad,
        turn_handling=turn_opts,
    )

    # Telephony noise cancellation filter
    nc_filter = None
    if noise_cancellation:
        if is_outbound_followup and hasattr(noise_cancellation, "BVCTelephony"):
            nc_filter = noise_cancellation.BVCTelephony()
        elif hasattr(noise_cancellation, "BVC"):
            nc_filter = noise_cancellation.BVC()

    room_options = room_io.RoomOptions(
        audio_input=room_io.AudioInputOptions(noise_cancellation=nc_filter)
    )

    if is_outbound_followup:
        agent_instance = DoctorFollowupAssistant(client, call_meta=call_meta)
        await session.start(agent=agent_instance, room=ctx.room, room_options=room_options)

        # Strict Devanagari Hindi initial greeting. The lead-time is computed
        # from the actual follow-up date (the call may fire any day in the
        # window), never hardcoded as "2 दिन बाद".
        patient_name = call_meta.get("patient_name", "")
        doc_name = call_meta.get("doctor_name", "डॉक्टर")
        follow_date = call_meta.get("follow_up_date", "")
        when_txt = _lead_time_text(follow_date)
        greeting_msg = (
            f"नमस्ते {patient_name} जी! मैं Aayogya से सहायक बोल रहा हूँ। "
            f"डॉक्टर {doc_name} के साथ आपका चेकअप {when_txt} तय है। "
            f"क्या आप जा पाएंगे?"
        )
        await session.say(greeting_msg, allow_interruptions=True)
    else:
        profile = await safe(client.get_profile()) or {}
        patient_name = profile.get("name", "")
        preferred_lang = profile.get("language", config.DEFAULT_LANG or "hi")
        first_name = patient_name.split()[0] if patient_name else ""

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
        await session.say(greeting_msg, allow_interruptions=True)


def build_worker_options() -> WorkerOptions:
    """Configure isolated jobs on Windows and keep two warmed workers ready."""
    return WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        # LiveKit 1.8.3 defaults to THREAD on Windows. Explicit processes isolate
        # concurrent calls from the shared GIL and each job receives its own VAD.
        job_executor_type=JobExecutorType.PROCESS,
        num_idle_processes=2,
        # Cold imports and local model initialization need more than the 10s SDK default.
        initialize_process_timeout=90.0,
        # Agent name lives in livekit.toml ([agent] name) — the SDK's preferred
        # location; passing it here too would emit a deprecation warning.
    )


if __name__ == "__main__":
    cli.run_app(build_worker_options())
