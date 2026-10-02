"""Composite extraction-confidence (0-1) for a medicine read off a (often
handwritten) prescription. The point: give the user a number they can TRUST —
"confidence high => the image was read correctly."

A VLM's OWN self-reported confidence is weak and poorly calibrated on handwriting
(a model misreads a scrawled brand just as confidently as a clear one), so we do
NOT show it raw. We blend it with signals grounded OUTSIDE the model:
  - catalog:  we have a salt (model-given or catalog-resolved). A total miss
              (needs_salt_confirmation) is the weakest state -> penalised. Weighted
              highest because it's the least model-dependent signal.
  - dosage:   "1-0-1"/"BD" that the parser actually understood = a clean read.
  - strength: a strength was captured.

Below LOW_CONFIDENCE the field should be routed to human confirmation.

ponytail: the weights are a fixed heuristic, not a fitted model. If you ever
collect labelled read/mis-read data, fit these weights (or a small logistic model)
on it — the signal structure stays, only the constants change. Also: once the real
253k-row catalog replaces the demo stub, cross-checking a model-given salt against
the catalog (not just "is it present") makes the catalog signal much stronger.
"""
from __future__ import annotations

# Weights sum to 1.0. Catalog highest (model-independent), model self-report lowest.
_W_MODEL, _W_CATALOG, _W_DOSAGE, _W_STRENGTH = 0.30, 0.40, 0.20, 0.10

LOW_CONFIDENCE = 0.5  # below this (or on a catalog miss) -> human confirmation


def _clamp(x: float | None) -> float:
    if x is None:
        return 0.0
    return max(0.0, min(1.0, float(x)))


def score(
    *,
    model_conf: float | None,
    catalog_hit: bool,
    dosage_scheduled: bool,
    has_notation: bool,
    has_strength: bool,
) -> float:
    """Blend the four signals into a 0-1 composite. All args are primitives so
    both the sync extractor and the LangGraph nodes (which carry dicts) can call it."""
    s_model = _clamp(model_conf)
    s_catalog = 1.0 if catalog_hit else 0.35
    s_dosage = 1.0 if dosage_scheduled else (0.5 if has_notation else 0.3)
    s_strength = 1.0 if has_strength else 0.6
    composite = (
        _W_MODEL * s_model
        + _W_CATALOG * s_catalog
        + _W_DOSAGE * s_dosage
        + _W_STRENGTH * s_strength
    )
    return round(composite, 2)


def needs_review(conf: float, catalog_miss: bool) -> bool:
    """A field the UI should ask the human to confirm: low composite OR no salt."""
    return conf < LOW_CONFIDENCE or catalog_miss
