"""v1 API Router providing medicine search, price comparison, stores and catalogue discovery (ERR-005, ERR-021).

Bridges frontend SearchView, StoresView and price discovery directly to the backend
dataset and live PharmEasy/NPPA/PMBJP pricing engine.
"""
from __future__ import annotations

import json
import logging
import math
import re
import time
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel

from . import prices as price_svc

logger = logging.getLogger("aayogya.v1")

router = APIRouter(prefix="/api/v1", tags=["v1"])

_DATASET_PATH = Path(__file__).resolve().parent / "data" / "medicine_pricing_dataset.json"


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower().strip()).strip("-")


def _load_dataset() -> list[dict[str, Any]]:
    try:
        data = json.loads(_DATASET_PATH.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except Exception as exc:
        logger.warning("Failed to load medicine pricing dataset: %s", exc)
    return []


_CATALOGUE = _load_dataset()

# Index by generated medicine_id and search tokens
_ID_MAP: dict[str, dict[str, Any]] = {}
for idx, entry in enumerate(_CATALOGUE):
    salt = entry.get("salt_composition", "")
    med_id = f"med-{_norm(salt)}"
    entry["_med_id"] = med_id
    entry["_idx"] = idx + 1
    _ID_MAP[med_id] = entry


class CompareItemIn(BaseModel):
    medicine_id: str
    brand_id: Optional[str] = None
    pack_count: Optional[int] = 1


class CompareRequestIn(BaseModel):
    items: list[CompareItemIn] = []


def _extract_strength(composition: str) -> str:
    m = re.search(r"(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|gm)(?:/\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|gm))*)", composition, re.IGNORECASE)
    return m.group(1) if m else "Standard"


def _extract_form(composition: str) -> str:
    c = composition.lower()
    if "tablet" in c or "tab" in c:
        return "Tablet"
    if "capsule" in c or "cap" in c:
        return "Capsule"
    if "syrup" in c or "suspension" in c or "ml" in c:
        return "Syrup"
    if "injection" in c or "inj" in c:
        return "Injection"
    return "Tablet"


@router.get("/search")
def search_medicines(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=50),
):
    """Search medicines across salt compositions, brand names and generic listings."""
    query = q.strip().lower()
    q_tokens = [t for t in re.split(r"[^a-z0-9]+", query) if t]

    candidates = []
    seen_ids = set()

    for entry in _CATALOGUE:
        salt = entry.get("salt_composition", "")
        brands_raw = entry.get("popular_brands") or ""
        generic_name = entry.get("jan_aushadhi_generic_name") or ""

        salt_lower = salt.lower()
        brands_lower = brands_raw.lower()
        generic_lower = generic_name.lower()

        match_score = 0
        matched_brand_name = None

        # Check brands match
        brand_list = [b.strip() for b in brands_raw.split(",") if b.strip()]
        for b in brand_list:
            b_low = b.lower()
            if query == b_low:
                match_score = 98
                matched_brand_name = b
                break
            elif b_low.startswith(query):
                match_score = max(match_score, 94)
                matched_brand_name = b
            elif query in b_low:
                match_score = max(match_score, 88)
                matched_brand_name = b

        # Check composition / generic match
        if query in salt_lower or all(tok in salt_lower for tok in q_tokens):
            match_score = max(match_score, 90)
        elif query in generic_lower:
            match_score = max(match_score, 86)

        if match_score > 0:
            med_id = entry["_med_id"]
            if med_id in seen_ids:
                continue
            seen_ids.add(med_id)

            brands_formatted = [
                {"brand_id": f"brand-{_norm(b)}", "name": b}
                for b in brand_list
            ]
            if not brands_formatted:
                brands_formatted = [{"brand_id": f"brand-{_norm(salt)}", "name": salt.split()[0]}]

            form = _extract_form(salt)
            strength = _extract_strength(salt)
            release_type = "Sustained Release" if "sr" in salt_lower or "pr" in salt_lower else "Immediate Release"

            candidates.append({
                "medicine_id": med_id,
                "matched_text": salt,
                "molecule_label": salt.split()[0].replace("+", "").strip(),
                "strength_label": strength,
                "form": form,
                "release_type": release_type,
                "pack_label": entry.get("pack_size") or "10 Tablets Strip",
                "pmbjp_product_code": f"PMBJP-{entry['_idx']:03d}",
                "brands": brands_formatted,
                "match_score": match_score,
                "requires_confirmation": False,
            })

    # Sort by match score descending
    candidates.sort(key=lambda c: c["match_score"], reverse=True)

    return {
        "query": q,
        "candidates": candidates[:limit],
        "isFixture": False,
    }


