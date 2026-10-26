"use client";

import { clearResourceCache, invalidateResource } from "./resourceCache";

// Thin fetch wrapper: attaches the Bearer token, unwraps FastAPI's {detail},
// and broadcasts a logout on 401 so the app can drop back to the login screen.
const TOKEN_KEY = "aushadh_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem("aushadh_token");
}
export function setToken(t) {
  window.localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  if (typeof window !== "undefined") {
    const pid = window.localStorage.getItem(PATIENT_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem("aushadh_token");
    window.localStorage.removeItem(PATIENT_KEY); // stale patient header = wrong dashboard
    clearResourceCache();
    try {
      import("./indexedDb")
        .then((m) => {
          m.clearSensitiveStorage?.(pid);
        })
        .catch(() => {});
    } catch {}
  }
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const PATIENT_KEY = "aushadh_patient_id";

// Which linked patient the (caregiver) token acts on. Patients ignore this —
// the backend forces them to self regardless of the header.
export function getActivePatientId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PATIENT_KEY) || null;
}
export function setActivePatientId(id) {
  if (typeof window === "undefined") return;
  const prev = window.localStorage.getItem(PATIENT_KEY);
  if (id) window.localStorage.setItem(PATIENT_KEY, id);
  else window.localStorage.removeItem(PATIENT_KEY);
  if (prev !== id) {
    clearResourceCache();
    window.dispatchEvent(new CustomEvent("aushadh:patient_switched", { detail: { patientId: id } }));
  }
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
  let isTimeout = false;
  const ac = new AbortController();
  const timer = setTimeout(() => {
    isTimeout = true;
    ac.abort();
  }, opts.timeoutMs ?? 90000);

  if (opts.signal) {
    if (opts.signal.aborted) {
      ac.abort();
    } else {
      opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }
  }
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { ...init, signal: ac.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      if (isTimeout) {
        throw new Error("The server took too long to respond — please try again.");
      }
      throw e; // Client cancellation (e.g. unmount or navigation), re-throw as AbortError
    }
    throw new Error("Couldn't reach the server. Make sure the backend is running, then try again.");
  } finally {
    clearTimeout(timer);
  }

  const isAuthEndpoint =
    path === "/auth/login" ||
    path === "/auth/register" ||
    path === "/auth/google" ||
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register");

  if (res.status === 401 && !isAuthEndpoint) {
    clearToken();
    clearResourceCache();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("aushadh:logout"));
    }
    throw new Error("Session expired — please sign in again.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const bodyDetail = body.detail || body.message;
      detail = Array.isArray(bodyDetail)
        ? bodyDetail.map((issue) => issue.msg).filter(Boolean).join(" ") || detail
        : bodyDetail || detail;
    } catch {
      /* non-JSON error body (e.g. Next.js proxy error when backend is offline) */
      if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        detail = "Backend server is unreachable. Please ensure the backend is running.";
      }
    }
    throw new Error(detail);
  }

  // Invalidate in-memory resource cache on mutations (POST, PUT, DELETE, PATCH)
  const isMutation = (opts.method && opts.method.toUpperCase() !== "GET") || opts.json !== undefined;
  if (isMutation) {
    invalidateResource();
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function login(identifier, password, role) {
  const data = await api("/auth/login", {
    method: "POST",
    json: { identifier, password, role },
  });
  setToken(data.token);
  if (data.patient?.id) {
    setActivePatientId(data.patient.id);
  }
  return data.patient;
}

export async function register({ name, email, phone, password, role }) {
  const data = await api("/auth/register", {
    method: "POST",
    json: { name, email, phone, password, role },
  });
  setToken(data.token);
  if (data.patient?.id) {
    setActivePatientId(data.patient.id);
  }
  return data.patient;
}

export async function googleAuth({ credential, mode, role }) {
  const data = await api("/auth/google", {
    method: "POST",
    json: { credential, mode, role },
  });
  setToken(data.token);
  if (data.patient?.id) {
    setActivePatientId(data.patient.id);
  }
  return data.patient;
}

// In-memory cache for public platform stats and prices to avoid request waterfalls (Batch 8)
let _cachedPublicStats = null;
let _cachedPublicStatsExpiry = 0;
const _publicPricesCache = new Map();

export async function getPublicStats() {
  const now = Date.now();
  if (_cachedPublicStats && now < _cachedPublicStatsExpiry) {
    return _cachedPublicStats;
  }
  try {
    const data = await api("/public/stats", { timeoutMs: 8000 });
    _cachedPublicStats = data;
    _cachedPublicStatsExpiry = now + 60 * 1000; // 60s cache
    return data;
  } catch {
    return {
      verified_medicines: null,
      nppa_caps_tracked: null,
      jan_aushadhi_generics: null,
      interaction_rules: null,
      status: "offline",
    };
  }
}

export async function getPublicPrices({ brand, salt, strength }) {
  const params = new URLSearchParams();
  if (brand) params.set("brand", brand);
  if (salt) params.set("salt", salt);
  if (strength) params.set("strength", strength);
  const cacheKey = params.toString();

  const now = Date.now();
  const hit = _publicPricesCache.get(cacheKey);
  if (hit && now - hit.timestamp < 3 * 60 * 1000) {
    return hit.data;
  }

  const res = await api(`/prices?${cacheKey}`);
  _publicPricesCache.set(cacheKey, { timestamp: now, data: res });
  return res;
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

// Talk to the agent through the backend so it can enforce caregiver links and
// mint a patient-scoped token where needed. Threads {role,text} history.
export async function askAssistant(message, history = []) {
  return api("/chat", {
    method: "POST",
    json: { message, history },
    timeoutMs: 90000,
  });
}

export function getAssistantHealth() {
  return api("/chat/health", { timeoutMs: 5000 });
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

