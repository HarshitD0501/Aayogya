"""Indian dosage notation parser. Safety-critical -> see test_dosage.py.

Turns "1-0-1", "BD", "TDS", "SOS", "HS", "OD", "1/2-0-1" into scheduled slots.
Returns timings (subset of morning/afternoon/night), doses per slot, doses/day,
and a prn flag (SOS/PRN = as-needed, never auto-scheduled).
"""
from __future__ import annotations

from dataclasses import dataclass, field

SLOTS_3 = ["morning", "afternoon", "night"]

# Abbreviation -> which slots fire (dose 1 each). SOS/PRN handled separately.
_ABBREV = {
    "OD": ["morning"],
    "QD": ["morning"],
    "ONCE DAILY": ["morning"],
    "ONCE A DAY": ["morning"],
    "BD": ["morning", "night"],
    "BID": ["morning", "night"],
    "TWICE DAILY": ["morning", "night"],
    "TWICE A DAY": ["morning", "night"],
    "TDS": ["morning", "afternoon", "night"],
    "TID": ["morning", "afternoon", "night"],
    "THRICE DAILY": ["morning", "afternoon", "night"],
    "QID": ["morning", "afternoon", "night"],  # 4x collapses to 3 named slots
    "HS": ["night"],  # hora somni = bedtime
    "BEDTIME": ["night"],
    "ON": ["night"],
    "MANE": ["morning"],
    "BBF": ["morning"],  # Before breakfast
    "EMPTY STOMACH": ["morning"],
}
_PRN = {"SOS", "PRN", "AS NEEDED", "IF NEEDED", "STAT"}


@dataclass
class Dosage:
    timings: list[str] = field(default_factory=list)  # scheduled slots
    doses: dict[str, float] = field(default_factory=dict)  # slot -> qty (e.g. 0.5)
    per_day: float = 0.0
    prn: bool = False
    raw: str = ""

    def as_dict(self) -> dict:
        return {
            "timings": self.timings,
            "doses": self.doses,
            "per_day": self.per_day,
            "prn": self.prn,
            "raw": self.raw,
        }


def _num(token: str) -> float:
    """Parse a dose token: 1, 0, 2, 1/2, ½, 0.5, 1.5."""
    token = token.strip().replace("½", "1/2").replace("¼", "1/4").replace("¾", "3/4")
    if not token:
        return 0.0
    if "/" in token:
        a, b = token.split("/", 1)
        return float(a) / float(b) if float(b) else 0.0
    return float(token)


def parse_dosage(notation: str) -> Dosage:
    if not notation or not notation.strip():
        return Dosage(raw=notation or "")
    raw = notation.strip()
    upper = raw.upper()

    # PRN / as-needed: no scheduled slots (design §7.3 — no auto-reminder).
    if any(tok in upper.split() or tok == upper for tok in _PRN):
        return Dosage(prn=True, raw=raw)
    for key in _PRN:
        if key in upper:
            return Dosage(prn=True, raw=raw)

    # Abbreviation form (BD/TDS/HS/OD...). Longest keys first to avoid OD-in-TDS.
    for key in sorted(_ABBREV, key=len, reverse=True):
        if key in upper.replace("-", " ").split() or upper == key:
            slots = _ABBREV[key]
            doses = {s: 1.0 for s in slots}
            return Dosage(timings=slots, doses=doses, per_day=float(len(slots)), raw=raw)

    # Numeric dash or slash form: 1-0-1, 1/0/1, 1/2-0-1, 1-1-1, or 4-part.
    delim = "-" if "-" in raw else ("/" if "/" in raw and not any(c.isalpha() for c in raw) else None)
    if delim:
        parts = [p for p in raw.split(delim)]
        try:
            vals = [_num(p) for p in parts]
        except (ValueError, ZeroDivisionError):
            return Dosage(raw=raw)  # unparseable -> caller flags for manual entry
        # Map to named slots. 3-part = M/A/N; 2-part = M/N; 4-part folds noon+eve.
        if len(vals) == 2:
            mapping = list(zip(["morning", "night"], vals))
        elif len(vals) == 3:
            mapping = list(zip(SLOTS_3, vals))
        elif len(vals) == 4:
            mapping = [
                ("morning", vals[0]),
                ("afternoon", vals[1] + vals[2]),
                ("night", vals[3]),
            ]
        else:
            return Dosage(raw=raw)
        doses = {slot: q for slot, q in mapping if q > 0}
        return Dosage(
            timings=list(doses.keys()),
            doses=doses,
            per_day=sum(doses.values()),
            raw=raw,
        )

    return Dosage(raw=raw)  # unknown -> manual entry
