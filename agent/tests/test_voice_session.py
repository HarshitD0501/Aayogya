"""Offline checks for the browser and outbound greeting paths."""

import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from voice import (  # noqa: E402
    DoctorFollowupAssistant,
    SahayakAssistant,
    bounded_profile,
    build_worker_options,
    start_browser_session,
    start_followup_session,
)


class RecordingSession:
    def __init__(self):
        self.started = []
        self.spoken = []

    async def start(self, **kwargs):
        self.started.append(kwargs)

    async def say(self, text, **kwargs):
        assert len(self.started) == 1, "speech must follow exactly one session start"
        self.spoken.append((text, kwargs))


class VoiceSessionTests(unittest.TestCase):
    def test_browser_greeting_in_hindi_and_english(self):
        for lang, expected in (("hi", "मैं सहायक हूँ"), ("en", "I’m Sahayak")):
            with self.subTest(lang=lang):
                session = RecordingSession()
                profile = {"name": "Anita Rao", "lang": lang, "plan": "free"}
                asyncio.run(start_browser_session(session, object(), object(), object(), profile))
                self.assertEqual(len(session.started), 1)
                self.assertEqual(len(session.spoken), 1)
                self.assertIsInstance(session.started[0]["agent"], SahayakAssistant)
                self.assertIn(expected, session.spoken[0][0])
                self.assertIn("Anita", session.spoken[0][0])

    def test_outbound_greeting_stays_on_outbound_agent(self):
        session = RecordingSession()
        metadata = {"patient_name": "Anita", "doctor_name": "Mehta", "follow_up_date": ""}
        asyncio.run(start_followup_session(session, object(), object(), object(), metadata))
        self.assertEqual(len(session.started), 1)
        self.assertEqual(len(session.spoken), 1)
        self.assertIsInstance(session.started[0]["agent"], DoctorFollowupAssistant)
        self.assertIn("डॉक्टर Mehta", session.spoken[0][0])

    def test_worker_registers_with_dispatch_name(self):
        from config import AGENT_NAME

        self.assertEqual(build_worker_options().agent_name, AGENT_NAME)

    def test_slow_profile_does_not_hold_greeting(self):
        async def slow_profile():
            await asyncio.sleep(0.1)
            return {"name": "Late"}

        async def scenario():
            task = asyncio.create_task(slow_profile())
            result = await bounded_profile(task, timeout=0.001)
            self.assertEqual(result, {})
            self.assertTrue(task.done())

        asyncio.run(scenario())

    def test_voice_tools_project_concise_records(self):
        import json

        class MockClient:
            async def get_medicines(self, include_prices: bool = False):
                return [
                    {
                        "id": 101,
                        "brand": "Dolo 650",
                        "salt": "Paracetamol",
                        "strength": "650mg",
                        "form": "Tablet",
                        "dosage_notation": "1-0-1",
                        "timing": ["morning", "night"],
                        "status": "active",
                        "prescriber_name": "Dr. Sharma",
                        "prices": {"heavy": "data"},
                    }
                ]

            async def list_reports(self, include_prices: bool = False):
                return [
                    {
                        "id": 1,
                        "prescription_date": "2026-10-20",
                        "follow_up_date": "2026-10-27",
                        "prescriber_name": "Dr. Sharma",
                        "prescriber_specialty": "Cardiology",
                        "medicines": [{"brand": "Dolo 650"}, {"brand": "Azithral"}],
                        "raw_ocr": "huge text string...",
                    }
                ]

        assistant = SahayakAssistant(MockClient(), profile={"name": "Anita"})
        meds_json = asyncio.run(assistant.get_my_medicines(None))
        meds = json.loads(meds_json)
        self.assertEqual(len(meds), 1)
        self.assertEqual(meds[0]["brand"], "Dolo 650")
        self.assertEqual(meds[0]["strength"], "650mg")
        # Ensure redundant fields and heavy prices cascade are stripped from tool prompt
        self.assertNotIn("prices", meds[0])
        self.assertNotIn("raw_ocr", meds[0])

        reports_json = asyncio.run(assistant.get_prescription_history(None))
        reports = json.loads(reports_json)
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0]["prescriber_name"], "Dr. Sharma")
        self.assertEqual(reports[0]["medicines"], ["Dolo 650", "Azithral"])
        self.assertNotIn("raw_ocr", reports[0])
