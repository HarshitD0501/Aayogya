"""Medicine pricing engine integrating PharmEasy (Live Market), NPPA (Govt Cap),
and Jan Aushadhi PMBJP (Affordable Generic Substitutes).

Provides real-time price discovery and consumer cost-saving analysis:
- Market Retail Price from PharmEasy's public search catalog (cached for efficiency)
- Legal ceiling price protection under NPPA (Pharma Sahi Daam / DPCO)
- Subsidized generic alternative rates from PMBJP (Pradhan Mantri Bhartiya Janaushadhi Pariyojana)
"""
from __future__ import annotations

import json
import logging
import re
import time
import urllib.parse
import urllib.request
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

# Official NPPA (DPCO / Pharma Sahi Daam) Ceiling Prices in INR (per standard strip)
_NPPA_CEILING_PRICES: dict[str, float] = {
    "paracetamol-650mg": 32.28,   # 15 tabs
    "paracetamol-500mg": 18.20,   # 15 tabs
    "paracetamol": 25.00,
    "pantoprazole-40mg": 89.50,   # 10 tabs
    "pantoprazole": 89.50,
    "pantoprazole-domperidone": 135.00,
    "metformin-500mg": 28.50,     # 10 tabs
    "metformin-850mg": 38.00,
    "metformin-1000mg": 45.00,
    "metformin": 32.00,
    "amlodipine-5mg": 32.00,      # 10 tabs
    "amlodipine-10mg": 55.00,
    "amlodipine": 32.00,
    "aspirin-75mg": 14.50,        # 14 tabs
    "aspirin-150mg": 22.00,
    "aspirin": 16.00,
    "atorvastatin-10mg": 78.00,   # 10 tabs
    "atorvastatin-20mg": 135.00,
    "atorvastatin": 85.00,
    "azithromycin-500mg": 84.50,  # 3 tabs
    "azithromycin": 84.50,
    "amoxicillin-clavulanic-acid-625mg": 138.00,  # 6 tabs
    "amoxicillin-clavulanic-acid": 138.00,
    "telmisartan-40mg": 84.00,    # 10 tabs
    "telmisartan": 84.00,
    "losartan-50mg": 62.00,
    "levothyroxine-100mcg": 185.00,  # 100 tabs
    "levothyroxine-50mcg": 145.00,
    "levothyroxine": 165.00,
    "ibuprofen-400mg": 24.50,     # 10 tabs
    "ibuprofen": 24.50,
    "ibuprofen-paracetamol": 38.00,
    "cetirizine-10mg": 24.00,     # 10 tabs
    "cetirizine": 24.00,
    "montelukast-levocetirizine": 120.00,
    "ciprofloxacin-500mg": 48.00,
    "diclofenac-50mg": 26.50,
    "ranitidine-150mg": 18.00,
}

