"""Central config (pydantic-settings) — single source for env-driven values.

Reads .env + process env. Field names map case-insensitively to env vars
(gemini_api_key <- GEMINI_API_KEY). Import `settings` everywhere instead of
scattering os.getenv calls.
"""
from __future__ import annotations

import secrets

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    environment: str = "development"
    enable_demo_accounts: bool = False

    # SQLite by default (zero setup). Postgres for scale:
    #   postgresql+psycopg://aayogya:aayogya@localhost:5432/aayogya
    database_url: str = "sqlite:///./aayogya.db"

    # Extraction VLM chain (OpenAI-compatible vision /chat/completions), tried in
    # order; first success wins, then Gemini. The canned result is development-only
    # and requires an explicit opt-in. Free/unmetered first, the
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
    enable_mock_extraction: bool = False

    # Signs session tokens. A per-process random key is used only for local
    # development; production must provide a stable, randomly generated secret.
    secret_key: str = ""
    google_client_id: str = ""

    # Text chatbot ("the brain") runs as the separate agent service (its own venv,
    # google-genai + livekit deps). The backend proxies /api/chat to it so the
    # dashboard talks to one origin (no CORS) and auth is enforced here first.
    agent_chat_url: str = "http://localhost:8080/chat"

    # LiveKit voice: the backend mints a room-join token for the patient's browser
    # (key+secret sign it locally, no server call). Same project the voice.py worker
    # uses. Blank => /api/voice/token returns 501 (voice disabled). URL is handed to
    # the browser to connect; must be a real wss://<project>.livekit.cloud.
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # WhatsApp Meta Cloud API (1000 free service conversations/mo from Meta).
    # Blank token or phone_number_id => operates in safe development/simulation mode.
    whatsapp_api_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = "aayogya_whatsapp_verify_token"
    whatsapp_app_secret: str = ""

    # Twilio Voice & Telephony
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_sip_domain: str = ""  # e.g., aayogya.pstn.twilio.com
    twilio_sip_username: str = ""
    twilio_sip_password: str = ""
    twilio_enable_amd: bool = True  # Answering Machine Detection (AMD)
    twilio_status_callback_url: str = ""  # Public webhook URL for status callbacks
    livekit_sip_trunk_id: str = ""  # LiveKit Outbound SIP Trunk ID (if using LiveKit SIP)
    # Agent name under which the voice worker (agent/voice.py) registers with
    # LiveKit Cloud. Outbound dispatches target THIS name so the right worker
    # gets the job. Must match agent_name in WorkerOptions (voice.py).
    livekit_agent_name: str = "aayogya-telephony"

    # Outbound Safety, Kill Switch & Allowlist (Batch 4: ERR-002, ERR-019)
    outbound_dispatch_enabled: bool = True
    outbound_phone_allowlist: str = ""  # Comma-separated E.164 numbers; blank => all allowed

    # Postgres connection pool (ignored for sqlite).
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 1800  # seconds; recycle before Postgres idle timeout

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        self.environment = self.environment.strip().lower()
        if self.environment not in {"development", "test", "production"}:
            raise ValueError("ENVIRONMENT must be development, test, or production")

        self.secret_key = self.secret_key.strip()
        if self.environment == "production":
            if len(self.secret_key) < 32:
                raise ValueError("Production requires SECRET_KEY with at least 32 characters")
            if self.enable_demo_accounts:
                raise ValueError("ENABLE_DEMO_ACCOUNTS cannot be enabled in production")
            if self.enable_mock_extraction:
                raise ValueError("ENABLE_MOCK_EXTRACTION cannot be enabled in production")
            if self.whatsapp_api_token and not self.whatsapp_app_secret:
                raise ValueError("Production with active WhatsApp integration requires WHATSAPP_APP_SECRET")
        elif not self.secret_key:
            # Keep local setup usable without shipping a forgeable shared key.
            # Tokens expire on restart, which is acceptable for a dev-only key.
            self.secret_key = secrets.token_urlsafe(48)
        return self

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgres")

    def pg_conninfo(self) -> str:
        """SQLAlchemy URL (postgresql+psycopg://...) -> psycopg conninfo for the
        LangGraph checkpointer (drops the +psycopg driver tag)."""
        return self.database_url.replace("postgresql+psycopg://", "postgresql://", 1)


settings = Settings()
