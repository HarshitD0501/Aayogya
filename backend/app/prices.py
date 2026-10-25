"""Medicine pricing engine integrating PharmEasy live results and price references.

Provides real-time price discovery and consumer cost-saving analysis:
- Market Retail Price from PharmEasy's public search catalog (cached for efficiency)
- NPPA ceiling price references (Pharma Sahi Daam / DPCO)
- PMBJP Jan Aushadhi price references
"""
from __future__ import annotations

import json
import logging
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger("aayogya.prices")

DISCLAIMER = (
    "PharmEasy prices are live search results. NPPA and PMBJP amounts are "
    "reference catalog values; verify current prices and pack sizes with the source. "
    "Unavailable sources are omitted."
)

# 24-hour in-memory cache for live market queries: {query_key: (data, timestamp)}
_CACHE: dict[str, tuple[dict[str, Any], float]] = {}
_CACHE_TTL_SEC = 86400  # 24 hours
_NEGATIVE_CACHE_TTL_SEC = 3600  # 1 hour negative cache for misses/errors

# Reference price data is maintained in the versioned backend dataset. The dataset's
# PharmEasy estimates are intentionally not consumed by this live pricing service.
_PRICING_DATA_PATH = Path(__file__).resolve().parent / "data" / "medicine_pricing_dataset.json"


def _norm_key(text: str) -> str:
    """Normalize text into clean hyphenated key for lookup: 'Paracetamol 650mg' -> 'paracetamol-650mg'."""
    t = text.lower().strip()
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


def _norm_composition(text: str) -> str:
    """Normalize salt/strength compositions despite spaces before units."""
    normalized = re.sub(r"(?<=\d)\s+(?=(?:mg|mcg|ml|g)\b)", "", text.lower())
    return _norm_key(normalized)


