"""Agent 3: Indian Drug Knowledge Graph & Fuzzy Matcher.

Maps raw OCR / VLM handwritten brand readings to standardized generic salts,
pharmaceutical forms, and clinical drug categories.
Features:
- High-coverage catalog loaded from app/data/indian_medicines.json (~100+ major Indian brands & salts)
- Suffix reasoning engine (-D, -H, -AM, -GP, -SP, -LC, -Forte, -SR, -XL)
- Fuzzy string matching (difflib SequenceMatcher) tolerance for misspelled or partial cursive handwriting
- Dual-tier confidence matching: exact match vs suggested match for Human-in-the-Loop review.
"""
from __future__ import annotations

import difflib
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("aayogya.catalog")

# Base fallback catalog in case JSON file is inaccessible
_FALLBACK_CATALOG: dict[str, dict[str, Any]] = {
    "dolo": {"salt": "Paracetamol", "form": "tablet", "category": "Antipyretic / Analgesic"},
    "crocin": {"salt": "Paracetamol", "form": "tablet", "category": "Antipyretic / Analgesic"},
    "calpol": {"salt": "Paracetamol", "form": "tablet", "category": "Antipyretic / Analgesic"},
    "pan": {"salt": "Pantoprazole", "form": "tablet", "category": "PPI / Antacid"},
    "pantop": {"salt": "Pantoprazole", "form": "tablet", "category": "PPI / Antacid"},
    "pantocid": {"salt": "Pantoprazole", "form": "tablet", "category": "PPI / Antacid"},
    "pan-d": {"salt": "Pantoprazole + Domperidone", "form": "capsule", "category": "PPI + Prokinetic"},
    "pantocid-dsr": {"salt": "Pantoprazole + Domperidone", "form": "capsule", "category": "PPI + Prokinetic"},
    "digene": {"salt": "Magnesium Hydroxide + Aluminium Hydroxide + Simethicone", "form": "syrup", "category": "Antacid"},
    "gelusil": {"salt": "Aluminium Hydroxide + Magnesium Hydroxide", "form": "syrup", "category": "Antacid"},
    "augmentin": {"salt": "Amoxicillin + Potassium Clavulanate", "form": "tablet", "category": "Antibiotic"},
    "moxikind-cv": {"salt": "Amoxicillin + Potassium Clavulanate", "form": "tablet", "category": "Antibiotic"},
    "azithral": {"salt": "Azithromycin", "form": "tablet", "category": "Antibiotic"},
    "cifran": {"salt": "Ciprofloxacin", "form": "tablet", "category": "Antibiotic"},
    "taxim-o": {"salt": "Cefixime", "form": "tablet", "category": "Antibiotic"},
    "zifi": {"salt": "Cefixime", "form": "tablet", "category": "Antibiotic"},
    "glycomet": {"salt": "Metformin", "form": "tablet", "category": "Antidiabetic"},
    "glycomet-gp": {"salt": "Metformin + Glimepiride", "form": "tablet", "category": "Antidiabetic Combination"},
    "janumet": {"salt": "Sitagliptin + Metformin", "form": "tablet", "category": "Antidiabetic Combination"},
    "amlong": {"salt": "Amlodipine", "form": "tablet", "category": "Antihypertensive"},
    "amlong-a": {"salt": "Amlodipine + Atenolol", "form": "tablet", "category": "Antihypertensive Combination"},
    "telma": {"salt": "Telmisartan", "form": "tablet", "category": "Antihypertensive"},
    "telma-h": {"salt": "Telmisartan + Hydrochlorothiazide", "form": "tablet", "category": "Antihypertensive Combination"},
    "telma-am": {"salt": "Telmisartan + Amlodipine", "form": "tablet", "category": "Antihypertensive Combination"},
    "ecosprin": {"salt": "Aspirin", "form": "tablet", "category": "Antiplatelet"},
    "atorva": {"salt": "Atorvastatin", "form": "tablet", "category": "Lipid Lowering"},
    "rosuvas": {"salt": "Rosuvastatin", "form": "tablet", "category": "Lipid Lowering"},
    "brufen": {"salt": "Ibuprofen", "form": "tablet", "category": "NSAID"},
    "combiflam": {"salt": "Ibuprofen + Paracetamol", "form": "tablet", "category": "NSAID Combination"},
    "zerodol": {"salt": "Aceclofenac", "form": "tablet", "category": "NSAID"},
    "zerodol-p": {"salt": "Aceclofenac + Paracetamol", "form": "tablet", "category": "NSAID Combination"},
    "zerodol-sp": {"salt": "Aceclofenac + Paracetamol + Serratiopeptidase", "form": "tablet", "category": "NSAID Combination"},
    "voveran": {"salt": "Diclofenac Sodium", "form": "tablet", "category": "NSAID"},
    "montair-lc": {"salt": "Montelukast + Levocetirizine", "form": "tablet", "category": "Antiasthmatic"},
    "allegra": {"salt": "Fexofenadine", "form": "tablet", "category": "Antihistamine"},
    "thyronorm": {"salt": "Levothyroxine", "form": "tablet", "category": "Thyroid Hormone"},
    "shelcal": {"salt": "Calcium + Vitamin D3", "form": "tablet", "category": "Supplement"},
    "becosules": {"salt": "Vitamin B-Complex + Vitamin C", "form": "capsule", "category": "Multivitamin"},
    "neurobion-forte": {"salt": "Vitamin B1 + B2 + B3 + B5 + B6 + B12", "form": "tablet", "category": "Supplement"},
}

