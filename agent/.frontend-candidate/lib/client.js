"use client";

// The reference screens use a separate /api/v1 contract. Failed requests stay
// visible to users; medicine facts and delivery statuses must come from an API.
export class ApiClientError extends Error {
  constructor(status, message, code = "API_ERROR", requestId) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

class Client {
  async request(path, { signal, timeout = 8000, headers, ...options } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeout);

    try {
      const response = await fetch(`/api/v1${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      if (response.status === 304) return response;
      if (!response.ok) {
        let message = `Service unavailable (${response.status}). Please try again later.`;
        try {
          const body = await response.json();
          message = body.detail || body.message || message;
        } catch {}
        throw new ApiClientError(response.status, message);
      }
      return response;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (error?.name === "AbortError") {
        throw new ApiClientError(0, "The request timed out. Please try again.", "TIMEOUT");
      }
      throw new ApiClientError(0, "Could not reach the service. Check your connection and try again.", "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  async json(path, options) {
    const response = await this.request(path, options);
    return response.status === 204 ? null : response.json();
  }

  search(query, limit = 8, signal) {
    return this.json(`/search?q=${encodeURIComponent(query)}&limit=${limit}`, { signal });
  }

  compare(payload, signal) {
    return this.json("/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal,
    });
  }

  ocr(file, signal) {
    const body = new FormData();
    body.append("file", file);
    return this.json("/ocr", { method: "POST", body, signal, timeout: 90000 });
  }

  getCities() { return this.json("/cities"); }

  getStores(cityId, lat, lng) {
    const query = new URLSearchParams();
    if (cityId) query.set("city_id", cityId);
    else if (Number.isFinite(lat) && Number.isFinite(lng)) {
      query.set("lat", String(lat));
      query.set("lng", String(lng));
    }
    return this.json(`/stores?${query}`);
  }

  getRoute(startLat, startLng, endLat, endLng) {
    const query = new URLSearchParams({
      start_lat: String(startLat), start_lng: String(startLng),
      end_lat: String(endLat), end_lng: String(endLng),
    });
    return this.json(`/routes?${query}`);
  }

  async getPublicCatalogue(etag) {
    const response = await this.request("/catalogue/public", {
      headers: etag ? { "If-None-Match": etag } : {},
    });
    if (response.status === 304) return { notModified: true };
    return { data: await response.json(), etag: response.headers.get("ETag") };
  }

  createReminder(payload, idempotencyKey) {
    return this.json("/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  }

  getReminderStatus(id, token) {
    return this.json(`/reminders/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  cancelReminder(id, token) {
    return this.json(`/reminders/${encodeURIComponent(id)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
  }

  createCall(payload, idempotencyKey) {
    return this.json("/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  }

  getCallStatus(id, token) {
    return this.json(`/calls/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export const apiClient = new Client();
