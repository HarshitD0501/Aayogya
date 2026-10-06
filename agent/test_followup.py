"""Test suite for Outbound Telephony Follow-Up prompt, dynamic language switching, and reschedule tool."""
from followup_prompt import FOLLOWUP_SYSTEM_PROMPT


def test_followup_prompt_hindi_opening():
    prompt_str = FOLLOWUP_SYSTEM_PROMPT.format(
        patient_name="रमेश कुमार",
        doctor_name="डॉ. शर्मा",
        doctor_specialty="हृदय रोग",
        follow_up_date="2026-10-15",
            lead_time="कल",
        report_id=101,
    )
    # 1. Must enforce pure Devanagari Hindi for the initial opening greeting
    assert "नमस्ते रमेश कुमार जी!" in prompt_str
    assert "DEVANAGARI SCRIPT" in prompt_str
    # Lead time comes from the actual date (computed), never hardcoded "2 दिन बाद"
    assert "डॉक्टर डॉ. शर्मा के साथ आपका चेकअप कल तय है" in prompt_str
    assert "ठीक 2 दिन बाद" not in prompt_str
    assert "NEVER write the initial Hindi greeting in English/Latin letters" in prompt_str
    print("  [PASS] Devanagari Hindi opening greeting with computed lead-time.")


def test_followup_prompt_dynamic_language_switching():
    prompt_str = FOLLOWUP_SYSTEM_PROMPT.format(
        patient_name="Shanti Devi",
        doctor_name="Dr. Mehta",
        doctor_specialty="Cardiology",
        follow_up_date="2026-10-18",
            lead_time="3 दिन बाद, 2026-10-18 को",
        report_id=102,
    )
    # 2. Dynamic code switching instruction
    assert "DYNAMIC LANGUAGE SWITCHING" in prompt_str
    assert "If the patient replies in English" in prompt_str
    assert "switch to natural, fluent, and polite English" in prompt_str
    assert "switch back to pure Devanagari Hindi" in prompt_str
    print("  [PASS] Dynamic bilingual language switching rules validated.")


def test_followup_prompt_reschedule_negotiation():
    prompt_str = FOLLOWUP_SYSTEM_PROMPT.format(
        patient_name="Aarav",
        doctor_name="Dr. Verma",
        doctor_specialty="General Medicine",
        follow_up_date="2026-10-20",
            lead_time="5 दिन बाद, 2026-10-20 को",
        report_id=103,
    )
    # 3. Reschedule negotiation: proactive inquiry and tool call
    assert "UNABLE TO ATTEND / RESCHEDULING" in prompt_str
    assert "reschedule_appointment" in prompt_str
    assert "आप किस दिन या समय पर उपलब्ध होंगे" in prompt_str
    print("  [PASS] Reschedule negotiation and tool triggering verified.")


def test_followup_prompt_emergency_and_safety_rules():
    prompt_str = FOLLOWUP_SYSTEM_PROMPT.format(
        patient_name="Aarav",
        doctor_name="Dr. Verma",
        doctor_specialty="General Medicine",
        follow_up_date="2026-10-20",
            lead_time="5 दिन बाद, 2026-10-20 को",
        report_id=103,
    )
    # 4. 108 Emergency and non-clinical compliance
    assert "108 या 112 पर कॉल करें" in prompt_str
    assert "You are NOT a doctor" in prompt_str
    assert "fasting" in prompt_str.lower()
    print("  [PASS] 108 Emergency and non-clinical safety verified.")


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING AAYOGYA AGENT FOLLOW-UP PROMPT & RESCHEDULE TEST")
    print("=======================================================\n")
    test_followup_prompt_hindi_opening()
    test_followup_prompt_dynamic_language_switching()
    test_followup_prompt_reschedule_negotiation()
    test_followup_prompt_emergency_and_safety_rules()
    print("\n=======================================================")
    print("ALL AGENT FOLLOW-UP TESTS PASSED WITH 0 ERRORS!")
    print("=======================================================\n")


def test_lead_time_text():
    from datetime import date, timedelta
    import voice

    today = date.today()
    assert voice._lead_time_text(today.isoformat()) == "आज"
    assert voice._lead_time_text((today + timedelta(days=1)).isoformat()) == "कल"
    assert voice._lead_time_text((today + timedelta(days=3)).isoformat()) == "3 दिन बाद, " + (today + timedelta(days=3)).isoformat() + " को"
    assert voice._lead_time_text("") == "जल्द"
    assert "2 दिन" not in voice._lead_time_text((today + timedelta(days=5)).isoformat())
    print("  [PASS] Lead-time text computed from the actual follow-up date.")


test_lead_time_text()
