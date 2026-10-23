"""Security checks for environment-specific session signing keys."""

import unittest
import os
from unittest.mock import patch

from pydantic import ValidationError

from app.config import Settings


class SettingsSecretKeyTests(unittest.TestCase):
    def settings_without_environment_files(self, **values) -> Settings:
        # The caller's shell may provide a key; isolate each case so unset-key
        # behavior is tested without reading .env or inheriting that value.
        with patch.dict(os.environ, {"SECRET_KEY": ""}):
            return Settings(_env_file=None, **values)

    def test_production_rejects_missing_or_short_secret(self):
        for secret in ("", "short", "dev-insecure-change-me", "x" * 31):
            with self.subTest(secret_length=len(secret)):
                with self.assertRaises(ValidationError):
                    self.settings_without_environment_files(
                        environment="production", secret_key=secret
                    )

    def test_production_accepts_stable_64_character_secret(self):
        secret = "a" * 64
        settings = self.settings_without_environment_files(
            environment="production", secret_key=secret
        )
        self.assertTrue(settings.secret_key == secret)

    def test_development_generates_distinct_random_secrets_when_unset(self):
        first = self.settings_without_environment_files(environment="development")
        second = self.settings_without_environment_files(environment="development")
        self.assertGreaterEqual(len(first.secret_key), 32)
        self.assertNotEqual(first.secret_key, second.secret_key)


if __name__ == "__main__":
    unittest.main()
