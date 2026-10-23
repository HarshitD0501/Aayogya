import unittest
from unittest.mock import patch

from app.prices import get_prices


class PriceFallbackTests(unittest.TestCase):
    @patch("app.prices._fetch_pharmeasy_live", return_value=None)
    def test_unknown_medicine_has_no_synthetic_price_or_savings(self, _lookup):
        result = get_prices("Unknown Compound", "17 mg", "Sample Brand")

        self.assertFalse(result["matched"])
        self.assertEqual(result["offers"], [])
        self.assertIsNone(result["market_price"])
        self.assertIsNone(result["market_mrp"])
        self.assertIsNone(result["nppa_ceiling_price"])
        self.assertIsNone(result["jan_aushadhi_price"])
        self.assertIsNone(result["max_savings_amount"])
        self.assertIsNone(result["max_savings_percent"])

    @patch("app.prices._fetch_pharmeasy_live", return_value=None)
    def test_catalog_prices_do_not_imply_market_price_or_savings(self, _lookup):
        result = get_prices("Paracetamol", "650mg", "Dolo 650")

        self.assertTrue(result["matched"])
        self.assertIsNone(result["market_price"])
        self.assertIsNotNone(result["jan_aushadhi_price"])
        self.assertIsNotNone(result["nppa_ceiling_price"])
        self.assertIsNone(result["max_savings_amount"])
        self.assertIsNone(result["max_savings_percent"])
        self.assertTrue(all(offer["badge"] == "Reference catalog" for offer in result["offers"]))

    @patch(
        "app.prices._fetch_pharmeasy_live",
        return_value={"name": "Sample Brand", "mrp": 50.0, "sale_price": 42.0, "slug": "sample"},
    )
    def test_live_listing_is_the_only_market_price_source(self, _lookup):
        result = get_prices("Unknown Compound", "17 mg", "Sample Brand")

        self.assertTrue(result["matched"])
        self.assertEqual(result["market_price"], 42.0)
        self.assertEqual(result["market_mrp"], 50.0)
        self.assertEqual(len(result["offers"]), 1)
        self.assertEqual(result["offers"][0]["badge"], "Live listing")


if __name__ == "__main__":
    unittest.main()
