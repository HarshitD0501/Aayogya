import sys
import unittest
from pathlib import Path
from unittest.mock import patch

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.prices import (
    parse_pack_units,
    extract_form,
    extract_release_type,
    is_formulation_equivalent,
    compute_unit_safe_comparison,
    get_prices,
    get_catalog_counts,
)
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class Batch7UnitSafePricingTests(unittest.TestCase):
    """Batch 7 tests for ERR-021 and ERR-022: Unit-safe pricing and genuine provenance."""

    def test_pack_unit_parsing(self):
        """Test parsing of diverse pharmaceutical packaging notations."""
        self.assertEqual(parse_pack_units("10 Tablets"), (10, "tablet"))
        self.assertEqual(parse_pack_units("15 Tablets Strip"), (15, "tablet"))
        self.assertEqual(parse_pack_units("30 Capsules Bottle"), (30, "capsule"))
        self.assertEqual(parse_pack_units("200 ml Bottle"), (200, "ml"))
        self.assertEqual(parse_pack_units("1 Vial"), (1, "vial"))
        self.assertEqual(parse_pack_units("1 Injection"), (1, "injection"))
        self.assertEqual(parse_pack_units("Standard Strip"), (10, "tablet"))
        self.assertEqual(parse_pack_units(None), (10, "tablet"))

    def test_form_and_release_extraction(self):
        """Test extraction of dosage form and release profile."""
        self.assertEqual(extract_form("Paracetamol 650mg Tablet"), "Tablet")
        self.assertEqual(extract_form("Omeprazole 20mg Capsule"), "Capsule")
        self.assertEqual(extract_form("Paracetamol 250mg/5ml Syrup"), "Syrup")
        self.assertEqual(extract_form("Ceftriaxone 1g Injection"), "Injection")

        self.assertEqual(extract_release_type("Metformin 500mg SR"), "Sustained Release")
        self.assertEqual(extract_release_type("Metformin 500mg Extended Release"), "Sustained Release")
        self.assertEqual(extract_release_type("Paracetamol 650mg"), "Immediate Release")

    def test_formulation_equivalence_validation(self):
        """ERR-021: Formulation equivalence checks prevent unsafe substitutions."""
        # Exact match
        eq, reason = is_formulation_equivalent("Paracetamol 650mg", "Paracetamol 650mg")
        self.assertTrue(eq)
        self.assertIsNone(reason)

        # Form mismatch: Syrup vs Tablet
        eq, reason = is_formulation_equivalent("Paracetamol 250mg/5ml Syrup", "Paracetamol 500mg Tablet")
        self.assertFalse(eq)
        self.assertIn("Incomparable dosage forms", reason)

        # Release profile mismatch: SR vs IR
        eq, reason = is_formulation_equivalent("Metformin 500mg SR", "Metformin 500mg")
        self.assertFalse(eq)
        self.assertIn("Release profile mismatch", reason)

        # Combination vs Single: Amlodipine + Atenolol vs Amlodipine alone
        eq, reason = is_formulation_equivalent("Amlodipine + Atenolol 5mg/50mg", "Amlodipine 5mg")
        self.assertFalse(eq)
        self.assertIn("count mismatch", reason)

    def test_unit_safe_pack_normalization(self):
        """ERR-021: Comparing 15-pack market vs 10-pack generic must normalize per-unit price."""
        # Market Calpol: 15 tablets at ₹60.00 (₹4.00 / tablet)
        # Jan Aushadhi generic: 10 tablets at ₹10.00 (₹1.00 / tablet)
        # Comparing for 1 prescribed pack (10 tablets):
        # Equivalent market cost = 10 * ₹4.00 = ₹40.00
        # Jan Aushadhi cost = 10 * ₹1.00 = ₹10.00
        # Savings = ₹30.00 (75%), NOT ₹50.00 (83%)
        res = compute_unit_safe_comparison(
            market_price_inr=60.0,
            market_pack_str="15 Tablets Strip",
            pmbjp_price_inr=10.0,
            pmbjp_pack_str="10 Tablets",
            nppa_ceiling_inr=32.0,
            nppa_pack_str="10 Tablets",
            requested_packs=1,
            is_equivalent=True,
        )

        self.assertTrue(res["comparable"])
        self.assertEqual(res["unit_type"], "tablet")
        self.assertEqual(res["market_price"]["amount_paise"], 4000)  # ₹40.00 for 10 tabs
        self.assertEqual(res["market_price"]["unit_price_inr"], 4.0)
        self.assertEqual(res["pmbjp_price"]["amount_paise"], 1000)   # ₹10.00 for 10 tabs
        self.assertEqual(res["pmbjp_price"]["unit_price_inr"], 1.0)
        self.assertEqual(res["saving_paise"], 3000)                  # ₹30.00 savings
        self.assertEqual(res["saving_percent"], 75)                  # Exactly 75%
        self.assertEqual(res["unit_saving_paise"], 300.0)            # 300 paise / tab

    def test_liquid_vs_solid_unit_mismatch_rejected(self):
        """ERR-021: Liquid syrup (ml) compared to tablet (unit) must be rejected as incomparable."""
        res = compute_unit_safe_comparison(
            market_price_inr=85.0,
            market_pack_str="100 ml Bottle",
            pmbjp_price_inr=15.0,
            pmbjp_pack_str="10 Tablets",
            requested_packs=1,
            is_equivalent=True,
        )

        self.assertFalse(res["comparable"])
        self.assertIn("Unit mismatch", res["reason"])
        self.assertIsNone(res["saving_paise"])
        self.assertIsNone(res["saving_percent"])

    def test_unknown_retail_price_suppresses_savings(self):
        """ERR-022: If retail price is unavailable, savings must be None (suppressed), not invented."""
        res = compute_unit_safe_comparison(
            market_price_inr=None,
            market_pack_str="10 Tablets",
            pmbjp_price_inr=10.5,
            pmbjp_pack_str="10 Tablets",
            requested_packs=1,
            is_equivalent=True,
        )

        self.assertFalse(res["comparable"])
        self.assertIsNone(res["market_price"])
        self.assertIsNotNone(res["pmbjp_price"])
        self.assertEqual(res["pmbjp_price"]["amount_paise"], 1050)
        self.assertIsNone(res["saving_paise"])
        self.assertIsNone(res["saving_percent"])
        self.assertIn("Market retail price unavailable", res["reason"])

    def test_nppa_regulatory_details_and_current_urls(self):
        """ERR-022: NPPA is statutory regulation and links to current official portals, not 404 pages."""
        result = get_prices("Paracetamol", "650mg", "Dolo 650")

        self.assertTrue(result["matched"])
        self.assertIsNotNone(result["nppa_details"])
        self.assertEqual(result["nppa_details"]["regulation"], "DPCO 2013 Ceiling Order")
        self.assertEqual(result["nppa_details"]["source_url"], "https://nppa.gov.in/en/view_more?id=4")

        # Check that Jan Aushadhi offer points to the current active portal, not ProductList.aspx
        ja_offers = [o for o in result["offers"] if "Jan Aushadhi" in o["platform"]]
        self.assertTrue(len(ja_offers) > 0)
        self.assertIn("product-view-list", ja_offers[0]["url"])
        self.assertNotIn("ProductList.aspx", ja_offers[0]["url"])

    def test_v1_compare_endpoint_unit_safe_response(self):
        """Test API route /api/v1/compare enforces unit safety and handles unknown IDs without fallback."""
        # 1. Unknown medicine ID must return comparable=False with clear reason, NOT fallback to catalogue[0]
        resp = client.post("/api/v1/compare", json={"items": [{"medicine_id": "nonexistent-drug-id-999"}]})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        item = data["items"][0]
        self.assertFalse(item["comparable"])
        self.assertIn("not found in catalog", item["excluded_reason"])
        self.assertIsNone(item["saving_paise"])

        # 2. Known medicine with pack_count = 2
        # Use first medicine from search
        s_resp = client.get("/api/v1/search?q=paracetamol")
        self.assertEqual(s_resp.status_code, 200)
        candidates = s_resp.json()["candidates"]
        self.assertTrue(len(candidates) > 0)
        med_id = candidates[0]["medicine_id"]

        c_resp = client.post("/api/v1/compare", json={"items": [{"medicine_id": med_id, "pack_count": 2}]})
        self.assertEqual(c_resp.status_code, 200)
        c_data = c_resp.json()
        c_item = c_data["items"][0]
        self.assertEqual(c_item["medicine_id"], med_id)
        self.assertIn("unit_type", c_item)
        if c_item["pmbjp_price"]:
            self.assertEqual(c_item["pmbjp_price"]["source_url"], "https://janaushadhi.gov.in/product-portfolio/product-view-list")


if __name__ == "__main__":
    unittest.main()
