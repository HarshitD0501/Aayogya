"""Cross-doctor interaction check (design §7.4 — the moat).

Runs on the SALTS of ACTIVE meds across ALL of a patient's reports (not just the
latest), so a new prescription from one doctor is checked against every other
doctor's meds. Output cites a source and is framed as "checked against N known
interactions," never "guaranteed safe."
"""
from __future__ import annotations

from itertools import combinations

from sqlalchemy.orm import Session

from .models import Interaction, Medicine


def _norm(salt: str) -> str:
    return (salt or "").strip().lower()


def _pair(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted([_norm(a), _norm(b)]))


def check(db: Session, patient_id: str) -> dict:
    meds = (
        db.query(Medicine)
        .filter(
            Medicine.patient_id == patient_id,
            Medicine.status == "active",
            Medicine.salt.isnot(None),
        )
        .all()
    )
    # salt-pair -> interaction row, order-independent
    table = {_pair(i.salt_a, i.salt_b): i for i in db.query(Interaction).all()}

    findings, seen = [], set()
    checked = 0
    for m1, m2 in combinations(meds, 2):
        if _norm(m1.salt) == _norm(m2.salt):
            continue  # same salt (e.g. duplicate) — not an interaction pair
        checked += 1
        key = _pair(m1.salt, m2.salt)
        hit = table.get(key)
        if not hit or key in seen:
            continue
        seen.add(key)
        findings.append({
            "severity": hit.severity,
            "note": hit.note,
            "source": hit.source,
            "cross_doctor": (m1.prescriber_name or "") != (m2.prescriber_name or ""),
            "medicines": [
                {"brand": m1.brand, "salt": m1.salt, "prescriber": m1.prescriber_name},
                {"brand": m2.brand, "salt": m2.salt, "prescriber": m2.prescriber_name},
            ],
        })

    order = {"major": 0, "moderate": 1, "minor": 2}
    findings.sort(key=lambda f: order.get(f["severity"], 9))
    return {
        "checked_pairs": checked,
        "known_interactions_in_db": len(table),
        "findings": findings,
        "disclaimer": (
            "Checked against known interactions only - not a guarantee of safety. "
            "Confirm with your doctor."
        ),
    }
