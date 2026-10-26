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


def parse_pack_units(pack_str: str | None) -> tuple[int, str]:
    """Parse pack string into (quantity, unit_name)."""
    if not pack_str:
        return (10, "tablet")
    s = pack_str.lower().strip()
    m_vol = re.search(r"(\d+(?:\.\d+)?)\s*ml\b", s)
    if m_vol:
        return (int(float(m_vol.group(1))), "ml")
    m_count = re.search(r"(\d+)\s*(tablet|tab|capsule|cap|vial|injection|inj|pill)", s)
    if m_count:
        qty = int(m_count.group(1))
        u = m_count.group(2)
        if u.startswith("tab") or u == "pill":
            unit = "tablet"
        elif u.startswith("cap"):
            unit = "capsule"
        elif u.startswith("inj"):
            unit = "injection"
        else:
            unit = u
        return (qty, unit)
    m_num = re.search(r"^(\d+)", s)
    if m_num:
        return (int(m_num.group(1)), "tablet")
    return (10, "tablet")


def extract_form(composition: str) -> str:
    c = composition.lower()
    if any(k in c for k in ["syrup", "suspension", "liquid", "oral solution", "ml"]):
        return "Syrup"
    if "capsule" in c or "cap" in c:
        return "Capsule"
    if any(k in c for k in ["injection", "inj", "vial", "ampoule"]):
        return "Injection"
    return "Tablet"


def extract_release_type(composition: str) -> str:
    c = composition.lower()
    if any(r in c for r in ["sustained release", "extended release", "controlled release", "sr", "er", "cr", "pr", "xr"]):
        return "Sustained Release"
    return "Immediate Release"


def parse_ingredients(composition: str) -> list[tuple[str, str]]:
    cleaned = re.sub(r"\b(tablets?|capsules?|syrups?|injections?|ip|bp|usp)\b", "", composition, flags=re.IGNORECASE).strip()
    parts = [p.strip() for p in cleaned.split("+") if p.strip()]
    results = []
    for part in parts:
        m = re.search(r"^(.*?)\s*(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|gm|iu|units?))(?:\b|$)", part, re.IGNORECASE)
        if m:
            name = m.group(1).strip().lower()
            strength = m.group(2).strip().lower().replace(" ", "")
            results.append((name, strength))
        else:
            name = part.strip().lower()
            results.append((name, "standard"))
    return results


def is_formulation_equivalent(
    comp_a: str,
    comp_b: str,
    form_a: str | None = None,
    form_b: str | None = None,
    release_a: str | None = None,
    release_b: str | None = None,
) -> tuple[bool, str | None]:
    fa = form_a or extract_form(comp_a)
    fb = form_b or extract_form(comp_b)
    if fa != fb:
        return False, f"Incomparable dosage forms: {fa} cannot be compared with {fb}"

    ra = release_a or extract_release_type(comp_a)
    rb = release_b or extract_release_type(comp_b)
    if ra != rb:
        return False, f"Release profile mismatch: {ra} cannot be substituted with {rb}"

    ing_a = parse_ingredients(comp_a)
    ing_b = parse_ingredients(comp_b)

    if len(ing_a) != len(ing_b):
        return False, f"Active ingredient count mismatch: {len(ing_a)} vs {len(ing_b)} components"

    names_a = sorted(a[0] for a in ing_a)
    names_b = sorted(b[0] for b in ing_b)
    for na, nb in zip(names_a, names_b):
        if not (na in nb or nb in na):
            return False, f"Molecule mismatch: '{na}' does not match '{nb}'"

    return True, None


