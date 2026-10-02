"""Safety-critical: dosage notation must map to the right slots (design §7.3).
Run: py test_dosage.py
"""
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

    # 4-part folds noon+evening into afternoon
    q = parse_dosage("1-1-1-1")
    assert q.doses["afternoon"] == 2.0, q.doses

    # garbage / empty -> no schedule, no crash (caller flags manual entry)
    assert parse_dosage("").timings == [] and parse_dosage("xyz").timings == []
    print("dosage: all cases pass")


if __name__ == "__main__":
    test()
