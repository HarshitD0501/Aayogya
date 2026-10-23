"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Disclaimer from "@/components/Disclaimer";
import SearchSuggestions from "@/components/SearchSuggestions";
import PriceComparisonHero from "@/components/PriceComparisonHero";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/client";
import {
  addOrUpdateReportWithItem,
  getCatalogueCache,
  saveCatalogueCache,
  searchOfflineCatalogue,
} from "@/lib/indexedDb";
import { Search as SearchIcon, ArrowRight, RotateCcw, AlertCircle, Sparkles, ShoppingBag } from "lucide-react";
import Link from "next/link";

export default function SearchPage({ hideNavbar = false, onNavigateTab }) {
  const { t } = useLanguage();

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [packCount, setPackCount] = useState(1);
  const [comparisonItem, setComparisonItem] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState(null);

  const [addedSuccess, setAddedSuccess] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchAbortRef = useRef(null);
  const compareAbortRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync public catalogue in background for offline use
  useEffect(() => {
    let active = true;
    const syncCatalogue = async () => {
      try {
        const cached = await getCatalogueCache();
        const res = await apiClient.getPublicCatalogue(cached?.etag || null);
        if (active && res.data && res.data.records) {
          await saveCatalogueCache(res.data, res.etag);
        }
      } catch (err) {
        console.warn("Public catalogue cache sync skipped:", err);
      }
    };
    syncCatalogue();
    return () => {
      active = false;
    };
  }, []);

  // Search query execution
  const executeSearch = useCallback(async (searchQuery) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setCandidates([]);
      setSearchError(null);
      setIsSearching(false);
      setShowSuggestions(false);
      return;
    }

    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setHighlightedIndex(-1);

    try {
      const response = await apiClient.search(trimmed, 8, controller.signal);
      setCandidates(response.candidates || []);
      setIsOfflineMode(false);
      setShowSuggestions((response.candidates || []).length > 0);
    } catch (err) {
      try {
        const offlineRecords = await searchOfflineCatalogue(trimmed);
        if (offlineRecords.length > 0) {
          const offlineCandidates = offlineRecords.map((r) => ({
            medicine_id: r.medicine_id,
            matched_text: r.name,
            molecule_label: r.molecule_label,
            strength_label: r.strength_label,
            form: r.form,
            release_type: null,
            pack_label: "Standard Pack",
            brands: [],
            match_score: 80,
            requires_confirmation: true,
          }));
          setCandidates(offlineCandidates);
          setIsOfflineMode(true);
          setShowSuggestions(true);
          return;
        }
      } catch {}

      setSearchError("Unable to reach medicine search service. Please check your connection.");
      setCandidates([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val);
    }, 250);
  };

  // Compare on selection
  const executeCompare = useCallback(async (candidate, brandId, count) => {
    if (compareAbortRef.current) compareAbortRef.current.abort();
    const controller = new AbortController();
    compareAbortRef.current = controller;

    setIsComparing(true);
    setCompareError(null);
    setAddedSuccess(false);

    try {
      const res = await apiClient.compare(
        {
          items: [
            {
              medicine_id: candidate.medicine_id,
              brand_id: brandId,
              pack_count: count,
            },
          ],
        },
        controller.signal
      );

      if (res.items && res.items.length > 0) {
        setComparisonItem(res.items[0]);
      } else {
        setCompareError("No comparison data returned for this product.");
        setComparisonItem(null);
      }
    } catch (err) {
      setCompareError("Failed to verify price comparison. Please retry.");
      setComparisonItem(null);
    } finally {
      setIsComparing(false);
    }
  }, []);

  const handleSelectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setShowSuggestions(false);
    setQuery(candidate.matched_text || candidate.molecule_label);
    const initialBrandId = candidate.brands?.[0]?.brand_id || null;
    setSelectedBrandId(initialBrandId);
    executeCompare(candidate, initialBrandId, packCount);
  };

  const handlePackCountChange = (newCount) => {
    setPackCount(newCount);
    if (selectedCandidate) {
      executeCompare(selectedCandidate, selectedBrandId, newCount);
    }
  };

  const handleAddToReport = async (item, count) => {
    setIsAdding(true);
    try {
      await addOrUpdateReportWithItem(item, count);
      setAddedSuccess(true);
      setTimeout(() => setAddedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to add to report:", err);
      alert("Could not save to local report.");
    } finally {
      setIsAdding(false);
    }
  };

  const content = (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8">
      {/* Editorial Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch-hover text-xs font-bold uppercase tracking-wider text-brand-navy">
          <Sparkles className="w-3.5 h-3.5 text-brand-orange" />
          <span>PMBJP Price Transparency</span>
        </div>
        <h1 className="font-serif font-black text-3xl sm:text-5xl text-brand-navy tracking-tight leading-tight">
          {t.searchTitle}
        </h1>
        <p className="font-sans text-sm sm:text-base text-brand-gray font-light">
          {t.searchSubtitle}
        </p>
      </div>

      {/* Search Input Box */}
      <div className="relative max-w-3xl mx-auto">
        <div className="flex items-center bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-2 sm:p-3 transition-shadow focus-within:shadow-sketch-hover">
          <SearchIcon className="w-6 h-6 text-brand-orange ml-2 mr-3 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            onFocus={() => candidates.length > 0 && setShowSuggestions(true)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchAriaLabel}
            className="w-full bg-transparent font-sans text-base sm:text-lg font-medium text-brand-navy placeholder:text-brand-gray/60 focus:outline-none"
          />
          {isSearching && (
            <span className="w-5 h-5 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mr-3 flex-shrink-0" />
          )}
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setCandidates([]);
                setShowSuggestions(false);
                setSelectedCandidate(null);
                setComparisonItem(null);
              }}
              className="text-xs font-bold text-brand-gray hover:text-brand-navy px-2 py-1 mr-1"
              aria-label="Clear Search"
            >
              Clear
            </button>
          )}
        </div>

        <p className="text-xs text-brand-gray mt-2 px-2 flex items-center justify-between">
          <span>{t.searchHelpText}</span>
          <span className="font-bold text-brand-navy">Try: Dolo, Glycomet, Atorva</span>
        </p>

        {/* Autocomplete Suggestions */}
        {showSuggestions && (
          <SearchSuggestions
            candidates={candidates}
            highlightedIndex={highlightedIndex}
            onSelectCandidate={handleSelectCandidate}
            isOffline={isOfflineMode}
          />
        )}
      </div>

      {/* Comparison Result Hero */}
      {isComparing && (
        <div className="p-8 text-center bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch max-w-3xl mx-auto">
          <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="font-serif font-bold text-brand-navy">Verifying exact generic equivalent pricing…</p>
        </div>
      )}

      {comparisonItem && !isComparing && (
        <div className="max-w-4xl mx-auto space-y-4">
          <PriceComparisonHero
            item={comparisonItem}
            packCount={packCount}
            onPackCountChange={handlePackCountChange}
            onAddToReport={handleAddToReport}
            isAdding={isAdding}
            addedSuccess={addedSuccess}
          />

          {/* Link to Saved Basket */}
          <div className="text-center pt-2">
            {onNavigateTab ? (
              <button
                onClick={() => onNavigateTab("history")}
                className="inline-flex items-center gap-2 text-xs font-bold text-brand-navy uppercase tracking-wider hover:text-brand-orange underline underline-offset-4"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>View Saved Reports & Basket History</span>
              </button>
            ) : (
              <Link
                href="/history"
                className="inline-flex items-center gap-2 text-xs font-bold text-brand-navy uppercase tracking-wider hover:text-brand-orange underline underline-offset-4"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>View Saved Reports & Basket History</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Empty State / Initial Guide */}
      {!comparisonItem && !isComparing && (
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <div className="p-4 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch text-center space-y-2">
            <span className="text-2xl font-serif font-black text-brand-orange">01</span>
            <h4 className="font-serif font-black text-sm text-brand-navy">Search Brand</h4>
            <p className="text-xs text-brand-gray">Type any prescribed Indian brand or salt to discover equivalents.</p>
          </div>
          <div className="p-4 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch text-center space-y-2">
            <span className="text-2xl font-serif font-black text-brand-orange">02</span>
            <h4 className="font-serif font-black text-sm text-brand-navy">Inspect PMBJP</h4>
            <p className="text-xs text-brand-gray">Compare verified Jan Aushadhi MRP against NPPA regulated ceiling caps.</p>
          </div>
          <div className="p-4 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch text-center space-y-2">
            <span className="text-2xl font-serif font-black text-brand-orange">03</span>
            <h4 className="font-serif font-black text-sm text-brand-navy">Confirm & Save</h4>
            <p className="text-xs text-brand-gray">Generate a counter slip to consult your pharmacist or doctor.</p>
          </div>
        </div>
      )}

      {/* Global Legal Notice */}
      <div className="max-w-3xl mx-auto">
        <Disclaimer />
      </div>
    </main>
  );

  if (hideNavbar) {
    return content;
  }

  return (
    <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
      <Navbar activeTab="search" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
