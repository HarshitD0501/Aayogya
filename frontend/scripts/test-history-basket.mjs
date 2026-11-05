import assert from "node:assert";
import { computeReportTotals, filterPrescriptionReports, isReportAccessible } from "../lib/indexedDb.js";

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

// Test 4: Strict Tenant Isolation & Browser Segregation (Fixes U07, F26 & F38)
const testReports = [
  { report_id: "rep-1", patient_id: "ramesh" },
  { report_id: "rep-2", patient_id: "shanti" },
  { report_id: "rep-3", patient_id: null }, // unassigned guest report
  { report_id: "rep-4", patient_id: "rameshkumar" }, // substring check
];

// Authenticated user 'ramesh': only exact patient reports returned; guest reports separate
const rameshReports = filterPrescriptionReports(testReports, "ramesh");
assert.strictEqual(rameshReports.length, 1);
assert.strictEqual(rameshReports[0].report_id, "rep-1");
assert.ok(!rameshReports.some((r) => r.report_id === "rep-3"), "Guest report must not leak into patient account");
assert.ok(!rameshReports.some((r) => r.report_id === "rep-2"), "Foreign patient report must not leak");
assert.ok(!rameshReports.some((r) => r.report_id === "rep-4"), "Substring match must not leak");

// Explicit import flag: user explicitly chooses to include unassigned guest history
const rameshWithGuest = filterPrescriptionReports(testReports, "ramesh", true);
assert.strictEqual(rameshWithGuest.length, 2);
assert.ok(rameshWithGuest.some((r) => r.report_id === "rep-1"));
assert.ok(rameshWithGuest.some((r) => r.report_id === "rep-3"));

// Substring check: querying "ram" must NOT match "ramesh" or "rameshkumar"
const ramReports = filterPrescriptionReports(testReports, "ram");
assert.strictEqual(ramReports.length, 0);

// Unauthenticated / guest session: only unassigned guest reports returned
const guestReports = filterPrescriptionReports(testReports, null);
assert.strictEqual(guestReports.length, 1);
assert.strictEqual(guestReports[0].report_id, "rep-3");

// Test 5: isReportAccessible direct permission checks
assert.strictEqual(isReportAccessible(testReports[0], "ramesh"), true);
assert.strictEqual(isReportAccessible(testReports[0], "shanti"), false);
assert.strictEqual(isReportAccessible(testReports[0], null), false);
assert.strictEqual(isReportAccessible(testReports[2], "ramesh"), false); // guest report not leaked to signed-in user
assert.strictEqual(isReportAccessible(testReports[2], "ramesh", { allowGuest: true }), true);
assert.strictEqual(isReportAccessible(testReports[2], null), true); // guest session accessing guest report

console.log("PASS: Test 4 & 5 - Strict tenant isolation, segregation, and ownership checks verified.");

console.log("\nALL PRESCRIPTION BASKET & HISTORY TESTS PASSED SUCCESSFULLY!");
