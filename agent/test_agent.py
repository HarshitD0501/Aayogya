"""One runnable self-check for the parts that fail silently if broken:
the non-clinical safety rules in the shared prompt, and BackendClient's auth +
routing (per-patient isolation lives on the token, so the header must be right).

    python test_agent.py      # or: pytest test_agent.py

No network: BackendClient's HTTP is swapped for an httpx.MockTransport that echoes
back the path and the Authorization header it received.
"""
from __future__ import annotations

import asyncio

import httpx

import prompt
from backend_client import BackendClient, safe


def test_prompt_has_safety_rules() -> None:
    p = prompt.SYSTEM_PROMPT.lower()
    for must in ["never diagnose", "108", "confirm with your doctor", "not medical advice"]:
        assert must in p, f"SYSTEM_PROMPT missing safety rule: {must!r}"


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


def test_backend_client() -> None:
    asyncio.run(_run_backend_client_checks())


if __name__ == "__main__":
    test_prompt_has_safety_rules()
    test_backend_client()
    print("ok — prompt safety rules present, BackendClient auth + routing correct")
