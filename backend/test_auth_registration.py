"""Registration API integration tests with an isolated SQLite database."""
from __future__ import annotations

import os
import tempfile
import unittest
import zlib
from pathlib import Path

os.environ["ENABLE_DEMO_ACCOUNTS"] = "false"
_test_db_dir = tempfile.TemporaryDirectory(prefix="aayogya-registration-")
os.environ["DATABASE_URL"] = f"sqlite:///{(Path(_test_db_dir.name) / 'registration.db').as_posix()}"

from fastapi.testclient import TestClient  # noqa: E402

from app.auth import verify_password  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Patient  # noqa: E402


class RegistrationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        engine.dispose()
        _test_db_dir.cleanup()

    def setUp(self):
        phone_suffix = str(zlib.crc32(self._testMethodName.encode()) % 1_000_000_000).zfill(9)
        self.email = f"{self._testMethodName}@example.com"
        self.phone = f"9{phone_suffix}"

    def register(self, **overrides):
        payload = {
            "name": "  Anya   Sharma ",
            "email": self.email,
            "phone": self.phone,
            "password": "correct horse battery",
        }
        payload.update(overrides)
        return self.client.post("/api/auth/register", json=payload)

    def test_register_creates_patient_and_signs_in(self):
        response = self.register(
            email="ANYA@example.com", phone="987 654 3210", role="caregiver"
        )

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["patient"]["name"], "Anya Sharma")
        self.assertEqual(body["patient"]["role"], "patient")
        self.assertTrue(body["token"])

        profile = self.client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
        )
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()["id"], body["patient"]["id"])

        db = SessionLocal()
        try:
            patient = db.get(Patient, body["patient"]["id"])
            self.assertEqual(patient.email, "anya@example.com")
            self.assertEqual(patient.phone, "+919876543210")
            self.assertNotEqual(patient.password_hash, "correct horse battery")
            self.assertTrue(verify_password("correct horse battery", patient.password_hash))
        finally:
            db.close()

    def test_registered_account_can_log_in_using_normalized_phone(self):
        registered = self.register(email="phone-login@example.com", phone="9987654321")
        self.assertEqual(registered.status_code, 201, registered.text)

        login = self.client.post(
            "/api/auth/login",
            json={"identifier": "998-765-4321", "password": "correct horse battery"},
        )
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["patient"]["id"], registered.json()["patient"]["id"])

    def test_email_and_phone_must_be_unique(self):
        self.assertEqual(self.register().status_code, 201)
        duplicate_email = self.register(email=self.email.upper(), phone="9123456789")
        duplicate_phone = self.register(email="different@example.com", phone=self.phone)

        self.assertEqual(duplicate_email.status_code, 409)
        self.assertEqual(duplicate_phone.status_code, 409)

    def test_invalid_registration_data_is_rejected(self):
        invalid_phone = self.register(phone="12345")
        short_password = self.register(email="short@example.com", phone="9123456789", password="short")
        invalid_email = self.register(email="not-an-email", phone="9123456789")

        self.assertEqual(invalid_phone.status_code, 422)
        self.assertEqual(short_password.status_code, 422)
        self.assertEqual(invalid_email.status_code, 422)


if __name__ == "__main__":
    unittest.main()
