"use client";

import { useEffect, useRef, useState } from "react";
import { useReveal } from "@/lib/gsap";
import { Card, Note } from "@/components/ui";

// All client-side: browser geolocation + OpenStreetMap tiles + Overpass for
// pharmacy POIs. No API keys and no app data leaves the browser except the
// map coordinate you search. Leaflet is imported lazily (it touches `window`).
const PUNE = [18.5204, 73.8567];
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function overpass(query) {
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) {
        lastErr = new Error("HTTP " + res.status);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All Overpass mirrors failed");
}

export default function Pharmacies() {
  const mapDiv = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const userMarker = useRef(null);
  const L = useRef(null);
  const [list, setList] = useState([]);
  const [status, setStatus] = useState("Locating you…");
  const [busy, setBusy] = useState(false);
  const scope = useReveal([]);

  const setUserLocationMarker = (lat, lng) => {
    if (!map.current || !L.current) return;
    const Ll = L.current;
    if (userMarker.current) {
      map.current.removeLayer(userMarker.current);
    }
    const userIcon = Ll.divIcon({
      className: "custom-user-marker",
      html: `<div class="user-location-marker"><div class="user-pulse"></div><div class="user-pin" title="You are here">📍</div></div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 42],
      popupAnchor: [0, -40],
    });
    userMarker.current = Ll.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
      .addTo(map.current)
      .bindPopup("<b>📍 You are here</b>");
  };

  const dirs = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;

  const search = async (lat, lng) => {
    if (!layer.current || !L.current) return;
    setBusy(true);
    setStatus("Searching pharmacies nearby…");
    const q =
      `[out:json][timeout:25];(` +
      `node["amenity"="pharmacy"](around:3000,${lat},${lng});` +
      `way["amenity"="pharmacy"](around:3000,${lat},${lng});` +
      `);out center;`;
    try {
      const data = await overpass(q);
      const shops = (data.elements || [])
        .map((e) => ({
          id: e.id,
          name: e.tags?.name || "Pharmacy",
          lat: e.lat ?? e.center?.lat,
          lng: e.lon ?? e.center?.lon,
          phone: e.tags?.phone || e.tags?.["contact:phone"],
        }))
        .filter((s) => s.lat && s.lng);
      const Ll = L.current;
      layer.current.clearLayers();
      const pharmacyIcon = Ll.divIcon({
        className: "custom-pharmacy-marker",
        html: `
          <div class="pharmacy-marker-pin">
            <div class="pharmacy-icon-badge">
              <span class="pharmacy-emoji">💊</span>
            </div>
            <div class="pharmacy-pointer"></div>
          </div>
        `,
        iconSize: [38, 44],
        iconAnchor: [19, 43],
        popupAnchor: [0, -40],
      });
      shops.forEach((s) => {
        Ll.marker([s.lat, s.lng], { icon: pharmacyIcon })
          .addTo(layer.current)
          .bindPopup(
            `<b>${s.name}</b><br><a href="${dirs(s)}" target="_blank" rel="noreferrer">Directions →</a>`
          );
      });
      setList(shops);
      setStatus(
        shops.length ? `${shops.length} pharmacies within 3 km` : "No pharmacies found here — try another area."
      );
    } catch {
      setStatus("Map data servers are busy — try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const locate = () => {
    setStatus("Locating you…");
    if (!navigator.geolocation) {
      map.current?.setView(PUNE, 14);
      setUserLocationMarker(PUNE[0], PUNE[1]);
      search(PUNE[0], PUNE[1]);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.current?.setView([latitude, longitude], 15);
        setUserLocationMarker(latitude, longitude);
        search(latitude, longitude);
      },
      () => {
        map.current?.setView(PUNE, 14);
        setUserLocationMarker(PUNE[0], PUNE[1]);
        search(PUNE[0], PUNE[1]);
      },
      { timeout: 8000 }
    );
  };

  const searchHere = () => {
    const c = map.current?.getCenter();
    if (c) search(c.lat, c.lng);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Ll = (await import("leaflet")).default;
      if (cancelled || !mapDiv.current) return;
      L.current = Ll;
      const m = Ll.map(mapDiv.current).setView(PUNE, 14);
      Ll.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(m);
      layer.current = Ll.layerGroup().addTo(m);
      map.current = m;
      setTimeout(() => m.invalidateSize(), 150);
      locate();
    })();
    return () => {
      cancelled = true;
      if (userMarker.current && map.current) {
        map.current.removeLayer(userMarker.current);
        userMarker.current = null;
      }
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={scope} className="grid cols-2">
      <Card title="Interactive Map" sub="OpenStreetMap · Verified pharmacies within 3 km radius" reveal={false}>
        <div className="map-actions">
          <button className="btn btn-sm btn-primary" onClick={locate} disabled={busy}>
            <span>📍 Use my location</span>
          </button>
          <button className="btn btn-sm" onClick={searchHere} disabled={busy}>
            <span>🔍 Search this map area</span>
          </button>
        </div>
        <div id="pmap" ref={mapDiv} />
      </Card>

      <Card title="Nearby Pharmacies" sub={status}>
        {list.length === 0 ? (
          <Note tone="info">
            {busy ? "Querying local pharmacies…" : "Move or zoom the map and click “Search this map area”."}
          </Note>
        ) : (
          <div className="plist">
            {list.map((s) => (
              <div className="ph" key={s.id}>
                <div className="nm">{s.name}</div>
                <div className="links">
                  <a href={dirs(s)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span>Directions</span>
                    <span>→</span>
                  </a>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)" }}>
                      <span>📞 Call to confirm stock</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
