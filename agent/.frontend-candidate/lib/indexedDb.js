/**
 * Aushadh-AI IndexedDB Storage Layer
 * Local-first client persistence. No personal images, tokens or unreviewed health data.
 */

const DB_NAME = 'aushadh_ai_db';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('catalogue_cache')) {
        db.createObjectStore('catalogue_cache', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('prescriptions')) {
        db.createObjectStore('prescriptions', { keyPath: 'report_id' });
      }

      if (!db.objectStoreNames.contains('action_tokens')) {
        db.createObjectStore('action_tokens', { keyPath: 'action_id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Public catalogue cache functions
export async function saveCatalogueCache(data, etag = null) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('catalogue_cache', 'readwrite');
      const store = tx.objectStore('catalogue_cache');
      const payload = {
        id: 'public_catalogue',
        version: data.version,
        checked_on: data.checked_on,
        etag: etag ?? null,
        cached_at: new Date().toISOString(),
        records: data.records,
      };
      const req = store.put(payload);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save public catalogue cache in IndexedDB:', err);
  }
}

export async function getCatalogueCache() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('catalogue_cache', 'readonly');
      const store = tx.objectStore('catalogue_cache');
      const req = store.get('public_catalogue');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to retrieve public catalogue cache from IndexedDB:', err);
    return null;
  }
}

export async function searchOfflineCatalogue(query) {
  const cached = await getCatalogueCache();
  if (!cached || !cached.records || !query.trim()) {
    return [];
  }
  const clean = query.trim().toLowerCase();
  return cached.records
    .filter(
      (r) =>
        r.name.toLowerCase().includes(clean) ||
        r.molecule_label.toLowerCase().includes(clean)
    )
    .slice(0, 8);
}

// Prescription report functions
export async function savePrescriptionReport(report) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('prescriptions', 'readwrite');
    const store = tx.objectStore('prescriptions');
    const req = store.put(report);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPrescriptionReport(reportId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('prescriptions', 'readonly');
    const store = tx.objectStore('prescriptions');
    const req = store.get(reportId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPrescriptionReports() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('prescriptions', 'readonly');
    const store = tx.objectStore('prescriptions');
    const req = store.getAll();
    req.onsuccess = () => {
      const reports = req.result || [];
      // Sort newest first
      reports.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      resolve(reports);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePrescriptionReport(reportId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('prescriptions', 'readwrite');
    const store = tx.objectStore('prescriptions');
    const req = store.delete(reportId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function computeReportTotals(items) {
  const comparable = items.filter(
    (item) => item.comparison_snapshot.saving_paise !== null && item.comparison_snapshot.saving_paise !== undefined
  );
  const incomplete = items.filter(
    (item) => item.comparison_snapshot.saving_paise === null || item.comparison_snapshot.saving_paise === undefined
  );

  let marketTotalPaise = 0;
  let pmbjpTotalPaise = 0;

  for (const item of comparable) {
    if (item.comparison_snapshot.market_price) {
      marketTotalPaise += item.comparison_snapshot.market_price.amount_paise * item.pack_count;
    }
    if (item.comparison_snapshot.pmbjp_price) {
      pmbjpTotalPaise += item.comparison_snapshot.pmbjp_price.amount_paise * item.pack_count;
    }
  }

  const savingTotalPaise = marketTotalPaise - pmbjpTotalPaise;
  const savingPercent =
    marketTotalPaise > 0 ? Math.round((savingTotalPaise / marketTotalPaise) * 100) : null;

  return {
    comparable_item_count: comparable.length,
    incomplete_item_count: incomplete.length,
    market_total_paise: comparable.length > 0 ? marketTotalPaise : null,
    pmbjp_total_paise: comparable.length > 0 ? pmbjpTotalPaise : null,
    saving_total_paise: comparable.length > 0 ? savingTotalPaise : null,
    saving_percent: savingPercent,
  };
}

export async function addOrUpdateReportWithItem(
  item,
  packCount = 1,
  existingReportId = null,
  checkup = null
) {
  const reportId = existingReportId || `rep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  let existing = await getPrescriptionReport(reportId);

  const confirmedItem = {
    medicine_id: item.medicine_id,
    pmbjp_product_code: item.pmbjp_product_code || null,
    brand_id: item.brand_id || null,
    brand_name: item.brand_name || null,
    matched_text: item.matched_text || item.brand_name || "Verified Medicine",
    molecule_label: item.molecule_label,
    strength_label: item.strength_label,
    form: item.form,
    release_type: item.release_type || null,
    pack_label: item.pack_label || "10 tablets",
    pack_count: packCount,
    comparison_snapshot: {
      market_price: item.market_price || null,
      pmbjp_price: item.pmbjp_price || null,
      nppa_ceiling_price: item.nppa_ceiling_price || null,
      saving_paise: item.saving_paise || null,
      saving_percent: item.saving_percent || null,
      comparison_basis: item.comparison_basis || null,
      excluded_reason: item.excluded_reason || null,
    },
  };

  if (!existing) {
    const items = [confirmedItem];
    const totals = computeReportTotals(items);
    const newReport = {
      report_id: reportId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items,
      totals_snapshot: totals,
      checkup: checkup || null,
    };
    await savePrescriptionReport(newReport);
  } else {
    const idx = existing.items.findIndex((i) => i.medicine_id === item.medicine_id);
    if (idx >= 0) {
      existing.items[idx].pack_count += packCount;
    } else {
      existing.items.push(confirmedItem);
    }
    existing.updated_at = new Date().toISOString();
    existing.totals_snapshot = computeReportTotals(existing.items);
    if (checkup) existing.checkup = checkup;
    await savePrescriptionReport(existing);
  }

  return reportId;
}

// Action tokens management (for Phase F6)
export async function saveActionToken(tokenRecord) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('action_tokens', 'readwrite');
    const store = tx.objectStore('action_tokens');
    const req = store.put(tokenRecord);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getActionToken(actionId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('action_tokens', 'readonly');
    const store = tx.objectStore('action_tokens');
    const req = store.get(actionId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
