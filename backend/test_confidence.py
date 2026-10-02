"""The confidence % is what the user trusts ("high => read correctly"), so the
composite must rank a clean read above a garbled one and route weak reads to
human confirmation. Run: py test_confidence.py
"""
from app import confidence as c


def test():
    # Clean read: model sure, salt known, dosage parsed, strength present -> high.
    clean = c.score(model_conf=0.9, catalog_hit=True, dosage_scheduled=True,
                    has_notation=True, has_strength=True)
    assert clean >= 0.9, clean

    # Garbage read: model unsure, no salt, no dosage, no strength -> low, needs review.
    bad = c.score(model_conf=0.4, catalog_hit=False, dosage_scheduled=False,
                  has_notation=False, has_strength=False)
    assert bad < c.LOW_CONFIDENCE, bad
    assert c.needs_review(bad, catalog_miss=True)

    # Catalog miss always routes to review even if the rest looks clean (can't trust
    # a brand we couldn't resolve to a real salt).
    miss = c.score(model_conf=0.9, catalog_hit=False, dosage_scheduled=True,
                   has_notation=True, has_strength=True)
    assert c.needs_review(miss, catalog_miss=True)

    # A clean read is NOT flagged for review.
    assert not c.needs_review(clean, catalog_miss=False)

    # Ordering: grounded signals outweigh the model's own (over)confidence.
    grounded = c.score(model_conf=0.3, catalog_hit=True, dosage_scheduled=True,
                       has_notation=True, has_strength=True)
    overconfident_miss = c.score(model_conf=1.0, catalog_hit=False, dosage_scheduled=False,
                                 has_notation=False, has_strength=False)
    assert grounded > overconfident_miss, (grounded, overconfident_miss)

    # None model_conf must not crash and clamps to 0.
    assert 0.0 <= c.score(model_conf=None, catalog_hit=True, dosage_scheduled=True,
                          has_notation=True, has_strength=True) <= 1.0
    print("confidence: all cases pass")


if __name__ == "__main__":
    test()
