"""Shared tool logic. The agent's ONLY way to touch patient data is the backend
API (design §4 — one source of truth; §11 — per-patient isolation enforced there).

Each voice session / chat request gets its own BackendClient bound to that one
patient's bearer token, so a patient's tools can never read another's records.
"""
from __future__ import annotations

import logging

import httpx

import config

logger = logging.getLogger("aarogya.agent")


class BackendClient:
    """Per-patient HTTP client for the Aarogya backend. Holds one patient's token."""

    def __init__(self, token: str, *, http: httpx.AsyncClient | None = None) -> None:
        self._token = token
        # `http` is injectable for tests (httpx.MockTransport); prod builds its own.
        self._http = http or httpx.AsyncClient(base_url=config.BACKEND_URL, timeout=10.0)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _get(self, path: str):
        # Auth header set here (not on the client) so the token→patient binding —
        # the isolation boundary — holds on every request and stays testable.
        r = await self._http.get(path, headers={"Authorization": f"Bearer {self._token}"})
        r.raise_for_status()
        return r.json()

    # --- tools: each maps to exactly one existing backend endpoint ---
    async def get_profile(self) -> dict:
        """Patient's name, subscription plan (free/pro), and preferred language."""
        return await self._get("/api/auth/me")

    async def get_medicines(self) -> list[dict]:
        """Active medicines with dosage timing, duration, and indicative prices."""
        return await self._get("/api/medicines")

    async def check_interactions(self) -> dict:
        """Cross-doctor drug-interaction check across ALL active medicines."""
        return await self._get("/api/interactions")

    async def list_reports(self) -> list[dict]:
        """Prescription/report history, newest first."""
        return await self._get("/api/reports")


async def safe(coro):
    """Run a tool call; on any failure return a friendly error dict instead of
    crashing the conversation (graceful degradation, design §12)."""
    try:
        return await coro
    except Exception as e:  # noqa: BLE001 - degrade, don't crash a live call
        logger.warning("backend tool failed: %s", e)
        return {"error": "I couldn't reach your records just now. Please try again in a moment."}


async def login_demo() -> str | None:
    """Standalone mode: obtain a token from demo creds so the agent runs with no
    frontend. Returns None if demo creds aren't configured."""
    if not (config.DEMO_IDENTIFIER and config.DEMO_PASSWORD):
        return None
    async with httpx.AsyncClient(base_url=config.BACKEND_URL, timeout=10.0) as c:
        r = await c.post(
            "/api/auth/login",
            json={"identifier": config.DEMO_IDENTIFIER, "password": config.DEMO_PASSWORD},
        )
        r.raise_for_status()
        return r.json()["token"]
