"use client";

import React, { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Disclaimer from "@/components/Disclaimer";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getAllPrescriptionReports,
  deletePrescriptionReport,
} from "@/lib/indexedDb";
import { formatPaise, formatPercent } from "@/lib/currency";
import {
  History,
  FileText,
  Trash2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Printer,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export default function HistoryPage({ hideNavbar = false, onNavigateTab }) {
  const { t } = useLanguage();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await getAllPrescriptionReports();
      setReports(stored || []);
    } catch (err) {
      console.error("Failed to load local reports:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await deletePrescriptionReport(deleteTargetId);
      setReports((prev) => prev.filter((r) => r.report_id !== deleteTargetId));
      setDeleteTargetId(null);
    } catch (err) {
      alert("Failed to delete local report.");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalSavingsPaise = reports.reduce((acc, r) => {
    const s = r.totals?.saving_total_paise || 0;
    return acc + s;
  }, 0);

  const totalMedicinesCount = reports.reduce((acc, r) => {
    return acc + (r.items?.length || 0);
  }, 0);

  const content = (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8">
      {/* Editorial Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch-hover text-xs font-bold uppercase tracking-wider text-brand-navy">
          <History className="w-3.5 h-3.5 text-brand-orange" />
          <span>Zero-Cloud Device Vault</span>
        </div>
        <h1 className="font-serif font-black text-3xl sm:text-5xl text-brand-navy tracking-tight leading-tight">
          {t.historyTitle}
        </h1>
        <p className="font-sans text-sm sm:text-base text-brand-gray font-light">
          {t.historySubtitle}
        </p>
      </div>

      {/* Aggregate Savings Hero */}
      <div className="p-6 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <span className="text-xs font-sans font-black uppercase tracking-wider text-brand-navy">
            Estimated Total Potential Savings (Cumulative)
          </span>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="font-serif font-black text-4xl sm:text-5xl text-brand-navy">
              {formatPaise(totalSavingsPaise)}
            </span>
            <span className="text-xs font-bold bg-brand-peach/40 text-brand-navy px-2.5 py-1 rounded border border-brand-navy/30 uppercase tracking-wider">
              Across {reports.length} Saved {reports.length === 1 ? "Report" : "Reports"}
            </span>
          </div>
          <p className="text-xs font-sans text-brand-gray mt-2">
            Based on verified PMBJP substitutions for {totalMedicinesCount} total medicine lines.
          </p>
        </div>

        {onNavigateTab ? (
          <button
            onClick={() => onNavigateTab("search")}
            className="w-full sm:w-auto px-5 py-3 bg-brand-orange text-brand-navy border-2 border-brand-navy font-serif font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover text-center"
          >
            + New Prescription Compare
          </button>
        ) : (
          <Link
            href="/search"
            className="w-full sm:w-auto px-5 py-3 bg-brand-orange text-brand-navy border-2 border-brand-navy font-serif font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover text-center"
          >
            + New Prescription Compare
          </Link>
        )}
      </div>

      {/* Local Storage Privacy Notice */}
      <div className="p-4 bg-brand-peach/30 border-2 border-brand-navy sketchy-box text-xs font-sans text-brand-navy flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-navy flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold uppercase tracking-wider block mb-0.5">
            100% Privacy & Local Storage Law
          </span>
          <p className="text-brand-navy/80 leading-relaxed">
            {t.localOnlyWarning}
          </p>
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        <h3 className="font-serif font-black text-xl text-brand-navy">
          Saved Prescription Dossiers ({reports.length})
        </h3>

        {loading ? (
          <div className="p-8 text-center bg-brand-white border-2 border-brand-navy sketchy-box">
            <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="font-serif font-bold text-brand-navy">Loading local vault…</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="p-10 text-center bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch space-y-4">
            <FileText className="w-12 h-12 text-brand-orange mx-auto stroke-[1.5]" />
            <h4 className="font-serif font-black text-xl text-brand-navy">
              {t.emptyHistoryTitle}
            </h4>
            <p className="font-sans text-sm text-brand-gray max-w-md mx-auto">
              {t.emptyHistoryDesc}
            </p>
            {onNavigateTab ? (
              <button
                onClick={() => onNavigateTab("search")}
                className="inline-block px-5 py-2.5 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch"
              >
                Start First Comparison
              </button>
            ) : (
              <Link
                href="/search"
                className="inline-block px-5 py-2.5 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch"
              >
                Start First Comparison
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((rep) => {
              const saving = rep.totals?.saving_total_paise;
              const pmbjpTotal = rep.totals?.pmbjp_total_paise;
              return (
                <div
                  key={rep.report_id}
                  className="p-5 sm:p-6 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 hover:shadow-sketch-hover transition-shadow"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-serif font-black text-lg sm:text-xl text-brand-navy">
                        {rep.patient_label || "Prescription Report"}
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-brand-navy/5 border border-brand-navy/20 px-2 py-0.5 rounded text-brand-navy">
                        {rep.report_id}
                      </span>
                    </div>

                    <p className="font-sans text-xs text-brand-gray">
                      Created:{" "}
                      <span className="font-bold text-brand-navy">
                        {new Date(rep.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>{" "}
                      • {rep.items?.length || 0} Medicines Confirmed
                    </p>

                    <div className="flex items-center gap-4 text-xs font-sans pt-1">
                      <div>
                        <span className="text-brand-gray block text-[10px] uppercase font-bold">
                          Generic Total:
                        </span>
                        <span className="font-serif font-bold text-brand-navy">
                          {pmbjpTotal ? formatPaise(pmbjpTotal) : "₹--"}
                        </span>
                      </div>
                      <div>
                        <span className="text-brand-gray block text-[10px] uppercase font-bold">
                          Potential Saving:
                        </span>
                        <span className="font-serif font-black text-emerald-800">
                          {saving ? formatPaise(saving) : "₹0"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <Link
                      href={`/prescriptions/${rep.report_id}`}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-brand-orange" />
                      <span>Open & Print</span>
                    </Link>

                    <button
                      onClick={() => setDeleteTargetId(rep.report_id)}
                      className="p-2.5 bg-brand-cream hover:bg-red-100 border-2 border-brand-navy text-brand-navy hover:text-red-700 rounded transition-colors"
                      title="Delete from local device"
                      aria-label="Delete report"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 bg-brand-navy/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h4 className="font-serif font-black text-lg">Delete Local Report?</h4>
            </div>
            <p className="font-sans text-xs text-brand-gray leading-relaxed">
              This report will be permanently removed from this device's IndexedDB. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 border-2 border-brand-navy bg-brand-cream font-bold text-xs uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 border-2 border-brand-navy bg-red-600 text-white font-bold text-xs uppercase tracking-wider"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </main>
  );

  if (hideNavbar) {
    return content;
  }

  return (
    <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
      <Navbar activeTab="history" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
