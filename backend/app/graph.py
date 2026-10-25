"""LangGraph pipeline for design §5:
  ocr -> extract_meds -> validate_catalog -> [HUMAN CONFIRM] -> reconcile_active

Human-in-the-loop: the graph interrupt()s at human_confirm; nothing is scheduled
until the patient confirms. Upload runs the graph to the interrupt; confirm
resumes the same run. State is checkpointed (Postgres for scale, in-memory on
sqlite) so the two HTTP calls resume one pipeline.

ponytail: the pipeline stops at reconcile_active. interaction_check (design
§7.4) runs as the live /api/interactions endpoint, NOT a terminal node, because
the check must span ALL of a patient's reports, not just this one.
explain_rag isn't built yet (needs the drug_info table).

Nodes are thin wrappers over the existing pure logic (extraction/catalog/dosage)
so the graph adds structure, not a second implementation.
"""
from __future__ import annotations

import base64
from datetime import date
from typing import Optional, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from . import catalog, confidence
from .dosage import parse_dosage
from .extraction import _ALLOWED, _extract_raw, _status
from .schemas import ExtractedMed


class PipelineState(TypedDict, total=False):
    image_b64: str          # input image; cleared after OCR to keep checkpoints small
    mime: str
    patient_id: str
    raw_ocr: str
    prescriber_name: Optional[str]
    prescriber_specialty: Optional[str]
    prescription_date: Optional[str]
    follow_up_date: Optional[str]
    overall_confidence: float
    mock: bool
    meds: list[dict]        # ExtractedMed dumps, mutated through the nodes
    confirmed: bool


def _ocr(state: PipelineState) -> dict:
    """Agent 1 (Vision Preprocessor) + Agent 2 (Clinical Handwriting Decipherer).
    Decodes image and invokes extraction backend with fallback chain.
    OCR text is treated strictly as untrusted DATA (design §11)."""
    b64 = state.get("image_b64", "")
    mime = state.get("mime", "image/jpeg")
    try:
        image_bytes = base64.b64decode(b64) if b64 else b""
    except Exception:
        image_bytes = b""
    raw, mock = _extract_raw(image_bytes, mime)
    return {
        "raw_ocr": raw.get("raw_ocr", ""),
        "prescriber_name": raw.get("prescriber_name"),
        "prescriber_specialty": raw.get("prescriber_specialty"),
        "prescription_date": raw.get("prescription_date"),
        "follow_up_date": raw.get("follow_up_date"),
        "mock": mock,
        "meds": [m for m in raw.get("meds", []) if m.get("brand")],
        "image_b64": "",  # drop the image once OCR'd to keep checkpoints lightweight
    }


def _extract_meds(state: PipelineState) -> dict:
    """Structure the raw meds into the canonical ExtractedMed shape (defaults filled)."""
    meds = [
        ExtractedMed(**{k: m.get(k) for k in _ALLOWED if m.get(k) is not None}).model_dump()
        for m in state["meds"]
    ]
    return {"meds": meds}