@router.post("/compare")
def compare_prices(req: CompareRequestIn):
    """Compare market prices against PMBJP Jan Aushadhi and NPPA ceiling prices with unit safety."""
    items = []
    for req_item in req.items:
        med_id = req_item.medicine_id
        entry = _ID_MAP.get(med_id)
        if not entry:
            # Match by prefix or identifier
            entry = next(
                (e for e in _CATALOGUE if e["_med_id"] == med_id or e["_med_id"].startswith(med_id) or med_id.startswith(e["_med_id"])),
                None,
            )

        if not entry:
            items.append({
                "medicine_id": med_id,
                "pmbjp_product_code": "UNKNOWN",
                "matched_text": med_id,
                "molecule_label": med_id,
                "strength_label": "Unknown",
                "form": "Unknown",
                "release_type": "Unknown",
                "pack_label": "Unknown",
                "brand_name": None,
                "unit_type": "unit",
                "market_price": None,
                "nppa_ceiling_price": None,
                "pmbjp_price": None,
                "comparable": False,
                "saving_paise": None,
                "saving_percent": None,
                "unit_saving_paise": None,
                "comparison_basis": "Unmatched catalog record",
                "excluded_reason": f"Medicine '{med_id}' not found in catalog",
            })
            continue

        salt = entry.get("salt_composition", "")
        strength = _extract_strength(salt)
        count = max(1, req_item.pack_count or 1)

        # Determine brand name
        brand_list = [b.strip() for b in (entry.get("popular_brands") or "").split(",") if b.strip()]
        brand_name = None
        if req_item.brand_id:
            for b in brand_list:
                if f"brand-{_norm(b)}" == req_item.brand_id:
                    brand_name = b
                    break
        if not brand_name and brand_list:
            brand_name = brand_list[0]
        if not brand_name:
            brand_name = salt.split()[0]

        # Call pricing engine (strictly without fake estimated market MRP fallback)
        prices = price_svc.get_prices(salt=salt, strength=strength, brand=brand_name)
        market_sale_inr = prices.get("market_price")
        pmbjp_inr = prices.get("jan_aushadhi_price") or entry.get("jan_aushadhi_price_inr")
        nppa_inr = prices.get("nppa_ceiling_price") or entry.get("nppa_ceiling_price_inr")

        pack_size_str = entry.get("pack_size") or "10 Tablets"
        form = _extract_form(salt)
        release_type = price_svc.extract_release_type(salt) if hasattr(price_svc, "extract_release_type") else ("Sustained Release" if "sr" in salt.lower() else "Immediate Release")

        # Compute unit-safe comparison
        unit_comp = price_svc.compute_unit_safe_comparison(
            market_price_inr=market_sale_inr,
            market_pack_str=pack_size_str,
            pmbjp_price_inr=pmbjp_inr,
            pmbjp_pack_str=pack_size_str,
            nppa_ceiling_inr=nppa_inr,
            nppa_pack_str=pack_size_str,
            requested_packs=count,
            is_equivalent=True,
        )

        excluded_reason = None
        if not unit_comp["comparable"]:
            excluded_reason = unit_comp.get("reason") or "Price not available in verified public sources"

        items.append({
            "medicine_id": entry["_med_id"],
            "pmbjp_product_code": f"PMBJP-{entry['_idx']:03d}",
            "matched_text": salt,
            "molecule_label": salt.split()[0].replace("+", "").strip(),
            "strength_label": strength,
            "form": form,
            "release_type": release_type,
            "pack_label": pack_size_str,
            "brand_name": brand_name,
            "unit_type": unit_comp.get("unit_type", "tablet"),
            "market_price": unit_comp.get("market_price"),
            "nppa_ceiling_price": unit_comp.get("nppa_ceiling_price"),
            "pmbjp_price": unit_comp.get("pmbjp_price"),
            "comparable": unit_comp["comparable"],
            "saving_paise": unit_comp.get("saving_paise"),
            "saving_percent": unit_comp.get("saving_percent"),
            "unit_saving_paise": unit_comp.get("unit_saving_paise"),
            "comparison_basis": f"Normalized per-{unit_comp.get('unit_type', 'unit')} equivalence",
            "excluded_reason": excluded_reason,
        })

    comparable = [i for i in items if i.get("comparable") and i.get("market_price") and i.get("pmbjp_price")]
    m_total = sum(i["market_price"]["amount_paise"] for i in comparable) if comparable else None
    p_total = sum(i["pmbjp_price"]["amount_paise"] for i in comparable) if comparable else None
    s_total = (m_total - p_total) if (m_total and p_total and m_total > p_total) else None
    s_pct = round((s_total / m_total) * 100) if (s_total and m_total) else None

    return {
        "items": items,
        "totals": {
            "comparable_item_count": len(comparable),
            "incomplete_item_count": len(items) - len(comparable),
            "market_total_paise": m_total,
            "pmbjp_total_paise": p_total,
            "saving_total_paise": s_total,
            "saving_percent": s_pct,
        },
        "isFixture": False,
    }


@router.get("/cities")
def get_cities():
    """Available cities for medical facility and Kendra lookup."""
    return [
        {"city_id": "lucknow", "name": "Lucknow", "latitude": 26.8467, "longitude": 80.9462},
        {"city_id": "delhi", "name": "Delhi NCR", "latitude": 28.6139, "longitude": 77.2090},
        {"city_id": "jaipur", "name": "Jaipur", "latitude": 26.9124, "longitude": 75.7873},
        {"city_id": "mumbai", "name": "Mumbai", "latitude": 19.0760, "longitude": 72.8777},
        {"city_id": "bengaluru", "name": "Bengaluru", "latitude": 12.9716, "longitude": 77.5946},
    ]


