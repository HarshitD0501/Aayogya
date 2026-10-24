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

// Development catalogue fixtures for fallback
const DEV_CATALOGUE = [
  {
    medicine_id: "pmbjp-001-paracetamol-500",
    matched_text: "Paracetamol Tablets IP 500mg",
    molecule_label: "Paracetamol",
    strength_label: "500 mg",
    form: "Tablet",
    release_type: "Immediate Release",
    pack_label: "10 Tablets Strip",
    pmbjp_product_code: "PMBJP-001",
    brands: [
      { brand_id: "brand-dolo-500", name: "Dolo 500" },
      { brand_id: "brand-calpol-500", name: "Calpol 500" }
    ],
    market_prices: {
      "brand-dolo-500": {
        amount_paise: 1650,
        currency: "INR",
        unit: "10 tablets",
        source_url: "https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine",
        checked_on: "2026-03-01"
      },
      "brand-calpol-500": {
        amount_paise: 1720,
        currency: "INR",
        unit: "10 tablets",
        source_url: "https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine",
        checked_on: "2026-03-01"
      }
    },
    pmbjp_price: {
      amount_paise: 980,
      currency: "INR",
      unit: "10 tablets",
      source_url: "http://janaushadhi.gov.in/ProductList.aspx",
      checked_on: "2026-03-01"
    },
    nppa_ceiling_price: {
      amount_paise: 1800,
      currency: "INR",
      unit: "10 tablets",
      source_url: "https://www.nppaindia.nic.in/ceiling-prices",
      checked_on: "2026-03-01"
    }
  },
  {
    medicine_id: "pmbjp-023-metformin-500",
    matched_text: "Metformin Hydrochloride Tablets IP 500mg",
    molecule_label: "Metformin HCl",
    strength_label: "500 mg",
    form: "Tablet",
    release_type: "Sustained Release",
    pack_label: "10 Tablets Strip",
    pmbjp_product_code: "PMBJP-023",
    brands: [
      { brand_id: "brand-glycomet-500", name: "Glycomet 500 SR" },
      { brand_id: "brand-obimet-500", name: "Obimet 500 SR" }
    ],
    market_prices: {
      "brand-glycomet-500": {
        amount_paise: 2450,
        currency: "INR",
        unit: "10 tablets",
        source_url: "https://nppaipdms.gov.in",
        checked_on: "2026-03-01"
      }
    },
    pmbjp_price: {
      amount_paise: 1120,
      currency: "INR",
      unit: "10 tablets",
      source_url: "http://janaushadhi.gov.in",
      checked_on: "2026-03-01"
    },
    nppa_ceiling_price: {
      amount_paise: 2700,
      currency: "INR",
      unit: "10 tablets",
      source_url: "https://www.nppaindia.nic.in",
      checked_on: "2026-03-01"
    }
  },
  {
    medicine_id: "pmbjp-045-atorvastatin-10",
    matched_text: "Atorvastatin Tablets IP 10mg",
    molecule_label: "Atorvastatin Calcium",
    strength_label: "10 mg",
    form: "Tablet",
    release_type: "Immediate Release",
    pack_label: "10 Tablets Strip",
    pmbjp_product_code: "PMBJP-045",
    brands: [
      { brand_id: "brand-atorva-10", name: "Atorva 10" },
      { brand_id: "brand-lipitor-10", name: "Lipitor 10" }
    ],
    market_prices: {
      "brand-atorva-10": {
        amount_paise: 7850,
        currency: "INR",
        unit: "10 tablets",
        source_url: "https://nppaipdms.gov.in",
        checked_on: "2026-03-01"
      }
    },
    pmbjp_price: {
      amount_paise: 1840,
      currency: "INR",
      unit: "10 tablets",
      source_url: "http://janaushadhi.gov.in",
      checked_on: "2026-03-01"
    },
    nppa_ceiling_price: {
      amount_paise: 8200,
      currency: "INR",
      unit: "10 tablets",
      source_url: "https://www.nppaindia.nic.in",
      checked_on: "2026-03-01"
    }
  },
  {
    medicine_id: "pmbjp-012-amlodipine-5",
    matched_text: "Amlodipine Tablets IP 5mg",
    molecule_label: "Amlodipine Besylate",
    strength_label: "5 mg",
    form: "Tablet",
    release_type: "Immediate Release",
    pack_label: "10 Tablets Strip",
    pmbjp_product_code: "PMBJP-012",
    brands: [
      { brand_id: "brand-amlong-5", name: "Amlong 5" },
      { brand_id: "brand-norvasc-5", name: "Norvasc 5" }
    ],
    market_prices: {
      "brand-amlong-5": {
        amount_paise: 3820,
        currency: "INR",
        unit: "10 tablets",
        source_url: "https://nppaipdms.gov.in",
        checked_on: "2026-03-01"
      }
    },
    pmbjp_price: {
      amount_paise: 750,
      currency: "INR",
      unit: "10 tablets",
      source_url: "http://janaushadhi.gov.in",
      checked_on: "2026-03-01"
    },
    nppa_ceiling_price: {
      amount_paise: 4200,
      currency: "INR",
      unit: "10 tablets",
      source_url: "https://www.nppaindia.nic.in",
      checked_on: "2026-03-01"
    }
  }
];

