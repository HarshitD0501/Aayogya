"""Batch 6B regression tests — Genuine facility lookup, location, routing, and map reliability (ERR-007, ERR-024, ERR-030).
"""
from __future__ import annotations

import math
from pathlib import Path
import sys
from unittest.mock import patch, MagicMock, AsyncMock

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.v1_router import _haversine_km, _ROUTE_CACHE


client = TestClient(app)


def test_haversine_calculation():
    """Verify haversine distance calculation accuracy."""
    # Delhi Connaught Place (28.6315, 77.2167) to India Gate (28.6129, 77.2295)
    dist = _haversine_km(28.6315, 77.2167, 28.6129, 77.2295)
    # Expected distance is ~2.4 km
    assert 2.0 <= dist <= 2.8


def test_stores_listing_structure_and_provenance():
    """ERR-007: /api/v1/stores returns genuine facilities with provenance tags and no synthetic phone numbers."""
    r = client.get("/api/v1/stores?city_id=delhi")
    assert r.status_code == 200
    stores = r.json()
    assert len(stores) >= 2

    for store in stores:
        assert "store_id" in store
        assert "name" in store
        assert "kind" in store
        assert store["kind"] in ("kendra", "pharmacy", "hospital")
        assert "latitude" in store and "longitude" in store
        assert -90.0 <= store["latitude"] <= 90.0
        assert -180.0 <= store["longitude"] <= 180.0
        assert "provenance" in store
        assert "source" in store["provenance"]
        assert store["provenance"]["verified"] is True

        # Phone numbers must be None or real formatted numbers, never fake synthetic patterns
        if store["phone"] is not None:
            assert isinstance(store["phone"], str)
            assert len(store["phone"]) >= 7


def test_stores_kind_filtering():
    """ERR-007: /api/v1/stores correctly filters by kind (kendra, pharmacy, hospital)."""
    r_kendra = client.get("/api/v1/stores?city_id=lucknow&kind=kendra")
    assert r_kendra.status_code == 200
    kendras = r_kendra.json()
    assert len(kendras) > 0
    assert all(k["kind"] == "kendra" for k in kendras)

    r_pharm = client.get("/api/v1/stores?city_id=lucknow&kind=pharmacy")
    assert r_pharm.status_code == 200
    pharmacies = r_pharm.json()
    assert len(pharmacies) > 0
    assert all(p["kind"] == "pharmacy" for p in pharmacies)

    r_hosp = client.get("/api/v1/stores?city_id=lucknow&kind=hospital")
    assert r_hosp.status_code == 200
    hospitals = r_hosp.json()
    assert len(hospitals) >= 4
    assert all(h["kind"] == "hospital" for h in hospitals)


def test_lucknow_auto_location_and_nearest_sort():
    """User in Lucknow providing GPS coordinates gets Lucknow facilities sorted closest first."""
    # Near Hazratganj Lucknow (26.8467, 80.9462)
    lat, lng = 26.8467, 80.9462
    r = client.get(f"/api/v1/stores?lat={lat}&lng={lng}")
    assert r.status_code == 200
    stores = r.json()
    assert len(stores) >= 10
    # Must be Lucknow stores
    assert all(s["city_id"] == "lucknow" for s in stores)
    # Closest should be within 0.5 km of Hazratganj
    assert stores[0]["distance_km"] < 0.6
    # Ascending sort
    distances = [s["distance_km"] for s in stores]
    assert distances == sorted(distances)


def test_route_validation():
    """ERR-007: /api/v1/routes validates coordinate bounds."""
    # Invalid latitude > 90
    r = client.get("/api/v1/routes?start_lat=95.0&start_lng=77.2&end_lat=28.6&end_lng=77.2")
    assert r.status_code == 422

    # Invalid longitude < -180
    r = client.get("/api/v1/routes?start_lat=28.6&start_lng=-190.0&end_lat=28.6&end_lng=77.2")
    assert r.status_code == 422


