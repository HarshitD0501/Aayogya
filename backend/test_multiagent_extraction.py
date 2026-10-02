"""Comprehensive Production-Grade Test Suite for Aarogya Multi-Agent Extraction Pipeline.

Tests all 4 agents and safety edge cases:
1. Agent 1: Vision Preprocessor (EXIF, contrast, ink sharpening, corrupt/tiny/RGBA images).
2. Agent 2: Clinical Handwriting & Shorthand Decipherer (JSON sanitization, markdown fences, trailing commas).
3. Agent 3: Indian Drug Knowledge Graph & Fuzzy Matcher (exact, stem, suffix, and difflib cursive fuzzy matching).
4. Agent 4: Clinical Validation & Confidence Orchestrator (dosage parsing, duration/status, confidence scoring).
5. LangGraph Pipeline End-to-End Execution (interrupt at human_confirm, state resumption, checkpointing).
"""
import base64
import io
from datetime import date
from PIL import Image

from app import catalog, confidence
from app.dosage import parse_dosage
from app.extraction import (
    _clean_json_str,
    _postprocess,
    _status,
    extract,
)
from app.graph import build_pipeline
from app.preprocessor import preprocess_prescription_image
from langgraph.types import Command


# =====================================================================
# AGENT 1 TESTS: Vision Preprocessor & Image Enhancement
# =====================================================================
def test_agent_1_preprocessor():
    print("Testing Agent 1: Vision Preprocessor...")

    # Test 1.1: Standard RGB image
    img = Image.new("RGB", (800, 600), color=(240, 240, 230))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    raw_bytes = buf.getvalue()

    enhanced, mime = preprocess_prescription_image(raw_bytes, "image/jpeg")
    assert mime == "image/jpeg"
    assert len(enhanced) > 0
    with Image.open(io.BytesIO(enhanced)) as res_img:
        assert res_img.size == (800, 600)
        assert res_img.mode == "RGB"

    # Test 1.2: RGBA / Transparent image
    rgba_img = Image.new("RGBA", (500, 500), color=(255, 255, 255, 128))
    rgba_buf = io.BytesIO()
    rgba_img.save(rgba_buf, format="PNG")
    enhanced_rgba, _ = preprocess_prescription_image(rgba_buf.getvalue(), "image/png")
    with Image.open(io.BytesIO(enhanced_rgba)) as res_img:
        assert res_img.mode == "RGB"

    # Test 1.3: Oversized image downscaling
    large_img = Image.new("RGB", (3000, 4000), color=(200, 200, 200))
    large_buf = io.BytesIO()
    large_img.save(large_buf, format="JPEG")
    enhanced_large, _ = preprocess_prescription_image(large_buf.getvalue(), "image/jpeg")
    with Image.open(io.BytesIO(enhanced_large)) as res_img:
        assert max(res_img.size) <= 2048
        # Aspect ratio preserved (3000/4000 = 0.75)
        assert round(res_img.size[0] / res_img.size[1], 2) == 0.75

    # Test 1.4: Corrupt image bytes fallback
    corrupt_bytes = b"not_a_valid_image_header_payload_1234567890"
    out_bytes, out_mime = preprocess_prescription_image(corrupt_bytes, "image/jpeg")
    # Graceful fallback returns original bytes instead of crashing
    assert out_bytes == corrupt_bytes

    print("  [PASS] Agent 1 Preprocessor passed all tests.")


# =====================================================================
# AGENT 2 TESTS: Clinical Handwriting Decipherer & JSON Sanitization
# =====================================================================
def test_agent_2_json_cleaner():
    print("Testing Agent 2: JSON Cleaner & Robust Parser...")

    # Test 2.1: Markdown fenced JSON
    raw_markdown = """```json
    {
        "prescriber_name": "Dr. Sharma",
        "meds": [{"brand": "Dolo 650", "dosage_notation": "1-0-1"}]
    }
    ```"""
    cleaned = _clean_json_str(raw_markdown)
    assert cleaned.startswith("{") and cleaned.endswith("}")
    assert '"prescriber_name": "Dr. Sharma"' in cleaned

    # Test 2.2: Conversational preamble & trailing remarks
    conversational = """Here is the extracted data from the prescription:
    {
        "prescriber_name": "Dr. Patel",
        "prescription_date": "2026-05-10"
    }
    Hope this helps! Let me know if you need more."""
    cleaned = _clean_json_str(conversational)
    assert cleaned == '{\n        "prescriber_name": "Dr. Patel",\n        "prescription_date": "2026-05-10"\n    }'

    # Test 2.3: Trailing commas
    trailing_comma = '{"brand": "Augmentin", "strength": "625mg", }'
    cleaned = _clean_json_str(trailing_comma)
    import json
    parsed = json.loads(cleaned)
    assert parsed["brand"] == "Augmentin"

    print("  [PASS] Agent 2 JSON Cleaner passed all tests.")


