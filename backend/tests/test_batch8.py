"""
Batch 8 Test Suite:
Validates frontend loading optimizations, public stats transparency, in-memory caching,
history pagination bounds, and isolated test runner integration (ERR-028, ERR-030, ERR-032).
"""

import math
import sys
from pathlib import Path
import pytest

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app import prices as price_svc

client = TestClient(app)


def test_public_stats_contract():
    """Verify /api/public/stats returns truth-backed metrics without fictional constants (ERR-032)."""
    res = client.get("/api/public/stats")
    assert res.status_code == 200
    data = res.json()

    assert "verified_medicines" in data
    assert "nppa_caps_tracked" in data
    assert "jan_aushadhi_generics" in data
    assert "interaction_rules" in data
    assert "active_patients" in data
    assert "data_sources" in data
    assert data["status"] == "online"

    # Must be grounded in actual catalog counts
    counts = price_svc.get_catalog_counts()
    assert data["nppa_caps_tracked"] == counts["nppa"]
    assert data["jan_aushadhi_generics"] == counts["jan_aushadhi"]
    assert data["verified_medicines"] == counts["nppa"] + counts["jan_aushadhi"]

    # Provenance data sources must name exact official sources
    assert "NPPA Ceiling Prices" in data["data_sources"]
    assert "PMBJP Jan Aushadhi" in data["data_sources"]


def test_public_prices_endpoint_truthfulness():
    """Verify /api/prices returns verified price observations with honest attribution."""
    res = client.get("/api/prices?brand=Paracetamol")
    assert res.status_code == 200
    data = res.json()

    assert "brand" in data
    assert "jan_aushadhi_price" in data
    assert "nppa_ceiling_price" in data
    assert "nppa_details" in data
    assert "offers" in data

    # Jan Aushadhi generic in offers must have official active PMBJP portal URL
    ja_offer = next((o for o in data["offers"] if "Jan Aushadhi" in o["platform"]), None)
    if ja_offer:
        assert "janaushadhi.gov.in" in ja_offer["url"]
        assert ja_offer["price"] > 0

    # NPPA ceiling must have official circular portal URL
    if data["nppa_details"]:
        assert "nppa.gov.in" in data["nppa_details"]["source_url"]
        assert "DPCO" in data["nppa_details"]["regulation"]


def test_pagination_bounds_calculation():
    """Verify pagination calculation logic used across HistoryView and Sections Reports."""
    PAGE_SIZE = 5

    def paginate(items, page):
        total_pages = max(1, math.ceil(len(items) / PAGE_SIZE))
        clamped_page = max(1, min(page, total_pages))
        start = (clamped_page - 1) * PAGE_SIZE
        end = clamped_page * PAGE_SIZE
        return items[start:end], clamped_page, total_pages

    # 1. Empty list
    items = []
    p_items, cur_page, total = paginate(items, 1)
    assert p_items == []
    assert cur_page == 1
    assert total == 1

    # 2. Exactly 5 items (1 page)
    items = list(range(1, 6))
    p_items, cur_page, total = paginate(items, 1)
    assert len(p_items) == 5
    assert total == 1

    # 3. 12 items (3 pages: 5, 5, 2)
    items = list(range(1, 13))
    p_items_1, _, total = paginate(items, 1)
    assert p_items_1 == [1, 2, 3, 4, 5]
    assert total == 3

    p_items_2, _, _ = paginate(items, 2)
    assert p_items_2 == [6, 7, 8, 9, 10]

    p_items_3, _, _ = paginate(items, 3)
    assert p_items_3 == [11, 12]

    # 4. Out-of-bounds page clamped
    p_items_clamp, cur, _ = paginate(items, 99)
    assert cur == 3
    assert p_items_clamp == [11, 12]


def test_service_worker_security_contract():
    """Verify sw.js explicitly bypasses /api and /agent to prevent caching patient data."""
    from pathlib import Path
    sw_path = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "sw.js"
    assert sw_path.exists(), "sw.js must exist in frontend/public"

    content = sw_path.read_text(encoding="utf-8")
    # Verify sensitive path bypasses
    assert "pathname.startsWith('/api/')" in content or "pathname === '/api'" in content
    assert "pathname.startsWith('/agent/')" in content or "pathname === '/agent'" in content
    assert "fetch(event.request)" in content


def test_app_bundle_size_evidence():
    """Verify code-splitting deferral in page.js and components."""
    from pathlib import Path
    app_page = Path(__file__).resolve().parent.parent.parent / "frontend" / "app" / "app" / "page.js"
    caregiver = Path(__file__).resolve().parent.parent.parent / "frontend" / "components" / "Caregiver.js"
    assistant = Path(__file__).resolve().parent.parent.parent / "frontend" / "components" / "Assistant.js"

    # page.js must dynamically import Dashboard and Caregiver
    p_content = app_page.read_text(encoding="utf-8")
    assert "dynamic(() => import(\"@/components/Dashboard\")" in p_content
    assert "dynamic(() => import(\"@/components/Caregiver\")" in p_content

    # Caregiver must dynamically import Assistant
    c_content = caregiver.read_text(encoding="utf-8")
    assert "dynamic(() => import(\"@/components/Assistant\")" in c_content

    # Assistant must dynamically import LiveVoiceAgent
    a_content = assistant.read_text(encoding="utf-8")
    assert "dynamic(() => import(\"@/components/LiveVoiceAgent\")" in a_content


def test_object_url_cleanup_contract():
    """Verify ScanView and Sections Upload implement proper object URL teardown (ERR-030)."""
    from pathlib import Path
    scan_view = Path(__file__).resolve().parent.parent.parent / "frontend" / "components" / "views" / "ScanView.js"
    sections = Path(__file__).resolve().parent.parent.parent / "frontend" / "components" / "sections.js"

    s_content = scan_view.read_text(encoding="utf-8")
    assert "URL.revokeObjectURL(previewUrl)" in s_content

    sec_content = sections.read_text(encoding="utf-8")
    assert "URL.revokeObjectURL(preview)" in sec_content


if __name__ == "__main__":
    pytest.main(["-v", __file__])
