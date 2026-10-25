"""Patient profile adapter and instruction builder for Sahayak (voice and chat).

Normalizes backend PatientOut schema fields (lang, plan) alongside legacy fields,
ensuring truthful context without hallucinated fields (ERR-027).
"""
from __future__ import annotations

from typing import Any

DEFAULT_LANG = "hi"


def normalize_profile(profile: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize patient profile fields across backend schema (PatientOut) and legacy keys."""
    p = profile or {}
    lang = p.get("lang") or p.get("language") or DEFAULT_LANG or "hi"
    plan = p.get("plan") or p.get("subscription_plan") or "free"
    name = (p.get("name") or "").strip()
    age = p.get("age")
    gender = p.get("gender")
    return {
        "id": p.get("id", ""),
        "name": name,
        "lang": lang,
        "language": lang,
        "plan": plan,
        "subscription_plan": plan,
        "age": age,
        "gender": gender,
        "role": p.get("role", "patient"),
    }


def build_patient_instructions(base_prompt: str, profile: dict[str, Any] | None = None) -> str:
    """Build Sahayak system instructions with truthful, non-hallucinated patient context."""
    p = normalize_profile(profile)
    name = p["name"]
    lang = p["lang"]
    plan = p["plan"]
    age = p["age"]
    gender = p["gender"]

    instructions = base_prompt
    if name:
        context_lines = [
            "\n\n# PATIENT CONTEXT",
            f"You are speaking directly with patient {name}.",
        ]
        if age:
            context_lines.append(f"- Age: {age}")
        if gender:
            context_lines.append(f"- Gender: {gender}")
        context_lines.append(f"- Preferred language: {lang}")
        context_lines.append(f"- Subscription plan: {plan}")
        context_lines.append(f"Always address them warmly by name in their language ({lang}).")
        instructions += "\n".join(context_lines)
    return instructions
