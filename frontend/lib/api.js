"use client";

// Thin fetch wrapper: attaches the Bearer token, unwraps FastAPI's {detail},
// and broadcasts a logout on 401 so the app can drop back to the login screen.
const TOKEN_KEY = "aarogya_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  window.localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const init = { ...opts, headers };
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.json);
    delete init.json;
  }

  // Extraction runs a real Gemini vision call (~30s). Give it a generous
  // ceiling and turn the opaque network "TypeError: Failed to fetch" into an
  // actionable message so a dropped/hung request isn't a mystery.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 90000);
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { ...init, signal: ac.signal });
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error("The server took too long to respond — please try again.");
    throw new Error("Couldn't reach the server. Make sure the backend is running, then try again.");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("aarogya:logout"));
    throw new Error("Session expired — please sign in again.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function login(identifier, password) {
  const data = await api("/auth/login", {
    method: "POST",
    json: { identifier, password },
  });
  setToken(data.token);
  return data.patient;
}

export async function uploadReport(file) {
  const fd = new FormData();
  fd.append("file", file);
  return api("/reports/upload", { method: "POST", body: fd });
}

export function confirmReport(id) {
  return api(`/reports/${id}/confirm`, { method: "POST" });
}

// Talk to the voice/chat agent (System B) at /agent/chat. The patient's bearer
// token IS the auth — the agent makes every tool call as that patient, so the
// backend's per-patient isolation still holds. Threads {role,text} history.
export async function askAssistant(message, history = []) {
  const token = getToken();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90000);
  let res;
  try {
    res = await fetch("/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, token, history }),
      signal: ac.signal,
    });
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error("The assistant took too long to respond — please try again.");
    throw new Error("Assistant is offline. Start it with: uvicorn chat:app --port 8080");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = `Assistant error (${res.status})`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.json(); // { reply, history }
}

export async function getVoiceToken() {
  const token = getToken();
  // 1. Try authenticated backend endpoint /api/voice/token
  if (token) {
    try {
      const data = await api("/voice/token", { method: "POST" });
      if (data?.url && data?.token) return data;
    } catch (e) {
      console.warn("Backend voice token error:", e.message);
      // If error is 501 or configuration issue, throw descriptive error
      if (e.message.includes("501") || e.message.includes("Voice not configured")) {
        throw e;
      }
    }
  }

  // 2. Try standalone /agent/token (handled by demo.py on port 8080)
  try {
    const res = await fetch("/agent/token");
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Agent token fallback error:", err);
  }

  throw new Error("Voice service is not ready. Please verify LIVEKIT_URL / LIVEKIT_API_KEY in .env");
}