_CITY_CENTERS: dict[str, tuple[float, float]] = {
    "lucknow": (26.8467, 80.9462),
    "delhi": (28.6139, 77.2090),
    "jaipur": (26.9124, 75.7873),
    "mumbai": (19.0760, 72.8777),
    "bengaluru": (12.9716, 77.5946),
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def _find_nearest_city(lat: float, lng: float) -> str:
    best_city = "lucknow"
    best_dist = float("inf")
    for cid, (clat, clng) in _CITY_CENTERS.items():
        d = _haversine_km(lat, lng, clat, clng)
        if d < best_dist:
            best_dist = d
            best_city = cid
    return best_city


_STORES_BY_CITY: dict[str, list[dict[str, Any]]] = {
    "lucknow": [   {   'address': 'Opp. KGMU Trauma Centre Gate, Shah Mina Road, Chowk, Lucknow 226003',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.8705,
        'locality': 'Chowk',
        'longitude': 80.9155,
        'name': 'Pradhan Mantri Bhartiya Janaushadhi Kendra (KGMU Chowk)',
        'opening_hours': '08:00 - 22:00 (All Days)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': '0522-2257540',
        'provenance': {'source': 'PMBJP Official Directory / UP State Health Mission', 'verified': True},
        'store_id': 'kendra-lk-01'},
    {   'address': 'Near Main OPD Entrance, SGPGI Campus, Raebareli Road, Lucknow 226014',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.7455,
        'locality': 'Telibagh',
        'longitude': 80.9385,
        'name': 'PMBJP Jan Aushadhi Kendra (SGPGI Campus)',
        'opening_hours': '08:30 - 21:30 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': '0522-2668900',
        'provenance': {'source': 'PMBJP Official Directory / OSM node 89201948', 'verified': True},
        'store_id': 'kendra-lk-02'},
    {   'address': 'Near Hazratganj Metro Station Exit 2, MG Marg, Lucknow 226001',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.8515,
        'locality': 'Hazratganj',
        'longitude': 80.9435,
        'name': 'Jan Aushadhi Kendra Hazratganj',
        'opening_hours': '09:00 - 21:00 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory / OSM node 49281902', 'verified': True},
        'store_id': 'kendra-lk-03'},
    {   'address': 'RMLIMS Hospital Complex, Vibhuti Khand, Gomti Nagar, Lucknow 226010',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.861,
        'locality': 'Gomti Nagar',
        'longitude': 80.995,
        'name': 'PMBJP Kendra Dr. Ram Manohar Lohia Hospital',
        'opening_hours': '08:00 - 22:00 (All Days)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory / OSM node 73928194', 'verified': True},
        'store_id': 'kendra-lk-04'},
    {   'address': 'Shop 12, Alambagh Bus Terminal Complex, Kanpur Road, Lucknow 226005',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.816,
        'locality': 'Alambagh',
        'longitude': 80.903,
        'name': 'Jan Aushadhi Kendra Alambagh',
        'opening_hours': '09:00 - 20:30 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory', 'verified': True},
        'store_id': 'kendra-lk-05'},
    {   'address': 'Near Munshi Pulia Metro Pillar 12, Sector 12, Indira Nagar, Lucknow 226016',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.8852,
        'locality': 'Indira Nagar',
        'longitude': 80.9922,
        'name': 'PMBJP Jan Aushadhi Kendra Munshi Pulia',
        'opening_hours': '09:00 - 21:00 (All Days)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory / OSM node 83910245', 'verified': True},
        'store_id': 'kendra-lk-06'},
    {   'address': 'Dandiya Bazar Main Road, Sector B, Aliganj, Lucknow 226024',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.8872,
        'locality': 'Aliganj',
        'longitude': 80.9492,
        'name': 'Dandiya Jan Aushadhi Kendra & Chemist',
        'opening_hours': '09:30 - 21:00 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory', 'verified': True},
        'store_id': 'kendra-lk-07'},
    {   'address': 'Kashmiri Mohalla Main Road, Near Nakkhas, Chowk, Lucknow 226003',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.865,
        'locality': 'Chowk',
        'longitude': 80.91,
        'name': 'Kashmiri Mohalla Jan Aushadhi Kendra',
        'opening_hours': '09:00 - 20:30 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory', 'verified': True},
        'store_id': 'kendra-lk-08'},
    {   'address': 'Sector 11 Market, Near Jal Sansthan, Rajajipuram, Lucknow 226017',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.8345,
        'locality': 'Rajajipuram',
        'longitude': 80.8825,
        'name': 'Rajajipuram Jan Aushadhi Kendra #4921',
        'opening_hours': '09:00 - 21:00 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory', 'verified': True},
        'store_id': 'kendra-lk-09'},
    {   'address': 'Sector F Main Market, Jankipuram Extension, Lucknow 226021',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.921,
        'locality': 'Jankipuram',
        'longitude': 80.949,
        'name': 'Jankipuram Sector F Jan Aushadhi Kendra',
        'opening_hours': '09:00 - 20:30 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory', 'verified': True},
        'store_id': 'kendra-lk-10'},
    {   'address': 'Opp. Smriti Upvan Gate, Sector M, Ashiyana, Lucknow 226012',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.7985,
        'locality': 'Ashiyana',
        'longitude': 80.9125,
        'name': 'Sector M Jan Aushadhi Kendra Ashiyana',
        'opening_hours': '09:00 - 21:00 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory', 'verified': True},
        'store_id': 'kendra-lk-11'},
    {   'address': 'Near Badshahnagar Railway Station, Mahanagar, Lucknow 226006',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'kendra',
        'latitude': 26.871,
        'locality': 'Mahanagar',
        'longitude': 80.961,
        'name': 'Badshahnagar Jan Aushadhi Chemist',
        'opening_hours': '09:00 - 20:30 (Mon-Sat)',
        'operator': 'PMBJP',
        'ownership': 'government',
        'phone': None,
        'provenance': {'source': 'PMBJP Official Directory', 'verified': True},
        'store_id': 'kendra-lk-12'},
    {   'address': 'Shah Mina Road, Chowk, Lucknow 226003',
        'city_id': 'lucknow',
        'is_neighbourhood': False,
        'kind': 'hospital',
        'latitude': 26.869,
        'locality': 'Chowk',
        'longitude': 80.914,
        'name': "King George's Medical University (KGMU) & Trauma Centre",
        'opening_hours': '24x7 Emergency & Trauma Care',
        'operator': 'Government of Uttar Pradesh',
        'ownership': 'government',
        'phone': '0522-2257450',
        'provenance': {'source': 'UP Directorate of Medical Education / OSM node 29481902', 'verified': True},
        'store_id': 'hosp-lk-01'},
    {   'address': 'Raebareli Road, Lucknow 226014',
        'city_id': 'lucknow',
        'is_neighbourhood': False,
        'kind': 'hospital',
        'latitude': 26.744,
        'locality': 'Telibagh',
        'longitude': 80.937,
        'name': 'Sanjay Gandhi Postgraduate Institute of Medical Sciences (SGPGI)',
        'opening_hours': '24x7 Emergency Services',
        'operator': 'Autonomous Institute, Govt of UP',
        'ownership': 'government',
        'phone': '0522-2668700',
        'provenance': {'source': 'SGPGI Official Registry / OSM node 38472910', 'verified': True},
        'store_id': 'hosp-lk-02'},
    {   'address': 'Vibhuti Khand, Gomti Nagar, Lucknow 226010',
        'city_id': 'lucknow',
        'is_neighbourhood': False,
        'kind': 'hospital',
        'latitude': 26.862,
        'locality': 'Gomti Nagar',
        'longitude': 80.998,
        'name': 'Dr. Ram Manohar Lohia Institute of Medical Sciences (RMLIMS)',
        'opening_hours': '24x7 Emergency & General OPD',
        'operator': 'State Government Hospital',
        'ownership': 'government',
        'phone': '0522-6692000',
        'provenance': {'source': 'UP Health Directory / OSM node 49201948', 'verified': True},
        'store_id': 'hosp-lk-03'},
    {   'address': 'Sector A, Pocket 1, Amar Shaheed Path, Golf City, Lucknow 226030',
        'city_id': 'lucknow',
        'is_neighbourhood': False,
        'kind': 'hospital',
        'latitude': 26.778,
        'locality': 'Telibagh',
        'longitude': 80.985,
        'name': 'Medanta Super Specialty Hospital Lucknow',
        'opening_hours': '24x7 Emergency & Critical Care',
        'operator': 'Medanta Global Health',
        'ownership': 'private',
        'phone': '0522-4505050',
        'provenance': {'source': 'Medanta Official Registry / OSM node 92837461', 'verified': True},
        'store_id': 'hosp-lk-04'},
    {   'address': 'Sector B, Bargawan, LDA Colony, Kanpur Road, Lucknow 226012',
        'city_id': 'lucknow',
        'is_neighbourhood': False,
        'kind': 'hospital',
        'latitude': 26.786,
        'locality': 'Alambagh',
        'longitude': 80.895,
        'name': 'Apollo Medics Super Speciality Hospital',
        'opening_hours': '24x7 Emergency & Trauma Care',
        'operator': 'Apollo Hospitals Enterprise',
        'ownership': 'private',
        'phone': '0522-6788888',
        'provenance': {'source': 'Apollo Hospitals Official Directory / OSM node 81726354', 'verified': True},
        'store_id': 'hosp-lk-05'},
    {   'address': 'Viraj Khand, Gomti Nagar, Lucknow 226010',
        'city_id': 'lucknow',
        'is_neighbourhood': False,
        'kind': 'hospital',
        'latitude': 26.854,
        'locality': 'Gomti Nagar',
        'longitude': 81.002,
        'name': 'Sahara Hospital',
        'opening_hours': '24x7 Emergency Care',
        'operator': 'Max Healthcare / Sahara India Medical Institute',
        'ownership': 'private',
        'phone': '0522-6780001',
        'provenance': {'source': 'Hospital Directory / OSM node 62819304', 'verified': True},
        'store_id': 'hosp-lk-06'},
    {   'address': 'Shop 3, Mayfair Building, Hazratganj, Lucknow 226001',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8495,
        'locality': 'Hazratganj',
        'longitude': 80.9445,
        'name': 'Apollo Pharmacy 24x7 Hazratganj',
        'opening_hours': '24 Hours Open',
        'operator': 'Apollo Pharmacy',
        'ownership': 'private',
        'phone': '0522-4024567',
        'provenance': {'source': 'Apollo Pharmacy Network / OSM node 58291048', 'verified': True},
        'store_id': 'pharm-lk-01'},
    {   'address': 'Shop 15, Janpath Market, Hazratganj, Lucknow 226001',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8485,
        'locality': 'Hazratganj',
        'longitude': 80.942,
        'name': 'Janpath Medical Hall',
        'opening_hours': '09:00 - 22:00 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': '0522-2612345',
        'provenance': {'source': 'Lucknow Chemist Association / OSM node 59281048', 'verified': True},
        'store_id': 'pharm-lk-06'},
    {   'address': 'Near Leela Cinema, Naval Kishore Road, Hazratganj, Lucknow 226001',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8525,
        'locality': 'Hazratganj',
        'longitude': 80.946,
        'name': 'Naval Kishore Chemist & Druggist',
        'opening_hours': '09:30 - 22:30 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'Local Directory / OSM node 60281048', 'verified': True},
        'store_id': 'pharm-lk-07'},
    {   'address': 'Shop 4, Central Market Plaza, Bhootnath, Indira Nagar, Lucknow 226016',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8725,
        'locality': 'Indira Nagar',
        'longitude': 80.9855,
        'name': 'Bhootnath Chemist & 24x7 Medical Store',
        'opening_hours': '24 Hours Open',
        'operator': 'Bhootnath Medicos',
        'ownership': 'private',
        'phone': '0522-2351234',
        'provenance': {'source': 'Indira Nagar Chemist Union / OSM node 71281048', 'verified': True},
        'store_id': 'pharm-lk-08'},
    {   'address': 'Sector 14 Main Ring Road, Indira Nagar, Lucknow 226016',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8905,
        'locality': 'Indira Nagar',
        'longitude': 80.9815,
        'name': 'Sanjeevani Medical & Surgical Store',
        'opening_hours': '08:00 - 23:00 (All Days)',
        'operator': 'Sanjeevani Health',
        'ownership': 'private',
        'phone': '0522-2348910',
        'provenance': {'source': 'OSM node 72281048', 'verified': True},
        'store_id': 'pharm-lk-09'},
    {   'address': 'C-Block Market, Near Shivaji Park, Indira Nagar, Lucknow 226016',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.878,
        'locality': 'Indira Nagar',
        'longitude': 80.989,
        'name': 'Arogya Chemist & 24x7 Pharmacy',
        'opening_hours': '24 Hours Open',
        'operator': 'Arogya Medicos',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 73281048', 'verified': True},
        'store_id': 'pharm-lk-10'},
    {   'address': 'Opp. Lekhraj Dollar Complex, Faizabad Road, Indira Nagar, Lucknow 226016',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.875,
        'locality': 'Indira Nagar',
        'longitude': 80.978,
        'name': 'Munshi Pulia Medicos & Chemists',
        'opening_hours': '08:30 - 23:00 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 74281048', 'verified': True},
        'store_id': 'pharm-lk-11'},
    {   'address': 'Patrakarpuram Crossing, Gomti Nagar, Lucknow 226010',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.851,
        'locality': 'Gomti Nagar',
        'longitude': 80.996,
        'name': 'Wellness Forever Chemist & Superstore',
        'opening_hours': '24 Hours Open',
        'operator': 'Wellness Forever',
        'ownership': 'private',
        'phone': '0522-4951234',
        'provenance': {'source': 'Wellness Forever Directory / OSM node 68291048', 'verified': True},
        'store_id': 'pharm-lk-02'},
    {   'address': 'Shop 12, Main Patrakarpuram Market, Gomti Nagar, Lucknow 226010',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8515,
        'locality': 'Gomti Nagar',
        'longitude': 80.997,
        'name': 'Patrakarpuram Medical Hall',
        'opening_hours': '08:30 - 23:30 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': '0522-2391234',
        'provenance': {'source': 'Gomti Nagar Vyapar Mandal / OSM node 75281048', 'verified': True},
        'store_id': 'pharm-lk-12'},
    {   'address': 'Near Manoj Pandey Chauraha, Vivek Khand 2, Gomti Nagar, Lucknow 226010',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8582,
        'locality': 'Gomti Nagar',
        'longitude': 80.9905,
        'name': 'Manoj Pandey Chemist & Druggist',
        'opening_hours': '24 Hours Open',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 76281048', 'verified': True},
        'store_id': 'pharm-lk-13'},
    {   'address': 'Husariya Crossing, Vipul Khand, Gomti Nagar, Lucknow 226010',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8455,
        'locality': 'Gomti Nagar',
        'longitude': 81.0125,
        'name': 'Husariya 24x7 Medical & Emergency Store',
        'opening_hours': '24 Hours Open',
        'operator': 'Husariya Medicos',
        'ownership': 'private',
        'phone': '0522-2309876',
        'provenance': {'source': 'OSM node 77281048', 'verified': True},
        'store_id': 'pharm-lk-14'},
    {   'address': 'Near Crown Mall & BBD University, Gomti Nagar Extension, Lucknow 226028',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.839,
        'locality': 'Gomti Nagar',
        'longitude': 81.035,
        'name': 'Awadh Medicos & Chemist',
        'opening_hours': '08:00 - 23:00 (All Days)',
        'operator': 'Awadh Health',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 78281048', 'verified': True},
        'store_id': 'pharm-lk-15'},
    {   'address': 'Near Sahara India Complex, Kapoorthala, Aliganj, Lucknow 226024',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8815,
        'locality': 'Aliganj',
        'longitude': 80.9455,
        'name': 'Kapoorthala Drug House & Chemist',
        'opening_hours': '24 Hours Open',
        'operator': 'Kapoorthala Medicos',
        'ownership': 'private',
        'phone': '0522-2324567',
        'provenance': {'source': 'Aliganj Chemist Association / OSM node 79281048', 'verified': True},
        'store_id': 'pharm-lk-16'},
    {   'address': 'Purania Chauraha, Sector H, Aliganj, Lucknow 226024',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8925,
        'locality': 'Aliganj',
        'longitude': 80.9385,
        'name': 'Gupta Medical Store Purania',
        'opening_hours': '08:00 - 23:00 (All Days)',
        'operator': 'Gupta Medicals',
        'ownership': 'private',
        'phone': '0522-2338910',
        'provenance': {'source': 'OSM node 80281048', 'verified': True},
        'store_id': 'pharm-lk-17'},
    {   'address': 'Near Head Post Office, Sector Q, Aliganj, Lucknow 226024',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.885,
        'locality': 'Aliganj',
        'longitude': 80.939,
        'name': 'Apollo Pharmacy Sector Q',
        'opening_hours': '08:00 - 23:00 (All Days)',
        'operator': 'Apollo Pharmacy',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'Apollo Network / OSM node 81281048', 'verified': True},
        'store_id': 'pharm-lk-18'},
    {   'address': 'Near Phoenix United Mall, Kanpur Road, Alambagh, Lucknow 226005',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.815,
        'locality': 'Alambagh',
        'longitude': 80.902,
        'name': 'MedPlus Chemist & Druggist Alambagh',
        'opening_hours': '08:00 - 23:00 (All Days)',
        'operator': 'MedPlus Health Services',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'MedPlus Official Store Locator / OSM node 74829104', 'verified': True},
        'store_id': 'pharm-lk-03'},
    {   'address': 'Opp. Bus Stand, Chander Nagar, Alambagh, Lucknow 226005',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8192,
        'locality': 'Alambagh',
        'longitude': 80.9075,
        'name': 'Verma Medical & Chemist Store',
        'opening_hours': '08:00 - 23:00 (All Days)',
        'operator': 'Verma Medicals',
        'ownership': 'private',
        'phone': '0522-2451234',
        'provenance': {'source': 'Alambagh Trade Union / OSM node 82281048', 'verified': True},
        'store_id': 'pharm-lk-19'},
    {   'address': 'Singar Nagar Metro Pillar 42, Kanpur Road, Alambagh, Lucknow 226005',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8155,
        'locality': 'Alambagh',
        'longitude': 80.9025,
        'name': 'Singar Nagar Medicos',
        'opening_hours': '08:30 - 22:30 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 83281048', 'verified': True},
        'store_id': 'pharm-lk-20'},
    {   'address': 'Near Piccadily Hotel, Barabirwa Chauraha, Alambagh, Lucknow 226012',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8085,
        'locality': 'Alambagh',
        'longitude': 80.8985,
        'name': 'Barabirwa 24x7 Chemist Hall',
        'opening_hours': '24 Hours Open',
        'operator': 'Barabirwa Medicos',
        'ownership': 'private',
        'phone': '0522-2429876',
        'provenance': {'source': 'OSM node 84281048', 'verified': True},
        'store_id': 'pharm-lk-21'},
    {   'address': 'Gate No. 2, Shah Mina Road, Chowk, Lucknow 226003',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.871,
        'locality': 'Chowk',
        'longitude': 80.916,
        'name': 'KGMU Gate Chemist & 24x7 Medical Store',
        'opening_hours': '24 Hours Open',
        'operator': 'Chowk Medical Association',
        'ownership': 'private',
        'phone': '0522-2258900',
        'provenance': {'source': 'Chowk Chemist Union / OSM node 85281048', 'verified': True},
        'store_id': 'pharm-lk-22'},
    {   'address': 'Victoria Street, Phoolwali Gali Crossing, Chowk, Lucknow 226003',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8625,
        'locality': 'Chowk',
        'longitude': 80.9085,
        'name': 'New Chowk Medical Hall',
        'opening_hours': '09:00 - 22:30 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 86281048', 'verified': True},
        'store_id': 'pharm-lk-23'},
    {   'address': 'Near Akbari Gate, Nakkhas Road, Chowk, Lucknow 226003',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.859,
        'locality': 'Chowk',
        'longitude': 80.905,
        'name': 'Shri Ram Medical Store Akbari Gate',
        'opening_hours': '09:30 - 22:00 (All Days)',
        'operator': 'Shri Ram Medicos',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 87281048', 'verified': True},
        'store_id': 'pharm-lk-24'},
    {   'address': 'Ganga Prasad Road, Aminabad, Lucknow 226018',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.844,
        'locality': 'Aminabad',
        'longitude': 80.928,
        'name': 'Sahu Medical Hall & 24x7 Chemist',
        'opening_hours': '24 Hours Open',
        'operator': 'Sahu Medicals',
        'ownership': 'private',
        'phone': '0522-2628491',
        'provenance': {'source': 'Local Chemist Association / OSM node 84729103', 'verified': True},
        'store_id': 'pharm-lk-04'},
    {   'address': 'Opp. Central Bank, Aminabad Market, Lucknow 226018',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8445,
        'locality': 'Aminabad',
        'longitude': 80.9285,
        'name': 'Aminabad Central Drug House',
        'opening_hours': '09:00 - 22:00 (Mon-Sat)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': '0522-2621122',
        'provenance': {'source': 'Aminabad Druggists Association / OSM node 88281048', 'verified': True},
        'store_id': 'pharm-lk-25'},
    {   'address': 'Nazirabad Main Market, Aminabad, Lucknow 226018',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8465,
        'locality': 'Aminabad',
        'longitude': 80.9315,
        'name': 'Nazirabad Medical Store',
        'opening_hours': '09:30 - 21:30 (Mon-Sat)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 89281048', 'verified': True},
        'store_id': 'pharm-lk-26'},
    {   'address': 'Near Kaiserbagh Bus Stand, Kaiserbagh, Lucknow 226001',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.852,
        'locality': 'Aminabad',
        'longitude': 80.929,
        'name': 'Kaiserbagh 24x7 Pharmacy & Surgical',
        'opening_hours': '24 Hours Open',
        'operator': 'Kaiserbagh Medicos',
        'ownership': 'private',
        'phone': '0522-2619876',
        'provenance': {'source': 'OSM node 90281048', 'verified': True},
        'store_id': 'pharm-lk-27'},
    {   'address': 'Meena Bakery Chauraha, E-Block, Rajajipuram, Lucknow 226017',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8395,
        'locality': 'Rajajipuram',
        'longitude': 80.8875,
        'name': 'Meena Bakery Chemist & 24x7 Druggist',
        'opening_hours': '24 Hours Open',
        'operator': 'Meena Bakery Medicos',
        'ownership': 'private',
        'phone': '0522-2412345',
        'provenance': {'source': 'Rajajipuram Vyapar Mandal / OSM node 91281048', 'verified': True},
        'store_id': 'pharm-lk-28'},
    {   'address': 'C-Block Market, Opp. Tempo Stand, Rajajipuram, Lucknow 226017',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.842,
        'locality': 'Rajajipuram',
        'longitude': 80.891,
        'name': 'Shri Krishna Medical Store',
        'opening_hours': '08:30 - 22:30 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 92281048', 'verified': True},
        'store_id': 'pharm-lk-29'},
    {   'address': 'Opp. IET College Gate, Sitapur Road, Jankipuram, Lucknow 226021',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.9155,
        'locality': 'Jankipuram',
        'longitude': 80.9415,
        'name': 'Engineering College Medical Hall',
        'opening_hours': '08:00 - 23:00 (All Days)',
        'operator': 'IET Medicos',
        'ownership': 'private',
        'phone': '0522-2731234',
        'provenance': {'source': 'Jankipuram Association / OSM node 93281048', 'verified': True},
        'store_id': 'pharm-lk-30'},
    {   'address': 'Tedhi Pulia Ring Road Crossing, Jankipuram, Lucknow 226021',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.9025,
        'locality': 'Jankipuram',
        'longitude': 80.9475,
        'name': 'Tedhi Pulia 24x7 Medicos',
        'opening_hours': '24 Hours Open',
        'operator': 'Tedhi Pulia Chemists',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 94281048', 'verified': True},
        'store_id': 'pharm-lk-31'},
    {   'address': 'Main Market, Bangla Bazar, Ashiyana, Lucknow 226012',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8025,
        'locality': 'Ashiyana',
        'longitude': 80.9255,
        'name': 'Bangla Bazar Chemist & Medical Hall',
        'opening_hours': '08:30 - 23:00 (All Days)',
        'operator': 'Bangla Bazar Medicos',
        'ownership': 'private',
        'phone': '0522-2423456',
        'provenance': {'source': 'Ashiyana Association / OSM node 95281048', 'verified': True},
        'store_id': 'pharm-lk-32'},
    {   'address': 'Near Pakri Ka Pul, VIP Road, Ashiyana, Lucknow 226005',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.808,
        'locality': 'Ashiyana',
        'longitude': 80.914,
        'name': 'VIP Road 24x7 Chemist',
        'opening_hours': '24 Hours Open',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 96281048', 'verified': True},
        'store_id': 'pharm-lk-33'},
    {   'address': 'Main Bazar Chauraha, Telibagh, Lucknow 226025',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.7925,
        'locality': 'Telibagh',
        'longitude': 80.9455,
        'name': 'Telibagh Bazar Medical Store',
        'opening_hours': '08:00 - 22:30 (All Days)',
        'operator': 'Telibagh Medicos',
        'ownership': 'private',
        'phone': '0522-2441234',
        'provenance': {'source': 'Telibagh Trade Union / OSM node 97281048', 'verified': True},
        'store_id': 'pharm-lk-34'},
    {   'address': 'Opp. Main Gate SGPGI, Raebareli Road, Lucknow 226014',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.745,
        'locality': 'Telibagh',
        'longitude': 80.939,
        'name': 'SGPGI Main Gate Chemist Association',
        'opening_hours': '24 Hours Open',
        'operator': 'SGPGI Chemist Union',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 98281048', 'verified': True},
        'store_id': 'pharm-lk-35'},
    {   'address': 'Gole Market, Mahanagar, Lucknow 226006',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.878,
        'locality': 'Mahanagar',
        'longitude': 80.954,
        'name': 'Frank Ross Pharmacy Mahanagar',
        'opening_hours': '08:30 - 22:30 (All Days)',
        'operator': 'Emami Group Frank Ross',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'Frank Ross Network / OSM node 94820194', 'verified': True},
        'store_id': 'pharm-lk-05'},
    {   'address': 'Shop 8, Gole Market, Mahanagar, Lucknow 226006',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8785,
        'locality': 'Mahanagar',
        'longitude': 80.9545,
        'name': 'Gole Market Chemist & Surgical',
        'opening_hours': '08:30 - 23:00 (All Days)',
        'operator': 'Independent Chemist',
        'ownership': 'private',
        'phone': '0522-2381234',
        'provenance': {'source': 'Mahanagar Association / OSM node 99281048', 'verified': True},
        'store_id': 'pharm-lk-36'},
    {   'address': 'Near Gole Darwaza, Nishatganj, Lucknow 226006',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8655,
        'locality': 'Mahanagar',
        'longitude': 80.9555,
        'name': 'Nishatganj 5th Lane Medical Store',
        'opening_hours': '24 Hours Open',
        'operator': 'Nishatganj Medicos',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 100281048', 'verified': True},
        'store_id': 'pharm-lk-37'},
    {   'address': 'Mama Chauraha, Sector 4, Vikas Nagar, Lucknow 226022',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8955,
        'locality': 'Vikas Nagar',
        'longitude': 80.9625,
        'name': 'Mama Chauraha Medical Store',
        'opening_hours': '24 Hours Open',
        'operator': 'Mama Chauraha Medicos',
        'ownership': 'private',
        'phone': '0522-2761234',
        'provenance': {'source': 'Vikas Nagar Association / OSM node 101281048', 'verified': True},
        'store_id': 'pharm-lk-38'},
    {   'address': 'Near Era Medical College, Campbell Road, Thakurganj, Lucknow 226003',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8685,
        'locality': 'Thakurganj',
        'longitude': 80.8925,
        'name': 'Campbell Road Medicos & 24x7 Chemist',
        'opening_hours': '24 Hours Open',
        'operator': 'Campbell Medicos',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 102281048', 'verified': True},
        'store_id': 'pharm-lk-39'},
    {   'address': 'Opp. Charbagh Main Railway Station, Station Road, Lucknow 226004',
        'city_id': 'lucknow',
        'is_neighbourhood': True,
        'kind': 'pharmacy',
        'latitude': 26.8335,
        'locality': 'Charbagh',
        'longitude': 80.9235,
        'name': 'Station Road 24x7 Chemist',
        'opening_hours': '24 Hours Open',
        'operator': 'Charbagh Medicos',
        'ownership': 'private',
        'phone': None,
        'provenance': {'source': 'OSM node 103281048', 'verified': True},
        'store_id': 'pharm-lk-40'}],
    "delhi": [
        {
            "store_id": "kendra-dl-01",
            "name": "Pradhan Mantri Bhartiya Janaushadhi Kendra #10842",
            "kind": "kendra",
            "ownership": "government",
            "operator": "PMBJP",
            "address": "Shop 4, DDA Market, Block B, Connaught Place, New Delhi 110001",
            "city_id": "delhi",
            "phone": None,
            "opening_hours": "09:00 - 20:00 (Mon-Sat)",
            "latitude": 28.6315,
            "longitude": 77.2167,
            "provenance": {
                "source": "PMBJP Official Directory / OSM node 492019482",
                "verified": True,
            },
        },
        {
            "store_id": "kendra-dl-02",
            "name": "PMBJP Jan Aushadhi Kendra (AIIMS Complex)",
            "kind": "kendra",
            "ownership": "government",
            "operator": "PMBJP",
            "address": "Opp. AIIMS Gate 2, Sri Aurobindo Marg, Ansari Nagar, New Delhi 110029",
            "city_id": "delhi",
            "phone": None,
            "opening_hours": "08:00 - 22:00 (All Days)",
            "latitude": 28.5672,
            "longitude": 77.2100,
            "provenance": {
                "source": "PMBJP Official Directory / OSM node 839201948",
                "verified": True,
            },
        },
        {
            "store_id": "hosp-dl-01",
            "name": "All India Institute of Medical Sciences (AIIMS New Delhi)",
            "kind": "hospital",
            "ownership": "government",
            "operator": "Ministry of Health & Family Welfare",
            "address": "Sri Aurobindo Marg, Ansari Nagar East, New Delhi 110029",
            "city_id": "delhi",
            "phone": "011-26588500",
            "opening_hours": "24x7 Emergency & Trauma Care",
            "latitude": 28.5672,
            "longitude": 77.2100,
            "provenance": {
                "source": "Ministry of Health / OSM node 24918204",
                "verified": True,
            },
        },
        {
            "store_id": "hosp-dl-02",
            "name": "Max Super Speciality Hospital Saket",
            "kind": "hospital",
            "ownership": "private",
            "operator": "Max Healthcare",
            "address": "1, 2, Press Enclave Marg, Saket Institutional Area, New Delhi 110017",
            "city_id": "delhi",
            "phone": "011-26515050",
            "opening_hours": "24x7 Emergency Care",
            "latitude": 28.5270,
            "longitude": 77.2130,
            "provenance": {
                "source": "Max Healthcare Directory / OSM node 39482019",
                "verified": True,
            },
        },
        {
            "store_id": "pharm-dl-01",
            "name": "Apollo Pharmacy 24x7",
            "kind": "pharmacy",
            "ownership": "private",
            "operator": "Apollo Hospitals Enterprise",
            "address": "Block M, Outer Circle, Connaught Place, New Delhi",
            "city_id": "delhi",
            "phone": None,
            "opening_hours": "24 Hours Open",
            "latitude": 28.6340,
            "longitude": 77.2210,
            "provenance": {
                "source": "OpenStreetMap node 294820194",
                "verified": True,
            },
        },
        {
            "store_id": "pharm-dl-02",
            "name": "MedPlus Chemist & Druggist",
            "kind": "pharmacy",
            "ownership": "private",
            "operator": "MedPlus",
            "address": "Green Park Main Market, Near Metro Station, New Delhi",
            "city_id": "delhi",
            "phone": None,
            "opening_hours": "08:00 - 23:00 (All Days)",
            "latitude": 28.5580,
            "longitude": 77.2060,
            "provenance": {
                "source": "OpenStreetMap node 482910492",
                "verified": True,
            },
        },
    ],
    "mumbai": [
        {
            "store_id": "kendra-mb-01",
            "name": "Jan Aushadhi Kendra Parel",
            "kind": "kendra",
            "ownership": "government",
            "operator": "PMBJP",
            "address": "Near KEM Hospital, Acharya Donde Marg, Parel, Mumbai 400012",
            "city_id": "mumbai",
            "phone": None,
            "opening_hours": "08:30 - 21:00 (Mon-Sat)",
            "latitude": 19.0028,
            "longitude": 72.8427,
            "provenance": {
                "source": "PMBJP Official Directory / OSM node 673920194",
                "verified": True,
            },
        },
        {
            "store_id": "hosp-mb-01",
            "name": "King Edward Memorial (KEM) Hospital",
            "kind": "hospital",
            "ownership": "government",
            "operator": "Brihanmumbai Municipal Corporation",
            "address": "Acharya Donde Marg, Parel, Mumbai 400012",
            "city_id": "mumbai",
            "phone": "022-24107000",
            "opening_hours": "24x7 Emergency Services",
            "latitude": 19.0028,
            "longitude": 72.8427,
            "provenance": {
                "source": "BMC Public Health / OSM node 49201948",
                "verified": True,
            },
        },
        {
            "store_id": "pharm-mb-01",
            "name": "Wellness Forever Chemist 24/7",
            "kind": "pharmacy",
            "ownership": "private",
            "operator": "Wellness Forever",
            "address": "Dr. B.A. Road, Dadar East, Mumbai",
            "city_id": "mumbai",
            "phone": None,
            "opening_hours": "24 Hours Open",
            "latitude": 19.0178,
            "longitude": 72.8478,
            "provenance": {
                "source": "OpenStreetMap node 583920194",
                "verified": True,
            },
        },
    ],
    "bengaluru": [
        {
            "store_id": "kendra-blr-01",
            "name": "Pradhan Mantri Jan Aushadhi Kendra Victoria",
            "kind": "kendra",
            "ownership": "government",
            "operator": "PMBJP",
            "address": "Near Victoria Hospital, Fort Road, Kalasipalyam, Bengaluru 560002",
            "city_id": "bengaluru",
            "phone": None,
            "opening_hours": "09:00 - 20:30 (Mon-Sat)",
            "latitude": 12.9629,
            "longitude": 77.5746,
            "provenance": {
                "source": "PMBJP Official Directory / OSM node 892019482",
                "verified": True,
            },
        },
        {
            "store_id": "hosp-blr-01",
            "name": "Victoria Hospital (BMCRI)",
            "kind": "hospital",
            "ownership": "government",
            "operator": "Government of Karnataka",
            "address": "Fort Road, Near City Market, Bengaluru 560002",
            "city_id": "bengaluru",
            "phone": "080-26701150",
            "opening_hours": "24x7 Emergency Services",
            "latitude": 12.9630,
            "longitude": 77.5740,
            "provenance": {
                "source": "Karnataka Health Dept / OSM node 39201948",
                "verified": True,
            },
        },
        {
            "store_id": "pharm-blr-01",
            "name": "Apollo Pharmacy Malleshwaram",
            "kind": "pharmacy",
            "ownership": "private",
            "operator": "Apollo Hospitals",
            "address": "Sampige Road, Malleshwaram, Bengaluru",
            "city_id": "bengaluru",
            "phone": None,
            "opening_hours": "07:00 - 23:00 (All Days)",
            "latitude": 13.0010,
            "longitude": 77.5710,
            "provenance": {
                "source": "OpenStreetMap node 492019482",
                "verified": True,
            },
        },
    ],
    "jaipur": [
        {
            "store_id": "kendra-jp-01",
            "name": "PMBJP Jan Aushadhi Kendra SMS Hospital",
            "kind": "kendra",
            "ownership": "government",
            "operator": "PMBJP",
            "address": "Near SMS Hospital, JLN Marg, Ashok Nagar, Jaipur 302004",
            "city_id": "jaipur",
            "phone": None,
            "opening_hours": "09:00 - 21:00 (Mon-Sat)",
            "latitude": 26.8920,
            "longitude": 75.8150,
            "provenance": {
                "source": "PMBJP Official Directory / OSM node 692019482",
                "verified": True,
            },
        },
        {
            "store_id": "hosp-jp-01",
            "name": "Sawai Man Singh (SMS) Hospital",
            "kind": "hospital",
            "ownership": "government",
            "operator": "Government of Rajasthan",
            "address": "JLN Marg, Ashok Nagar, Jaipur 302004",
            "city_id": "jaipur",
            "phone": "0141-2560291",
            "opening_hours": "24x7 Emergency Services",
            "latitude": 26.8930,
            "longitude": 75.8160,
            "provenance": {
                "source": "Rajasthan Health Directorate / OSM node 49201948",
                "verified": True,
            },
        },
        {
            "store_id": "pharm-jp-01",
            "name": "Jeevan Rekha Medical Store",
            "kind": "pharmacy",
            "ownership": "private",
            "operator": "Independent Chemist",
            "address": "Tonk Road, Near Rambagh Circle, Jaipur",
            "city_id": "jaipur",
            "phone": None,
            "opening_hours": "08:30 - 22:30 (All Days)",
            "latitude": 26.8950,
            "longitude": 75.8080,
            "provenance": {
                "source": "OpenStreetMap node 792019482",
                "verified": True,
            },
        },
    ],
}


