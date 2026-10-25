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
        settings.database_url,
        connect_args={"check_same_thread": False, "timeout": 30},
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
    except Exception as exc:
        from sqlalchemy.exc import DatabaseError

        if engine.dialect.name == "sqlite" and isinstance(exc, DatabaseError) and (
            "malformed" in str(exc.orig).lower()
            or "disk image" in str(exc.orig).lower()
        ):
            raise RuntimeError(
                "SQLite database corruption detected; startup aborted without resetting data. "
                "Stop all backend processes and preserve the database and any -wal/-shm files. "
                "For an invalid index rootpage, run: python recover_sqlite.py "
                "<database.db> <recovered.db>. Verify the recovered copy before replacing "
                "the original. Other corruption requires restoring a backup or SQLite recovery."
            ) from exc
        raise RuntimeError(
            "Database migrations failed; startup aborted. "
            "Resolve the Alembic error and retry."
        ) from exc
    # Ensure WAL journal mode for SQLite single-worker reliability
    if not settings.is_postgres:
        with engine.connect() as conn:
            from sqlalchemy import text
            try:
                conn.execute(text("PRAGMA journal_mode=WAL"))
                conn.commit()
            except Exception:
                pass
