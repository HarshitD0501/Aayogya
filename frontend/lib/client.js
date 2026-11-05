"use client";

export class ApiClientError extends Error {
  constructor(status, message, code = "API_ERROR", requestId) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// In-memory TTL cache for public data to eliminate redundant request waterfalls (Batch 8)
const _MEM_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const hit = _MEM_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > CACHE_TTL_MS) {
    _MEM_CACHE.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(key, data) {
  if (_MEM_CACHE.size > 100) {
    const firstKey = _MEM_CACHE.keys().next().value;
    if (firstKey) _MEM_CACHE.delete(firstKey);
  }
  _MEM_CACHE.set(key, { timestamp: Date.now(), data });
}

class Client {
  async fetchWithTimeout(url, options = {}) {
    const timeoutMs = options.timeout || 8000;
    const controller = new AbortController();
    let timeoutId;

    if (options.signal) {
      if (options.signal.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      options.signal.addEventListener(
        "abort",
        () => controller.abort(options.signal.reason || new DOMException("The operation was aborted", "AbortError")),
        { once: true }
      );
    }

    timeoutId = setTimeout(() => {
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
    }, timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      return res;
    } catch (err) {
      if (err?.name === "AbortError" || err?.message?.toLowerCase().includes("abort") || controller.signal.aborted) {
        const isTimeout = controller.signal.reason?.name === "TimeoutError";
        if (isTimeout) {
          throw new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError");
        }
        throw new DOMException("The operation was aborted", "AbortError");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 1. Search medicines
  async search(query, limit = 8, signal) {
    const res = await this.fetchWithTimeout(`/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`, { signal });
    if (!res.ok) {
      throw new ApiClientError(res.status, `Medicine search failed (${res.status})`, "SEARCH_FAILED");
    }
    return await res.json();
  }

  // 2. Price comparison
  async compare(req, signal) {
    const res = await this.fetchWithTimeout(`/api/v1/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal
    });
    if (!res.ok) {
      throw new ApiClientError(res.status, `Price comparison failed (${res.status})`, "COMPARE_FAILED");
    }
    return await res.json();
  }

  // 3. OCR Prescription parse
  async ocr(file, patientId = null, signal = null) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const headers = {};
      if (typeof window !== "undefined") {
        const token =
          window.localStorage.getItem("aushadh_token") ||
          window.localStorage.getItem("aayogya_token");
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }
      if (patientId) {
        headers["X-Patient-Id"] = String(patientId);
      }
      const res = await this.fetchWithTimeout(`/api/reports/upload`, {
        method: "POST",
        headers,
        body: formData,
        timeout: 90000,
        signal,
      });
      if (!res.ok) {
        let errDetail = "Failed to process prescription image.";
        try {
          const errData = await res.json();
          errDetail = errData.detail || errDetail;
        } catch {}
        throw new ApiClientError(res.status, errDetail);
      }
      const report = await res.json();
      const meds = report.medicines || [];
      return {
        report_id: report.id,
        prescriber_name: report.prescriber_name,
        prescriber_specialty: report.prescriber_specialty,
        ocr_text:
          report.raw_ocr ||
          meds.map((m) => `${m.brand} ${m.dosage_notation || ""}`).join("\n"),
        suggestions: meds.map((m) => ({
          observed_text: `${m.brand || m.salt} ${m.strength || ""} ${
            m.dosage_notation || ""
          }`.trim(),
          query_tokens: [m.brand, m.salt].filter(Boolean),
          candidate_medicine_ids: [],
        })),
        isFixture: false,
      };
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      throw new ApiClientError(500, e.message || "Failed to process prescription image.");
    }
  }

  // 3b. Confirm Prescription Report to activate in clinical health records
  async confirmReport(reportId, patientId = null, signal = null) {
    const headers = {};
    if (typeof window !== "undefined") {
      const token =
        window.localStorage.getItem("aushadh_token") ||
        window.localStorage.getItem("aayogya_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    if (patientId) {
      headers["X-Patient-Id"] = String(patientId);
    }
    const res = await this.fetchWithTimeout(`/api/reports/${encodeURIComponent(reportId)}/confirm`, {
      method: "POST",
      headers,
      signal,
    });
    if (!res.ok) {
      let errDetail = "Failed to confirm prescription report.";
      try {
        const errData = await res.json();
        errDetail = errData.detail || errDetail;
      } catch {}
      throw new ApiClientError(res.status, errDetail);
    }
    return await res.json();
  }

  // 4. Cities
  async getCities() {
    const cached = getCached("cities");
    if (cached) return cached;
    try {
      const res = await this.fetchWithTimeout(`/api/v1/cities`);
      if (res.ok) {
        const data = await res.json();
        setCached("cities", data);
        return data;
      }
    } catch {}
    const fallback = [
      {"city_id": "lucknow", "name": "Lucknow", "latitude": 26.8467, "longitude": 80.9462},
      {"city_id": "delhi", "name": "Delhi NCR", "latitude": 28.6139, "longitude": 77.2090},
      {"city_id": "jaipur", "name": "Jaipur", "latitude": 26.9124, "longitude": 75.7873},
      {"city_id": "mumbai", "name": "Mumbai", "latitude": 19.0760, "longitude": 72.8777},
      {"city_id": "bengaluru", "name": "Bengaluru", "latitude": 12.9716, "longitude": 77.5946}
    ];
    setCached("cities", fallback);
    return fallback;
  }

  // 4b. Localities
  async getLocalities(cityId = "lucknow") {
    const cacheKey = `localities:${cityId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    try {
      const res = await this.fetchWithTimeout(`/api/v1/localities?city_id=${encodeURIComponent(cityId)}`);
      if (res.ok) {
        const data = await res.json();
        setCached(cacheKey, data);
        return data;
      }
    } catch (e) {
      console.warn("Localities lookup failed:", e);
    }
    return [];
  }

  // 5. Stores
  async getStores(cityId = "lucknow", lat, lng, kind = "all", ownership = "all", locality = "all", query = "") {
    const params = new URLSearchParams();
    if (cityId) params.append("city_id", cityId);
    if (lat != null && lng != null) {
      params.append("lat", lat);
      params.append("lng", lng);
    }
    if (kind && kind !== "all") params.append("kind", kind);
    if (ownership && ownership !== "all") params.append("ownership", ownership);
    if (locality && locality !== "all") params.append("locality", locality);
    if (query && query.trim()) params.append("q", query.trim());

    const cacheKey = `stores:${params.toString()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const res = await this.fetchWithTimeout(`/api/v1/stores?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCached(cacheKey, data);
        return data;
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("Store lookup failed:", e);
    }
    return [];
  }

  // 6. Routes
  async getRoute(startLat, startLng, endLat, endLng) {
    const cacheKey = `route:${startLat},${startLng}->${endLat},${endLng}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const res = await this.fetchWithTimeout(
        `/api/v1/routes?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.geometry) {
          setCached(cacheKey, data);
          return data;
        }
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("Routing lookup failed:", e);
    }
    // Return null instead of fictional hardcoded 1.2 km / 6 min route (ERR-007)
    return null;
  }

  // 7. Public Catalogue ETag
  async getPublicCatalogue(etag) {
    const headers = etag ? { "If-None-Match": etag } : {};
    const res = await this.fetchWithTimeout(`/api/v1/catalogue/public`, { headers });
    if (res.status === 304) return { notModified: true };
    if (!res.ok) {
      throw new ApiClientError(res.status, "Unable to fetch public catalogue.", "SERVICE_UNAVAILABLE");
    }
    return {
      data: await res.json(),
      etag: res.headers.get("ETag")
    };
  }

  // 8. Reminders
  async createReminder(payload, idempotencyKey) {
    throw new ApiClientError(
      501,
      "Standalone reminder scheduling is not available for local dossiers. Please manage reminders inside the Patient Workspace for your confirmed active medicines.",
      "UNSUPPORTED_LOCAL_ACTION"
    );
  }

  async getReminderStatus(reminderId, managementToken) {
    throw new ApiClientError(
      501,
      "Standalone reminder status endpoint is unavailable.",
      "UNSUPPORTED_LOCAL_ACTION"
    );
  }

  async cancelReminder(reminderId, managementToken) {
    throw new ApiClientError(
      501,
      "Standalone reminder cancellation is unavailable.",
      "UNSUPPORTED_LOCAL_ACTION"
    );
  }

  // 9. Calls
  async createCall(payload, idempotencyKey) {
    const numericReportId = Number(payload?.report_id);
    if (!payload?.report_id || isNaN(numericReportId) || numericReportId <= 0) {
      throw new ApiClientError(
        400,
        "Telephony checkup calls require a confirmed clinical record in your account with a verified backend ID. Local comparison dossiers cannot initiate cloud calls.",
        "UNSUPPORTED_LOCAL_ACTION"
      );
    }

    const headers = { "Content-Type": "application/json" };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    try {
      const res = await this.fetchWithTimeout(`/api/telephony/dispatch`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          report_id: numericReportId,
        })
      });
      if (res.ok) {
        return await res.json();
      }
      let errDetail = "Call request failed";
      try {
        const errJson = await res.json();
        errDetail = errJson.detail || errDetail;
      } catch {}
      throw new ApiClientError(res.status, errDetail);
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      throw new ApiClientError(500, e.message || "Could not connect to call service.");
    }
  }

  async getCallStatus(callId, managementToken) {
    const numericCallId = Number(callId);
    if (!callId || isNaN(numericCallId) || numericCallId <= 0) {
      throw new ApiClientError(
        400,
        "Invalid call identifier.",
        "INVALID_CALL_ID"
      );
    }
    try {
      const headers = {};
      if (managementToken) {
        headers["Authorization"] = `Bearer ${managementToken}`;
      }
      const res = await this.fetchWithTimeout(`/api/telephony/status/${encodeURIComponent(callId)}`, { headers });
      if (res.ok) {
        return await res.json();
      }
      let errDetail = "Failed to fetch call status";
      try {
        const errJson = await res.json();
        errDetail = errJson.detail || errDetail;
      } catch {}
      throw new ApiClientError(res.status, errDetail);
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      throw new ApiClientError(500, e.message || "Could not retrieve call status.");
    }
  }
}

export const apiClient = new Client();
