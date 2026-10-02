"""DB engine. SQLite by default (zero setup); Postgres with a real connection
pool for scale — swap via DATABASE_URL. Pool tuning lives in config.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

if settings.is_postgres:
    engine = create_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle,
        pool_pre_ping=True,  # drop dead connections instead of erroring mid-request
    )
else:
    # check_same_thread only matters for SQLite + FastAPI's threadpool.
    engine = create_engine(
        settings.database_url, connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Apply Alembic migrations — the schema source of truth (handles fresh
    create AND ALTERs on an existing DB).

    ponytail: auto-upgrade at startup is fine single-worker; for multi-worker
    deploys run `alembic upgrade head` once in the entrypoint instead of here.
    """
    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parent.parent  # backend/ (holds alembic.ini)
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))  # cwd-independent
    try:
        command.upgrade(cfg, "head")
    except Exception:
        pass
    Base.metadata.create_all(bind=engine)

    # Safe column auto-addition for SQLite dev environment
    if not settings.is_postgres:
        with engine.connect() as conn:
            from sqlalchemy import text
            col_specs = [
                ("patients", "auto_reminders_enabled", "BOOLEAN DEFAULT 1"),
                ("patients", "whatsapp_reminders_enabled", "BOOLEAN DEFAULT 1"),
                ("patients", "call_reminders_enabled", "BOOLEAN DEFAULT 0"),
                ("patients", "reminder_time_morning", "VARCHAR DEFAULT '08:00 AM'"),
                ("patients", "reminder_time_afternoon", "VARCHAR DEFAULT '01:00 PM'"),
                ("patients", "reminder_time_night", "VARCHAR DEFAULT '08:00 PM'"),
                ("medicines", "reminders_enabled", "BOOLEAN DEFAULT 1"),
                ("medicines", "stopped_at", "DATETIME"),
                ("medicines", "stopped_reason", "VARCHAR"),
            ]
            for table, col, col_type in col_specs:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                    conn.commit()
                except Exception:
                    pass  # column already exists
