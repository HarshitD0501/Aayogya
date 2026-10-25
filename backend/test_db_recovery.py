"""Regression tests using real malformed SQLite files, never the local app DB."""
from contextlib import closing
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from recover_sqlite import recover_indexes


class IndexRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "source.db"
        self.output = Path(self.temp.name) / "recovered.db"
        with closing(sqlite3.connect(self.source)) as c:
            c.executescript("CREATE TABLE patients(id INTEGER PRIMARY KEY, google_sub TEXT);"
                            "INSERT INTO patients VALUES(1, 'subject-1');"
                            "CREATE UNIQUE INDEX ix_patients_google_sub ON patients(google_sub);")

    def corrupt(self, name="ix_patients_google_sub"):
        with closing(sqlite3.connect(self.source)) as c:
            pages = c.execute("PRAGMA page_count").fetchone()[0]
            if name == "ix_patients_google_sub":
                sql = c.execute("SELECT sql FROM sqlite_schema WHERE name=?", (name,)).fetchone()[0]
                c.execute("DROP INDEX ix_patients_google_sub")
                c.execute("PRAGMA writable_schema=ON")
                c.execute("INSERT INTO sqlite_schema VALUES('index', ?, 'patients', ?, ?)",
                          (name, pages + 1, sql))
                c.commit()
                return
            c.execute("PRAGMA writable_schema=ON")
            c.execute("UPDATE sqlite_schema SET rootpage=? WHERE name=?", (pages + 1, name))
            c.commit()

    def test_recovers_exact_startup_error_preserves_data_and_unique_index(self):
        self.corrupt()
        original_bytes = self.source.read_bytes()
        with closing(sqlite3.connect(self.source)) as c:
            with self.assertRaisesRegex(sqlite3.DatabaseError, "invalid rootpage"):
                c.execute("PRAGMA integrity_check")
        self.assertEqual(recover_indexes(self.source, self.output), ["ix_patients_google_sub"])
        self.assertEqual(self.source.read_bytes(), original_bytes)
        with closing(sqlite3.connect(self.output)) as c:
            self.assertEqual(c.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
            self.assertEqual(c.execute("SELECT * FROM patients").fetchall(), [(1, "subject-1")])
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("INSERT INTO patients VALUES(2, 'subject-1')")

    def test_refuses_table_corruption(self):
        self.corrupt("patients")
        with self.assertRaisesRegex(ValueError, "only out-of-range"):
            recover_indexes(self.source, self.output)

    def test_refuses_healthy_database(self):
        with self.assertRaisesRegex(ValueError, "only out-of-range"):
            recover_indexes(self.source, self.output)

    def test_never_overwrites_existing_output(self):
        self.output.write_bytes(b"existing backup")
        with self.assertRaises(FileExistsError):
            recover_indexes(self.source, self.output)
        self.assertEqual(self.output.read_bytes(), b"existing backup")

    def test_refuses_in_place_recovery(self):
        with self.assertRaisesRegex(ValueError, "differ"):
            recover_indexes(self.source, self.source)

    def test_missing_source_is_not_created(self):
        missing = self.source.with_name("missing.db")
        with self.assertRaises(sqlite3.OperationalError):
            recover_indexes(missing, self.output)
        self.assertFalse(missing.exists())

    def run_app_code(self, code, database=None):
        env = dict(os.environ, DATABASE_URL="sqlite:///" + (database or self.source).as_posix(),
                   ENVIRONMENT="test", ENABLE_DEMO_ACCOUNTS="false")
        return subprocess.run([sys.executable, "-c", code], env=env,
                              cwd=Path(__file__).parent, capture_output=True, text=True, timeout=60)

    def test_startup_explains_corruption_without_modifying_database(self):
        self.corrupt()
        before = self.source.read_bytes()
        result = self.run_app_code("from app.db import init_db; init_db()")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SQLite database corruption detected", result.stderr)
        self.assertIn("recover_sqlite.py", result.stderr)
        self.assertEqual(self.source.read_bytes(), before)

    def test_fresh_migrations_and_restart_are_idempotent(self):
        fresh = self.source.with_name("fresh.db")
        result = self.run_app_code("from app.db import init_db, engine; "
                                   "init_db(); init_db(); engine.dispose()", fresh)
        self.assertEqual(result.returncode, 0, result.stderr)
        with closing(sqlite3.connect(fresh)) as c:
            self.assertEqual(c.execute("SELECT version_num FROM alembic_version").fetchone(),
                             ("c83a1b4d2e5f",))
            patient_cols = [r[1] for r in c.execute("PRAGMA table_info(patients)")]
            self.assertIn("google_sub", patient_cols)
            self.assertIn("auto_reminders_enabled", patient_cols)
            self.assertEqual(c.execute("PRAGMA integrity_check").fetchall(), [("ok",)])

    def test_recovery_rejects_additional_corruption(self):
        # An orphaned old index page is additional corruption, not a lost final page.
        with closing(sqlite3.connect(self.source)) as c:
            pages = c.execute("PRAGMA page_count").fetchone()[0]
            c.execute("PRAGMA writable_schema=ON")
            c.execute("UPDATE sqlite_schema SET rootpage=? WHERE type='index'", (pages + 1,))
            c.commit()
        with self.assertRaisesRegex(ValueError, "integrity_check"):
            recover_indexes(self.source, self.output)

    def test_recovery_includes_committed_wal_data(self):
        with closing(sqlite3.connect(self.source)) as writer:
            writer.execute("PRAGMA journal_mode=WAL")
            writer.execute("INSERT INTO patients VALUES(2, 'wal-subject')")
            writer.commit()
            self.corrupt()
            self.assertTrue(Path(str(self.source) + "-wal").exists())
            recover_indexes(self.source, self.output)
        with closing(sqlite3.connect(self.output)) as c:
            self.assertEqual(c.execute("SELECT google_sub FROM patients WHERE id=2").fetchone(),
                             ("wal-subject",))

    def test_recovery_refuses_foreign_key_violations(self):
        with closing(sqlite3.connect(self.source)) as c:
            c.executescript("CREATE TABLE reports(patient_id INTEGER REFERENCES patients(id));"
                            "INSERT INTO reports VALUES(999);")
        self.corrupt()
        with self.assertRaisesRegex(ValueError, "foreign key violations"):
            recover_indexes(self.source, self.output)


if __name__ == "__main__":
    unittest.main()
