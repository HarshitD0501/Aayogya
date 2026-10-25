"""Checks that interaction results never imply complete safety coverage."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

class _Query:
    def __init__(self, rows):
        self.rows = rows

    def outerjoin(self, *_args, **_kwargs):
        return self

    def filter(self, *_conditions):
        return self

    def all(self):
        return self.rows


class _Session:
    def __init__(self, medicines, rules):
        self.medicines = medicines
        self.rules = rules

    def query(self, model):
        return _Query(self.medicines if model.__name__ == "Medicine" else self.rules)


def _medicine(salt, brand):
    return SimpleNamespace(
        patient_id="patient-1",
        status="active",
        salt=salt,
        brand=brand,
        prescriber_name="Dr. Example",
    )


class InteractionCoverageTests(unittest.TestCase):
    def test_no_match_is_explicitly_limited(self):
        from app.interactions import check

        db = _Session(
            [_medicine("Aspirin", "Aspirin 75"), _medicine("Metformin", "Metformin 500")],
            [SimpleNamespace(salt_a="ibuprofen", salt_b="aspirin", severity="major", note="rule", source="source")],
        )

        result = check(db, "patient-1")

        self.assertEqual(result["known_interactions_in_db"], 1)
        self.assertEqual(result["findings"], [])
        self.assertFalse(result["coverage_complete"])
        self.assertIn("1 loaded interaction rules", result["coverage_note"])
        self.assertIn("does not rule out an interaction", result["coverage_note"])

    def test_matching_rule_still_returns_finding(self):
        from app.interactions import check

        db = _Session(
            [_medicine("Aspirin", "Aspirin 75"), _medicine("Ibuprofen", "Ibuprofen 400")],
            [SimpleNamespace(salt_a="ibuprofen", salt_b="aspirin", severity="major", note="review", source="source")],
        )

        result = check(db, "patient-1")

        self.assertEqual(len(result["findings"]), 1)
        self.assertFalse(result["coverage_complete"])


if __name__ == "__main__":
    unittest.main()
