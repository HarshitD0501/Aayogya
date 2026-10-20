"use client";

// Thin fetch wrapper: attaches the Bearer token, unwraps FastAPI's {detail},
// and broadcasts a logout on 401 so the app can drop back to the login screen.
const TOKEN_KEY = "aayogya_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem("aarogya_token");
}
export function setToken(t) {
  window.localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem("aarogya_token");
    window.localStorage.removeItem(PATIENT_KEY); // stale patient header = wrong dashboard
  }
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const PATIENT_KEY = "aayogya_patient_id";

// Which linked patient the (caregiver) token acts on. Patients ignore this —
// the backend forces them to self regardless of the header.
export function getActivePatientId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PATIENT_KEY) || null;
}
export function setActivePatientId(id) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(PATIENT_KEY, id);
  else window.localStorage.removeItem(PATIENT_KEY);
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const pid = getActivePatientId();
  if (token && pid) headers["X-Patient-Id"] = pid;

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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("aayogya:logout"));
      window.dispatchEvent(new Event("aarogya:logout"));
    }
    throw new Error("Session expired — please sign in again.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
    } catch {
      /* non-JSON error body (e.g. Next.js proxy error when backend is offline) */
      if (res.status === 500 || res.status === 502 || res.status === 504) {
        detail = "Backend server is unreachable on port 8000. Please ensure the backend is started with: uvicorn app.main:app --reload --port 8000";
      }
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

export async function getPublicStats() {
  try {
    return await api("/public/stats", { timeoutMs: 8000 });
  } catch {
    return {
      verified_medicines: 120,
      nppa_caps_tracked: 38,
      jan_aushadhi_generics: 34,
      interaction_rules: 14,
      status: "online",
    };
  }
}

export async function getPublicPrices({ brand, salt, strength }) {
  const params = new URLSearchParams();
  if (brand) params.set("brand", brand);
  if (salt) params.set("salt", salt);
  if (strength) params.set("strength", strength);
  return api(`/prices?${params.toString()}`);
}

export const DEMO_USERS = [
  {
    id: "meera",
    name: "Meera Kulkarni",
    email: "meera@demo.in",
    password: "pass1234",
    tag: "Family Caregiver",
    desc: "Caregiver dashboard — manage Papa, Dadi, brother & Maa together",
    color: "#7c3aed",
  },
  {
    id: "ramesh",
    name: "Ramesh Kulkarni",
    email: "ramesh@demo.in",
    password: "pass1234",
    tag: "Cardio & Diabetes",
    desc: "Amlodipine, Metformin, Ecosprin, Pantoprazole (Single Doctor)",
    color: "#2563eb",
  },
  {
    id: "shanti",
    name: "Shanti Devi",
    email: "shanti@demo.in",
    password: "pass1234",
    tag: "Safety Alert Demo",
    desc: "Multi-doctor prescriptions with flagged NSAID + Aspirin alert",
    color: "#dc2626",
  },
  {
    id: "aarav",
    name: "Aarav Sharma",
    email: "aarav@demo.in",
    password: "pass1234",
    tag: "Schedule & SOS",
    desc: "Active Pan 40 & Digene course with automated WhatsApp tracking",
    color: "#059669",
  },
];

export async function loginAsDemo(patientId = "ramesh") {
  const user = DEMO_USERS.find((u) => u.id === patientId) || DEMO_USERS[0];
  return login(user.email, user.password);
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
    throw new Error("Assistant is offline. Start it with: uvicorn chat:app --port 8081");
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

// --- Caregiver portal helpers ---

export function getFamilyOverview() {
  return api("/caregiver/patients");
}

export function updatePatientContact(patientId, phone) {
  return api(`/caregiver/patients/${patientId}/contact`, {
    method: "POST",
    json: { phone },
  });
}

export function dispatchAiCall(reportId, force = false) {
  return api("/telephony/dispatch", {
    method: "POST",
    json: { report_id: reportId, force },
  });
}

// Build the official WhatsApp click-to-chat URL for a caregiver's own WhatsApp
// (free, no Meta API). Number: full international format WITHOUT '+'; text URL-encoded.
export function whatsappLink(phone, text) {
  const digits = (phone || "").replace(/\D/g, "");
  const withCc = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCc}?text=${encodeURIComponent(text)}`;
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