# Official PMBJP (Jan Aushadhi) Subsidized Generic Prices in INR (per standard strip)
_JAN_AUSHADHI_PRICES: dict[str, dict[str, Any]] = {
    "paracetamol-650mg": {
        "price": 10.50,
        "generic_name": "Paracetamol Tablets IP 650 mg",
        "pack": "10 Tablets",
    },
    "paracetamol-500mg": {
        "price": 6.50,
        "generic_name": "Paracetamol Tablets IP 500 mg",
        "pack": "10 Tablets",
    },
    "paracetamol": {
        "price": 8.00,
        "generic_name": "Paracetamol Tablets IP",
        "pack": "10 Tablets",
    },
    "pantoprazole-40mg": {
        "price": 14.50,
        "generic_name": "Pantoprazole Gastro-resistant Tablets IP 40 mg",
        "pack": "10 Tablets",
    },
    "pantoprazole": {
        "price": 14.50,
        "generic_name": "Pantoprazole Tablets 40 mg",
        "pack": "10 Tablets",
    },
    "pantoprazole-domperidone": {
        "price": 22.00,
        "generic_name": "Pantoprazole and Domperidone SR Capsules",
        "pack": "10 Capsules",
    },
    "metformin-500mg": {
        "price": 7.50,
        "generic_name": "Metformin Hydrochloride Tablets IP 500 mg",
        "pack": "10 Tablets",
    },
    "metformin-850mg": {
        "price": 10.00,
        "generic_name": "Metformin Hydrochloride Tablets IP 850 mg",
        "pack": "10 Tablets",
    },
    "metformin-1000mg": {
        "price": 12.50,
        "generic_name": "Metformin Hydrochloride Prolonged-release 1000 mg",
        "pack": "10 Tablets",
    },
    "metformin": {
        "price": 8.50,
        "generic_name": "Metformin Hydrochloride Tablets IP",
        "pack": "10 Tablets",
    },
    "amlodipine-5mg": {
        "price": 5.50,
        "generic_name": "Amlodipine Tablets IP 5 mg",
        "pack": "10 Tablets",
    },
    "amlodipine-10mg": {
        "price": 9.00,
        "generic_name": "Amlodipine Tablets IP 10 mg",
        "pack": "10 Tablets",
    },
    "amlodipine": {
        "price": 6.00,
        "generic_name": "Amlodipine Tablets IP",
        "pack": "10 Tablets",
    },
    "aspirin-75mg": {
        "price": 5.00,
        "generic_name": "Aspirin Gastro-resistant Tablets IP 75 mg",
        "pack": "14 Tablets",
    },
    "aspirin-150mg": {
        "price": 8.00,
        "generic_name": "Aspirin Gastro-resistant Tablets IP 150 mg",
        "pack": "14 Tablets",
    },
    "aspirin": {
        "price": 6.00,
        "generic_name": "Aspirin Tablets IP",
        "pack": "14 Tablets",
    },
    "atorvastatin-10mg": {
        "price": 12.00,
        "generic_name": "Atorvastatin Tablets IP 10 mg",
        "pack": "10 Tablets",
    },
    "atorvastatin-20mg": {
        "price": 22.00,
        "generic_name": "Atorvastatin Tablets IP 20 mg",
        "pack": "10 Tablets",
    },
    "atorvastatin": {
        "price": 14.00,
        "generic_name": "Atorvastatin Tablets IP",
        "pack": "10 Tablets",
    },
    "azithromycin-500mg": {
        "price": 34.00,
        "generic_name": "Azithromycin Tablets IP 500 mg",
        "pack": "3 Tablets",
    },
    "azithromycin": {
        "price": 34.00,
        "generic_name": "Azithromycin Tablets IP",
        "pack": "3 Tablets",
    },
    "amoxicillin-clavulanic-acid-625mg": {
        "price": 58.00,
        "generic_name": "Amoxicillin and Potassium Clavulanate Tablets IP 625 mg",
        "pack": "6 Tablets",
    },
    "amoxicillin-clavulanic-acid": {
        "price": 58.00,
        "generic_name": "Amoxicillin and Potassium Clavulanate Tablets",
        "pack": "6 Tablets",
    },
    "telmisartan-40mg": {
        "price": 14.00,
        "generic_name": "Telmisartan Tablets IP 40 mg",
        "pack": "10 Tablets",
    },
    "telmisartan": {
        "price": 14.00,
        "generic_name": "Telmisartan Tablets IP",
        "pack": "10 Tablets",
    },
    "levothyroxine-100mcg": {
        "price": 75.00,
        "generic_name": "Levothyroxine Sodium Tablets IP 100 mcg",
        "pack": "100 Tablets",
    },
    "levothyroxine-50mcg": {
        "price": 60.00,
        "generic_name": "Levothyroxine Sodium Tablets IP 50 mcg",
        "pack": "100 Tablets",
    },
    "levothyroxine": {
        "price": 65.00,
        "generic_name": "Levothyroxine Sodium Tablets IP",
        "pack": "100 Tablets",
    },
    "ibuprofen-400mg": {
        "price": 7.00,
        "generic_name": "Ibuprofen Tablets IP 400 mg",
        "pack": "10 Tablets",
    },
    "ibuprofen": {
        "price": 7.00,
        "generic_name": "Ibuprofen Tablets IP",
        "pack": "10 Tablets",
    },
    "ibuprofen-paracetamol": {
        "price": 12.00,
        "generic_name": "Ibuprofen and Paracetamol Tablets",
        "pack": "10 Tablets",
    },
    "cetirizine-10mg": {
        "price": 4.50,
        "generic_name": "Cetirizine Hydrochloride Tablets IP 10 mg",
        "pack": "10 Tablets",
    },
    "cetirizine": {
        "price": 4.50,
        "generic_name": "Cetirizine Hydrochloride Tablets",
        "pack": "10 Tablets",
    },
    "montelukast-levocetirizine": {
        "price": 24.00,
        "generic_name": "Montelukast Sodium and Levocetirizine Tablets",
        "pack": "10 Tablets",
    },
}


def _norm_key(text: str) -> str:
    """Normalize text into clean hyphenated key for lookup: 'Paracetamol 650mg' -> 'paracetamol-650mg'."""
    t = text.lower().strip()
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


def _fetch_pharmeasy_live(query: str) -> dict[str, Any] | None:
    """Query PharmEasy's public catalog endpoint for live MRP, sale price and discounts.

    Cached for 24 hours in memory to ensure maximum speed and respect rate limits.
    """
    cache_key = _norm_key(query)
    now = time.time()
    if cache_key in _CACHE:
        val, ts = _CACHE[cache_key]
        if now - ts < _CACHE_TTL_SEC:
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
    # Keys for local regulatory and generic catalogs
    combo_key = _norm_key(f"{salt} {strength_str}")
    salt_key = _norm_key(salt or "")

    # ---------------------------------------------------------
    # Pillar 1: PharmEasy (Live Market Price)
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
    # Pillar 2: NPPA reference catalog ceiling price
    # ---------------------------------------------------------
    nppa_cap = _NPPA_CEILING_PRICES.get(combo_key) or _NPPA_CEILING_PRICES.get(salt_key)

    # ---------------------------------------------------------
    # Pillar 3: Jan Aushadhi reference catalog price
    # ---------------------------------------------------------
    ja_entry = _JAN_AUSHADHI_PRICES.get(combo_key) or _JAN_AUSHADHI_PRICES.get(salt_key)
    jan_aushadhi_price = ja_entry["price"] if ja_entry else None
    ja_generic_title = ja_entry["generic_name"] if ja_entry else None

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
            "url": "https://janaushadhi.gov.in/ProductList.aspx",
        })
    if nppa_cap is not None:
        offers.append({
            "platform": "NPPA Ceiling (Reference Catalog)",
            "price": nppa_cap,
            "mrp": nppa_cap,
            "currency": "INR",
            "badge": "Reference catalog",
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
