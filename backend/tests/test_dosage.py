"""Safety-critical: dosage notation must map to the right slots (design §7.3).
Run: py test_dosage.py
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.dosage import parse_dosage


def test():
    d = parse_dosage("1-0-1")
    assert d.timings == ["morning", "night"], d.timings
    assert d.per_day == 2.0 and not d.prn

    assert parse_dosage("1-1-1").timings == ["morning", "afternoon", "night"]
    assert parse_dosage("0-1-0").timings == ["afternoon"]

    assert parse_dosage("BD").timings == ["morning", "night"]
    assert parse_dosage("TDS").per_day == 3.0
    assert parse_dosage("OD").timings == ["morning"]
    assert parse_dosage("HS").timings == ["night"]

    # SOS/PRN must NEVER schedule a slot.
    for prn in ("SOS", "PRN", "1 SOS"):
        p = parse_dosage(prn)
        assert p.prn and p.timings == [], (prn, p)

    # half doses
    h = parse_dosage("1/2-0-1/2")
    assert h.doses == {"morning": 0.5, "night": 0.5}, h.doses
    assert parse_dosage("½-0-1").doses["morning"] == 0.5

    # 4-part preserves 4 distinct administrations without folding (ERR-025)
    q = parse_dosage("1-1-1-1")
    assert q.timings == ["morning", "afternoon", "evening", "night"], q.timings
    assert q.doses == {"morning": 1.0, "afternoon": 1.0, "evening": 1.0, "night": 1.0}, q.doses
    assert q.per_day == 4.0, q.per_day

    # QID and Q6H preserve 4 slots
    qid = parse_dosage("QID")
    assert qid.timings == ["morning", "afternoon", "evening", "night"]
    assert qid.per_day == 4.0
    q6h = parse_dosage("Q6H")
    assert q6h.timings == ["morning", "afternoon", "evening", "night"]
    assert q6h.per_day == 4.0

    # garbage / empty -> no schedule, no crash (caller flags manual entry)
    assert parse_dosage("").timings == [] and parse_dosage("xyz").timings == []
    print("dosage: all cases pass")


if __name__ == "__main__":
    test()