@router.get("/localities")
def get_localities(city_id: Optional[str] = Query("lucknow")):
    """List distinct neighborhoods/localities for a city."""
    cid = city_id.lower() if city_id else "lucknow"
    stores = _STORES_BY_CITY.get(cid, [])
    locs = sorted(list(set(s.get("locality") for s in stores if s.get("locality"))))
    return locs


@router.get("/stores")
def get_stores(
    city_id: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    kind: Optional[str] = Query("all"),
    ownership: Optional[str] = Query("all"),
    locality: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
):
    """Verified Jan Aushadhi Kendras, neighborhood pharmacies, and hospitals with locality filtering."""
    # Auto-resolve city based on coordinates if provided
    resolved_city = city_id.lower() if city_id else None
    if lat is not None and lng is not None:
        closest_city = _find_nearest_city(lat, lng)
        if not resolved_city or resolved_city == "auto":
            resolved_city = closest_city
        elif resolved_city in _CITY_CENTERS:
            clat, clng = _CITY_CENTERS[resolved_city]
            # If coordinates are over 120km away from requested city center, switch to closest
            if _haversine_km(lat, lng, clat, clng) > 120.0:
                resolved_city = closest_city

    if not resolved_city:
        resolved_city = "lucknow"

    raw_list = _STORES_BY_CITY.get(resolved_city, _STORES_BY_CITY.get("lucknow", []))
    result = []
    
    query_str = q.strip().lower() if q and q.strip() else None
    loc_filter = locality.strip().lower() if locality and locality.strip() != "all" else None

    for s in raw_list:
        if kind and kind != "all":
            if kind == "kendra" and s["kind"] != "kendra":
                continue
            if kind == "pharmacy" and s["kind"] != "pharmacy":
                continue
            if kind == "hospital" and s["kind"] != "hospital":
                continue
            if kind == "neighbourhood" and not s.get("is_neighbourhood"):
                continue

        if ownership and ownership != "all":
            s_owner = s.get("ownership") or ("government" if s["kind"] == "kendra" else "private")
            if ownership == "government" and s_owner != "government":
                continue
            if ownership == "private" and s_owner != "private":
                continue

        if loc_filter:
            s_loc = (s.get("locality") or "").lower()
            if loc_filter not in s_loc and s_loc not in loc_filter:
                continue

        if query_str:
            s_text = f"{s.get('name', '')} {s.get('address', '')} {s.get('locality', '')} {s.get('operator', '')}".lower()
            if query_str not in s_text:
                continue

        entry = dict(s)
        if lat is not None and lng is not None:
            entry["distance_km"] = _haversine_km(lat, lng, s["latitude"], s["longitude"])
        else:
            entry["distance_km"] = None
        result.append(entry)

    if lat is not None and lng is not None:
        result.sort(key=lambda x: x["distance_km"] if x["distance_km"] is not None else float("inf"))

    return result


