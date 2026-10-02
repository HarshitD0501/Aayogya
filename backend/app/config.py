"""Central config (pydantic-settings) — single source for env-driven values.

Reads .env + process env. Field names map case-insensitively to env vars
(gemini_api_key <- GEMINI_API_KEY). Import `settings` everywhere instead of
scattering os.getenv calls.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # SQLite by default (zero setup). Postgres for scale:
    #   postgresql+psycopg://aayogya:aayogya@localhost:5432/aayogya
    database_url: str = "sqlite:///./aayogya.db"

    # Extraction VLM chain (OpenAI-compatible vision /chat/completions), tried in
    # order; first success wins, then Gemini, then MOCK. Free/unmetered first, the
    # per-token HF router last (its tiny free credit is the "runs out immediately" trap).
    #
    # 1) Ollama — self-hosted Qwen2.5-VL-7B, unmetered/free (`ollama pull qwen2.5vl:7b`).
    #    Blank url => skipped; if url is set but Ollama isn't running the call fails
    #    fast (connect timeout) and the chain falls through.
    ollama_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen2.5vl:7b"
    # 2) Groq — genuinely free, RATE-limited not per-token (30 rpm / 200K tok-day).
    #    qwen3.8-27b is Groq's vision model (the old llama-4-scout id now 404s).
    #    Blank key => skipped. List a key's models: GET /openai/v1/models.
    groq_api_key: str = ""
    groq_model: str = "qwen/qwen3.8-27b"
    # 3) HF Inference Providers router — per-token metered (the trap); last VLM resort
    #    only if a token is set. 7B is unserved here; 72B works.
    hf_token: str = ""
    hf_model: str = "Qwen/Qwen2.5-VL-72B-Instruct"

    # Blank => Gemini path off. gemini-flash-latest alias avoids model-deprecation 404s.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"

    # Signs session tokens. MUST be a long random value in prod (else forgeable).
    secret_key: str = "dev-insecure-change-me"

    # Text chatbot ("the brain") runs as the separate agent service (its own venv,
    # google-genai + livekit deps). The backend proxies /api/chat to it so the
    # dashboard talks to one origin (no CORS) and auth is enforced here first.
    agent_chat_url: str = "http://localhost:8081/chat"

    # LiveKit voice: the backend mints a room-join token for the patient's browser
    # (key+secret sign it locally, no server call). Same project the voice.py worker
    # uses. Blank => /api/voice/token returns 501 (voice disabled). URL is handed to
    # the browser to connect; must be a real wss://<project>.livekit.cloud.
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # Postgres connection pool (ignored for sqlite).
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 1800  # seconds; recycle before Postgres idle timeout

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgres")

    def pg_conninfo(self) -> str:
        """SQLAlchemy URL (postgresql+psycopg://...) -> psycopg conninfo for the
        LangGraph checkpointer (drops the +psycopg driver tag)."""
        return self.database_url.replace("postgresql+psycopg://", "postgresql://", 1)


settings = Settings()