# Common Indian brand suffix clinical rules
_SUFFIX_SALT_MODIFIERS: dict[str, str] = {
    "-d": " + Domperidone",
    "-dsr": " + Domperidone",
    "-h": " + Hydrochlorothiazide",
    "-am": " + Amlodipine",
    "-a": " + Atenolol",
    "-gp": " + Glimepiride",
    "-sp": " + Serratiopeptidase",
    "-p": " + Paracetamol",
    "-lc": " + Levocetirizine",
    "-av": " + Atorvastatin",
}


def _load_catalog() -> dict[str, dict[str, Any]]:
    """Load the expanded Indian medicines catalog from JSON file."""
    catalog = dict(_FALLBACK_CATALOG)
    data_path = Path(__file__).resolve().parent / "data" / "indian_medicines.json"
    if data_path.exists():
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    catalog.update(loaded)
                    logger.info(f"Loaded {len(catalog)} Indian medicines into catalog knowledge base.")
        except Exception as exc:
            logger.warning(f"Error loading {data_path}: {exc}. Using fallback catalog.")
    return catalog


_CATALOG: dict[str, dict[str, Any]] = _load_catalog()


def _normalize(brand: str) -> str:
    """Normalize brand name for lookup:
    'Dolo-650' -> 'dolo'
    'Pan - D 40mg' -> 'pan-d'
    'Augmentin 625 DUO' -> 'augmentin'
    'Telma H 40' -> 'telma-h'
    """
    b = brand.strip().lower()
    # Remove forms like tab, cap, syp, inj
    b = re.sub(r"\b(tab|tablets?|caps?|capsules?|syp|syrup|inj|injection|drops)\b", "", b)
    # Remove strength numbers e.g. 650mg, 40/12.5, 500, etc.
    b = re.sub(r"\b\d+([./]\d+)*\s*(mg|mcg|ml|gm?|iu|units?)?\b", "", b)
    # Remove descriptor noise (Duo, Forte, SR, PR, XL, ER, Plus)
    b = re.sub(r"\b(duo|forte|plus)\b", "", b)
    b = re.sub(r"[^a-z\-\s]", "", b).strip()
    b = re.sub(r"\s+", "-", b).strip("-")
    return b


def _similarity(s1: str, s2: str) -> float:
    """Compute normalized Gestalt pattern matching similarity (0.0 to 1.0)."""
    return difflib.SequenceMatcher(None, s1, s2).ratio()


def lookup(brand: str) -> dict[str, Any] | None:
    """Intelligent multi-tier drug lookup:
    1. Exact match on normalized brand
    2. Suffix-decomposed match (e.g. pan-d -> pan + Domperidone)
    3. Fuzzy string matching against 100+ Indian catalog entries (tolerates handwriting misspellings)
    Returns:
        {"salt": str, "form": str, "canonical_brand": str, "match_type": str, "confidence": float}
        or None on total miss.
    """
    if not brand:
        return None

    norm = _normalize(brand)
    if not norm:
        return None

    # Tier 1: Exact Match
    if norm in _CATALOG:
        entry = _CATALOG[norm]
        return {
            "salt": entry["salt"],
            "form": entry.get("form", "tablet"),
            "category": entry.get("category"),
            "canonical_brand": norm,
            "match_type": "exact",
            "confidence": 1.0,
        }

    # Tier 2: Strip trailing release modifier (-sr, -pr, -xl, -er)
    clean_stem = re.sub(r"-(sr|pr|xl|er)$", "", norm)
    if clean_stem in _CATALOG:
        entry = _CATALOG[clean_stem]
        return {
            "salt": entry["salt"],
            "form": entry.get("form", "tablet"),
            "category": entry.get("category"),
            "canonical_brand": clean_stem,
            "match_type": "stem_exact",
            "confidence": 0.95,
        }

    # Tier 3: Suffix Awareness (-d, -h, -am, -gp, -sp)
    for suffix, salt_addon in _SUFFIX_SALT_MODIFIERS.items():
        if norm.endswith(suffix):
            root = norm[: -len(suffix)].strip("-")
            if root in _CATALOG:
                base_entry = _CATALOG[root]
                combined_salt = base_entry["salt"] + salt_addon
                return {
                    "salt": combined_salt,
                    "form": base_entry.get("form", "tablet"),
                    "category": base_entry.get("category"),
                    "canonical_brand": f"{root}{suffix}",
                    "match_type": "suffix_inferred",
                    "confidence": 0.90,
                }

    # Tier 4: Fuzzy Match (difflib SequenceMatcher across all catalog keys)
    # Handles cursive handwriting OCR errors: 'Agmntn' -> 'augmentin', 'Dlo' -> 'dolo'
    all_keys = list(_CATALOG.keys())
    closest_matches = difflib.get_close_matches(norm, all_keys, n=1, cutoff=0.72)
    if closest_matches:
        best_match_key = closest_matches[0]
        score = _similarity(norm, best_match_key)
        entry = _CATALOG[best_match_key]
        logger.info(
            f"Agent 3 (Fuzzy Matcher): '{brand}' (norm: '{norm}') fuzzy-matched to '{best_match_key}' (score: {score:.2f})"
        )
        return {
            "salt": entry["salt"],
            "form": entry.get("form", "tablet"),
            "category": entry.get("category"),
            "canonical_brand": best_match_key,
            "match_type": "fuzzy",
            "confidence": round(score, 2),
        }

    # Tier 5: First token fallback (e.g. 'augmentin-625-tablets' -> 'augmentin')
    head = norm.split("-")[0]
    if head in _CATALOG and len(head) >= 3:
        entry = _CATALOG[head]
        return {
            "salt": entry["salt"],
            "form": entry.get("form", "tablet"),
            "category": entry.get("category"),
            "canonical_brand": head,
            "match_type": "prefix_head",
            "confidence": 0.85,
        }

    return None
