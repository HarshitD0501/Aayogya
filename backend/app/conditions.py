"""Salt -> what it's commonly used for. INFORMATIONAL drug-use info (like the
leaflet), NOT a diagnosis of the patient (design 5.4, non-clinical). Surfaced in
the summary as "commonly used for ...", never as "you have ...".
"""
from __future__ import annotations

# substring-matched against the (lowercased) salt, so combo salts still resolve.
_USES = {
    "paracetamol": "fever and pain",
    "pantoprazole": "acidity / reflux (GERD)",
    "domperidone": "nausea and bloating",
    "antacid": "acidity",
    "aspirin": "blood thinning (heart protection)",
    "amlodipine": "high blood pressure",
    "metformin": "type-2 diabetes (blood sugar)",
    "levothyroxine": "low thyroid (hypothyroidism)",
    "ibuprofen": "pain and inflammation",
}

DISCLAIMER = "Common use of the medicine - informational, not a diagnosis."


def used_for(salt: str | None) -> str | None:
    if not salt:
        return None
    s = salt.lower()
    hits = [use for key, use in _USES.items() if key in s]
    return "; ".join(dict.fromkeys(hits)) or None
