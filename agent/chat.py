"""System B — the text chatbot, sharing the SAME brain (prompt) and the SAME tools
(BackendClient) as the voice agent. Different frontend, one brain (design §4).

    uvicorn chat:app --port 8080

POST /chat  {token?, message, history?}  ->  {reply, history}
GET /health  ->  {status: "ok"} (liveness only; does not call Gemini)
- `token` is the patient's backend bearer token (from app login). If omitted, the
  server falls back to demo creds when configured. The token IS the auth: every tool
  call is made as that patient against the backend, which enforces per-patient
  isolation (design §11). Put this endpoint behind the same origin as your app.

Tool calling uses google-genai automatic function calling: Gemini decides when to
call get_my_medicines / check_drug_interactions / etc., the SDK runs them and feeds
results back, and we return the final spoken-style text.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

import config
import prompt
from backend_client import BackendClient, login_demo, safe

logger = logging.getLogger("aayogya.agent")

app = FastAPI(title="Sahayak — Aayogya text chatbot")
_genai = genai.Client(api_key=config.GOOGLE_API_KEY)


@app.get("/health")
async def health():
    """Liveness probe for the agent process; does not call the model provider."""
    return {"status": "ok"}

# Codes worth OUR extra retry: transient 5xx overload only. We deliberately do NOT
# retry 429 here — the SDK already retries rate-limits internally honoring the
# server's `retryDelay` (often ~24s), so re-retrying a daily-quota 429 just stacks
# 24s sleeps and blows past the client timeout. On 429 we degrade immediately.
_RETRY_CODES = {500, 502, 503, 504}


class ChatIn(BaseModel):
    message: str
    token: str | None = None
    history: list[dict] = []  # [{"role": "user"|"model", "text": "..."}]


def _make_tools(client: BackendClient) -> list:
    """Bind the shared tools to this request's patient (closures capture the client)."""

    async def get_my_profile() -> dict:
        """Get the patient's name, subscription plan (free/pro) and preferred language."""
        raw = await safe(client.get_profile())
        if not raw or not isinstance(raw, dict) or "error" in raw:
            return raw or {}
        lang = raw.get("lang") or raw.get("language") or config.DEFAULT_LANG or "hi"
        plan = raw.get("plan") or raw.get("subscription_plan") or "free"
        return {
            "name": raw.get("name", ""),
            "lang": lang,
            "language": lang,
            "plan": plan,
            "subscription_plan": plan,
            "role": raw.get("role", "patient"),
        }

    async def get_my_medicines() -> list | dict:
        """List the patient's current active medicines with how and when to take them."""
        raw = await safe(client.get_medicines(include_prices=False))
        if not raw or isinstance(raw, dict):
            return raw or []
        return [
            {
                "brand": m.get("brand"),
                "salt": m.get("salt"),
                "strength": m.get("strength"),
                "form": m.get("form"),
                "dosage_notation": m.get("dosage_notation"),
                "timing": m.get("timing"),
                "status": m.get("status"),
                "prescriber": m.get("prescriber_name"),
            }
            for m in raw
            if isinstance(m, dict)
        ]

    async def check_drug_interactions() -> dict:
        """Check for dangerous interactions across ALL the patient's active medicines."""
        return await safe(client.check_interactions())

    async def get_prescription_history() -> list | dict:
        """List the patient's past prescriptions and reports, newest first."""
        raw = await safe(client.list_reports(include_prices=False))
        if not raw or isinstance(raw, dict):
            return raw or []
        return [
            {
                "id": r.get("id"),
                "prescription_date": r.get("prescription_date"),
                "follow_up_date": r.get("follow_up_date"),
                "prescriber_name": r.get("prescriber_name"),
                "prescriber_specialty": r.get("prescriber_specialty"),
                "medicines": [m.get("brand") for m in r.get("medicines", []) if isinstance(m, dict) and m.get("brand")],
            }
            for r in raw[:5]
        ]

    return [get_my_profile, get_my_medicines, check_drug_interactions, get_prescription_history]


def _to_history(history: list[dict]) -> list[types.Content]:
    """Prior turns as genai Contents, bounded to the most recent 10 turns.
    The new user message is sent via chat.send_message."""
    bounded = history[-10:] if history else []
    return [
        types.Content(role=h.get("role", "user"), parts=[types.Part(text=h.get("text", ""))])
        for h in bounded
        if h.get("text")
    ]


async def _with_retry(call, *, tries: int = 2, base_delay: float = 1.0):
    """Retry an async Gemini call through transient overload/quota (503/5xx),
    bounded to 2 attempts to protect latency budgets. Permanent errors re-raise at once."""
    for attempt in range(tries):
        try:
            return await call()
        except errors.APIError as e:
            if e.code not in _RETRY_CODES or attempt == tries - 1:
                raise
            await asyncio.sleep(base_delay * (attempt + 1))


@app.post("/chat")
async def chat(body: ChatIn):
    token = body.token or await login_demo()
    if not token:
        raise HTTPException(401, "Missing patient token.")
    client = BackendClient(token)
    try:
        # AFC belongs on the chat API, not models.generate_content (SDK guidance).
        # Build a fresh chat session per retry attempt so a mid-turn failure never
        # leaves half a tool-call turn behind; our tools are read-only GETs, so
        # re-running them on retry is safe/idempotent.
        async def _ask():
            chat = _genai.aio.chats.create(
                model=config.GEMINI_MODEL,
                config=types.GenerateContentConfig(
                    system_instruction=prompt.SYSTEM_PROMPT,
                    tools=_make_tools(client),
                ),
                history=_to_history(body.history),
            )
            return await chat.send_message(body.message)

        resp = await _with_retry(_ask)
        reply = resp.text or "Sorry, I couldn't answer that. Please try again."
    except errors.APIError as e:  # overloaded/quota after retries -> degrade, don't 500 (§12)
        logger.warning("gemini call failed after retries: %s %s", e.code, e.status)
        reply = (
            "The assistant has reached today's usage limit. Please try again later."
            if e.code == 429
            else "The assistant is very busy right now. Please try again in a moment."
        )
    except Exception:  # noqa: BLE001 - a chat endpoint must never 500 the caller (§12)
        logger.exception("unexpected agent failure")
        reply = "Sorry, something went wrong on my end. Please try again in a moment."
    finally:
        await client.aclose()

    history = body.history + [
        {"role": "user", "text": body.message},
        {"role": "model", "text": reply},
    ]
    return {"reply": reply, "history": history}


if __name__ == "__main__":  # self-check: retry transient, re-raise permanent (no network)
    _calls = {"n": 0}

    async def _flaky():  # 503 twice, then succeeds
        _calls["n"] += 1
        if _calls["n"] < 3:
            raise errors.ServerError(503, {"error": {"message": "busy"}})
        return "ok"

    async def _fatal():  # 404 must NOT be retried
        raise errors.ClientError(404, {"error": {"message": "bad model"}})

    async def _selfcheck():
        assert await _with_retry(_flaky, base_delay=0) == "ok" and _calls["n"] == 3
        try:
            await _with_retry(_fatal, base_delay=0)
            raise AssertionError("404 should re-raise, not retry")
        except errors.ClientError as e:
            assert e.code == 404
        print("chat self-check OK")

    asyncio.run(_selfcheck())
