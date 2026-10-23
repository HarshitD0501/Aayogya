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

export default function StoresPage({ hideNavbar = false, onNavigateTab }) {
  const { t } = useLanguage();

  const [cities, setCities] = useState([]);
  const [selectedCityId, setSelectedCityId] = useState("delhi");
  const [userCoords, setUserCoords] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [filterKind, setFilterKind] = useState("all");

  const [activeRoute, setActiveRoute] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [showRouteSteps, setShowRouteSteps] = useState(false);

  // 1. Fetch cities
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiClient.getCities();
        if (active && res.length > 0) {
          setCities(res);
          setSelectedCityId(res[0].city_id);
        }
      } catch (err) {
        console.warn("Could not fetch cities:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 2. Fetch stores
  useEffect(() => {
    let active = true;
    const fetchStores = async () => {
      setLoadingStores(true);
      setStoresError(null);
      try {
        const lat = userCoords?.lat;
        const lng = userCoords?.lng;
        const res = await apiClient.getStores(selectedCityId, lat, lng);
        if (active) {
          setStores(res || []);
          setSelectedStore(res?.[0] || null);
        }
      } catch (err) {
        console.error("Failed to fetch stores:", err);
        if (active) {
          setStores([]);
          setSelectedStore(null);
          setStoresError("Store information is unavailable. Please try again when the store service is connected.");
        }
      } finally {
        if (active) setLoadingStores(false);
      }
    };
    fetchStores();
    return () => {
      active = false;
    };
  }, [selectedCityId, userCoords]);

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
      },
      (err) => {
        alert("Location access denied or unavailable. Using city filter.");
        setIsLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const handleGetRoute = async (store) => {
    setSelectedStore(store);
    setLoadingRoute(true);
    setActiveRoute(null);
    setShowRouteSteps(true);

    try {
      const startLat = userCoords?.lat || (stores[0]?.latitude ? stores[0].latitude - 0.01 : 28.625);
      const startLng = userCoords?.lng || (stores[0]?.longitude ? stores[0].longitude - 0.01 : 77.210);
      const res = await apiClient.getRoute(startLat, startLng, store.latitude, store.longitude);
      setActiveRoute(res);
    } catch (err) {
      alert("Unable to calculate driving route.");
    } finally {
      setLoadingRoute(false);
    }
  };

  const filteredStores = stores.filter((s) => {
    if (filterKind === "kendra") return s.kind === "kendra" || s.name.toLowerCase().includes("jan aushadhi");
    if (filterKind === "pharmacy") return s.kind === "pharmacy";
    return true;
  });

  const content = (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8">
      {/* Editorial Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch-hover text-xs font-bold uppercase tracking-wider text-brand-navy">
          <Compass className="w-3.5 h-3.5 text-brand-orange" />
          <span>Govt PMBJP Network</span>
        </div>
        <h1 className="font-serif font-black text-3xl sm:text-5xl text-brand-navy tracking-tight leading-tight">
          {t.storesTitle}
        </h1>
        <p className="font-sans text-sm sm:text-base text-brand-gray font-light">
          {t.storesSubtitle}
        </p>
      </div>

      {/* City Filter & Geolocation Bar */}
      <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-black uppercase tracking-wider text-brand-navy whitespace-nowrap">
            {t.selectCity}:
          </label>
          <select
            value={selectedCityId}
            onChange={(e) => setSelectedCityId(e.target.value)}
            className="bg-brand-cream border-2 border-brand-navy px-3 py-2 text-xs font-bold text-brand-navy focus:outline-none w-full sm:w-48"
          >
            {cities.map((c) => (
              <option key={c.city_id} value={c.city_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleUseLocation}
          disabled={isLocating}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-brand-cream hover:bg-brand-peach/40 border-2 border-brand-navy text-brand-navy text-xs font-black uppercase tracking-wider sketchy-btn shadow-sketch-hover"
        >
          <Navigation className="w-4 h-4 text-brand-orange" />
          <span>{isLocating ? "Detecting GPS…" : t.useLocation}</span>
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterKind("all")}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
            filterKind === "all"
              ? "bg-brand-navy text-brand-cream sketchy-btn shadow-sketch"
              : "bg-brand-white text-brand-navy"
          }`}
        >
          All Outlets ({stores.length})
        </button>
        <button
          onClick={() => setFilterKind("kendra")}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
            filterKind === "kendra"
              ? "bg-brand-navy text-brand-cream sketchy-btn shadow-sketch"
              : "bg-brand-white text-brand-navy"
          }`}
        >
          PMBJP Kendras Only
        </button>
        <button
          onClick={() => setFilterKind("pharmacy")}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
            filterKind === "pharmacy"
              ? "bg-brand-navy text-brand-cream sketchy-btn shadow-sketch"
              : "bg-brand-white text-brand-navy"
          }`}
        >
          Commercial Pharmacies
        </button>
      </div>

      {/* List-First Store Cards Grid */}
      {storesError && (
        <div role="alert" className="bg-brand-white border-2 border-brand-navy sketchy-box p-4 text-sm text-brand-navy">
          {storesError}
        </div>
      )}
      <div className="space-y-4">
        <h3 className="font-serif font-black text-xl text-brand-navy">
          Verified Outlets in {cities.find((c) => c.city_id === selectedCityId)?.name || "Selected Area"}
        </h3>

        {loadingStores ? (
          <div className="p-8 text-center bg-brand-white border-2 border-brand-navy sketchy-box">
            <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="font-serif font-bold text-brand-navy">Loading verified Kendra listings…</p>
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="p-6 text-center bg-brand-white border-2 border-brand-navy sketchy-box">
            <p className="font-sans text-sm text-brand-gray">No outlets found matching this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStores.map((store) => {
              const isSelected = selectedStore?.store_id === store.store_id;
              const isKendra = store.kind === "kendra" || store.name.toLowerCase().includes("jan aushadhi");
              return (
                <div
                  key={store.store_id}
                  onClick={() => setSelectedStore(store)}
                  className={`p-5 bg-brand-white border-2 border-brand-navy sketchy-box transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                    isSelected ? "shadow-sketch ring-2 ring-brand-orange" : "shadow-sketch-hover"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-[9px] font-sans font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                          isKendra
                            ? "bg-brand-orange text-brand-navy border-brand-navy"
                            : "bg-brand-gray/10 text-brand-gray border-brand-navy/20"
                        }`}
                      >
                        {isKendra ? "Official Jan Aushadhi" : "Commercial Pharmacy"}
                      </span>
                      {store.distance_km && (
                        <span className="text-xs font-mono font-bold text-brand-navy">
                          {store.distance_km} km away
                        </span>
                      )}
                    </div>

                    <h4 className="font-serif font-black text-lg text-brand-navy mt-2">
                      {store.name}
                    </h4>
                    <p className="font-sans text-xs text-brand-gray mt-1 leading-relaxed">
                      {store.address}
                    </p>

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
                          <a href={`tel:${store.phone}`} className="hover:underline">
                            {store.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGetRoute(store);
                    }}
                    className="w-full py-2 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-3.5 h-3.5 text-brand-orange" />
                    <span>Get Driving Directions</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Driving Route Steps */}
      {activeRoute && (
        <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-5 space-y-4 animate-in fade-in-50">
          <div className="flex items-center justify-between border-b-2 border-brand-navy/10 pb-3">
            <div>
              <span className="text-[10px] font-sans font-black uppercase tracking-widest bg-brand-orange text-brand-navy px-2 py-0.5 rounded border border-brand-navy">
                Verified Route
              </span>
              <h4 className="font-serif font-black text-lg text-brand-navy mt-1">
                Route to {selectedStore?.name}
              </h4>
            </div>
            <div className="text-right">
              <span className="font-serif font-black text-xl text-brand-navy">
                {activeRoute.distance_km} km
              </span>
              <span className="text-xs font-sans text-brand-gray block">
                ≈ {activeRoute.duration_minutes} mins drive
              </span>
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

      {/* Interactive Map Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-serif font-black text-xl text-brand-navy">
            Kendra Geographic Distribution
          </h3>
          <span className="text-xs font-sans text-brand-gray">
            OpenStreetMap Data & Routing
          </span>
        </div>

        <LazyStoreMap
          stores={filteredStores}
          selectedStore={selectedStore}
          userCoords={userCoords}
          activeRoute={activeRoute}
          onSelectStore={(st) => setSelectedStore(st)}
        />
      </div>

      <Disclaimer />
    </main>
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
