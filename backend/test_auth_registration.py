"""Registration API integration tests with an isolated SQLite database."""
from __future__ import annotations

import os
import tempfile
import unittest
import zlib
from pathlib import Path

os.environ["ENABLE_DEMO_ACCOUNTS"] = "false"
os.environ["GOOGLE_CLIENT_ID"] = "registration-test-client"
os.environ["AGENT_CHAT_URL"] = "http://localhost:8080/chat"
_test_db_dir = tempfile.TemporaryDirectory(prefix="aayogya-registration-")
os.environ["DATABASE_URL"] = f"sqlite:///{(Path(_test_db_dir.name) / 'registration.db').as_posix()}"

from fastapi.testclient import TestClient  # noqa: E402

from app.auth import _verify_token, verify_password  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import CaregiverLink, Patient  # noqa: E402


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
        response = self.register(email="ANYA@example.com", phone="989 012 3456")

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
            self.assertEqual(patient.phone, "+919890123456")
            self.assertNotEqual(patient.password_hash, "correct horse battery")
            self.assertTrue(verify_password("correct horse battery", patient.password_hash))
        finally:
            db.close()

    def test_caregiver_registration_routes_to_caregiver_dashboard(self):
        registered = self.register(role="caregiver")
        self.assertEqual(registered.status_code, 201, registered.text)
        self.assertEqual(registered.json()["patient"]["role"], "caregiver")

        dashboard = self.client.get(
            "/api/caregiver/patients",
            headers={"Authorization": f"Bearer {registered.json()['token']}"},
        )
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertEqual(dashboard.json()["patients"], [])

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

    def test_google_can_register_and_sign_in_as_selected_role(self):
        from unittest.mock import patch

        claims = {
            "sub": "google-sub-123",
            "email": "caregiver@gmail.com",
            "email_verified": True,
            "name": "Google Caregiver",
        }
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims) as verify:
            registered = self.client.post(
                "/api/auth/google",
                json={"credential": "g" * 150, "mode": "register", "role": "caregiver"},
            )

        self.assertEqual(registered.status_code, 200, registered.text)
        self.assertEqual(registered.json()["patient"]["role"], "caregiver")
        verify.assert_called_once()
        self.assertEqual(verify.call_args.kwargs["audience"], "registration-test-client")

        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
            signed_in = self.client.post(
                "/api/auth/google",
                json={"credential": "g" * 150, "mode": "login", "role": "caregiver"},
            )
        self.assertEqual(signed_in.status_code, 200, signed_in.text)
        self.assertEqual(signed_in.json()["patient"]["id"], registered.json()["patient"]["id"])

    def test_google_rejects_unverified_email_and_wrong_selected_role(self):
        from unittest.mock import patch

        claims = {
            "sub": "google-sub-456",
            "email": "patient@gmail.com",
            "email_verified": False,
            "name": "Google Patient",
        }
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
            unverified = self.client.post(
                "/api/auth/google",
                json={"credential": "g" * 150, "mode": "register", "role": "patient"},
            )
        self.assertEqual(unverified.status_code, 401)

        patient = self.register(email="role-check@example.com", phone="9876543210", role="patient")
        wrong_role_login = self.client.post(
            "/api/auth/login",
            json={
                "identifier": "role-check@example.com",
                "password": "correct horse battery",
                "role": "caregiver",
            },
        )
        self.assertEqual(patient.status_code, 201)
        self.assertEqual(wrong_role_login.status_code, 403)

    def test_caregiver_chat_proxy_uses_linked_patient_scope(self):
        from unittest.mock import AsyncMock, patch

        patient = self.register(email="chat-patient@example.com", phone="9876543213")
        caregiver = self.register(
            email="chat-caregiver@example.com", phone="9876543211", role="caregiver"
        )
        self.assertEqual(patient.status_code, 201, patient.text)
        self.assertEqual(caregiver.status_code, 201, caregiver.text)
        patient_id = patient.json()["patient"]["id"]
        caregiver_id = caregiver.json()["patient"]["id"]

        db = SessionLocal()
        try:
            db.add(CaregiverLink(caregiver_id=caregiver_id, patient_id=patient_id, relation="child"))
            db.commit()
        finally:
            db.close()

        upstream = AsyncMock()
        upstream.__aenter__.return_value = upstream
        upstream.__aexit__.return_value = None
        response = type(
            "AgentResponse",
            (),
            {"raise_for_status": lambda self: None, "json": lambda self: {"reply": "ok", "history": []}},
        )()
        upstream.post.return_value = response
        headers = {
            "Authorization": f"Bearer {caregiver.json()['token']}",
            "X-Patient-Id": patient_id,
        }

        with patch("app.main.httpx.AsyncClient", return_value=upstream):
            result = self.client.post(
                "/api/chat",
                headers=headers,
                json={"message": "List my medicines", "history": []},
            )

        self.assertEqual(result.status_code, 200, result.text)
        agent_body = upstream.post.call_args.kwargs["json"]
        self.assertEqual(_verify_token(agent_body["token"]), patient_id)

    def test_chat_health_and_upstream_failure_are_graceful(self):
        import httpx
        from unittest.mock import AsyncMock, patch

        registered = self.register(email="chat-health@example.com", phone="9876543212")
        self.assertEqual(registered.status_code, 201, registered.text)
        headers = {"Authorization": f"Bearer {registered.json()['token']}"}

        health_upstream = AsyncMock()
        health_upstream.__aenter__.return_value = health_upstream
        health_upstream.__aexit__.return_value = None
        health_upstream.get.side_effect = httpx.ConnectError("agent is restarting")
        with patch("app.main.httpx.AsyncClient", return_value=health_upstream):
            health = self.client.get("/api/chat/health", headers=headers)
        self.assertEqual(health.status_code, 200, health.text)
        self.assertEqual(health.json(), {"available": False})
        health_upstream.get.assert_awaited_once_with("http://localhost:8080/health")

        failed_upstream = AsyncMock()
        failed_upstream.__aenter__.return_value = failed_upstream
        failed_upstream.__aexit__.return_value = None
        failed_upstream.post.side_effect = httpx.ConnectError("agent is restarting")
        with patch("app.main.httpx.AsyncClient", return_value=failed_upstream):
            failed = self.client.post(
                "/api/chat", headers=headers, json={"message": "Hello", "history": []}
            )
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(
            failed.json()["detail"],
            "The text assistant is temporarily unavailable. Please try again shortly or use Live Voice.",
        )


if __name__ == "__main__":
    unittest.main()
