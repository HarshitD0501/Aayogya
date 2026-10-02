"""Alembic env. URL + metadata come from the app so config lives in one place.

Only manages the app's own tables — LangGraph's checkpoint tables (created by
PostgresSaver.setup) are left alone via include_object. render_as_batch makes
ALTERs work on sqlite too; compare_type catches column-type changes.
"""
from alembic import context

from app.db import Base, engine
import app.models  # noqa: F401 — register tables on Base

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    # Ignore anything not defined by our models (e.g. langgraph checkpoints).
    if type_ == "table":
        return name in target_metadata.tables
    return True


_opts = dict(
    target_metadata=target_metadata,
    include_object=include_object,
    render_as_batch=True,
    compare_type=True,
)


def run_migrations_offline() -> None:
    context.configure(url=str(engine.url), literal_binds=True, **_opts)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(connection=connection, **_opts)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