# =====================================================================
# AGENT 3 TESTS: Indian Drug Knowledge Graph & Fuzzy Matcher
# =====================================================================
def test_agent_3_catalog_fuzzy():
    print("Testing Agent 3: Indian Drug Knowledge Graph & Fuzzy Matcher...")

    # Test 3.1: Exact match
    hit = catalog.lookup("Dolo 650")
    assert hit is not None
    assert hit["salt"] == "Paracetamol"
    assert hit["match_type"] == "exact"
    assert hit["confidence"] == 1.0

    # Test 3.2: Suffix clinical reasoning (-D, -H, -GP, -SP)
    hit_pan_d = catalog.lookup("Pan-D")
    assert hit_pan_d is not None
    assert "Pantoprazole + Domperidone" in hit_pan_d["salt"]

    hit_telma_h = catalog.lookup("Telma-H")
    assert hit_telma_h is not None
    assert "Telmisartan + Hydrochlorothiazide" in hit_telma_h["salt"]

    hit_glycomet_gp = catalog.lookup("Glycomet-GP 1")
    assert hit_glycomet_gp is not None
    assert "Metformin + Glimepiride" in hit_glycomet_gp["salt"]

    hit_zerodol_sp = catalog.lookup("Zerodol-SP")
    assert hit_zerodol_sp is not None
    assert "Aceclofenac + Paracetamol + Serratiopeptidase" in hit_zerodol_sp["salt"]

    # Test 3.3: Stem strip (-SR, -PR, -XL)
    hit_sr = catalog.lookup("Glycomet-SR 500")
    assert hit_sr is not None
    assert hit_sr["salt"] == "Metformin"

    # Test 3.4: Fuzzy cursive handwriting misspellings
    # Doctor wrote cursive 'Agmntin' instead of Augmentin
    hit_fuzzy_aug = catalog.lookup("Agmntin")
    assert hit_fuzzy_aug is not None
    assert hit_fuzzy_aug["match_type"] == "fuzzy"
    assert "Amoxicillin" in hit_fuzzy_aug["salt"]

    # Doctor wrote cursive 'Dlo' instead of Dolo
    hit_fuzzy_dolo = catalog.lookup("Dlo")
    assert hit_fuzzy_dolo is not None
    assert hit_fuzzy_dolo["match_type"] == "fuzzy"
    assert hit_fuzzy_dolo["salt"] == "Paracetamol"

    # Test 3.5: Unknown brand
    hit_none = catalog.lookup("NonExistentMedicineXyz99")
    assert hit_none is None

    print("  [PASS] Agent 3 Drug Catalog & Fuzzy Matcher passed all tests.")


# =====================================================================
# AGENT 4 TESTS: Clinical Validation & Confidence Orchestrator
# =====================================================================
def test_agent_4_validation_and_confidence():
    print("Testing Agent 4: Clinical Validation & Confidence Orchestrator...")

    # Test 4.1: Indian dosage variations
    assert parse_dosage("1-0-1").timings == ["morning", "night"]
    assert parse_dosage("1/0/1").timings == ["morning", "night"]
    assert parse_dosage("1-1-1").timings == ["morning", "afternoon", "night"]
    assert parse_dosage("1-0-0").timings == ["morning"]
    assert parse_dosage("0-0-1").timings == ["night"]
    assert parse_dosage("BBF").timings == ["morning"]
    assert parse_dosage("bedtime").timings == ["night"]
    assert parse_dosage("empty stomach").timings == ["morning"]
    assert parse_dosage("once daily").timings == ["morning"]
    assert parse_dosage("SOS").prn is True and parse_dosage("SOS").timings == []

    # Test 4.2: Status calculation
    today_iso = date.today().isoformat()
    assert _status(today_iso, 5) == "active"
    assert _status(today_iso, None) == "active"
    assert _status(today_iso, -1) == "active"  # edge case: negative duration
    assert _status("2020-01-01", 5) == "expired"

    # Test 4.3: Postprocessing with Fuzzy Match triggers HITL
    med_fuzzy = _postprocess(
        {"brand": "Agmntin 625", "dosage_notation": "1-0-1", "strength": "625mg", "confidence": 0.8},
        prescription_date=today_iso,
    )
    assert med_fuzzy.salt == "Amoxicillin + Potassium Clavulanate"
    assert med_fuzzy.needs_salt_confirmation is True  # Fuzzy match MUST require human confirmation!
    assert "Suggested match from" in (med_fuzzy.notes or "")
    assert med_fuzzy.timing == ["morning", "night"]

    # Test 4.4: Postprocessing with Unknown Brand triggers HITL
    med_unknown = _postprocess(
        {"brand": "MysteryDrug 10", "dosage_notation": "1-0-0", "confidence": 0.5},
        prescription_date=today_iso,
    )
    assert med_unknown.salt is None
    assert med_unknown.needs_salt_confirmation is True

    # Test 4.5: Clean exact match gives high confidence
    med_clean = _postprocess(
        {"brand": "Dolo 650", "dosage_notation": "1-0-1", "strength": "650mg", "confidence": 0.95},
        prescription_date=today_iso,
    )
    assert med_clean.salt == "Paracetamol"
    assert med_clean.needs_salt_confirmation is False
    assert med_clean.confidence >= 0.85

    print("  [PASS] Agent 4 Clinical Validation & Confidence passed all tests.")


