"use client";

/**
 * Scoped in-memory resource cache and in-flight request deduplicator.
 * Keyed strictly by actor session token + target patient ID + normalized path.
 * In-memory only (NEVER persisted to localStorage/IndexedDB to prevent private PII leakage).
 * Invalidate automatically on:
 *  - 401 session expiry or manual logout (aushadh:logout)
 *  - Patient switch (aushadh:patient_switched)
 *  - Explicit mutation writes (POST/PUT/DELETE/PATCH)
 */

function getLocalToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("aushadh_token");
}

function getLocalPatientId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("aushadh_patient_id");
}

const cacheStore = new Map();
const inFlightPromises = new Map();

// Default freshness window for read-only dashboard modules: 15 seconds
export const DEFAULT_TTL_MS = 15000;

export function buildCacheKey(path, actorToken = null, patientId = null) {
  const token = actorToken !== null ? actorToken : getLocalToken();
  const pid = patientId !== null && patientId !== undefined ? patientId : getLocalPatientId();
  const tokenFingerprint = token ? String(token).slice(-16) : "anon";
  const patientScope = pid ? String(pid) : "self";
  return `${tokenFingerprint}:${patientScope}:${path}`;
}

export function getCachedResource(key, maxAgeMs = DEFAULT_TTL_MS) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now - entry.timestamp > maxAgeMs) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedResource(key, data) {
  cacheStore.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function invalidateResource(pathPrefix = "") {
  if (!pathPrefix) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.includes(pathPrefix)) {
      cacheStore.delete(key);
    }
  }
}

export function clearResourceCache() {
  cacheStore.clear();
  inFlightPromises.clear();
}

/**
 * Executes a deduplicated, scoped cached fetch.
 * If an identical GET request is in-flight for this actor+patient+path,
 * it returns the pending promise instead of triggering a second network call.
 */
export async function fetchWithResourceCache(path, fetchFn, options = {}) {
  const { maxAgeMs = DEFAULT_TTL_MS, skipCache = false, signal = null, actorToken = null, patientId = null } = options;
  const key = buildCacheKey(path, actorToken, patientId);

  if (!skipCache) {
    const cached = getCachedResource(key, maxAgeMs);
    if (cached !== null) {
      return cached;
    }
  }

  // The network request is shared across consumers, so a component's
  // AbortSignal must not own/cancel that shared request. Otherwise an effect
  // cleanup (for example React Strict Mode's setup -> cleanup -> setup check)
  // can abort the promise that the next mounted consumer is waiting on.
  let sharedPromise = inFlightPromises.get(key);
  if (!sharedPromise) {
    sharedPromise = (async () => {
      try {
        const data = await fetchFn();
        if (!skipCache && data !== null && data !== undefined) {
          setCachedResource(key, data);
        }
        return data;
      } finally {
        // Do not delete a newer request started after cache clearing.
        if (inFlightPromises.get(key) === sharedPromise) {
          inFlightPromises.delete(key);
        }
      }
    })();
    inFlightPromises.set(key, sharedPromise);
  }

  // Cancellation is local to this consumer; other consumers continue to
  // receive the shared result. The underlying request has its own API timeout.
  if (!signal) return sharedPromise;
  if (signal.aborted) {
    throw signal.reason || new DOMException("The operation was aborted", "AbortError");
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason || new DOMException("The operation was aborted", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    sharedPromise.then(
      (data) => {
        cleanup();
        resolve(data);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

// Auto-register cache flush on logout and patient-switch events
if (typeof window !== "undefined") {
  window.addEventListener("aushadh:logout", () => {
    clearResourceCache();
  });
  window.addEventListener("aushadh:patient_switched", () => {
    clearResourceCache();
  });
}