def compute_unit_safe_comparison(
    market_price_inr: float | None,
    market_pack_str: str | None,
    pmbjp_price_inr: float | None,
    pmbjp_pack_str: str | None,
    nppa_ceiling_inr: float | None = None,
    nppa_pack_str: str | None = None,
    requested_packs: int = 1,
    is_equivalent: bool = True,
    equivalence_reason: str | None = None,
) -> dict[str, Any]:
    """Compute unit-normalized price comparison between market, Jan Aushadhi, and NPPA cap."""
    requested_packs = max(1, requested_packs)
    market_qty, market_unit = parse_pack_units(market_pack_str)
    pmbjp_qty, pmbjp_unit = parse_pack_units(pmbjp_pack_str)

    if not is_equivalent:
        return {
            "comparable": False,
            "reason": equivalence_reason or "Formulation mismatch: cannot safely compare",
            "unit_type": pmbjp_unit,
            "market_price": None,
            "pmbjp_price": None,
            "nppa_ceiling_price": None,
            "saving_paise": None,
            "saving_percent": None,
            "unit_saving_paise": None,
        }

    if market_unit != pmbjp_unit:
        return {
            "comparable": False,
            "reason": f"Unit mismatch: market is {market_unit} vs Jan Aushadhi is {pmbjp_unit}",
            "unit_type": pmbjp_unit,
            "market_price": None,
            "pmbjp_price": None,
            "nppa_ceiling_price": None,
            "saving_paise": None,
            "saving_percent": None,
            "unit_saving_paise": None,
        }

    # Normalized unit prices in INR and Paise
    total_requested_units = requested_packs * pmbjp_qty

    market_data = None
    market_unit_price = None
    if market_price_inr is not None and market_qty > 0:
        market_unit_price = market_price_inr / market_qty
        market_cost_inr = round(total_requested_units * market_unit_price, 2)
        market_data = {
            "amount_paise": round(market_cost_inr * 100),
            "amount_inr": market_cost_inr,
            "unit_price_inr": round(market_unit_price, 4),
            "unit_price_paise": round(market_unit_price * 100, 2),
            "unit": f"{total_requested_units} {pmbjp_unit}s ({requested_packs} pack)" if requested_packs == 1 else f"{total_requested_units} {pmbjp_unit}s ({requested_packs} packs)",
            "source_url": "https://pharmeasy.in",
            "checked_on": "2026-10-26",
        }

    pmbjp_data = None
    pmbjp_unit_price = None
    if pmbjp_price_inr is not None and pmbjp_qty > 0:
        pmbjp_unit_price = pmbjp_price_inr / pmbjp_qty
        pmbjp_cost_inr = round(total_requested_units * pmbjp_unit_price, 2)
        pmbjp_data = {
            "amount_paise": round(pmbjp_cost_inr * 100),
            "amount_inr": pmbjp_cost_inr,
            "unit_price_inr": round(pmbjp_unit_price, 4),
            "unit_price_paise": round(pmbjp_unit_price * 100, 2),
            "unit": f"{total_requested_units} {pmbjp_unit}s ({requested_packs} pack)" if requested_packs == 1 else f"{total_requested_units} {pmbjp_unit}s ({requested_packs} packs)",
            "source_url": "https://janaushadhi.gov.in/product-portfolio/product-view-list",
            "checked_on": "2026-10-26",
        }

    nppa_data = None
    if nppa_ceiling_inr is not None:
        n_qty, _ = parse_pack_units(nppa_pack_str or pmbjp_pack_str)
        n_unit_price = nppa_ceiling_inr / n_qty
        nppa_cost_inr = round(total_requested_units * n_unit_price, 2)
        nppa_data = {
            "amount_paise": round(nppa_cost_inr * 100),
            "amount_inr": nppa_cost_inr,
            "unit_price_inr": round(n_unit_price, 4),
            "unit_price_paise": round(n_unit_price * 100, 2),
            "unit": f"{total_requested_units} {pmbjp_unit}s",
            "regulation": "DPCO 2013 Statutory Ceiling",
            "source_url": "https://nppa.gov.in/en/view_more?id=4",
            "checked_on": "2026-10-26",
        }

    # Savings calculation strictly requires BOTH market and Jan Aushadhi
    saving_paise = None
    saving_percent = None
    unit_saving_paise = None
    is_comparable = bool(market_data and pmbjp_data)

    if is_comparable and market_unit_price and pmbjp_unit_price:
        if market_unit_price > pmbjp_unit_price:
            saving_inr = round((market_unit_price - pmbjp_unit_price) * total_requested_units, 2)
            saving_paise = round(saving_inr * 100)
            saving_percent = round(((market_unit_price - pmbjp_unit_price) / market_unit_price) * 100)
            unit_saving_paise = round((market_unit_price - pmbjp_unit_price) * 100, 2)

    return {
        "comparable": is_comparable,
        "reason": None if is_comparable else ("Market retail price unavailable from verified source" if not market_data else "Jan Aushadhi generic price not available"),
        "unit_type": pmbjp_unit,
        "market_price": market_data,
        "pmbjp_price": pmbjp_data,
        "nppa_ceiling_price": nppa_data,
        "saving_paise": saving_paise,
        "saving_percent": saving_percent,
        "unit_saving_paise": unit_saving_paise,
    }


def get_prices(
    salt: str | None,
    strength: str | None,
    brand: str | None = None,
) -> dict:
    """Return live market prices and explicitly listed reference catalog values with unit safety."""
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
            "url": "https://janaushadhi.gov.in/product-portfolio/product-view-list",
        })
    if nppa_cap is not None:
        offers.append({
            "platform": "NPPA Ceiling (Reference Catalog)",
            "price": nppa_cap,
            "mrp": nppa_cap,
            "currency": "INR",
            "badge": "Reference catalog",
            "pack_size": pack_size,
            "url": "https://nppa.gov.in/en/view_more?id=4",
        })

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
        "nppa_details": {
            "ceiling_price_inr": nppa_cap,
            "currency": "INR",
            "regulation": "DPCO 2013 Ceiling Order",
            "source_url": "https://nppa.gov.in/en/view_more?id=4",
            "checked_on": "2026-10-26",
        } if nppa_cap is not None else None,
        "jan_aushadhi_price": jan_aushadhi_price,
        "max_savings_percent": savings_pct,
        "max_savings_amount": savings_amt,
        "offers": offers,
    }