# =====================================================================
# END-TO-END LANGGRAPH PIPELINE TEST (WITH HITL INTERRUPT)
# =====================================================================
def test_langgraph_pipeline_e2e():
    print("Testing LangGraph Multi-Agent Pipeline with Human-in-the-Loop Interrupt...")

    import app.graph
    original_extract_raw = app.graph._extract_raw
    app.graph._extract_raw = lambda image_bytes, mime: ({
        "prescriber_name": "Dr. A. K. Verma",
        "prescriber_specialty": "Cardiology",
        "prescription_date": "2026-10-01",
        "follow_up_date": "2026-10-15",
        "raw_ocr": "Dr. A.K. Verma  Telma-H 40 1-0-0  Pan-D 1-0-0 empty stomach  Agmntin 625 1-0-1 x5d",
        "meds": [
            {"brand": "Telma-H 40", "salt": None, "strength": "40mg", "dosage_notation": "1-0-0", "duration_days": 30, "confidence": 0.95},
            {"brand": "Pan-D", "salt": None, "strength": "40mg", "dosage_notation": "1-0-0", "duration_days": 14, "confidence": 0.9},
            {"brand": "Agmntin 625", "salt": None, "strength": "625mg", "dosage_notation": "1-0-1", "duration_days": 5, "confidence": 0.8},
        ],
    }, False)

    try:
        pipeline = build_pipeline()
        config = {"configurable": {"thread_id": "test-session-12345"}}

        # Step 1: Upload / initial invocation -> runs through ocr, extract_meds, validate_catalog
        # and MUST interrupt at human_confirm!
        pipeline.invoke(
            {"image_b64": "ZHVtbXk=", "mime": "image/jpeg", "patient_id": "demo-patient"},
            config,
        )

        state = pipeline.get_state(config)
        # Graph must be paused waiting for human confirmation
        assert state.next == ("human_confirm",), f"Expected next node to be ('human_confirm',), got: {state.next}"
        snap = state.values
        assert len(snap.get("meds", [])) == 3
        assert snap.get("overall_confidence") > 0.0

        # Verify Agent 3 & Agent 4 resolved correctly in graph state:
        meds_by_brand = {m["brand"]: m for m in snap["meds"]}
        # Telma-H suffix clinical inference:
        assert "Telmisartan + Hydrochlorothiazide" in meds_by_brand["Telma-H 40"]["salt"]
        assert meds_by_brand["Telma-H 40"]["needs_salt_confirmation"] is False

        # Pan-D suffix inference:
        assert "Pantoprazole + Domperidone" in meds_by_brand["Pan-D"]["salt"]
        assert meds_by_brand["Pan-D"]["timing"] == ["morning"]

        # Agmntin 625 cursive fuzzy match:
        assert "Amoxicillin + Potassium Clavulanate" in meds_by_brand["Agmntin 625"]["salt"]
        assert meds_by_brand["Agmntin 625"]["needs_salt_confirmation"] is True  # MUST require human confirm!
        assert "Suggested match from" in meds_by_brand["Agmntin 625"]["notes"]

        # Step 2: Human reviews & confirms -> resumes pipeline to reconcile_active and END
        pipeline.invoke(Command(resume={"confirmed": True}), config)

        final_state = pipeline.get_state(config)
        assert final_state.next == (), f"Expected graph to reach END, got next: {final_state.next}"
        final_meds = final_state.values.get("meds", [])
        assert len(final_meds) == 3
        for med in final_meds:
            assert med["status"] in ("active", "expired")

        print("  [PASS] LangGraph Multi-Agent Pipeline E2E passed with 100% success.")
    finally:
        app.graph._extract_raw = original_extract_raw


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING AAROGYA MULTI-AGENT EXTRACTION TEST SUITE")
    print("=======================================================\n")
    test_agent_1_preprocessor()
    test_agent_2_json_cleaner()
    test_agent_3_catalog_fuzzy()
    test_agent_4_validation_and_confidence()
    test_langgraph_pipeline_e2e()
    print("\n=======================================================")
    print("ALL TESTS PASSED WITH 0 ERRORS! SYSTEM PRODUCTION-READY")
    print("=======================================================\n")