def _load_pricing_dataset() -> dict[str, dict[str, Any]]:
    """Load NPPA and PMBJP reference values keyed by exact salt composition."""
    try:
        records = json.loads(_PRICING_DATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Unable to load pricing reference dataset: %s", exc)
        return {}

    if not isinstance(records, list):
        logger.warning("Pricing reference dataset must be a JSON list")
        return {}

    catalog = {}
    for record in records:
        if not isinstance(record, dict) or not record.get("salt_composition"):
            continue
        key = _norm_composition(record["salt_composition"])
        if key:
            catalog[key] = record
    return catalog


_PRICING_CATALOG = _load_pricing_dataset()


def get_catalog_counts() -> dict[str, int]:
    """Return the number of non-null NPPA and PMBJP reference entries."""
    return {
        "nppa": sum(record.get("nppa_ceiling_price_inr") is not None for record in _PRICING_CATALOG.values()),
        "jan_aushadhi": sum(record.get("jan_aushadhi_price_inr") is not None for record in _PRICING_CATALOG.values()),
    }


def _fetch_pharmeasy_live(query: str) -> dict[str, Any] | None:
    """Query PharmEasy's public catalog endpoint for live MRP, sale price and discounts.

    Cached for 24 hours in memory (or 1 hour for misses) to ensure maximum speed and respect rate limits.
    """
    cache_key = _norm_key(query)
    now = time.time()
    if cache_key in _CACHE:
        val, ts = _CACHE[cache_key]
        ttl = _CACHE_TTL_SEC if val is not None else _NEGATIVE_CACHE_TTL_SEC
        if now - ts < ttl:
            return val

    try:
        q_encoded = urllib.parse.quote(query.strip())
        url = f"https://pharmeasy.in/api/search/search/?q={q_encoded}&page=1"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                products = data.get("data", {}).get("products", [])
                if products:
                    top = products[0]
                    result = {
                        "name": top.get("name", query),
                        "mrp": float(top.get("mrpDecimal") or 0.0),
                        "sale_price": float(top.get("salePriceDecimal") or 0.0),
                        "discount_pct": float(top.get("discountDecimal") or 0.0),
                        "manufacturer": top.get("manufacturer", ""),
                        "slug": top.get("slug", ""),
                    }
                    _CACHE[cache_key] = (result, now)
                    return result
    except Exception as exc:
        logger.debug(f"PharmEasy live lookup error for '{query}': {exc}")

    _CACHE[cache_key] = (None, now)
    return None


def get_prices(
    salt: str | None,
    strength: str | None,
    brand: str | None = None,
) -> dict:
    """Return only live market prices and explicitly listed reference catalog values.
    """
    if not salt and not brand:
        return {
            "matched": False,
            "salt": salt,
            "strength": strength,
            "brand": brand,
            "reason": "Salt or brand unknown — confirm medicine to price it",
            "offers": [],
        }

    strength_str = strength or ""
    # Match only an exact salt/strength composition from the versioned dataset.
    catalog_keys = (
        _norm_composition(f"{salt or ''} {strength_str}"),
        _norm_composition(salt or ""),
    )
    catalog_entry = next(
        (_PRICING_CATALOG[key] for key in catalog_keys if key and key in _PRICING_CATALOG),
        None,
    )

    # ---------------------------------------------------------
    # Source 1: PharmEasy live market price
    # ---------------------------------------------------------
    market_query = f"{brand or salt} {strength_str}".strip()
    pe_data = _fetch_pharmeasy_live(market_query)

    offers = []
    market_sale_price = None
    market_mrp = None
    if pe_data and pe_data["sale_price"] > 0:
        market_sale_price = pe_data["sale_price"]
        market_mrp = pe_data["mrp"] or market_sale_price
        pe_url = (
            f"https://pharmeasy.in/online-medicine-order/{pe_data['slug']}"
            if pe_data.get("slug")
            else f"https://pharmeasy.in/search/all?name={urllib.parse.quote(market_query)}"
        )
        offers.append({
            "platform": "PharmEasy (Live Search)",
            "price": market_sale_price,
            "mrp": market_mrp,
            "currency": "INR",
            "badge": "Live listing",
            "url": pe_url,
        })
    else:
        pe_url = f"https://pharmeasy.in/search/all?name={urllib.parse.quote(market_query)}"

    # ---------------------------------------------------------
    # Source 2: NPPA reference catalog ceiling price
    # ---------------------------------------------------------
    nppa_cap = catalog_entry.get("nppa_ceiling_price_inr") if catalog_entry else None

    # ---------------------------------------------------------
    # Source 3: Jan Aushadhi reference catalog price
    # ---------------------------------------------------------
    jan_aushadhi_price = catalog_entry.get("jan_aushadhi_price_inr") if catalog_entry else None
    ja_generic_title = catalog_entry.get("jan_aushadhi_generic_name") if catalog_entry else None
    pack_size = catalog_entry.get("pack_size") if catalog_entry else None

    # Calculate savings comparing market price vs Jan Aushadhi generic
    savings_amt = None
    savings_pct = None
    if market_sale_price is not None and jan_aushadhi_price is not None:
        savings_amt = max(0.0, round(market_sale_price - jan_aushadhi_price, 2))
        savings_pct = round((savings_amt / market_sale_price) * 100, 1) if market_sale_price > 0 else 0.0

    # Build entries only for sources that supplied a live or catalog value.
    if jan_aushadhi_price is not None:
        offers.append({
            "platform": "Jan Aushadhi (PMBJP Reference Catalog)",
            "price": jan_aushadhi_price,
            "mrp": jan_aushadhi_price,
            "currency": "INR",
            "badge": "Reference catalog",
            "generic_title": ja_generic_title,
            "pack_size": pack_size,
            "url": "https://janaushadhi.gov.in/ProductList.aspx",
        })
    if nppa_cap is not None:
        offers.append({
            "platform": "NPPA Ceiling (Reference Catalog)",
            "price": nppa_cap,
            "mrp": nppa_cap,
            "currency": "INR",
            "badge": "Reference catalog",
            "pack_size": pack_size,
            "url": "https://nppa.gov.in",
        })

    # Keep only prices backed by a live listing or explicit catalog entry.
    offers.sort(key=lambda o: o["price"])

    return {
        "matched": bool(offers),
        "reason": None if offers else "No price source was found for this medicine.",
        "brand": brand,
        "salt": salt,
        "strength": strength,
        "disclaimer": DISCLAIMER,
        "market_price": market_sale_price,
        "market_mrp": market_mrp,
        "nppa_ceiling_price": nppa_cap,
        "jan_aushadhi_price": jan_aushadhi_price,
        "max_savings_percent": savings_pct,
        "max_savings_amount": savings_amt,
        "offers": offers,
    }
