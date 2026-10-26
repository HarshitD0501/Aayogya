import assert from "node:assert";
import { computeReportTotals, filterPrescriptionReports } from "../lib/indexedDb.js";

console.log("Running prescription basket and history totals verification tests...");

// Test 1: computeReportTotals with single comparable item
const item1 = {
  medicine_id: "dolo-650",
  brand_name: "Dolo 650",
  matched_text: "Paracetamol 650mg",
  pack_count: 1,
  market_price: { amount_paise: 3354 },
  pmbjp_price: { amount_paise: 645 },
  saving_paise: 2709,
  saving_percent: 81,
  comparison_snapshot: {
    market_price: { amount_paise: 3354 },
    pmbjp_price: { amount_paise: 645 },
    saving_paise: 2709,
    saving_percent: 81,
  },
};

const totals1 = computeReportTotals([item1]);
console.log("Test 1 totals:", totals1);
assert.strictEqual(totals1.comparable_item_count, 1);
assert.strictEqual(totals1.incomplete_item_count, 0);
assert.strictEqual(totals1.market_total_paise, 3354);
assert.strictEqual(totals1.pmbjp_total_paise, 645);
assert.strictEqual(totals1.saving_total_paise, 2709);
assert.strictEqual(totals1.saving_percent, 81);
console.log("PASS: Test 1 - Single item totals match expected.");

// Test 2: computeReportTotals with multiple items (multi-item sum)
const item2 = {
  medicine_id: "azithromycin-500",
  brand_name: "Azee 500",
  matched_text: "Azithromycin 500mg",
  pack_count: 1,
  market_price: { amount_paise: 11950 },
  pmbjp_price: { amount_paise: 3200 },
  saving_paise: 8750,
  saving_percent: 73,
  comparison_snapshot: {
    market_price: { amount_paise: 11950 },
    pmbjp_price: { amount_paise: 3200 },
    saving_paise: 8750,
    saving_percent: 73,
  },
};

const totals2 = computeReportTotals([item1, item2]);
console.log("Test 2 totals:", totals2);
assert.strictEqual(totals2.comparable_item_count, 2);
assert.strictEqual(totals2.incomplete_item_count, 0);
assert.strictEqual(totals2.market_total_paise, 3354 + 11950);
assert.strictEqual(totals2.pmbjp_total_paise, 645 + 3200);
assert.strictEqual(totals2.saving_total_paise, 2709 + 8750);
console.log("PASS: Test 2 - Multi-item basket sum matches.");

// Test 3: computeReportTotals with snapshot-only item (backward compatibility)
const itemSnapshotOnly = {
  medicine_id: "metformin-500",
  matched_text: "Metformin 500mg",
  pack_count: 1,
  comparison_snapshot: {
    market_price: { amount_paise: 4500 },
    pmbjp_price: { amount_paise: 1200 },
    saving_paise: 3300,
    saving_percent: 73,
  },
};

const totals3 = computeReportTotals([itemSnapshotOnly]);
console.log("Test 3 totals:", totals3);
assert.strictEqual(totals3.comparable_item_count, 1);
assert.strictEqual(totals3.market_total_paise, 4500);
assert.strictEqual(totals3.pmbjp_total_paise, 1200);
assert.strictEqual(totals3.saving_total_paise, 3300);
console.log("PASS: Test 3 - Backward compatible snapshot-only item totals match.");

// Test 4: Tenant isolation matching logic (Fixes F26 & F38)
const testReports = [
  { report_id: "rep-1", patient_id: "ramesh" },
  { report_id: "rep-2", patient_id: "shanti" },
  { report_id: "rep-3", patient_id: null }, // unassigned guest report
  { report_id: "rep-4", patient_id: "rameshkumar" }, // substring check
];

const rameshReports = filterPrescriptionReports(testReports, "ramesh");
assert.strictEqual(rameshReports.length, 2); // ramesh + unassigned guest
assert.ok(rameshReports.some((r) => r.report_id === "rep-1"));
assert.ok(rameshReports.some((r) => r.report_id === "rep-3"));
assert.ok(!rameshReports.some((r) => r.report_id === "rep-2"));
assert.ok(!rameshReports.some((r) => r.report_id === "rep-4")); // no substring leakage!

// Substring check: querying "ram" must NOT leak "ramesh" or "rameshkumar"
const ramReports = filterPrescriptionReports(testReports, "ram");
assert.strictEqual(ramReports.length, 1); // only unassigned guest
assert.strictEqual(ramReports[0].report_id, "rep-3");

// Logged out / unauthenticated: must NEVER leak authenticated patient reports
const unauthenticatedReports = filterPrescriptionReports(testReports, null);
assert.strictEqual(unauthenticatedReports.length, 1); // only guest unassigned report
assert.strictEqual(unauthenticatedReports[0].report_id, "rep-3");

console.log("PASS: Test 4 - Strict tenant isolation and substring leakage prevention verified.");

console.log("\nALL 4 PRESCRIPTION BASKET & HISTORY TESTS PASSED SUCCESSFULLY!");
