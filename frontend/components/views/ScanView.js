"use client";

import React, { useState, useRef, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Disclaimer from "@/components/Disclaimer";
import SearchSuggestions from "@/components/SearchSuggestions";
import PriceComparisonHero from "@/components/PriceComparisonHero";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/client";
import { addOrUpdateReportWithItem } from "@/lib/indexedDb";
import {
  Camera,
  Upload,
  AlertTriangle,
  CheckCircle,
  FileText,
  Search,
  XCircle,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ScanView({ hideNavbar = false, onNavigateTab, patient }) {
  const { t } = useLanguage();

  // File selection
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [validationError, setValidationError] = useState(null);

  // OCR state
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResponse, setOcrResponse] = useState(null);
  const [ocrError, setOcrError] = useState(null);
  const [isConfirmingReport, setIsConfirmingReport] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  // Manual search fallback
  const [correctionQuery, setCorrectionQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [compareError, setCompareError] = useState(null);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [addError, setAddError] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [packCount, setPackCount] = useState(1);
  const [comparisonItem, setComparisonItem] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [activeReportId, setActiveReportId] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // ERR-030: Clean object URL teardown on unmount or URL replacement
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (file) => {
    setValidationError(null);
    setOcrError(null);
    setOcrResponse(null);

    if (!file) {
      setSelectedFile(null);
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setValidationError("Unsupported file format. Please upload JPEG, PNG, or WebP.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError("File is larger than 5MB limit. Please take a smaller picture.");
      return;
    }

    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRunOcr = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setOcrError(null);
    setConfirmSuccess(false);
    setConfirmError(null);

    try {
      const res = await apiClient.ocr(selectedFile, patient?.id);
      setOcrResponse(res);
    } catch (err) {
      setOcrError(err?.message || "Prescription scanning service could not extract text. Please use manual search below.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReport = async () => {
    if (!ocrResponse?.report_id) return;
    setIsConfirmingReport(true);
    setConfirmError(null);
    try {
      await apiClient.confirmReport(ocrResponse.report_id, patient?.id);
      setConfirmSuccess(true);
    } catch (err) {
      setConfirmError(err?.message || "Failed to confirm prescription with health records.");
    } finally {
      setIsConfirmingReport(false);
    }
  };

  const handleManualSearch = async (queryText) => {
    const q = queryText.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await apiClient.search(q, 8);
      setCandidates(res.candidates || []);
    } catch (err) {
      setSearchError("Could not retrieve medicine candidates.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCandidate = async (candidate, brandIdOverride = null) => {
    setSelectedCandidate(candidate);
    const brandId = brandIdOverride !== null ? brandIdOverride : (candidate.brands?.[0]?.brand_id || null);
    setSelectedBrandId(brandId);
    setIsSearching(true);
    setCompareError(null);
    try {
      const res = await apiClient.compare({
        items: [
          {
            medicine_id: candidate.medicine_id,
            brand_id: brandId,
            pack_count: packCount,
          },
        ],
      });
      if (res.items && res.items.length > 0) {
        setComparisonItem(res.items[0]);
      } else {
        setCompareError("No comparison data available for this candidate.");
        setComparisonItem(null);
      }
    } catch (err) {
      setCompareError("Unable to calculate price comparison for this candidate. Please check your connection.");
      setComparisonItem(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePackCountChange = async (newCount) => {
    setPackCount(newCount);
    if (selectedCandidate) {
      setIsSearching(true);
      setCompareError(null);
      try {
        const res = await apiClient.compare({
          items: [
            {
              medicine_id: selectedCandidate.medicine_id,
              brand_id: selectedBrandId || selectedCandidate.brands?.[0]?.brand_id || null,
              pack_count: newCount,
            },
          ],
        });
        if (res.items && res.items.length > 0) {
          setComparisonItem(res.items[0]);
        }
      } catch (err) {
        setCompareError("Failed to update price comparison for the selected pack quantity.");
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleAddToReport = async (item, count) => {
    setIsAdding(true);
    setAddError(null);
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
      setAddError("Could not save item to local device storage. Please check browser permissions.");
    } finally {
      setIsAdding(false);
    }
  };

  const ContainerTag = hideNavbar ? "section" : "main";
  const HeadingTag = hideNavbar ? "h2" : "h1";

  const content = (
    <ContainerTag
      {...(hideNavbar ? { "aria-labelledby": "scan-heading" } : { id: "main-content", tabIndex: -1 })}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8 focus:outline-none"
    >
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-ui-surface border border-ui-border-decorative rounded-full shadow-xs text-xs font-semibold uppercase tracking-wider text-ui-text">
          <Camera className="w-3.5 h-3.5 text-brand-orange" />
          <span>Human-in-the-Loop OCR</span>
        </div>
        <HeadingTag
          {...(hideNavbar ? { id: "scan-heading" } : {})}
          className="font-serif font-black text-3xl sm:text-5xl text-brand-navy tracking-tight leading-tight"
        >
          {t.scanTitle}
        </HeadingTag>
        <p className="font-sans text-sm sm:text-base text-brand-gray font-light">
          {t.scanSubtitle}
        </p>
      </div>

      {/* Upload Container */}
      <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-card p-6 sm:p-8 space-y-6 max-w-3xl mx-auto">
        {/* File Picker Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-5 border border-dashed border-ui-border-decorative hover:border-ui-blue bg-ui-surface-subtle/40 hover:bg-ui-surface-subtle transition-all rounded-xl flex flex-col items-center justify-center gap-3 text-center group"
          >
            <div className="w-12 h-12 rounded-full bg-ui-surface border border-ui-border-decorative text-ui-blue flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <span className="font-serif font-semibold text-base text-ui-text block">
                {t.uploadButton}
              </span>
              <span className="text-[11px] font-sans text-ui-text-secondary">JPEG, PNG, WebP up to 5MB</span>
            </div>
          </button>

          <button
            onClick={() => cameraInputRef.current?.click()}
            className="p-5 border border-dashed border-ui-border-decorative hover:border-ui-blue bg-ui-surface-subtle/40 hover:bg-ui-surface-subtle transition-all rounded-xl flex flex-col items-center justify-center gap-3 text-center group"
          >
            <div className="w-12 h-12 rounded-full bg-ui-surface border border-ui-border-decorative text-ui-blue flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <span className="font-serif font-semibold text-base text-ui-text block">
                {t.cameraButton}
              </span>
              <span className="text-[11px] font-sans text-ui-text-secondary">Snap directly from mobile</span>
            </div>
          </button>
        </div>

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        />

        {/* Validation Error */}
        {validationError && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Staged Image Preview */}
        {previewUrl && (
          <div className="border border-ui-border-decorative rounded-xl p-4 bg-ui-surface-subtle/50 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-ui-text">
                Selected Image Preview
              </span>
              <button
                onClick={() => handleFileChange(null)}
                className="text-xs text-ui-danger hover:underline font-semibold flex items-center gap-1"
              >
                <XCircle className="w-4 h-4" />
                <span>Remove Image</span>
              </button>
            </div>

            <div className="max-h-64 overflow-hidden rounded-lg border border-ui-border-decorative bg-ui-surface flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Prescription preview"
                className="object-contain max-h-64 w-auto"
              />
            </div>

            <button
              onClick={handleRunOcr}
              disabled={isProcessing}
              className="w-full py-3.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-xl font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
                  <span>Extracting Text via Vision OCR…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-brand-orange" />
                  <span>Analyze Prescription & Find Generics</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* OCR Processing Error Alert (F22) */}
        {ocrError && (
          <div
            role="alert"
            className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-800 flex-shrink-0" />
              <span>{ocrError}</span>
            </div>
            {selectedFile && (
              <button
                onClick={handleRunOcr}
                className="px-2.5 py-1 bg-red-800 text-white hover:bg-red-900 rounded font-bold uppercase tracking-wider text-[11px] flex items-center gap-1 flex-shrink-0"
              >
                <span>Retry OCR</span>
              </button>
            )}
          </div>
        )}

        {/* OCR Result View */}
        {ocrResponse && (
          <div className="space-y-5 pt-4 border-t-2 border-brand-navy/10 animate-in fade-in-50">
            {/* Backend Confirmation Gateway (U05) */}
            {ocrResponse.report_id ? (
              <div className="p-4 bg-ui-surface border-2 border-ui-blue/30 rounded-xl space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-sm text-ui-text">
                        Prescription Staged in Health Records
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-ui-blue/10 text-ui-blue px-2 py-0.5 rounded">
                        Report #{ocrResponse.report_id}
                      </span>
                    </div>
                    <p className="text-xs text-ui-text-secondary mt-1">
                      {ocrResponse.prescriber_name ? `Doctor: ${ocrResponse.prescriber_name}` : "Extracted Prescription"}
                      {ocrResponse.prescriber_specialty ? ` · ${ocrResponse.prescriber_specialty}` : ""}
                    </p>
                  </div>

                  {confirmSuccess ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                      <CheckCircle className="w-4 h-4 text-emerald-700" />
                      <span>Confirmed & Regimen Active</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isConfirmingReport}
                      onClick={handleConfirmReport}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ui-blue hover:bg-ui-blue-hover text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex-shrink-0 disabled:opacity-60"
                    >
                      {isConfirmingReport ? "Activating Regimen…" : "Confirm & Save to Health Records"}
                    </button>
                  )}
                </div>

                {confirmSuccess && (
                  <div className="pt-2 flex items-center justify-between border-t border-ui-border-decorative/60">
                    <span className="text-xs text-emerald-800 font-medium">
                      ✓ Regimen successfully activated. Doses and reminders are now tracked.
                    </span>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab("medicines")}
                        className="text-xs font-semibold text-ui-blue hover:underline flex items-center gap-1"
                      >
                        <span>View Active Medicines</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {confirmError && (
                  <div role="alert" className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
                    {confirmError}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-ui-surface-subtle border border-ui-border-decorative rounded-xl flex items-start gap-3 shadow-xs">
                <ShieldAlert className="w-5 h-5 text-ui-blue flex-shrink-0 mt-0.5" />
                <div className="text-xs font-sans">
                  <span className="font-bold uppercase tracking-wider block text-ui-text mb-0.5">
                    GUEST LOCAL PREVIEW (NOT SAVED TO HEALTH RECORDS)
                  </span>
                  <p className="text-ui-text-secondary font-medium">
                    {t.ocrNotice}
                  </p>
                  <p className="text-ui-text-secondary text-[11px] mt-1.5 italic border-t border-ui-border-decorative/60 pt-1">
                    Sign in to your patient account to confirm this prescription and activate automated WhatsApp dose reminders.
                  </p>
                </div>
              </div>
            )}

            <div>
              <h4 className="font-serif font-semibold text-sm text-ui-text uppercase tracking-wider mb-2">
                Observed Medicine Candidates (Review Before Activation)
              </h4>
              <div className="space-y-2">
                {ocrResponse.suggestions?.map((sug, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-ui-surface border border-ui-border-decorative rounded-xl flex items-center justify-between gap-4 shadow-xs"
                  >
                    <div>
                      <span className="font-serif font-semibold text-sm text-ui-text">
                        "{sug.observed_text}"
                      </span>
                      <span className="text-[10px] font-sans font-medium text-ui-text-secondary block mt-0.5">
                        Extracted tokens: {sug.query_tokens.join(", ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleManualSearch(sug.query_tokens.join(" "))}
                      className="px-3.5 py-1.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      Verify & Match
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <details className="bg-ui-surface-subtle p-3.5 border border-ui-border-decorative rounded-xl text-xs">
              <summary className="font-semibold text-ui-text cursor-pointer">
                View Raw OCR Text Dump
              </summary>
              <pre className="mt-2 font-mono text-[11px] bg-ui-surface p-2.5 border border-ui-border-decorative rounded-lg whitespace-pre-wrap text-ui-text-secondary">
                {ocrResponse.ocr_text}
              </pre>
            </details>
          </div>
        )}

        {/* Permanent Manual Correction / Search Fallback */}
        <div className="pt-6 border-t border-ui-border-decorative/60 space-y-3">
          <h4 className="font-serif font-semibold text-base text-ui-text flex items-center gap-2">
            <Search className="w-4 h-4 text-ui-blue" />
            <span>Manual Search & Correction Fallback</span>
          </h4>
          <p className="font-sans text-xs text-ui-text-secondary">
            If handwriting or box scan was unclear, type the medicine name directly:
          </p>

          <div>
            <label htmlFor="manual-correction-query" className="sr-only">
              Medicine name to verify or correct
            </label>
            <div className="flex gap-2">
              <input
                id="manual-correction-query"
                type="text"
                value={correctionQuery}
                onChange={(e) => setCorrectionQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch(correctionQuery)}
                placeholder="Type medicine name (e.g. Dolo 500, Metformin)…"
                className="flex-1 bg-ui-surface border border-ui-control-border rounded-lg px-3.5 py-2.5 text-sm font-sans font-medium text-ui-text placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue"
              />
              <button
                type="button"
                onClick={() => handleManualSearch(correctionQuery)}
                className="px-4 py-2 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg font-semibold text-xs shadow-xs transition-colors"
              >
                Search
              </button>
            </div>
          </div>

          {/* Manual Search Error Alert (F22) */}
          {searchError && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0" />
                <span>{searchError}</span>
              </div>
              {correctionQuery.trim() && (
                <button
                  type="button"
                  onClick={() => handleManualSearch(correctionQuery)}
                  className="px-2.5 py-1 bg-rose-700 text-white hover:bg-rose-800 rounded font-semibold uppercase tracking-wider text-[10px]"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="border border-ui-border-decorative rounded-xl divide-y divide-ui-border-decorative/60 bg-ui-surface mt-3 overflow-hidden shadow-xs">
              {candidates.map((cand) => (
                <button
                  type="button"
                  key={cand.medicine_id}
                  onClick={() => handleSelectCandidate(cand)}
                  className="w-full p-3.5 hover:bg-ui-surface-subtle text-left flex justify-between items-center transition-colors focus:outline-none focus:bg-ui-surface-subtle"
                >
                  <div>
                    <span className="font-serif font-semibold text-sm text-ui-text block">
                      {cand.matched_text || cand.molecule_label}
                    </span>
                    <span className="text-xs text-ui-text-secondary block mt-0.5">
                      {cand.strength_label} • {cand.form}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-ui-blue uppercase tracking-wider flex-shrink-0">
                    Select →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comparison Inline Error (U15) */}
      {compareError && (
        <div
          role="alert"
          className="max-w-4xl mx-auto p-3.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0" />
            <span>{compareError}</span>
          </div>
          {selectedCandidate && (
            <button
              type="button"
              onClick={() => handleSelectCandidate(selectedCandidate)}
              className="px-2.5 py-1 bg-rose-800 text-white hover:bg-rose-900 rounded font-bold uppercase tracking-wider text-[11px]"
            >
              Retry Compare
            </button>
          )}
        </div>
      )}

      {/* Selected Candidate Price Hero */}
      {comparisonItem && (
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
                    onClick={() => handleSelectCandidate(selectedCandidate, b.brand_id)}
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

          {addError && (
            <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between shadow-xs">
              <span>{addError}</span>
              <button type="button" onClick={() => setAddError(null)} className="font-semibold text-rose-900 underline ml-2">Dismiss</button>
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
        </div>
      )}

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
      <Navbar activeTab="scan" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
