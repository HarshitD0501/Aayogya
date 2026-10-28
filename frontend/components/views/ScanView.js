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

  // Manual search fallback
  const [correctionQuery, setCorrectionQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
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

    try {
      const res = await apiClient.ocr(selectedFile);
      setOcrResponse(res);
    } catch (err) {
      setOcrError("Prescription scanning service could not extract text. Please use manual search below.");
    } finally {
      setIsProcessing(false);
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

  const handleSelectCandidate = async (candidate) => {
    setSelectedCandidate(candidate);
    setIsSearching(true);
    try {
      const res = await apiClient.compare({
        items: [
          {
            medicine_id: candidate.medicine_id,
            brand_id: candidate.brands?.[0]?.brand_id || null,
            pack_count: packCount,
          },
        ],
      });
      if (res.items && res.items.length > 0) {
        setComparisonItem(res.items[0]);
      }
    } catch (err) {
      alert("Failed to compare candidate.");
    } finally {
      setIsSearching(false);
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
      {...(hideNavbar ? { "aria-labelledby": "scan-heading" } : {})}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8"
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
            className="p-5 border-2 border-dashed border-brand-navy/40 hover:border-brand-navy bg-brand-cream/50 hover:bg-brand-peach/30 transition-all flex flex-col items-center justify-center gap-3 text-center group"
          >
            <div className="w-12 h-12 rounded-full bg-brand-orange/20 border-2 border-brand-navy flex items-center justify-center group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6 text-brand-navy" />
            </div>
            <div>
              <span className="font-serif font-black text-base text-brand-navy block">
                {t.uploadButton}
              </span>
              <span className="text-[11px] font-sans text-brand-gray">JPEG, PNG, WebP up to 5MB</span>
            </div>
          </button>

          <button
            onClick={() => cameraInputRef.current?.click()}
            className="p-5 border-2 border-dashed border-brand-navy/40 hover:border-brand-navy bg-brand-cream/50 hover:bg-brand-peach/30 transition-all flex flex-col items-center justify-center gap-3 text-center group"
          >
            <div className="w-12 h-12 rounded-full bg-brand-orange text-brand-navy border-2 border-brand-navy flex items-center justify-center group-hover:scale-105 transition-transform">
              <Camera className="w-6 h-6 text-brand-navy" />
            </div>
            <div>
              <span className="font-serif font-black text-base text-brand-navy block">
                {t.cameraButton}
              </span>
              <span className="text-[11px] font-sans text-brand-gray">Snap directly from mobile</span>
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
          <div className="p-3 bg-red-100 border-2 border-red-800 text-red-900 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-800 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Staged Image Preview */}
        {previewUrl && (
          <div className="border-2 border-brand-navy p-4 bg-brand-cream space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-brand-navy">
                Selected Image Preview
              </span>
              <button
                onClick={() => handleFileChange(null)}
                className="text-xs text-red-700 hover:text-red-900 font-bold flex items-center gap-1"
              >
                <XCircle className="w-4 h-4" />
                <span>Remove Image</span>
              </button>
            </div>

            <div className="max-h-64 overflow-hidden rounded border border-brand-navy/30 bg-black/5 flex items-center justify-center">
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
            <div className="p-3.5 bg-brand-peach/40 border-2 border-brand-navy flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-brand-navy flex-shrink-0 mt-0.5" />
              <div className="text-xs font-sans">
                <span className="font-black uppercase tracking-wider block text-brand-navy mb-0.5">
                  HUMAN CONFIRMATION REQUIRED (LOCAL PREVIEW ONLY)
                </span>
                <p className="text-brand-navy/80 font-medium">
                  {t.ocrNotice}
                </p>
                <p className="text-brand-gray text-[11px] mt-1.5 italic border-t border-brand-navy/10 pt-1">
                  Note: Text extracted here is for local review and generic comparison only. It has not been clinically confirmed or saved to your medical records on the server.
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-serif font-black text-sm text-brand-navy uppercase tracking-wider mb-2">
                Observed Medicine Candidates (Unconfirmed)
              </h4>
              <div className="space-y-2">
                {ocrResponse.suggestions?.map((sug, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-brand-cream border-2 border-brand-navy flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-serif font-bold text-sm text-brand-navy">
                        "{sug.observed_text}"
                      </span>
                      <span className="text-[10px] font-sans font-bold text-brand-gray block mt-0.5">
                        Extracted tokens: {sug.query_tokens.join(", ")}
                      </span>
                    </div>
                    <button
                      onClick={() => handleManualSearch(sug.query_tokens.join(" "))}
                      className="px-3.5 py-1.5 bg-ui-amber hover:bg-ui-amber-hover text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      Verify & Match
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <details className="bg-brand-cream p-3 border border-brand-navy/20 rounded text-xs">
              <summary className="font-bold text-brand-navy cursor-pointer">
                View Raw OCR Text Dump
              </summary>
              <pre className="mt-2 font-mono text-[11px] bg-brand-white p-2 border border-brand-navy/10 rounded whitespace-pre-wrap text-brand-gray">
                {ocrResponse.ocr_text}
              </pre>
            </details>
          </div>
        )}

        {/* Permanent Manual Correction / Search Fallback */}
        <div className="pt-6 border-t-2 border-brand-navy/10 space-y-3">
          <h4 className="font-serif font-black text-base text-brand-navy flex items-center gap-2">
            <Search className="w-4 h-4 text-brand-orange" />
            <span>Manual Search & Correction Fallback</span>
          </h4>
          <p className="font-sans text-xs text-brand-gray">
            If handwriting or box scan was unclear, type the medicine name directly:
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={correctionQuery}
              onChange={(e) => setCorrectionQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSearch(correctionQuery)}
              placeholder="Type medicine name (e.g. Dolo 500, Metformin)…"
              className="flex-1 bg-brand-white border-2 border-brand-navy px-3 py-2 text-sm font-sans font-medium text-brand-navy placeholder:text-brand-gray/60 focus:outline-none"
            />
            <button
              onClick={() => handleManualSearch(correctionQuery)}
              className="px-4 py-2 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg font-semibold text-xs shadow-xs transition-colors"
            >
              Search
            </button>
          </div>

          {/* Manual Search Error Alert (F22) */}
          {searchError && (
            <div
              role="alert"
              className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-800 flex-shrink-0" />
                <span>{searchError}</span>
              </div>
              {correctionQuery.trim() && (
                <button
                  onClick={() => handleManualSearch(correctionQuery)}
                  className="px-2 py-0.5 bg-red-800 text-white hover:bg-red-900 rounded font-bold uppercase tracking-wider text-[10px]"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="border-2 border-brand-navy divide-y divide-brand-navy/10 bg-brand-white mt-3">
              {candidates.map((cand) => (
                <div
                  key={cand.medicine_id}
                  onClick={() => handleSelectCandidate(cand)}
                  className="p-3 hover:bg-brand-cream cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <span className="font-serif font-bold text-sm text-brand-navy">
                      {cand.matched_text || cand.molecule_label}
                    </span>
                    <span className="text-xs text-brand-gray block">
                      {cand.strength_label} • {cand.form}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-brand-orange uppercase tracking-wider">
                    Select →
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected Candidate Price Hero */}
      {comparisonItem && (
        <div className="max-w-4xl mx-auto space-y-4">
          <PriceComparisonHero
            item={comparisonItem}
            packCount={packCount}
            onPackCountChange={setPackCount}
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
    <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
      <Navbar activeTab="scan" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
