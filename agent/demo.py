"""Local demo server for hand-testing the agent — NOT for production (no auth, no
CORS restriction; keep it on localhost). Serves a one-page UI that:
  (1) chats with the shared brain by delegating to chat.py's /chat, and
  (2) mints a LiveKit token so a browser mic can talk to the voice agent.

    uvicorn demo:app --port 8080      # then open http://localhost:8080

Chat needs the backend (System A) running + GOOGLE_API_KEY. Voice additionally needs
LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET set and a voice worker running
(`python voice.py dev`); that worker auto-joins the room and logs in with demo creds
(AAROGYA_DEMO_*), so leave the token box blank to test as the demo patient.
"""
from __future__ import annotations

import os
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

app = FastAPI(title="Aarogya — demo UI")
_HERE = os.path.dirname(os.path.abspath(__file__))


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(os.path.join(_HERE, "demo.html"))


@app.post("/chat")
async def chat_proxy(req: Request):
    # Deferred import so the server still starts (for voice-only testing) even if the
    # chat brain's key isn't configured yet. Reuses the ONE brain — no duplication.
    from chat import ChatIn, chat as _chat

    return await _chat(ChatIn(**await req.json()))


@app.get("/token")
async def token(room: str = "aarogya-demo"):
    """Mint a LiveKit join token for the browser. The voice.py worker auto-joins the
    same room and authenticates to the backend itself (demo creds)."""
    url = os.getenv("LIVEKIT_URL", "")
    key, secret = os.getenv("LIVEKIT_API_KEY", ""), os.getenv("LIVEKIT_API_SECRET", "")
    if not (url and key and secret):
        raise HTTPException(501, "Set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET to test voice.")
    try:
        from livekit import api  # bundled with livekit-agents
    except Exception:  # noqa: BLE001
        raise HTTPException(501, "livekit-api not installed (comes with livekit-agents).")
    jwt = (
        api.AccessToken(key, secret)
        .with_identity(f"demo-{uuid.uuid4().hex[:8]}")
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )
    return {"url": url, "token": jwt, "room": room}
