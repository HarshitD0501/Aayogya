"use client";

import React, { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export default function LazyStoreMap({
  stores = [],
  selectedStore = null,
  userCoords = null,
  activeRoute = null,
  focusedCenter = null,
  onSelectStore,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const leafletModuleRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);

  // 1. Initialize map once on mount, clean up on unmount (ERR-030)
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapContainerRef.current) return;
      leafletModuleRef.current = L;

      // Fix Leaflet default icon URLs in Next.js
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapInstanceRef.current && mapContainerRef.current) {
        const initialLat = userCoords ? userCoords.lat : (stores[0]?.latitude || 26.8467);
        const initialLng = userCoords ? userCoords.lng : (stores[0]?.longitude || 80.9462);

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 13,
          zoomControl: true,
          scrollWheelZoom: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        setTimeout(() => map.invalidateSize(), 150);
      }
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run once on mount

  // 2. Incremental updates for markers and route (ERR-024 safe DOM, ERR-030 smooth update)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletModuleRef.current;
    if (!map || !L) return;

    // A. Update User Location Marker
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userCoords && userCoords.lat && userCoords.lng) {
      const userIcon = L.divIcon({
        className: "user-location-marker",
        html: `<div style="background-color: #1a2234; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #38bdf8; box-shadow: 0 0 10px rgba(56,189,248,0.8); animation: pulse 2s infinite;"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon, zIndexOffset: 2000 }).addTo(map);

      // Safe popup DOM (ERR-024)
      const userPopup = document.createElement("div");
      const userB = document.createElement("b");
      userB.textContent = "📍 You Are Here (Current GPS Location)";
      userPopup.appendChild(userB);
      userMarker.bindPopup(userPopup);

      userMarkerRef.current = userMarker;
    }

    // B. Update Store & Hospital Markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stores.forEach((store) => {
      if (!store.latitude || !store.longitude) return;

      const isSelected = selectedStore && selectedStore.store_id === store.store_id;
      const isKendra = store.kind === "kendra" || (store.name && store.name.toLowerCase().includes("jan aushadhi"));
      const isHospital = store.kind === "hospital";
      const isNeighbourhood = Boolean(store.is_neighbourhood);

      let iconBg = "#059669"; // emerald for 24x7 pharmacy
      let markerBorder = isSelected ? "#1a2234" : "#ffffff";
      let markerEmoji = "💊";

      if (isHospital) {
        iconBg = "#e11d48"; // crimson for hospital
        markerEmoji = "🏥";
      } else if (isKendra) {
        iconBg = "#e8a838"; // orange for kendra
        markerEmoji = "🟡";
      } else if (isNeighbourhood) {
        iconBg = "#2563eb"; // blue for neighborhood chemist
        markerEmoji = "🏘️";
      }

      const iconSize = isSelected ? 26 : 20;

      const storeIcon = L.divIcon({
        className: "facility-marker",
        html: `<div style="background-color: ${iconBg}; width: ${iconSize}px; height: ${iconSize}px; border-radius: 50%; border: 3px solid ${markerBorder}; box-shadow: 2px 2px 0px #1a2234; display: flex; align-items: center; justify-content: center; font-size: ${isSelected ? "13px" : "10px"};">${markerEmoji}</div>`,
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize / 2],
      });

      const marker = L.marker([store.latitude, store.longitude], { icon: storeIcon }).addTo(map);

      // ERR-024: Safe DOM construction with textContent
      const popupDiv = document.createElement("div");
      popupDiv.style.fontFamily = "sans-serif";
      popupDiv.style.fontSize = "12px";
      popupDiv.style.color = "#1a2234";

      const titleB = document.createElement("b");
      titleB.style.fontSize = "13px";
      titleB.textContent = store.name || "Medical Facility";
      popupDiv.appendChild(titleB);
      popupDiv.appendChild(document.createElement("br"));

      if (store.locality) {
        const locBadge = document.createElement("span");
        locBadge.style.fontSize = "10px";
        locBadge.style.fontWeight = "bold";
        locBadge.style.color = "#2563eb";
        locBadge.textContent = `📍 Area: ${store.locality}`;
        popupDiv.appendChild(locBadge);
        popupDiv.appendChild(document.createElement("br"));
      }

      const kindSpan = document.createElement("span");
      kindSpan.style.fontSize = "10px";
      kindSpan.style.fontWeight = "bold";

      if (isHospital) {
        kindSpan.style.color = "#be123c";
        kindSpan.textContent = store.ownership === "government" ? "🏥 Govt Hospital / Trauma Center" : "🏥 Private Super-Specialty Hospital";
      } else if (isKendra) {
        kindSpan.style.color = "#b45309";
        kindSpan.textContent = "🟡 Govt Jan Aushadhi Kendra";
      } else if (isNeighbourhood) {
        kindSpan.style.color = "#1d4ed8";
        kindSpan.textContent = "🏘️ Local Neighborhood Chemist";
      } else {
        kindSpan.style.color = "#047857";
        kindSpan.textContent = "🟢 24x7 Commercial Pharmacy";
      }
      popupDiv.appendChild(kindSpan);
      popupDiv.appendChild(document.createElement("br"));

      if (store.address) {
        const addrSpan = document.createElement("span");
        addrSpan.style.color = "#6b6b6b";
        addrSpan.textContent = store.address;
        popupDiv.appendChild(addrSpan);
        popupDiv.appendChild(document.createElement("br"));
      }

      if (store.phone && /^[+0-9 -]{5,20}$/.test(store.phone.trim())) {
        const phoneLink = document.createElement("a");
        phoneLink.href = `tel:${encodeURIComponent(store.phone.trim())}`;
        phoneLink.style.color = isHospital ? "#e11d48" : "#2563eb";
        phoneLink.style.fontWeight = "bold";
        phoneLink.textContent = `📞 ${store.phone}`;
        popupDiv.appendChild(phoneLink);
        popupDiv.appendChild(document.createElement("br"));
      }

      const distB = document.createElement("b");
      distB.textContent = "Distance: ";
      const distSpan = document.createElement("span");
      distSpan.textContent = store.distance_km != null ? `${store.distance_km} km` : "Nearby";
      popupDiv.appendChild(distB);
      popupDiv.appendChild(distSpan);

      marker.bindPopup(popupDiv);

      marker.on("click", () => {
        onSelectStore && onSelectStore(store);
      });

      if (isSelected) {
        marker.openPopup();
      }

      markersRef.current.push(marker);
    });

    // C. Draw Route if available
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (activeRoute && activeRoute.geometry && activeRoute.geometry.coordinates) {
      const latLngs = activeRoute.geometry.coordinates.map((coord) => [coord[1], coord[0]]);
      const polyline = L.polyline(latLngs, {
        color: "#1a2234",
        weight: 4,
        dashArray: "6, 8",
      }).addTo(map);

      routeLayerRef.current = polyline;
      map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
    } else if (focusedCenter && focusedCenter.lat && focusedCenter.lng) {
      map.setView([focusedCenter.lat, focusedCenter.lng], 14);
    } else if (userCoords && userCoords.lat && userCoords.lng && !selectedStore) {
      map.panTo([userCoords.lat, userCoords.lng]);
    } else if (selectedStore && selectedStore.latitude && selectedStore.longitude) {
      map.panTo([selectedStore.latitude, selectedStore.longitude]);
    }
  }, [stores, selectedStore, userCoords, activeRoute, focusedCenter, onSelectStore]);

  return (
    <div className="w-full h-80 sm:h-[400px] md:h-[440px] border-2 border-brand-navy sketchy-box shadow-sketch overflow-hidden relative">
      <div ref={mapContainerRef} className="w-full h-full z-10" />
      <div className="absolute bottom-2 left-2 z-20 bg-brand-white/95 border border-brand-navy/30 px-3 py-1.5 rounded text-[10px] font-sans font-bold text-brand-navy shadow-sm flex flex-wrap items-center gap-2">
        <span>🏘️ Neighborhood Chemist</span>
        <span>•</span>
        <span>🟡 Govt Jan Aushadhi</span>
        <span>•</span>
        <span>🏥 Hospital</span>
        <span>•</span>
        <span>🟢 24x7 Pharmacy</span>
        <span>•</span>
        <span>🔵 You</span>
      </div>
    </div>
  );
}

