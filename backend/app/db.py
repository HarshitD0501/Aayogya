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
    command.upgrade(cfg, "head")
