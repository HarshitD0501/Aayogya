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
  Hospital,
  Building2,
  HeartPulse,
} from "lucide-react";

const LUCKNOW_LOCALITY_COORDS = {
  hazratganj: { lat: 26.8495, lng: 80.9445 },
  "indira nagar": { lat: 26.878, lng: 80.985 },
  "gomti nagar": { lat: 26.851, lng: 80.996 },
  aliganj: { lat: 26.885, lng: 80.945 },
  alambagh: { lat: 26.815, lng: 80.902 },
  chowk: { lat: 26.868, lng: 80.912 },
  aminabad: { lat: 26.845, lng: 80.929 },
  rajajipuram: { lat: 26.838, lng: 80.887 },
  jankipuram: { lat: 26.912, lng: 80.944 },
  ashiyana: { lat: 26.801, lng: 80.918 },
  telibagh: { lat: 26.785, lng: 80.942 },
  mahanagar: { lat: 26.875, lng: 80.954 },
  "vikas nagar": { lat: 26.894, lng: 80.961 },
  thakurganj: { lat: 26.868, lng: 80.892 },
  charbagh: { lat: 26.833, lng: 80.923 },
};

export default function StoresView({ hideNavbar = false, onNavigateTab, initialKind = "all" }) {
  const { t } = useLanguage();

  const [cities, setCities] = useState([]);
  const [selectedCityId, setSelectedCityId] = useState("lucknow");
  const [userCoords, setUserCoords] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [selectedStore, setSelectedStore] = useState(null);
  const [filterKind, setFilterKind] = useState(initialKind);
  const [filterOwnership, setFilterOwnership] = useState("all");
  const [selectedLocality, setSelectedLocality] = useState("all");
  const [availableLocalities, setAvailableLocalities] = useState([]);
  const [focusedCenter, setFocusedCenter] = useState(null);

  const [activeRoute, setActiveRoute] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [showRouteSteps, setShowRouteSteps] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [routeError, setRouteError] = useState(null);

  useEffect(() => {
    if (initialKind) {
      setFilterKind(initialKind);
    }
  }, [initialKind]);

  // 1. Fetch cities
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiClient.getCities();
        if (active && res.length > 0) {
          setCities(res);
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

  // 2. When GPS coords arrive, auto-switch selected city to closest
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
  }, [userCoords, cities, selectedCityId]);

  // 3. Fetch distinct localities for city
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

  // KPI counts
  const totalCount = stores.length;
  const hospitalCount = stores.filter((s) => s.kind === "hospital").length;
  const kendraCount = stores.filter((s) => s.kind === "kendra" || s.name?.toLowerCase().includes("jan aushadhi")).length;
  const chemistCount = stores.filter((s) => s.is_neighbourhood).length;
  const pharmacyCount = stores.filter((s) => s.kind === "pharmacy" || s.opening_hours?.includes("24")).length;

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
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-7"
    >
      {/* Editorial Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-ui-surface border border-ui-border-decorative rounded-full shadow-xs text-xs font-semibold uppercase tracking-wider text-ui-text">
          <Compass className="w-3.5 h-3.5 text-ui-blue" />
          <span>Verified Healthcare & Medicine Network</span>
        </div>
        <HeadingTag
          {...(hideNavbar ? { id: "stores-heading" } : {})}
          className="font-serif font-black text-3xl sm:text-4xl lg:text-5xl text-ui-text tracking-tight leading-tight"
        >
          {filterKind === "hospital" ? "Nearby Hospitals & Trauma Centers" : "Nearby Hospitals & Medical Stores"}
        </HeadingTag>
        <p className="font-sans text-sm sm:text-base text-ui-text-muted leading-relaxed">
          {filterKind === "hospital"
            ? "Verified Government Hospitals, Trauma Emergency Centers, and Super-Specialty Medical Institutes with 24x7 Casualty Services."
            : "Jan Aushadhi Kendras, Government Hospitals, Emergency Trauma Centers & 24x7 Commercial Pharmacies."}
        </p>
      </div>

      {/* Quick Facility Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilterKind("hospital")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterKind === "hospital"
              ? "bg-rose-50/80 border-rose-300 ring-2 ring-rose-200 shadow-xs"
              : "bg-ui-surface border-ui-border-decorative hover:border-ui-blue/40 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
              🏥 Hospitals
            </span>
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
              {hospitalCount}
            </span>
          </div>
          <p className="text-xs text-ui-text-muted mt-1.5 truncate">Govt & Super-Specialty</p>
        </button>

        <button
          type="button"
          onClick={() => setFilterKind("kendra")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterKind === "kendra"
              ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-200 shadow-xs"
              : "bg-ui-surface border-ui-border-decorative hover:border-ui-blue/40 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              🟡 Jan Aushadhi
            </span>
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              {kendraCount}
            </span>
          </div>
          <p className="text-xs text-ui-text-muted mt-1.5 truncate">Govt PMBJP Generic</p>
        </button>

        <button
          type="button"
          onClick={() => setFilterKind("neighbourhood")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterKind === "neighbourhood"
              ? "bg-blue-50/80 border-blue-300 ring-2 ring-blue-200 shadow-xs"
              : "bg-ui-surface border-ui-border-decorative hover:border-ui-blue/40 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
              🏘️ Chemists
            </span>
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
              {chemistCount}
            </span>
          </div>
          <p className="text-xs text-ui-text-muted mt-1.5 truncate">Local Neighborhood</p>
        </button>

        <button
          type="button"
          onClick={() => setFilterKind("all")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterKind === "all"
              ? "bg-ui-surface-subtle border-ui-blue ring-2 ring-ui-blue/20 shadow-xs"
              : "bg-ui-surface border-ui-border-decorative hover:border-ui-blue/40 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ui-navy flex items-center gap-1.5">
              🌐 All Network
            </span>
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-ui-surface-subtle text-ui-text border border-ui-border-decorative">
              {totalCount}
            </span>
          </div>
          <p className="text-xs text-ui-text-muted mt-1.5 truncate">All verified centers</p>
        </button>
      </div>

      {/* Hospital Emergency Assistance Banner (Visible when Hospital filter is active) */}
      {filterKind === "hospital" && (
        <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0 text-rose-800">
              <Hospital className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <h4 className="font-serif font-bold text-base text-ui-text">
                Verified Hospitals & Emergency Trauma Directory
              </h4>
              <p className="font-sans text-xs text-ui-text-muted mt-0.5 leading-relaxed">
                Govt Medical Colleges, Trauma Centers, and Super-Specialty Hospitals with 24x7 emergency casualty units.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
            <a
              href="tel:108"
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Ambulance: 108</span>
            </a>
            <a
              href="tel:112"
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-ui-navy hover:bg-ui-navy/90 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Emergency: 112</span>
            </a>
          </div>
        </div>
      )}

      {/* City & Neighborhood Filter Bar */}
      <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-card p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-ui-text-muted whitespace-nowrap">
              {t.selectCity}:
            </label>
            <select
              value={selectedCityId}
              onChange={(e) => setSelectedCityId(e.target.value)}
              className="bg-ui-surface border border-ui-border-decorative rounded-lg px-3 py-2 text-xs font-semibold text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-blue/30 focus:border-ui-blue transition-all w-full sm:w-44"
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
              <label className="text-xs font-bold uppercase tracking-wider text-ui-text-muted whitespace-nowrap">
                Area:
              </label>
              <select
                value={selectedLocality}
                onChange={(e) => {
                  const loc = e.target.value;
                  setSelectedLocality(loc);
                  const coord = LUCKNOW_LOCALITY_COORDS[loc.toLowerCase()];
                  if (coord) setFocusedCenter(coord);
                }}
                className="bg-ui-surface border border-ui-border-decorative rounded-lg px-3 py-2 text-xs font-semibold text-ui-text focus:outline-none focus:ring-2 focus:ring-ui-blue/30 focus:border-ui-blue transition-all w-full sm:w-48"
              >
                <option value="all">📍 All Areas ({stores.length})</option>
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
          className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative text-ui-text text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Navigation className={`w-4 h-4 text-ui-blue ${isLocating ? "animate-spin" : ""}`} />
          <span>{isLocating ? "Detecting GPS Location…" : userCoords ? "📍 Location Active (Refresh)" : t.useLocation}</span>
        </button>
      </div>

      {/* GPS Denial / Error Banner */}
      {gpsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-xs p-4 text-xs text-amber-900 flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span className="font-medium">{gpsError}</span>
          </div>
          <button
            onClick={() => setGpsError(null)}
            className="text-[11px] font-bold text-ui-navy uppercase tracking-wider hover:underline flex-shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quick Locality Chips */}
      {availableLocalities.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted whitespace-nowrap">
            Areas:
          </span>
          <button
            onClick={() => {
              setSelectedLocality("all");
              setFocusedCenter(null);
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md whitespace-nowrap border transition-all cursor-pointer ${
              selectedLocality === "all"
                ? "bg-ui-navy text-white border-ui-navy shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40 hover:bg-ui-surface-subtle"
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
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md whitespace-nowrap border transition-all cursor-pointer ${
                  selectedLocality.toLowerCase() === loc.toLowerCase()
                    ? "bg-ui-blue text-white border-ui-blue shadow-xs"
                    : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40 hover:bg-ui-surface-subtle"
                }`}
              >
                {loc} {count > 0 ? `(${count})` : ""}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Category & Ownership Controls */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterKind("all")}
            className={`px-3 py-1.5 text-xs font-semibold tracking-wider border rounded-lg transition-all cursor-pointer ${
              filterKind === "all"
                ? "bg-ui-blue text-white border-ui-blue shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40 hover:bg-ui-surface-subtle"
            }`}
          >
            All Facilities ({stores.length})
          </button>
          <button
            onClick={() => setFilterKind("hospital")}
            className={`px-3 py-1.5 text-xs font-semibold tracking-wider border rounded-lg transition-all cursor-pointer ${
              filterKind === "hospital"
                ? "bg-rose-700 text-white border-rose-800 shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40 hover:bg-ui-surface-subtle"
            }`}
          >
            🏥 Hospitals (Govt & Pvt)
          </button>
          <button
            onClick={() => setFilterKind("kendra")}
            className={`px-3 py-1.5 text-xs font-semibold tracking-wider border rounded-lg transition-all cursor-pointer ${
              filterKind === "kendra"
                ? "bg-amber-700 text-white border-amber-800 shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40 hover:bg-ui-surface-subtle"
            }`}
          >
            🟡 Jan Aushadhi (Govt)
          </button>
          <button
            onClick={() => setFilterKind("neighbourhood")}
            className={`px-3 py-1.5 text-xs font-semibold tracking-wider border rounded-lg transition-all cursor-pointer ${
              filterKind === "neighbourhood"
                ? "bg-ui-blue text-white border-ui-blue shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40 hover:bg-ui-surface-subtle"
            }`}
          >
            🏘️ Neighborhood Chemists
          </button>
          <button
            onClick={() => setFilterKind("pharmacy")}
            className={`px-3 py-1.5 text-xs font-semibold tracking-wider border rounded-lg transition-all cursor-pointer ${
              filterKind === "pharmacy"
                ? "bg-emerald-700 text-white border-emerald-800 shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40 hover:bg-ui-surface-subtle"
            }`}
          >
            💊 24x7 Commercial Pharmacies
          </button>
        </div>

        {/* Ownership Toggle */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-[10px] uppercase tracking-wider text-ui-text-muted">
            Ownership:
          </span>
          <button
            onClick={() => setFilterOwnership("all")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              filterOwnership === "all"
                ? "bg-ui-navy text-white border-ui-navy shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterOwnership("government")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              filterOwnership === "government"
                ? "bg-amber-700 text-white border-amber-800 shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40"
            }`}
          >
            🏛️ Government Only
          </button>
          <button
            onClick={() => setFilterOwnership("private")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              filterOwnership === "private"
                ? "bg-ui-blue text-white border-ui-blue shadow-xs"
                : "bg-ui-surface text-ui-text border-ui-border-decorative hover:border-ui-blue/40"
            }`}
          >
            🏢 Private Only
          </button>
        </div>
      </div>

      {/* Interactive Map Section */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif font-bold text-xl text-ui-text">
            Live Healthcare Facility Map
          </h3>
          <span className="text-xs font-sans text-ui-text-muted">
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
            <div className="p-6 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
              <div className="w-6 h-6 border-2 border-ui-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="font-serif font-bold text-xs uppercase tracking-wider text-ui-text">
                Calculating real-time OSRM driving route…
              </p>
            </div>
          )}

          {routeError && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-xs p-5 space-y-3 text-amber-900">
              <div className="flex items-center gap-2 text-ui-text">
                <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0" />
                <h4 className="font-serif font-bold text-base">Route Navigation Notice</h4>
              </div>
              <p className="text-xs font-sans text-ui-text-muted leading-relaxed">{routeError}</p>
              {selectedStore && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.latitude},${selectedStore.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-ui-navy hover:bg-ui-navy/90 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white/90" />
                  <span>Navigate to {selectedStore.name} on Google Maps</span>
                </a>
              )}
            </div>
          )}

          {activeRoute && (
            <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-card p-5 space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-ui-border-decorative pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-sans font-bold uppercase tracking-widest bg-ui-blue/10 text-ui-blue px-2 py-0.5 rounded border border-ui-blue/20">
                      Live OSRM Route
                    </span>
                    {activeRoute.provenance?.cached && (
                      <span className="text-[10px] font-mono text-ui-text-muted bg-ui-surface-subtle px-1.5 py-0.5 rounded border border-ui-border-decorative">
                        Cached
                      </span>
                    )}
                  </div>
                  <h4 className="font-serif font-bold text-lg text-ui-text mt-1">
                    Route to {selectedStore?.name}
                  </h4>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="font-serif font-bold text-xl text-ui-text">
                      {activeRoute.distance_km} km
                    </span>
                    <span className="text-xs font-sans text-ui-text-muted block">
                      ≈ {activeRoute.duration_minutes} mins drive
                    </span>
                  </div>
                  {selectedStore && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.latitude},${selectedStore.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative font-semibold text-xs rounded-lg shadow-xs flex items-center gap-1.5 text-ui-text transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-ui-blue" />
                      <span>Google Maps</span>
                    </a>
                  )}
                </div>
              </div>

              <ol className="list-decimal list-inside space-y-2 text-xs font-sans font-medium text-ui-text">
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

      {/* Verified Facilities Cards Grid */}
      <div id="verified-facilities" className="space-y-4 pt-4 border-t border-ui-border-decorative scroll-mt-24">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <h3 className="font-serif font-bold text-xl sm:text-2xl text-ui-text">
              {filterKind === "hospital"
                ? `Hospitals in ${cities.find((c) => c.city_id === selectedCityId)?.name || "Lucknow"}`
                : `Verified Facilities in ${cities.find((c) => c.city_id === selectedCityId)?.name || "Lucknow"}`}
            </h3>
            <span className="text-xs font-mono font-bold bg-ui-navy text-white px-2 py-0.5 rounded-md">
              {filteredStores.length} Places
            </span>
          </div>
          {userCoords && (
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
              Sorted by nearest to your GPS
            </span>
          )}
        </div>

        {loadingStores ? (
          <div className="p-8 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
            <div className="w-8 h-8 border-2 border-ui-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="font-serif font-bold text-ui-text">Locating verified medical facilities…</p>
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="p-8 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
            <p className="font-sans text-sm text-ui-text-muted">No medical facilities found matching this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStores.map((store) => {
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
                badgeStyle = "bg-amber-100 text-amber-900 border-amber-300";
              } else if (isHospital) {
                badgeText = store.ownership === "government" ? "Govt Hospital & Trauma" : "Private Super-Specialty";
                badgeStyle = store.ownership === "government"
                  ? "bg-rose-50 text-rose-800 border-rose-300"
                  : "bg-blue-50 text-blue-800 border-blue-300";
              } else if (isNeighbourhood) {
                badgeText = "Neighborhood Chemist";
                badgeStyle = "bg-blue-50 text-blue-800 border-blue-300";
              }

              return (
                <div
                  key={store.store_id}
                  id={`store-card-${store.store_id}`}
                  onClick={() => setSelectedStore(store)}
                  className={`p-5 bg-ui-surface border rounded-xl shadow-ui-card transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                    isSelected
                      ? "border-ui-blue ring-2 ring-ui-blue/30 shadow-md -translate-y-0.5"
                      : "border-ui-border-decorative hover:border-ui-blue/50 hover:shadow-md hover:-translate-y-0.5"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeStyle}`}>
                          {badgeText}
                        </span>
                        {store.locality && (
                          <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-ui-surface-subtle text-ui-text border border-ui-border-decorative">
                            📍 {store.locality}
                          </span>
                        )}
                        {isWalkingDistance && (
                          <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-700 text-white animate-pulse">
                            🚶 Walking (~{Math.round(store.distance_km * 1000)}m)
                          </span>
                        )}
                        {is24x7 && (
                          <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-600 text-white">
                            {isHospital ? "🚨 24x7 Emergency" : "24x7 Open"}
                          </span>
                        )}
                      </div>
                      {store.distance_km != null && (
                        <span className="text-xs font-mono font-bold text-ui-text whitespace-nowrap bg-ui-surface-subtle px-2 py-0.5 rounded-md border border-ui-border-decorative">
                          {store.distance_km} km away
                        </span>
                      )}
                    </div>

                    <h4 className="font-serif font-bold text-lg text-ui-text mt-2.5">
                      {store.name}
                    </h4>
                    <p className="font-sans text-xs text-ui-text-muted mt-1 leading-relaxed">
                      {store.address}
                    </p>

                    {store.provenance?.source && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-ui-text-muted mt-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="truncate">{store.provenance.source}</span>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-ui-border-decorative text-xs space-y-1.5">
                      {store.opening_hours && (
                        <div className="flex items-center gap-1.5 text-ui-text">
                          <Clock className="w-3.5 h-3.5 text-ui-blue" />
                          <span>{store.opening_hours}</span>
                        </div>
                      )}
                      {store.phone && (
                        <div className="flex items-center gap-1.5 text-ui-text font-bold">
                          <Phone className="w-3.5 h-3.5 text-ui-blue" />
                          <a href={`tel:${store.phone}`} className="hover:underline text-ui-blue font-mono">
                            {store.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-ui-border-decorative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGetRoute(store);
                      }}
                      className="flex-1 py-2 px-3 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5 text-white/90" />
                      <span>Route Steps</span>
                    </button>
                    {isHospital && store.phone && (
                      <a
                        href={`tel:${store.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="py-2 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 text-rose-800"
                      >
                        <Phone className="w-3.5 h-3.5 text-rose-700" />
                        <span>Call Desk</span>
                      </a>
                    )}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="py-2 px-3 bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 text-ui-text"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-ui-blue" />
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
    <div className="min-h-screen bg-ui-canvas text-ui-text flex flex-col">
      <Navbar activeTab="stores" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