def test_route_osrm_mock_and_caching():
    """ERR-007: /api/v1/routes calls OSRM driving engine and caches results."""
    mock_osrm_response = {
        "code": "Ok",
        "routes": [
            {
                "distance": 3200.5,
                "duration": 480.0,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [77.2090, 28.6139],
                        [77.2120, 28.6200],
                        [77.2167, 28.6315],
                    ],
                },
                "legs": [
                    {
                        "steps": [
                            {"maneuver": {"instruction": "Head north on Janpath"}, "name": "Janpath"},
                            {"maneuver": {"instruction": "Turn right onto CP Outer Circle"}, "name": "Outer Circle"},
                        ]
                    }
                ],
            }
        ],
    }

    test_start_lat = 28.6139
    test_start_lng = 77.2090
    test_end_lat = 28.6315
    test_end_lng = 77.2167

    # Clear cache key if present
    cache_key = f"{round(test_start_lat, 4)},{round(test_start_lng, 4)}->{round(test_end_lat, 4)},{round(test_end_lng, 4)}:driving"
    _ROUTE_CACHE.pop(cache_key, None)

    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_osrm_response
    mock_client.get.return_value = mock_resp

    with patch("httpx.AsyncClient") as mock_async_client:
        mock_instance = MagicMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_instance.get = AsyncMock(return_value=mock_resp)
        mock_async_client.return_value = mock_instance

        # Call endpoint
        r = client.get(
            f"/api/v1/routes?start_lat={test_start_lat}&start_lng={test_start_lng}&end_lat={test_end_lat}&end_lng={test_end_lng}"
        )
        assert r.status_code == 200
        data = r.json()
        assert data["distance_km"] == 3.2
        assert data["duration_minutes"] == 8.0
        assert len(data["steps"]) == 2
        assert data["geometry"]["type"] == "LineString"
        assert len(data["geometry"]["coordinates"]) == 3
        assert data["provenance"]["cached"] is False

        # Second call should hit in-memory cache
        r_cached = client.get(
            f"/api/v1/routes?start_lat={test_start_lat}&start_lng={test_start_lng}&end_lat={test_end_lat}&end_lng={test_end_lng}"
        )
        assert r_cached.status_code == 200
        data_cached = r_cached.json()
        assert data_cached["provenance"]["cached"] is True


def test_route_failure_error_handling():
    """ERR-007: /api/v1/routes raises HTTP 503 with directions URL on upstream failure instead of faking a route."""
    test_start_lat = 10.0001
    test_start_lng = 20.0001
    test_end_lat = 10.0500
    test_end_lng = 20.0500

    cache_key = f"{round(test_start_lat, 4)},{round(test_start_lng, 4)}->{round(test_end_lat, 4)},{round(test_end_lng, 4)}:driving"
    _ROUTE_CACHE.pop(cache_key, None)

    with patch("httpx.AsyncClient") as mock_async_client:
        mock_instance = MagicMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_instance.get = AsyncMock(side_effect=Exception("OSRM upstream network timeout"))
        mock_async_client.return_value = mock_instance

        r = client.get(
            f"/api/v1/routes?start_lat={test_start_lat}&start_lng={test_start_lng}&end_lat={test_end_lat}&end_lng={test_end_lng}"
        )
        assert r.status_code == 503
        detail = r.json()["detail"]
        assert "directions_url" in detail
        assert "https://www.google.com/maps/dir/" in detail["directions_url"]


def test_lucknow_neighborhood_localities_and_search():
    """Verify neighborhood discovery, locality endpoints, and text search across chemist names and localities."""
    # 1. Localities endpoint
    r_loc = client.get("/api/v1/localities?city_id=lucknow")
    assert r_loc.status_code == 200
    localities = r_loc.json()
    assert len(localities) >= 10
    assert "Indira Nagar" in localities
    assert "Gomti Nagar" in localities
    assert "Aliganj" in localities
    assert "Alambagh" in localities
    assert "Chowk" in localities

    # 2. Locality filtering for Indira Nagar
    r_indira = client.get("/api/v1/stores?city_id=lucknow&locality=Indira Nagar")
    assert r_indira.status_code == 200
    indira_stores = r_indira.json()
    assert len(indira_stores) >= 3
    assert all("Indira Nagar" in (s.get("locality") or s.get("address")) for s in indira_stores)

    # 3. Text query search for Bhootnath
    r_search = client.get("/api/v1/stores?city_id=lucknow&q=Bhootnath")
    assert r_search.status_code == 200
    search_results = r_search.json()
    assert len(search_results) >= 1
    assert "Bhootnath" in search_results[0]["name"]

    # 4. Neighborhood kind filter
    r_neigh = client.get("/api/v1/stores?city_id=lucknow&kind=neighbourhood")
    assert r_neigh.status_code == 200
    neigh_stores = r_neigh.json()
    assert len(neigh_stores) >= 30
    assert all(s.get("is_neighbourhood") is True for s in neigh_stores)


if __name__ == "__main__":
    print("Running Batch 6B test suite...")
    test_haversine_calculation()
    print("[PASS] test_haversine_calculation")
    test_stores_listing_structure_and_provenance()
    print("[PASS] test_stores_listing_structure_and_provenance")
    test_stores_kind_filtering()
    print("[PASS] test_stores_kind_filtering")
    test_lucknow_auto_location_and_nearest_sort()
    print("[PASS] test_lucknow_auto_location_and_nearest_sort")
    test_lucknow_neighborhood_localities_and_search()
    print("[PASS] test_lucknow_neighborhood_localities_and_search")
    test_route_validation()
    print("[PASS] test_route_validation")
    test_route_osrm_mock_and_caching()
    print("[PASS] test_route_osrm_mock_and_caching")
    test_route_failure_error_handling()
    print("[PASS] test_route_failure_error_handling")
    print("ALL BATCH 6B TESTS PASSED!")

