"""One runnable self-check for the parts that fail silently if broken:
the non-clinical safety rules in the shared prompt, and BackendClient's auth +
routing (per-patient isolation lives on the token, so the header must be right).

    python test_agent.py      # or: pytest test_agent.py

No network: BackendClient's HTTP is swapped for an httpx.MockTransport that echoes
back the path and the Authorization header it received.
"""
from __future__ import annotations

import asyncio
import multiprocessing

import httpx
from livekit.agents import JobExecutorType

import prompt
from backend_client import BackendClient, safe
from voice import build_patient_instructions, build_worker_options, normalize_profile


def test_prompt_has_safety_rules() -> None:
    p = prompt.SYSTEM_PROMPT.lower()
    for must in ["never diagnose", "108", "not medical advice", "escalation rules"]:
        assert must in p, f"SYSTEM_PROMPT missing safety rule: {must!r}"
    # The blanket per-reply disclaimer is GONE — the doctor is mentioned only on
    # escalation (new/worse symptoms, dose changes, results meaning, interactions).
    assert "end every clinical-adjacent answer" not in p
    assert "without any doctor disclaimer" in p


def test_worker_isolates_windows_jobs_in_prewarmed_processes() -> None:
    options = build_worker_options()
    assert options.job_executor_type is JobExecutorType.PROCESS
    assert options.num_idle_processes == 2
    assert options.initialize_process_timeout == 90.0

    # The SDK defaults to threads on Windows because some Python builds have
    # process-spawn failures. Exercise the current interpreter's spawn path too.
    context = multiprocessing.get_context("spawn")
    result = context.Queue()
    process = context.Process(target=_process_spawn_probe, args=(result,))
    process.start()
    # Windows spawn re-imports the LiveKit/Google plugin tree in the child.
    # The worker itself allows 90s for process initialization; 15s here was
    # shorter than a normal cold import on this machine.
    process.join(timeout=45)
    if process.is_alive():
        process.terminate()
        process.join(timeout=5)
        raise AssertionError("Windows spawn smoke check timed out")
    assert process.exitcode == 0
    assert result.get(timeout=2) == "spawn-ok"


def _process_spawn_probe(result) -> None:
    result.put("spawn-ok")


def _mock_client(token: str = "tok-123") -> BackendClient:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"ok": True, "path": request.url.path})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://test")
    client = BackendClient(token, http=http)
    client._seen = seen  # type: ignore[attr-defined]
    return client


async def _run_backend_client_checks() -> None:
    # Auth header is set from the patient's token — this IS the isolation boundary.
    client = BackendClient("tok-abc", http=httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"h": r.headers.get("authorization")})),
        base_url="http://test",
    ))
    assert (await client.get_profile())["h"] == "Bearer tok-abc"
    await client.aclose()

    # Each tool hits exactly the endpoint the backend exposes.
    expected = {
        "get_profile": "/api/auth/me",
        "get_medicines": "/api/medicines",
        "check_interactions": "/api/interactions",
        "list_reports": "/api/reports",
    }
    for method, path in expected.items():
        c = _mock_client()
        await getattr(c, method)()
        assert c._seen["path"] == path, f"{method} hit {c._seen['path']}, expected {path}"
        assert c._seen["auth"] == "Bearer tok-123"
        await c.aclose()

    # safe() degrades instead of raising when a tool blows up.
    async def boom():
        raise RuntimeError("backend down")

    out = await safe(boom())
    assert isinstance(out, dict) and "error" in out


def test_profile_normalization_and_instruction_safety() -> None:
    # 1. Backend PatientOut schema format (lang, plan)
    p_backend = {"id": "p1", "name": "Ramesh Kumar", "lang": "hi", "plan": "pro"}
    norm = normalize_profile(p_backend)
    assert norm["name"] == "Ramesh Kumar"
    assert norm["lang"] == "hi"
    assert norm["language"] == "hi"
    assert norm["plan"] == "pro"
    assert norm["subscription_plan"] == "pro"
    assert norm["age"] is None
    assert norm["gender"] is None

    # Instructions must NOT contain hallucinated 'Age: Not specified'
    instr = build_patient_instructions(p_backend)
    assert "You are speaking directly with patient Ramesh Kumar." in instr
    assert "- Preferred language: hi" in instr
    assert "- Subscription plan: pro" in instr
    assert "Not specified" not in instr
    assert "Age:" not in instr
    assert "Gender:" not in instr

    # 2. Legacy format (language, subscription_plan)
    p_legacy = {"name": "Priya", "language": "en", "subscription_plan": "free", "age": 30, "gender": "female"}
    norm_leg = normalize_profile(p_legacy)
    assert norm_leg["lang"] == "en"
    assert norm_leg["plan"] == "free"
    assert norm_leg["age"] == 30
    assert norm_leg["gender"] == "female"

    instr_leg = build_patient_instructions(p_legacy)
    assert "You are speaking directly with patient Priya." in instr_leg
    assert "- Age: 30" in instr_leg
    assert "- Gender: female" in instr_leg
    assert "- Preferred language: en" in instr_leg
    assert "- Subscription plan: free" in instr_leg

    # 3. Empty profile defaults
    empty = normalize_profile(None)
    assert empty["lang"] in ("hi", "en")
    assert empty["plan"] == "free"
    assert "PATIENT CONTEXT" not in build_patient_instructions(None)


def test_backend_client() -> None:
    asyncio.run(_run_backend_client_checks())


if __name__ == "__main__":
    test_prompt_has_safety_rules()
    test_profile_normalization_and_instruction_safety()
    test_worker_isolates_windows_jobs_in_prewarmed_processes()
    test_backend_client()
    print("ok — prompt safety rules present, profile normalization verified, BackendClient auth + routing correct")
