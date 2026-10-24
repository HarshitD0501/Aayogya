"""Rebuild out-of-range SQLite index roots in a separate, validated copy.

Stop all database users first. Never edits or replaces the input database.
Usage: python recover_sqlite.py aayogya.db recovered.db
"""
from __future__ import annotations

import argparse
import sqlite3
from contextlib import closing
from pathlib import Path


def recover_indexes(source: Path, output: Path) -> list[str]:
    source, output = source.resolve(), output.resolve()
    if source == output:
        raise ValueError("Recovery output must differ from the source")
    # Exclusive creation prevents overwriting either a backup or another database.
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
        with output.open("xb"):
            pass
        with closing(sqlite3.connect(output)) as copy:
            # SQLite's backup API includes committed WAL data in a consistent snapshot.
            original.backup(copy)

    with closing(sqlite3.connect(output)) as copy:
        # This bypass is confined to the recovery copy; normal startup never uses it.
        copy.execute("PRAGMA writable_schema=ON")
        pages = copy.execute("PRAGMA page_count").fetchone()[0]
        schema = copy.execute(
            "SELECT type, name, rootpage, sql FROM sqlite_schema"
        ).fetchall()
        invalid = [row for row in schema if row[2] > pages or row[2] < 0]
        if not invalid or any(t != "index" or not sql for t, _, _, sql in invalid):
            raise ValueError("Recovery supports only out-of-range, explicit index roots")
        tables = [name for kind, name, _, _ in schema if kind == "table"]

        def contents(connection):
            return {
                name: connection.execute(
                    'SELECT * FROM "' + name.replace('"', '""') + '" NOT INDEXED'
                ).fetchall()
                for name in tables
            }

        before = contents(copy)
        for _, name, _, _ in invalid:
            copy.execute("DELETE FROM sqlite_schema WHERE type='index' AND name=?", (name,))
        copy.commit()

    # Reopening forces SQLite to parse and validate the edited schema normally.
    with closing(sqlite3.connect(output)) as copy:
        with copy:
            for _, _, _, sql in invalid:
                copy.execute(sql)
        if copy.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("Recovered copy failed integrity_check; do not use it")
        if copy.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Recovered copy has foreign key violations; do not use it")
        if contents(copy) != before:
            raise ValueError("Recovered copy changed table data; do not use it")
    return [name for _, name, _, _ in invalid]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        rebuilt = recover_indexes(args.source, args.output)
    except (OSError, sqlite3.Error, ValueError) as exc:
        parser.exit(1, f"Recovery failed: {exc}. Do not use the output file. Source unchanged.\n")
    print(f"Verified recovery: {args.output}; rebuilt {', '.join(rebuilt)}. Source unchanged.")
