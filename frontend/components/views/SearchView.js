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

export default function SearchView({ hideNavbar = false, onNavigateTab, patient }) {
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
  const [noResultsQuery, setNoResultsQuery] = useState(null);

  const [addedSuccess, setAddedSuccess] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [activeReportId, setActiveReportId] = useState(null);
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
        if (active && res && res.data && res.data.records) {
          await saveCatalogueCache(res.data, res.etag);
        }
      } catch (err) {
        // Network failure / offline: do not seed synthetic catalogue
      }
    };
    syncCatalogue();
    return () => {
      active = false;
      if (searchAbortRef.current) searchAbortRef.current.abort();
      if (compareAbortRef.current) compareAbortRef.current.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
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
      setNoResultsQuery(null);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort(new DOMException("New search dispatched", "AbortError"));
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setHighlightedIndex(-1);

    try {
      const response = await apiClient.search(trimmed, 8, controller.signal);
      const items = response.candidates || [];
      setCandidates(items);
      setIsOfflineMode(false);
      setShowSuggestions(items.length > 0);
      if (items.length === 0) {
        setNoResultsQuery(trimmed);
      } else {
        setNoResultsQuery(null);
      }
    } catch (err) {
      if (
        err?.name === "AbortError" ||
        err?.message?.toLowerCase().includes("abort") ||
        controller.signal.aborted
      ) {
        return;
      }
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
            match_score: null,
            requires_confirmation: true,
          }));
          setCandidates(offlineCandidates);
          setIsOfflineMode(true);
          setShowSuggestions(true);
          setNoResultsQuery(null);
          return;
        }
      } catch {}

      setSearchError("Unable to reach medicine search service. Please check your connection.");
      setCandidates([]);
      setNoResultsQuery(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, []);

  const handleKeyDown = (e) => {
    if (!showSuggestions || candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, candidates.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && candidates[highlightedIndex]) {
        e.preventDefault();
        handleSelectCandidate(candidates[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  };

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (!val.trim()) {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort(new DOMException("Search cleared", "AbortError"));
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setCandidates([]);
      setSearchError(null);
      setIsSearching(false);
      setShowSuggestions(false);
      setSelectedCandidate(null);
      setComparisonItem(null);
      setCompareError(null);
      setNoResultsQuery(null);
      return;
    }

    // Invalidate stale comparison results immediately when user modifies search query (U16)
    setSelectedCandidate(null);
    setComparisonItem(null);
    setCompareError(null);
    setNoResultsQuery(null);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val);
    }, 250);
  };

  // Compare on selection
  const executeCompare = useCallback(async (candidate, brandId, count) => {
    if (isOfflineMode) {
      setCompareError("Real-time PMBJP price comparison requires an internet connection. Stored offline catalogue provides medicine names only.");
      setComparisonItem(null);
      setIsComparing(false);
      return;
    }

    if (compareAbortRef.current) {
      compareAbortRef.current.abort(new DOMException("New compare dispatched", "AbortError"));
    }
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
      if (
        err?.name === "AbortError" ||
        err?.message?.toLowerCase().includes("abort") ||
        controller.signal.aborted
      ) {
        return;
      }
      setCompareError("Failed to verify price comparison. Please retry.");
      setComparisonItem(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsComparing(false);
      }
    }
  }, [isOfflineMode]);

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
      const pid = patient?.id || (typeof window !== "undefined" ? window.localStorage.getItem("aushadh_patient_id") : null);
      const repId = await addOrUpdateReportWithItem(item, count, activeReportId, null, pid);
      if (repId) {
        setActiveReportId(repId);
      }
      setAddedSuccess(true);
      setTimeout(() => setAddedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to add to report:", err);
      alert("Could not save to local report.");
    } finally {
      setIsAdding(false);
    }
  };

  const ContainerTag = hideNavbar ? "section" : "main";
  const HeadingTag = hideNavbar ? "h2" : "h1";

  const content = (
    <ContainerTag
      {...(hideNavbar ? { "aria-labelledby": "search-heading" } : { id: "main-content", tabIndex: -1 })}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8 focus:outline-none"
    >
      {/* Editorial Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-ui-surface border border-ui-border-decorative rounded-full shadow-xs text-xs font-semibold uppercase tracking-wider text-ui-text">
          <Sparkles className="w-3.5 h-3.5 text-ui-blue" />
          <span>PMBJP Price Transparency</span>
        </div>
        <HeadingTag
          {...(hideNavbar ? { id: "search-heading" } : {})}
          className="font-serif font-semibold text-3xl sm:text-5xl text-ui-text tracking-tight leading-tight"
        >
          {t.searchTitle}
        </HeadingTag>
        <p className="font-sans text-sm sm:text-base text-ui-text-secondary">
          {t.searchSubtitle}
        </p>
      </div>

      {/* Search Input Box */}
      <div className="relative max-w-3xl mx-auto">
        <div className="flex items-center bg-ui-surface border border-ui-control-border rounded-xl shadow-xs p-2 sm:p-3 transition-all focus-within:border-ui-blue focus-within:ring-2 focus-within:ring-ui-blue/20">
          <SearchIcon className="w-6 h-6 text-brand-orange ml-2 mr-3 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onFocus={() => candidates.length > 0 && setShowSuggestions(true)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchAriaLabel}
            role="combobox"
            aria-expanded={showSuggestions && candidates.length > 0}
            aria-autocomplete="list"
            aria-controls="search-suggestions-listbox"
            aria-activedescendant={highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined}
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

      {/* Dedicated No-Results State (U16) */}
      {noResultsQuery && !isSearching && candidates.length === 0 && !searchError && (
        <div
          role="status"
          className="max-w-3xl mx-auto p-6 bg-ui-surface border border-ui-border-decorative rounded-xl text-center space-y-2 shadow-xs"
        >
          <p className="font-serif font-bold text-base text-ui-text">
            No exact matches found for "{noResultsQuery}"
          </p>
          <p className="text-xs text-ui-text-secondary max-w-md mx-auto">
            Try searching by active salt or generic molecule name (e.g. Paracetamol, Metformin, Amlodipine) or check spelling.
          </p>
        </div>
      )}

      {/* Visible Error Alerts (F22) */}
      {searchError && (
        <div
          role="alert"
          className="max-w-3xl mx-auto p-4 bg-[#FDF0EE] border border-[#F5B5AE] rounded-xl text-ui-text text-xs flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-ui-danger flex-shrink-0" />
            <span className="font-medium text-ui-danger">{searchError}</span>
          </div>
          {query.trim() && (
            <button
              onClick={() => executeSearch(query)}
              className="px-3 py-1.5 bg-ui-danger hover:bg-[#911C13] text-white rounded-lg font-semibold text-xs flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {compareError && (
        <div
          role="alert"
          className="max-w-3xl mx-auto p-4 bg-[#FDF0EE] border border-[#F5B5AE] rounded-xl text-ui-text text-xs flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-ui-danger flex-shrink-0" />
            <span className="font-medium text-ui-danger">{compareError}</span>
          </div>
          {selectedCandidate && (
            <button
              onClick={() => executeCompare(selectedCandidate, selectedBrandId, packCount)}
              className="px-3 py-1.5 bg-ui-danger hover:bg-[#911C13] text-white rounded-lg font-semibold text-xs flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Comparison Result Hero */}
      {isComparing && (
        <div className="p-8 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card max-w-3xl mx-auto">
          <div className="w-8 h-8 border-2 border-ui-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="font-serif font-semibold text-ui-text">Verifying exact generic equivalent pricing…</p>
        </div>
      )}

      {comparisonItem && !isComparing && (
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Brand Selection Selector (U15) */}
          {selectedCandidate && selectedCandidate.brands && selectedCandidate.brands.length > 1 && (
            <div className="p-4 bg-ui-surface border border-ui-border-decorative rounded-xl space-y-2 shadow-xs">
              <span className="text-xs font-semibold text-ui-text block">
                Select Branded Reference for Comparison:
              </span>
              <div className="flex flex-wrap gap-2">
                {selectedCandidate.brands.map((b) => (
                  <button
                    key={b.brand_id}
                    type="button"
                    onClick={() => {
                      setSelectedBrandId(b.brand_id);
                      executeCompare(selectedCandidate, b.brand_id, packCount);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      selectedBrandId === b.brand_id
                        ? "bg-ui-blue text-white border-ui-blue shadow-xs"
                        : "bg-ui-surface-subtle text-ui-text border-ui-border-decorative hover:border-ui-blue/50"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                className="inline-flex items-center gap-2 text-xs font-semibold text-ui-text hover:text-ui-blue transition-colors underline underline-offset-4"
              >
                <ShoppingBag className="w-4 h-4 text-ui-blue" />
                <span>View Saved Reports & Basket History</span>
              </button>
            ) : (
              <Link
                href="/history"
                className="inline-flex items-center gap-2 text-xs font-semibold text-ui-text hover:text-ui-blue transition-colors underline underline-offset-4"
              >
                <ShoppingBag className="w-4 h-4 text-ui-blue" />
                <span>View Saved Reports & Basket History</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Empty State / Initial Guide */}
      {!comparisonItem && !isComparing && (
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <div className="p-5 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card text-center space-y-2">
            <span className="text-2xl font-serif font-bold text-ui-blue">01</span>
            <h4 className="font-serif font-semibold text-sm text-ui-text">Search Brand</h4>
            <p className="text-xs text-ui-text-secondary">Type any prescribed Indian brand or salt to discover equivalents.</p>
          </div>
          <div className="p-5 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card text-center space-y-2">
            <span className="text-2xl font-serif font-bold text-ui-blue">02</span>
            <h4 className="font-serif font-semibold text-sm text-ui-text">Inspect PMBJP</h4>
            <p className="text-xs text-ui-text-secondary">Compare verified Jan Aushadhi MRP against NPPA regulated ceiling caps.</p>
          </div>
          <div className="p-5 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card text-center space-y-2">
            <span className="text-2xl font-serif font-bold text-ui-blue">03</span>
            <h4 className="font-serif font-semibold text-sm text-ui-text">Confirm & Save</h4>
            <p className="text-xs text-ui-text-secondary">Generate a counter slip to consult your pharmacist or doctor.</p>
          </div>
        </div>
      )}

      {/* Global Legal Notice */}
      <div className="max-w-3xl mx-auto">
        <Disclaimer />
      </div>
    </ContainerTag>
  );

  if (hideNavbar) {
    return content;
  }

  return (
    <div className="min-h-screen bg-ui-canvas text-ui-text flex flex-col font-sans">
      <Navbar activeTab="search" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
