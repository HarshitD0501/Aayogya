"use client";

import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Disclaimer from "@/components/Disclaimer";
import LazyStoreMap from "@/components/LazyStoreMap";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/client";
import {
  MapPin,
  Phone,
  Clock,
  Compass,
  Navigation,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

const LUCKNOW_LOCALITY_COORDS = {
  "hazratganj": { lat: 26.8495, lng: 80.9445 },
  "indira nagar": { lat: 26.8780, lng: 80.9850 },
  "gomti nagar": { lat: 26.8510, lng: 80.9960 },
  "aliganj": { lat: 26.8850, lng: 80.9450 },
  "alambagh": { lat: 26.8150, lng: 80.9020 },
  "chowk": { lat: 26.8680, lng: 80.9120 },
  "aminabad": { lat: 26.8450, lng: 80.9290 },
  "rajajipuram": { lat: 26.8380, lng: 80.8870 },
  "jankipuram": { lat: 26.9120, lng: 80.9440 },
  "ashiyana": { lat: 26.8010, lng: 80.9180 },
  "telibagh": { lat: 26.7850, lng: 80.9420 },
  "mahanagar": { lat: 26.8750, lng: 80.9540 },
  "vikas nagar": { lat: 26.8940, lng: 80.9610 },
  "thakurganj": { lat: 26.8680, lng: 80.8920 },
  "charbagh": { lat: 26.8330, lng: 80.9230 },
};

export default function StoresView({ hideNavbar = false, onNavigateTab }) {
  const { t } = useLanguage();

  const [cities, setCities] = useState([]);
  const [selectedCityId, setSelectedCityId] = useState("lucknow");
  const [userCoords, setUserCoords] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [selectedStore, setSelectedStore] = useState(null);
  const [filterKind, setFilterKind] = useState("all");
  const [filterOwnership, setFilterOwnership] = useState("all");
  const [selectedLocality, setSelectedLocality] = useState("all");
  const [availableLocalities, setAvailableLocalities] = useState([]);
  const [focusedCenter, setFocusedCenter] = useState(null);

  const [activeRoute, setActiveRoute] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [showRouteSteps, setShowRouteSteps] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [routeError, setRouteError] = useState(null);

  // 1. Fetch cities (GPS is requested only on explicit user consent via handleUseLocation)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiClient.getCities();
        if (active && res.length > 0) {
          setCities(res);
          // If no city selected yet, pick lucknow or first
          setSelectedCityId((prev) => {
            const hasLucknow = res.some((c) => c.city_id === "lucknow");
            return hasLucknow ? "lucknow" : res[0].city_id;
          });
        }
      } catch (err) {
        console.warn("Could not fetch cities:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 3. When GPS coords arrive, auto-switch selected city to the closest city
  useEffect(() => {
    if (!userCoords || cities.length === 0) return;
    let closestCity = cities[0];
    let minD = Infinity;
    cities.forEach((c) => {
      if (c.latitude && c.longitude) {
        const d = (userCoords.lat - c.latitude) ** 2 + (userCoords.lng - c.longitude) ** 2;
        if (d < minD) {
          minD = d;
          closestCity = c;
        }
      }
    });
    if (closestCity && closestCity.city_id !== selectedCityId) {
      setSelectedCityId(closestCity.city_id);
    }
  }, [userCoords, cities]);

  // 3b. Fetch distinct localities for city
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const locs = await apiClient.getLocalities(selectedCityId);
        if (active && Array.isArray(locs) && locs.length > 0) {
          setAvailableLocalities(locs);
        }
      } catch (err) {
        console.warn("Could not fetch localities:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedCityId]);

  // 4. Fetch stores & medical facilities
  useEffect(() => {
    let active = true;
    const fetchStores = async () => {
      setLoadingStores(true);
      try {
        const lat = userCoords?.lat;
        const lng = userCoords?.lng;
        const res = await apiClient.getStores(
          selectedCityId,
          lat,
          lng,
          "all",
          "all",
          selectedLocality !== "all" ? selectedLocality : null
        );
        if (active) {
          setStores(res || []);
          setSelectedStore(res?.[0] || null);
        }
      } catch (err) {
        console.error("Failed to fetch stores:", err);
      } finally {
        if (active) setLoadingStores(false);
      }
    };
    fetchStores();
    return () => {
      active = false;
    };
  }, [selectedCityId, userCoords, selectedLocality]);

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser. Please select a city manually.");
      return;
    }
    setIsLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
      },
      (err) => {
        setGpsError("Location access was denied or unavailable. Displaying verified facilities for the selected city.");
        setIsLocating(false);
      },
      { timeout: 9000, enableHighAccuracy: true }
    );
  };

  const handleGetRoute = async (store) => {
    setSelectedStore(store);
    setShowRouteSteps(true);
    setRouteError(null);

    if (!userCoords) {
      setRouteError(
        "Live driving route calculation requires your device GPS location. Tap 'Detect Location' above to enable, or open Google Maps navigation directly."
      );
      setActiveRoute(null);
      return;
    }

    setLoadingRoute(true);
    setActiveRoute(null);

    try {
      const res = await apiClient.getRoute(userCoords.lat, userCoords.lng, store.latitude, store.longitude);
      if (!res) {
        setRouteError("Live driving route is temporarily unavailable. Please open navigation in Google Maps.");
        setActiveRoute(null);
      } else {
        setActiveRoute(res);
        setRouteError(null);
      }
    } catch (err) {
      setRouteError("Unable to calculate driving route. Please open navigation in Google Maps.");
      setActiveRoute(null);
    } finally {
      setLoadingRoute(false);
    }
  };

  const filteredStores = stores.filter((s) => {
    if (filterKind === "kendra" && s.kind !== "kendra") return false;
    if (filterKind === "hospital" && s.kind !== "hospital") return false;
    if (filterKind === "pharmacy" && s.kind !== "pharmacy") return false;
    if (filterKind === "neighbourhood" && !s.is_neighbourhood) return false;

    if (filterOwnership === "government") {
      const isGov = s.ownership === "government" || s.kind === "kendra";
      if (!isGov) return false;
    }
    if (filterOwnership === "private") {
      if (s.ownership !== "private") return false;
    }

    if (selectedLocality && selectedLocality !== "all") {
      const sLoc = (s.locality || "").toLowerCase();
      const targetLoc = selectedLocality.toLowerCase();
      if (!sLoc.includes(targetLoc) && !targetLoc.includes(sLoc)) return false;
    }

    return true;
  });

  const ContainerTag = hideNavbar ? "section" : "main";
  const HeadingTag = hideNavbar ? "h2" : "h1";

  const content = (
    <ContainerTag
      {...(hideNavbar ? { "aria-labelledby": "stores-heading" } : {})}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8"
    >
      {/* Editorial Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-ui-surface border border-ui-border-decorative rounded-full shadow-xs text-xs font-semibold uppercase tracking-wider text-ui-text">
          <Compass className="w-3.5 h-3.5 text-brand-orange" />
          <span>Verified Healthcare & Medicine Network</span>
        </div>
        <HeadingTag
          {...(hideNavbar ? { id: "stores-heading" } : {})}
          className="font-serif font-black text-3xl sm:text-5xl text-brand-navy tracking-tight leading-tight"
        >
          Nearby Medical Stores & Hospitals
        </HeadingTag>
        <p className="font-sans text-sm sm:text-base text-brand-gray font-light">
          Jan Aushadhi Kendras, Government Hospitals, Emergency Trauma Centers & 24x7 Commercial Pharmacies
        </p>
      </div>

      {/* City & Neighborhood Filter Bar */}
      <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-card p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <label className="text-xs font-black uppercase tracking-wider text-brand-navy whitespace-nowrap">
              {t.selectCity}:
            </label>
            <select
              value={selectedCityId}
              onChange={(e) => setSelectedCityId(e.target.value)}
              className="bg-brand-cream border-2 border-brand-navy px-3 py-2 text-xs font-bold text-brand-navy focus:outline-none w-full sm:w-44"
            >
              {cities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {availableLocalities.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-brand-navy whitespace-nowrap">
                Neighborhood:
              </label>
              <select
                value={selectedLocality}
                onChange={(e) => {
                  const loc = e.target.value;
                  setSelectedLocality(loc);
                  const coord = LUCKNOW_LOCALITY_COORDS[loc.toLowerCase()];
                  if (coord) setFocusedCenter(coord);
                }}
                className="bg-brand-cream border-2 border-brand-navy px-3 py-2 text-xs font-bold text-brand-navy focus:outline-none w-full sm:w-48"
              >
                <option value="all">📍 All Neighborhoods ({stores.length})</option>
                {availableLocalities.map((loc) => (
                  <option key={loc} value={loc}>
                    📍 {loc}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleUseLocation}
          disabled={isLocating}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative text-ui-text text-xs font-semibold rounded-lg shadow-xs transition-colors"
        >
          <Navigation className={`w-4 h-4 text-brand-orange ${isLocating ? "animate-spin" : ""}`} />
          <span>{isLocating ? "Detecting GPS Location…" : (userCoords ? "📍 Location Active (Refresh)" : t.useLocation)}</span>
        </button>
      </div>

      {/* GPS Denial / Error Banner */}
      {gpsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-xs p-4 text-xs text-amber-900 flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-brand-orange flex-shrink-0" />
            <span className="font-medium">{gpsError}</span>
          </div>
          <button
            onClick={() => setGpsError(null)}
            className="text-[11px] font-bold text-brand-navy uppercase tracking-wider hover:underline flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quick Locality Chips */}
      {availableLocalities.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gray/80 whitespace-nowrap">
            Areas:
          </span>
          <button
            onClick={() => {
              setSelectedLocality("all");
              setFocusedCenter(null);
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded whitespace-nowrap border transition-all ${
              selectedLocality === "all"
                ? "bg-brand-navy text-brand-cream border-brand-navy shadow-sm"
                : "bg-brand-white text-brand-navy border-brand-navy/30 hover:border-brand-navy"
            }`}
          >
            All ({stores.length})
          </button>
          {availableLocalities.slice(0, 10).map((loc) => {
            const count = stores.filter((s) => (s.locality || "").toLowerCase() === loc.toLowerCase()).length;
            return (
              <button
                key={loc}
                onClick={() => {
                  setSelectedLocality(loc);
                  const coord = LUCKNOW_LOCALITY_COORDS[loc.toLowerCase()];
                  if (coord) setFocusedCenter(coord);
                }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded whitespace-nowrap border transition-all ${
                  selectedLocality.toLowerCase() === loc.toLowerCase()
                    ? "bg-blue-700 text-white border-blue-900 shadow-sm"
                    : "bg-brand-white text-brand-navy border-brand-navy/30 hover:border-brand-navy"
                }`}
              >
                {loc} {count > 0 ? `(${count})` : ""}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Pills - Facility Category & Ownership */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterKind("all")}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
              filterKind === "all"
                ? "bg-ui-blue text-white shadow-xs rounded-lg"
                : "bg-brand-white text-brand-navy"
            }`}
          >
            All Facilities ({stores.length})
          </button>
          <button
            onClick={() => setFilterKind("neighbourhood")}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
              filterKind === "neighbourhood"
                ? "bg-ui-blue text-white shadow-xs rounded-lg"
                : "bg-brand-white text-brand-navy"
            }`}
          >
            🏘️ Neighborhood Chemists
          </button>
          <button
            onClick={() => setFilterKind("kendra")}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
              filterKind === "kendra"
                ? "bg-ui-blue text-white shadow-xs rounded-lg"
                : "bg-brand-white text-brand-navy"
            }`}
          >
            🟡 Jan Aushadhi (Govt)
          </button>
          <button
            onClick={() => setFilterKind("hospital")}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
              filterKind === "hospital"
                ? "bg-ui-blue text-white shadow-xs rounded-lg"
                : "bg-brand-white text-brand-navy"
            }`}
          >
            🏥 Hospitals (Govt & Pvt)
          </button>
          <button
            onClick={() => setFilterKind("pharmacy")}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
              filterKind === "pharmacy"
                ? "bg-ui-blue text-white shadow-xs rounded-lg"
                : "bg-brand-white text-brand-navy"
            }`}
          >
            💊 24x7 Commercial Pharmacies
          </button>
        </div>

        {/* Ownership Toggle Pills */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-[10px] uppercase tracking-wider text-brand-gray/80">
            Ownership:
          </span>
          <button
            onClick={() => setFilterOwnership("all")}
            className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
              filterOwnership === "all"
                ? "bg-brand-navy text-brand-cream border-brand-navy"
                : "bg-brand-white text-brand-navy border-brand-navy/30"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterOwnership("government")}
            className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
              filterOwnership === "government"
                ? "bg-amber-800 text-white border-amber-900"
                : "bg-brand-white text-brand-navy border-brand-navy/30"
            }`}
          >
            🏛️ Government Only
          </button>
          <button
            onClick={() => setFilterOwnership("private")}
            className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
              filterOwnership === "private"
                ? "bg-blue-800 text-white border-blue-900"
                : "bg-brand-white text-brand-navy border-brand-navy/30"
            }`}
          >
            🏢 Private Only
          </button>
        </div>
      </div>

      {/* Interactive Map Section */}
      <div className="space-y-2">
        <div>
          <h3 className="font-serif font-black text-xl text-brand-navy">
            Live Healthcare Facility Map
          </h3>
          <span className="text-xs font-sans text-brand-gray">
            OpenStreetMap Data & OSRM Driving Engine
          </span>
        </div>

        <LazyStoreMap
          stores={filteredStores}
          selectedStore={selectedStore}
          userCoords={userCoords}
          activeRoute={activeRoute}
          focusedCenter={focusedCenter}
          onSelectStore={(st) => {
            setSelectedStore(st);
            const card = document.getElementById(`store-card-${st.store_id}`);
            if (card) {
              card.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }}
        />
      </div>

      {/* Driving Route Steps & Notifications */}
      {showRouteSteps && (
        <div className="space-y-4">
          {loadingRoute && (
            <div className="p-6 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card shadow-sketch">
              <div className="w-6 h-6 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="font-serif font-bold text-xs uppercase tracking-wider text-brand-navy">
                Calculating real-time OSRM driving route…
              </p>
            </div>
          )}

          {routeError && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-xs p-5 space-y-3 text-amber-900">
              <div className="flex items-center gap-2 text-brand-navy">
                <AlertCircle className="w-5 h-5 text-brand-orange flex-shrink-0" />
                <h4 className="font-serif font-black text-base">Route Navigation Notice</h4>
              </div>
              <p className="text-xs font-sans text-brand-gray leading-relaxed">{routeError}</p>
              {selectedStore && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.latitude},${selectedStore.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-brand-orange" />
                  <span>Navigate to {selectedStore.name} on Google Maps</span>
                </a>
              )}
            </div>
          )}

          {activeRoute && (
            <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-card p-5 space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-brand-navy/10 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-sans font-black uppercase tracking-widest bg-brand-orange text-brand-navy px-2 py-0.5 rounded border border-brand-navy">
                      Live OSRM Route
                    </span>
                    {activeRoute.provenance?.cached && (
                      <span className="text-[10px] font-mono text-brand-gray bg-brand-gray/10 px-1.5 py-0.5 rounded">
                        Cached
                      </span>
                    )}
                  </div>
                  <h4 className="font-serif font-black text-lg text-brand-navy mt-1">
                    Route to {selectedStore?.name}
                  </h4>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="font-serif font-black text-xl text-brand-navy">
                      {activeRoute.distance_km} km
                    </span>
                    <span className="text-xs font-sans text-brand-gray block">
                      ≈ {activeRoute.duration_minutes} mins drive
                    </span>
                  </div>
                  {selectedStore && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.latitude},${selectedStore.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-brand-cream hover:bg-brand-peach/40 border-2 border-brand-navy font-serif font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch flex items-center gap-1 text-brand-navy"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-brand-orange" />
                      <span>Google Maps</span>
                    </a>
                  )}
                </div>
              </div>

              <ol className="list-decimal list-inside space-y-2 text-xs font-sans font-medium text-brand-navy">
                {activeRoute.steps?.map((step, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Verified Facilities Cards Grid - Rendered Below the Map */}
      <div id="verified-facilities" className="space-y-4 pt-4 border-t-2 border-brand-navy/15 scroll-mt-24">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <h3 className="font-serif font-black text-xl sm:text-2xl text-brand-navy">
              Verified Facilities in {cities.find((c) => c.city_id === selectedCityId)?.name || "Lucknow"}
            </h3>
            <span className="text-xs font-mono font-bold bg-brand-navy text-brand-cream px-2 py-0.5 rounded">
              {filteredStores.length} Places
            </span>
          </div>
          {userCoords && (
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              Sorted by nearest to your GPS
            </span>
          )}
        </div>

        {loadingStores ? (
          <div className="p-8 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
            <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="font-serif font-bold text-brand-navy">Locating verified medical facilities…</p>
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="p-6 text-center bg-brand-white border-2 border-brand-navy sketchy-box">
            <p className="font-sans text-sm text-brand-gray">No medical facilities found matching this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStores.map((store, idx) => {
              const isSelected = selectedStore?.store_id === store.store_id;
              const isKendra = store.kind === "kendra" || store.name?.toLowerCase().includes("jan aushadhi");
              const isHospital = store.kind === "hospital";
              const is24x7 = store.opening_hours?.includes("24") || isHospital;

              const isNeighbourhood = Boolean(store.is_neighbourhood);
              const isWalkingDistance = store.distance_km != null && store.distance_km <= 1.0;

              let badgeText = "24x7 Pharmacy";
              let badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-300";
              if (isKendra) {
                badgeText = "Govt Jan Aushadhi";
                badgeStyle = "bg-amber-100 text-amber-900 border-amber-400";
              } else if (isHospital) {
                badgeText = store.ownership === "government" ? "Govt Hospital & Trauma" : "Private Super-Specialty";
                badgeStyle = store.ownership === "government"
                  ? "bg-rose-100 text-rose-900 border-rose-400"
                  : "bg-purple-100 text-purple-900 border-purple-400";
              } else if (isNeighbourhood) {
                badgeText = "Neighborhood Chemist";
                badgeStyle = "bg-blue-100 text-blue-900 border-blue-300";
              }

              return (
                <div
                  key={store.store_id}
                  id={`store-card-${store.store_id}`}
                  onClick={() => setSelectedStore(store)}
                  className={`p-5 bg-ui-surface border rounded-xl shadow-ui-card transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                  selectedStore?.store_id === s.store_id ? "border-ui-blue ring-2 ring-ui-blue/30" : "border-ui-border-decorative hover:border-ui-blue/50"
                    isSelected ? "shadow-sketch ring-2 ring-brand-orange" : "shadow-sketch-hover"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[9px] font-sans font-black uppercase tracking-wider px-2 py-0.5 rounded border ${badgeStyle}`}>
                          {badgeText}
                        </span>
                        {store.locality && (
                          <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                            📍 {store.locality}
                          </span>
                        )}
                        {isWalkingDistance && (
                          <span className="text-[9px] font-sans font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-600 text-white animate-pulse">
                            🚶 Walking (~{Math.round(store.distance_km * 1000)}m)
                          </span>
                        )}
                        {is24x7 && (
                          <span className="text-[9px] font-sans font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-600 text-white">
                            24x7 Open
                          </span>
                        )}
                      </div>
                      {store.distance_km != null && (
                        <span className="text-xs font-mono font-bold text-brand-navy whitespace-nowrap bg-brand-cream px-2 py-0.5 rounded border border-brand-navy/20">
                          {store.distance_km} km away
                        </span>
                      )}
                    </div>

                    <h4 className="font-serif font-black text-lg text-brand-navy mt-2.5">
                      {store.name}
                    </h4>
                    <p className="font-sans text-xs text-brand-gray mt-1 leading-relaxed">
                      {store.address}
                    </p>

                    {store.provenance?.source && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-brand-gray/80 mt-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="truncate">{store.provenance.source}</span>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-brand-navy/10 text-xs space-y-1">
                      {store.opening_hours && (
                        <div className="flex items-center gap-1.5 text-brand-navy/80">
                          <Clock className="w-3.5 h-3.5 text-brand-orange" />
                          <span>{store.opening_hours}</span>
                        </div>
                      )}
                      {store.phone && (
                        <div className="flex items-center gap-1.5 text-brand-navy font-bold">
                          <Phone className="w-3.5 h-3.5 text-brand-orange" />
                          <a href={`tel:${store.phone}`} className="hover:underline text-brand-navy font-mono">
                            {store.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-brand-navy/10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGetRoute(store);
                      }}
                      className="flex-1 py-2 px-3 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Navigation className="w-3.5 h-3.5 text-brand-orange" />
                      <span>Route Steps</span>
                    </button>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="py-2 px-3 bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 text-ui-text"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-brand-orange" />
                      <span>Google Maps</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Disclaimer />
    </ContainerTag>
  );

  if (hideNavbar) {
    return content;
  }

  return (
    <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
      <Navbar activeTab="stores" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