def _validate_catalog(state: PipelineState) -> dict:
    """Agent 3 (Knowledge Graph & Fuzzy Matcher) + Agent 4 (Clinical Validation).
    Resolves salts from brand names, handles suffix reasoning (-D, -H, -GP, -SP),
    flags cursive fuzzy matches and suffix inference for Human-in-the-Loop review,
    parses dosage, and calculates grounded confidence."""
    pdate = state.get("prescription_date") or date.today().isoformat()
    out = []
    for m in state["meds"]:
        m = dict(m)
        m["needs_salt_confirmation"] = m.get("needs_salt_confirmation", False)
        raw_conf = m.get("confidence")  # model self-report
        hit = catalog.lookup(m.get("brand", ""))
        match_type = hit.get("match_type") if hit else None
        model_salt = (m.get("salt") or "").strip().lower()
        catalog_salt = (hit.get("salt") or "").strip().lower() if hit else ""

        salt_conflict = False
        if model_salt and catalog_salt and model_salt != catalog_salt:
            if model_salt not in catalog_salt and catalog_salt not in model_salt:
                salt_conflict = True

        if hit:
            if not m.get("salt"):
                m["salt"] = hit["salt"]
            m["form"] = m.get("form") or hit.get("form")

            # ERR-011: Suffix inference, fuzzy matches, prefix fallback, and salt conflicts require explicit review
            if match_type in ("fuzzy", "suffix_inferred", "prefix_head") or salt_conflict:
                m["needs_salt_confirmation"] = True
                notes = []
                if m.get("notes"):
                    notes.append(m["notes"])
                if match_type == "suffix_inferred":
                    notes.append(f"Suffix inference suggested '{hit['canonical_brand'].title()}' with salt '{hit['salt']}'. Please verify.")
                elif match_type == "fuzzy":
                    notes.append(f"Suggested match from '{m.get('brand')}' to '{hit['canonical_brand'].title()}'")
                elif match_type == "prefix_head":
                    notes.append(f"Prefix fallback match from '{m.get('brand')}' to '{hit['canonical_brand'].title()}'")
                if salt_conflict:
                    notes.append(f"Extracted salt ('{m.get('salt')}') differs from catalog salt ('{hit['salt']}')")
                m["notes"] = "; ".join(notes)
        else:
            if not m.get("salt"):
                m["needs_salt_confirmation"] = True

        d = parse_dosage(m.get("dosage_notation") or "")
        m["timing"], m["per_day"], m["prn"] = d.timings, d.per_day, d.prn
        m["start_date"] = m.get("start_date") or pdate
        # ERR-001: Keep status as pending_review until human confirms
        m["status"] = "pending_review" if not state.get("confirmed") else _status(m["start_date"], m.get("duration_days"))
        is_catalog_grounded = bool(
            hit
            and hit.get("match_type") in ("exact", "stem_exact")
            and not m.get("needs_salt_confirmation")
        )
        m["confidence"] = confidence.score(
            model_conf=raw_conf,
            catalog_hit=is_catalog_grounded,
            dosage_scheduled=bool(m.get("timing") or m.get("prn")),
            has_notation=bool(m.get("dosage_notation")),
            has_strength=bool(m.get("strength")),
        )
        out.append(m)
    confs = [m["confidence"] for m in out] or [0.0]
    return {"meds": out, "overall_confidence": round(sum(confs) / len(confs), 2)}


def _human_confirm(state: PipelineState) -> dict:
    """HALT (design §5): nothing scheduled until the patient confirms. Upload pauses
    here; confirm resumes with Command(resume={'confirmed': True})."""
    payload = interrupt({"meds": state["meds"], "message": "Confirm these medicines"})
    confirmed = payload.get("confirmed", True) if isinstance(payload, dict) else bool(payload)
    return {"confirmed": confirmed}


def _reconcile_active(state: PipelineState) -> dict:
    """Authoritative active/expired at confirm time (a med may have expired since
    upload)."""
    today = date.today().isoformat()
    meds = []
    for m in state["meds"]:
        m = dict(m)
        m["status"] = _status(m.get("start_date") or today, m.get("duration_days"))
        meds.append(m)
    return {"meds": meds}


def build_pipeline(checkpointer=None):
    """Compile the graph. Pass a checkpointer (PostgresSaver in prod); defaults to
    in-memory so tests/sqlite need no setup."""
    g = StateGraph(PipelineState)
    g.add_node("ocr", _ocr)
    g.add_node("extract_meds", _extract_meds)
    g.add_node("validate_catalog", _validate_catalog)
    g.add_node("human_confirm", _human_confirm)
    g.add_node("reconcile_active", _reconcile_active)
    g.add_edge(START, "ocr")
    g.add_edge("ocr", "extract_meds")
    g.add_edge("extract_meds", "validate_catalog")
    g.add_edge("validate_catalog", "human_confirm")
    g.add_edge("human_confirm", "reconcile_active")
    g.add_edge("reconcile_active", END)
    return g.compile(checkpointer=checkpointer or MemorySaver())