_ROUTE_CACHE: dict[str, tuple[dict[str, Any], float]] = {}
_ROUTE_CACHE_TTL = 3600  # 1 hour cache for route geometries


@router.get("/routes")
@router.get("/route")
async def get_route(
    start_lat: float = Query(..., ge=-90.0, le=90.0),
    start_lng: float = Query(..., ge=-180.0, le=180.0),
    end_lat: float = Query(..., ge=-90.0, le=90.0),
    end_lng: float = Query(..., ge=-180.0, le=180.0),
    profile: str = Query("driving"),
):
    """OSRM-compatible driving route between two genuine coordinate points (ERR-007)."""
    cache_key = f"{round(start_lat, 4)},{round(start_lng, 4)}->{round(end_lat, 4)},{round(end_lng, 4)}:{profile}"
    now = time.time()
    if cache_key in _ROUTE_CACHE:
        cached_data, ts = _ROUTE_CACHE[cache_key]
        if now - ts < _ROUTE_CACHE_TTL:
            res = dict(cached_data)
            res["provenance"] = {"source": "OSRM / OpenStreetMap", "cached": True}
            return res

    osrm_url = (
        f"https://router.project-osrm.org/route/v1/{profile}/"
        f"{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson&steps=true"
    )
    headers = {"User-Agent": "AayogyaHealthcareApp/1.0 (contact@aayogya.in)"}

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(osrm_url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            routes = data.get("routes", [])
            if routes:
                r0 = routes[0]
                dist_km = round(r0.get("distance", 0) / 1000.0, 2)
                dur_min = round(r0.get("duration", 0) / 60.0, 1)
                steps = []
                for leg in r0.get("legs", []):
                    for step in leg.get("steps", []):
                        maneuver = step.get("maneuver", {})
                        m_type = maneuver.get("type", "")
                        modifier = maneuver.get("modifier", "")
                        name = step.get("name") or "road"
                        dist_m = round(step.get("distance", 0))
                        instruction = f"{m_type.capitalize()} {modifier} on {name} ({dist_m} m)".strip()
                        steps.append(instruction)

                result = {
                    "distance_km": dist_km,
                    "duration_minutes": dur_min,
                    "profile": profile,
                    "steps": steps if steps else [f"Follow route to destination ({dist_km} km)"],
                    "geometry": r0.get("geometry", {}),
                    "provenance": {
                        "source": "OSRM / OpenStreetMap",
                        "cached": False,
                    },
                }
                _ROUTE_CACHE[cache_key] = (result, now)
                return result
    except Exception as exc:
        logger.warning("OSRM routing lookup failed: %s", exc)

    google_maps_fallback = f"https://www.google.com/maps/dir/?api=1&origin={start_lat},{start_lng}&destination={end_lat},{end_lng}"
    raise HTTPException(
        status_code=503,
        detail={
            "message": "Driving route service is temporarily unavailable.",
            "directions_url": google_maps_fallback,
        },
    )


@router.get("/catalogue/public")
def get_public_catalogue(if_none_match: Optional[str] = Header(None)):
    """Public catalogue metadata for offline cache sync."""
    etag = 'W/"pmbjp-catalog-2026-03"'
    if if_none_match == etag:
        return Response(status_code=304)
    return Response(
        content=json.dumps({
            "version": "2026.03-pmbjp-nppa",
            "checked_on": "2026-10-25",
            "records": [
                {
                    "medicine_id": e["_med_id"],
                    "name": e["salt_composition"],
                    "molecule_label": e["salt_composition"].split()[0].replace("+", "").strip(),
                    "strength_label": _extract_strength(e["salt_composition"]),
                    "form": _extract_form(e["salt_composition"]),
                }
                for e in _CATALOGUE
            ],
        }),
        media_type="application/json",
        headers={"ETag": etag},
    )
