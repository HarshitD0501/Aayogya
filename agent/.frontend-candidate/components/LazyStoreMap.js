"use client";

import React, { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export default function LazyStoreMap({
  stores = [],
  selectedStore = null,
  userCoords = null,
  activeRoute = null,
  onSelectStore,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayerRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    // Dynamically import Leaflet
    import("leaflet").then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      // Fix Leaflet default icon URLs in Next.js
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Default center: Delhi NCR
      const initialLat = userCoords ? userCoords.lat : (stores[0]?.latitude || 28.6139);
      const initialLng = userCoords ? userCoords.lng : (stores[0]?.longitude || 77.2090);

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 13,
          zoomControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Add user location marker
      if (userCoords) {
        const userIcon = L.divIcon({
          className: "user-location-marker",
          html: `<div style="background-color: #1a2234; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #e8a838; box-shadow: 0 0 8px rgba(0,0,0,0.4);"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
          .addTo(map)
          .bindPopup("<b>Your Current Location</b>");
        markersRef.current.push(userMarker);
      }

      // Add store markers
      stores.forEach((store) => {
        if (!store.latitude || !store.longitude) return;

        const isSelected = selectedStore && selectedStore.store_id === store.store_id;
        const isKendra = store.kind === "kendra" || store.name.toLowerCase().includes("jan aushadhi");

        const iconBg = isKendra ? "#e8a838" : "#f4c4a8";
        const iconBorder = isSelected ? "#1a2234" : "#ffffff";
        const iconSize = isSelected ? 24 : 18;

        const storeIcon = L.divIcon({
          className: "kendra-marker",
          html: `<div style="background-color: ${iconBg}; width: ${iconSize}px; height: ${iconSize}px; border-radius: 50%; border: 3px solid ${iconBorder}; box-shadow: 2px 2px 0px #1a2234;"></div>`,
          iconSize: [iconSize, iconSize],
          iconAnchor: [iconSize / 2, iconSize / 2],
        });

        const marker = L.marker([store.latitude, store.longitude], { icon: storeIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; color: #1a2234;">
              <b style="font-size: 13px;">${store.name}</b><br/>
              <span style="color: #6b6b6b;">${store.address}</span><br/>
              ${store.phone ? `<a href="tel:${store.phone}" style="color: #e8a838; font-weight: bold;">📞 ${store.phone}</a><br/>` : ""}
              <b>Distance:</b> ${store.distance_km ? `${store.distance_km} km` : "Nearby"}
            </div>
          `);

        marker.on("click", () => {
          onSelectStore && onSelectStore(store);
        });

        markersRef.current.push(marker);
      });

      // Draw route if available
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
      } else if (selectedStore && selectedStore.latitude) {
        map.panTo([selectedStore.latitude, selectedStore.longitude]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [stores, selectedStore, userCoords, activeRoute, onSelectStore]);

  return (
    <div className="w-full h-80 sm:h-96 border-2 border-brand-navy sketchy-box shadow-sketch overflow-hidden relative">
      <div ref={mapContainerRef} className="w-full h-full z-10" />
      <div className="absolute bottom-2 left-2 z-20 bg-brand-white/90 border border-brand-navy/30 px-2 py-1 rounded text-[10px] font-sans font-bold text-brand-navy shadow-sm">
        🟡 Jan Aushadhi Kendra • 🔵 Current Location
      </div>
    </div>
  );
}