class Client {
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 8000);
    const signal = options.signal || controller.signal;

    try {
      const res = await fetch(url, { ...options, signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  // 1. Search medicines
  async search(query, limit = 8, signal) {
    const q = query.trim().toLowerCase();
    try {
      const res = await this.fetchWithTimeout(`/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`, { signal });
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    // Fixture fallback
    const matched = DEV_CATALOGUE.filter(item => 
      item.matched_text.toLowerCase().includes(q) ||
      item.molecule_label.toLowerCase().includes(q) ||
      item.brands.some(b => b.name.toLowerCase().includes(q))
    ).map(item => ({
      medicine_id: item.medicine_id,
      matched_text: item.matched_text,
      molecule_label: item.molecule_label,
      strength_label: item.strength_label,
      form: item.form,
      release_type: item.release_type,
      pack_label: item.pack_label,
      brands: item.brands,
      match_score: 92,
      requires_confirmation: false
    }));

    return {
      query,
      candidates: matched,
      isFixture: true
    };
  }

  // 2. Price comparison
  async compare(req, signal) {
    try {
      const res = await this.fetchWithTimeout(`/api/v1/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    // Fixture fallback
    const items = (req.items || []).map(reqItem => {
      const found = DEV_CATALOGUE.find(c => c.medicine_id === reqItem.medicine_id) || DEV_CATALOGUE[0];
      const count = reqItem.pack_count || 1;
      const brandId = reqItem.brand_id || (found.brands[0] ? found.brands[0].brand_id : null);
      const brandObj = found.brands.find(b => b.brand_id === brandId);
      const brandName = brandObj ? brandObj.name : null;

      const baseMarket = found.market_prices[brandId] || Object.values(found.market_prices)[0] || null;
      const marketPrice = baseMarket ? { ...baseMarket, amount_paise: baseMarket.amount_paise * count } : null;
      const pmbjpPrice = found.pmbjp_price ? { ...found.pmbjp_price, amount_paise: found.pmbjp_price.amount_paise * count } : null;
      const nppaPrice = found.nppa_ceiling_price ? { ...found.nppa_ceiling_price, amount_paise: found.nppa_ceiling_price.amount_paise * count } : null;

      let savingPaise = null;
      let savingPercent = null;
      if (marketPrice && pmbjpPrice && marketPrice.amount_paise > pmbjpPrice.amount_paise) {
        savingPaise = marketPrice.amount_paise - pmbjpPrice.amount_paise;
        savingPercent = Math.round((savingPaise / marketPrice.amount_paise) * 100);
      }

      return {
        medicine_id: found.medicine_id,
        pmbjp_product_code: found.pmbjp_product_code,
        matched_text: found.matched_text,
        molecule_label: found.molecule_label,
        strength_label: found.strength_label,
        form: found.form,
        release_type: found.release_type,
        pack_label: found.pack_label,
        brand_name: brandName,
        market_price: marketPrice,
        nppa_ceiling_price: nppaPrice,
        pmbjp_price: pmbjpPrice,
        saving_paise: savingPaise,
        saving_percent: savingPercent,
        comparison_basis: "Exact molecule, form & strength equivalent",
        excluded_reason: null
      };
    });

    const comparable = items.filter(i => i.market_price && i.pmbjp_price);
    const mTotal = comparable.reduce((acc, i) => acc + (i.market_price ? i.market_price.amount_paise : 0), 0);
    const pTotal = comparable.reduce((acc, i) => acc + (i.pmbjp_price ? i.pmbjp_price.amount_paise : 0), 0);
    const sTotal = mTotal > pTotal ? mTotal - pTotal : 0;
    const sPct = mTotal > 0 ? Math.round((sTotal / mTotal) * 100) : 0;

    return {
      items,
      totals: {
        comparable_item_count: comparable.length,
        incomplete_item_count: items.length - comparable.length,
        market_total_paise: mTotal || null,
        pmbjp_total_paise: pTotal || null,
        saving_total_paise: sTotal || null,
        saving_percent: sPct || null
      },
      isFixture: true
    };
  }

  // 3. OCR Prescription parse
  async ocr(file, signal) {
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

  // 4. Cities
  async getCities() {
    try {
      const res = await this.fetchWithTimeout(`/api/v1/cities`);
      if (res.ok) return await res.json();
    } catch {}
    return [
      { city_id: "delhi", name: "Delhi NCR", latitude: 28.6139, longitude: 77.2090 },
      { city_id: "jaipur", name: "Jaipur", latitude: 26.9124, longitude: 75.7873 },
      { city_id: "mumbai", name: "Mumbai", latitude: 19.0760, longitude: 72.8777 },
      { city_id: "bengaluru", name: "Bengaluru", latitude: 12.9716, longitude: 77.5946 }
    ];
  }

  // 5. Stores
  async getStores(cityId = "delhi", lat, lng) {
    try {
      const query = cityId ? `?city_id=${cityId}` : `?lat=${lat}&lng=${lng}`;
      const res = await this.fetchWithTimeout(`/api/v1/stores${query}`);
      if (res.ok) return await res.json();
    } catch {}

    return [
      {
        store_id: "kendra-dl-01",
        name: "Pradhan Mantri Jan Aushadhi Kendra #10842",
        kind: "kendra",
        address: "Shop 4, DDA Market, Block B, Connaught Place, New Delhi",
        city_id: "delhi",
        phone: "+91 98112 33445",
        opening_hours: "09:00 - 20:00 (Mon-Sat)",
        latitude: 28.6315,
        longitude: 77.2167,
        distance_km: 0.8,
        verified: true
      },
      {
        store_id: "kendra-dl-02",
        name: "Jan Aushadhi Medical Store #9214",
        kind: "kendra",
        address: "Near Gate 2, RML Hospital Complex, Baba Kharak Singh Marg",
        city_id: "delhi",
        phone: "+91 98115 77889",
        opening_hours: "08:30 - 21:00 (All Days)",
        latitude: 28.6235,
        longitude: 77.2035,
        distance_km: 1.4,
        verified: true
      },
      {
        store_id: "pharmacy-dl-03",
        name: "Apollo Pharmacy 24x7",
        kind: "pharmacy",
        address: "M-14, Outer Circle, Connaught Place",
        city_id: "delhi",
        phone: "+91 98110 55667",
        opening_hours: "24 Hours Open",
        latitude: 28.6340,
        longitude: 77.2210,
        distance_km: 1.1,
        verified: false
      },
      {
        store_id: "kendra-dl-04",
        name: "PMBJP Kendra South Extension",
        kind: "kendra",
        address: "GF-8, Main Market, South Extension Part 1",
        city_id: "delhi",
        phone: "+91 98119 44332",
        opening_hours: "10:00 - 20:30 (Mon-Sat)",
        latitude: 28.5726,
        longitude: 77.2238,
        distance_km: 4.2,
        verified: true
      }
    ];
  }

  // 6. Routes
  async getRoute(startLat, startLng, endLat, endLng) {
    try {
      const res = await this.fetchWithTimeout(`/api/v1/routes?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`);
      if (res.ok) return await res.json();
    } catch {}

    return {
      distance_km: 1.2,
      duration_minutes: 6,
      profile: "driving",
      steps: [
        "Head north on Radial Road toward Inner Circle (300 m)",
        "Turn right at roundabout onto Outer Circle (600 m)",
        "Turn left at Shop 4 DDA Market, destination will be on the left (300 m)"
      ],
      geometry: {
        type: "LineString",
        coordinates: [
          [startLng || 77.2100, startLat || 28.6250],
          [77.2130, 28.6280],
          [endLng || 77.2167, endLat || 28.6315]
        ]
      }
    };
  }

  // 7. Public Catalogue ETag
  async getPublicCatalogue(etag) {
    try {
      const headers = etag ? { "If-None-Match": etag } : {};
      const res = await this.fetchWithTimeout(`/api/v1/catalogue/public`, { headers });
      if (res.status === 304) return { notModified: true };
      if (res.ok) {
        return {
          data: await res.json(),
          etag: res.headers.get("ETag")
        };
      }
    } catch {}
    return {
      data: {
        version: "2026.03-dev-fixtures",
        checked_on: "2026-03-01",
        records: DEV_CATALOGUE.map(c => ({
          medicine_id: c.medicine_id,
          name: c.matched_text,
          molecule_label: c.molecule_label,
          strength_label: c.strength_label,
          form: c.form
        }))
      },
      etag: 'W/"dev-catalogue-etag"'
    };
  }

  // 8. Reminders
  async createReminder(payload, idempotencyKey) {
    const headers = { "Content-Type": "application/json" };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    try {
      const res = await this.fetchWithTimeout(`/api/v1/reminders`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
    } catch {}

    return {
      reminder_id: "rem-" + Date.now().toString(36),
      medicine_name: payload.medicine_name,
      daily_time: payload.daily_time,
      timezone: "Asia/Kolkata",
      status: "scheduled",
      management_token: "tok-rem-" + Math.random().toString(36).slice(2),
      next_due_at: new Date(Date.now() + 86400000).toISOString()
    };
  }

  async getReminderStatus(reminderId, managementToken) {
    const headers = {};
    if (managementToken) {
      headers["Authorization"] = `Bearer ${managementToken}`;
    }

    try {
      const res = await this.fetchWithTimeout(`/api/v1/reminders/${encodeURIComponent(reminderId)}`, { headers });
      if (res.ok) return await res.json();
    } catch {}

    return {
      reminder_id: reminderId,
      status: "scheduled",
      last_attempt: new Date().toISOString()
    };
  }

  async cancelReminder(reminderId, managementToken) {
    const headers = {};
    if (managementToken) {
      headers["Authorization"] = `Bearer ${managementToken}`;
    }

    try {
      const res = await this.fetchWithTimeout(`/api/v1/reminders/${encodeURIComponent(reminderId)}`, {
        method: "DELETE",
        headers
      });
      if (res.ok) return await res.json();
    } catch {}

    return { reminder_id: reminderId, status: "cancelled" };
  }

  // 9. Calls
  async createCall(payload, idempotencyKey) {
    const headers = { "Content-Type": "application/json" };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    try {
      const res = await this.fetchWithTimeout(`/api/v1/calls`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
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
    const headers = {};
    if (managementToken) {
      headers["Authorization"] = `Bearer ${managementToken}`;
    }

    try {
      const res = await this.fetchWithTimeout(`/api/v1/calls/${encodeURIComponent(callId)}`, { headers });
      if (res.ok) return await res.json();
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
