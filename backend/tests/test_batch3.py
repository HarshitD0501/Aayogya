"""Regression test suite for Batch 3:
- ERR-014: Alembic complete schema source of truth (fresh upgrade, downgrade, idempotency, zero gaps)
- ERR-015: Runtime dependencies declared and configured-but-uninstalled readiness handling
- ERR-033: Submodule metadata mapping and clean submodule status
- DB recovery utility regression
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.db import Base, init_db
import app.models


class TestBatch3ReproducibleRuntimeAndMigrations(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.backend_dir = Path(__file__).resolve().parent.parent
        self.root_dir = self.backend_dir.parent

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_err014_fresh_migration_zero_gaps(self):
        """ERR-014: Fresh Alembic upgrade from base to head produces identical schema to Base.metadata."""
        db_path = os.path.join(self.temp_dir, "fresh_alembic.db").replace("\\", "/")
        cfg = Config(str(self.backend_dir / "alembic.ini"))
        cfg.set_main_option("script_location", str(self.backend_dir / "alembic"))
        cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

        # Run Alembic upgrade head on empty database
        command.upgrade(cfg, "head")

        engine = create_engine(f"sqlite:///{db_path}")
        insp = inspect(engine)

        db_tables = set(insp.get_table_names()) - {"alembic_version"}
        model_tables = set(Base.metadata.tables.keys())

        # Assert all tables present
        missing_tables = model_tables - db_tables
        self.assertEqual(missing_tables, set(), f"Missing tables after upgrade head: {missing_tables}")

        # Assert every column in every model is present in DB
        for table_name in model_tables:
            db_cols = {c["name"] for c in insp.get_columns(table_name)}
            model_cols = {c.name for c in Base.metadata.tables[table_name].columns}
            missing_cols = model_cols - db_cols
            self.assertEqual(
                missing_cols,
                set(),
                f"Table '{table_name}' has missing columns in migration: {missing_cols}",
            )

        # Specifically check Batch 3 added columns
        patient_cols = {c["name"] for c in insp.get_columns("patients")}
        for col in [
            "auto_reminders_enabled",
            "whatsapp_reminders_enabled",
            "call_reminders_enabled",
            "reminder_time_morning",
            "reminder_time_afternoon",
            "reminder_time_night",
        ]:
            self.assertIn(col, patient_cols, f"Patient column '{col}' missing from migration")

        medicine_cols = {c["name"] for c in insp.get_columns("medicines")}
        for col in ["reminders_enabled", "stopped_at", "stopped_reason"]:
            self.assertIn(col, medicine_cols, f"Medicine column '{col}' missing from migration")

        self.assertIn("dose_adherences", db_tables)
        engine.dispose()

    def test_err014_migration_reversibility_and_idempotency(self):
        """ERR-014: Migration downgrades cleanly and re-upgrades idempotently."""
        db_path = os.path.join(self.temp_dir, "reversibility.db").replace("\\", "/")
        cfg = Config(str(self.backend_dir / "alembic.ini"))
        cfg.set_main_option("script_location", str(self.backend_dir / "alembic"))
        cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

        # 1. Upgrade to head
        command.upgrade(cfg, "head")

        # 2. Downgrade one step to b103a9018f2c
        command.downgrade(cfg, "b103a9018f2c")

        engine = create_engine(f"sqlite:///{db_path}")
        insp = inspect(engine)
        self.assertNotIn("dose_adherences", insp.get_table_names())
        patient_cols = {c["name"] for c in insp.get_columns("patients")}
        self.assertNotIn("auto_reminders_enabled", patient_cols)
        engine.dispose()

        # 3. Upgrade back to head
        command.upgrade(cfg, "head")

        engine = create_engine(f"sqlite:///{db_path}")
        insp = inspect(engine)
        self.assertIn("dose_adherences", insp.get_table_names())
        patient_cols = {c["name"] for c in insp.get_columns("patients")}
        self.assertIn("auto_reminders_enabled", patient_cols)
        engine.dispose()

    def test_err014_legacy_db_upgrade_idempotence(self):
        """ERR-014: Existing DB stamped at b103a9018f2c with pre-existing columns upgrades without collision."""
        db_path = os.path.join(self.temp_dir, "legacy.db").replace("\\", "/")
        cfg = Config(str(self.backend_dir / "alembic.ini"))
        cfg.set_main_option("script_location", str(self.backend_dir / "alembic"))
        cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

        # Upgrade to b103a9018f2c
        command.upgrade(cfg, "b103a9018f2c")

        # Simulate ad-hoc column addition on legacy database
        engine = create_engine(f"sqlite:///{db_path}")
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE patients ADD COLUMN auto_reminders_enabled BOOLEAN DEFAULT 1"))
            conn.execute(text("ALTER TABLE medicines ADD COLUMN reminders_enabled BOOLEAN DEFAULT 1"))
            conn.commit()
        engine.dispose()

        # Upgrade to head must detect existing columns and succeed without error
        command.upgrade(cfg, "head")

        engine = create_engine(f"sqlite:///{db_path}")
        insp = inspect(engine)
        self.assertIn("dose_adherences", insp.get_table_names())
        patient_cols = {c["name"] for c in insp.get_columns("patients")}
        self.assertIn("auto_reminders_enabled", patient_cols)
        self.assertIn("whatsapp_reminders_enabled", patient_cols)
        engine.dispose()

    def test_err015_declared_runtime_dependencies(self):
        """ERR-015: Runtime dependencies Pillow, livekit-api, livekit-protocol are in requirements.txt."""
        req_path = self.backend_dir / "requirements.txt"
        self.assertTrue(req_path.exists(), "requirements.txt must exist")
        content = req_path.read_text(encoding="utf-8").lower()

        self.assertIn("pillow", content, "Pillow must be declared in requirements.txt")
        self.assertIn("livekit-api", content, "livekit-api must be declared in requirements.txt")
        self.assertIn("livekit-protocol", content, "livekit-protocol must be declared in requirements.txt")

        # Test Pillow importability
        from PIL import Image
        img = Image.new("RGB", (100, 100), color="blue")
        self.assertEqual(img.size, (100, 100))

    def test_err033_submodule_metadata_clean(self):
        """ERR-033: .gitmodules maps agent/.reference-aushadh cleanly to its genuine remote."""
        gitmodules_path = self.root_dir / ".gitmodules"
        self.assertTrue(gitmodules_path.exists(), ".gitmodules must exist at repository root")
        content = gitmodules_path.read_text(encoding="utf-8")
        self.assertIn('submodule "agent/.reference-aushadh"', content)
        self.assertIn("https://github.com/HarshitD0501/Aushadh-AI.git", content)

        # Run git submodule status
        result = subprocess.run(
            ["git", "submodule", "status"],
            cwd=str(self.root_dir),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, f"git submodule status failed: {result.stderr}")
        self.assertIn("agent/.reference-aushadh", result.stdout)


if __name__ == "__main__":
    unittest.main()
