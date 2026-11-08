"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "@/components/Navbar";
import Disclaimer from "@/components/Disclaimer";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getAllPrescriptionReports,
  deletePrescriptionReport,
  computeReportTotals,
} from "@/lib/indexedDb";
import { getActivePatientId } from "@/lib/api";
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

export default function HistoryView({ hideNavbar = false, onNavigateTab, patient }) {
  const { t } = useLanguage();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const pid = patient?.id || getActivePatientId();
      const stored = await getAllPrescriptionReports(pid);
      setReports(stored || []);
    } catch (err) {
      console.error("Failed to load local reports:", err);
    } finally {
      setLoading(false);
    }
  }, [patient?.id]);

  const deleteDialogRef = useRef(null);
  const deleteCancelBtnRef = useRef(null);
  const deleteTriggerRef = useRef(null);

  useEffect(() => {
    loadReports();
    const handleReportUpdate = () => loadReports();
    if (typeof window !== "undefined") {
      window.addEventListener("aushadh:report_updated", handleReportUpdate);
      return () => window.removeEventListener("aushadh:report_updated", handleReportUpdate);
    }
  }, [loadReports]);

  // Modal lifecycle, focus containment and Escape key handler for delete modal (F36/U14)
  useEffect(() => {
    if (!deleteTargetId) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Set initial focus to safe default action (Cancel)
    const timer = setTimeout(() => {
      deleteCancelBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDeleteTargetId(null);
      }
      if (e.key === "Tab" && deleteDialogRef.current) {
        const focusable = deleteDialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"]):not([disabled])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (deleteTriggerRef.current && typeof deleteTriggerRef.current.focus === "function") {
        try {
          deleteTriggerRef.current.focus();
        } catch {}
      }
    };
  }, [deleteTargetId]);

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await deletePrescriptionReport(deleteTargetId);
      setReports((prev) => {
        const updated = prev.filter((r) => r.report_id !== deleteTargetId);
        const maxPage = Math.max(1, Math.ceil(updated.length / PAGE_SIZE));
        if (currentPage > maxPage) {
          setCurrentPage(maxPage);
        }
        return updated;
      });
      setDeleteTargetId(null);
    } catch (err) {
      alert("Failed to delete local report.");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalSavingsPaise = reports.reduce((acc, r) => {
    const totals = r.totals || r.totals_snapshot || computeReportTotals(r.items || []);
    const s = totals.saving_total_paise || 0;
    return acc + s;
  }, 0);

  const totalMedicinesCount = reports.reduce((acc, r) => {
    return acc + (r.items?.length || 0);
  }, 0);

  const ContainerTag = hideNavbar ? "section" : "main";
  const HeadingTag = hideNavbar ? "h2" : "h1";

  const content = (
    <ContainerTag
      {...(hideNavbar ? { "aria-labelledby": "history-heading" } : { id: "main-content", tabIndex: -1 })}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-8 focus:outline-none"
    >
      {/* Editorial Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-ui-surface border border-ui-border-decorative rounded-full shadow-xs text-xs font-semibold uppercase tracking-wider text-ui-text">
          <History className="w-3.5 h-3.5 text-ui-blue" />
          <span>Local Device Storage Vault</span>
        </div>
        <HeadingTag
          {...(hideNavbar ? { id: "history-heading" } : {})}
          className="font-serif font-semibold text-3xl sm:text-5xl text-ui-text tracking-tight leading-tight"
        >
          {t.historyTitle}
        </HeadingTag>
        <p className="font-sans text-sm sm:text-base text-ui-text-secondary">
          {t.historySubtitle}
        </p>
      </div>

      {/* Aggregate Savings Hero */}
      <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <span className="text-xs font-sans font-semibold uppercase tracking-wider text-ui-text-secondary">
            Estimated Total Potential Savings (Cumulative)
          </span>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="font-serif font-bold text-4xl sm:text-5xl text-ui-text">
              {formatPaise(totalSavingsPaise)}
            </span>
            <span className="text-xs font-semibold bg-ui-surface-subtle text-ui-text px-2.5 py-1 rounded border border-ui-border-decorative uppercase tracking-wider">
              Across {reports.length} Saved {reports.length === 1 ? "Report" : "Reports"}
            </span>
          </div>
          <p className="text-xs font-sans text-ui-text-secondary mt-2">
            Based on verified PMBJP substitutions for {totalMedicinesCount} total medicine lines.
          </p>
        </div>

        {onNavigateTab ? (
          <button
            onClick={() => onNavigateTab("search")}
            className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors text-center"
          >
            + New Prescription Compare
          </button>
        ) : (
          <Link
            href="/search"
            className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors text-center"
          >
            + New Prescription Compare
          </Link>
        )}
      </div>

      {/* Local Storage Privacy Notice (U04) */}
      <div className="p-4 bg-ui-surface border border-ui-border-decorative rounded-xl text-xs font-sans text-ui-text flex items-start gap-3 shadow-ui-card">
        <ShieldCheck className="w-5 h-5 text-ui-blue flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold uppercase tracking-wider block mb-0.5">
            Local Device Storage Notice
          </span>
          <p className="text-ui-text-secondary leading-relaxed">
            {t.localOnlyWarning}
          </p>
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        <h3 className="font-serif font-semibold text-xl text-ui-text">
          Saved Prescription Dossiers ({reports.length})
        </h3>

        {loading ? (
          <div className="p-8 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
            <div className="w-8 h-8 border-2 border-ui-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="font-serif font-semibold text-ui-text">Loading local vault…</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="p-10 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card space-y-4">
            <FileText className="w-12 h-12 text-ui-blue mx-auto stroke-[1.5]" />
            <h4 className="font-serif font-semibold text-xl text-ui-text">
              {t.emptyHistoryTitle}
            </h4>
            <p className="font-sans text-sm text-ui-text-secondary max-w-md mx-auto">
              {t.emptyHistoryDesc}
            </p>
            {onNavigateTab ? (
              <button
                onClick={() => onNavigateTab("search")}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors"
              >
                Start First Comparison
              </button>
            ) : (
              <Link
                href="/search"
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors"
              >
                Start First Comparison
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {reports
              .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
              .map((rep) => {
                const totals = rep.totals || rep.totals_snapshot || computeReportTotals(rep.items || []);
                const saving = totals.saving_total_paise;
                const pmbjpTotal = totals.pmbjp_total_paise;
                return (
                  <div
                    key={rep.report_id}
                    className="p-5 sm:p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 hover:shadow-md transition-shadow"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif font-semibold text-lg sm:text-xl text-ui-text">
                          {rep.patient_label || "Prescription Report"}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-ui-surface-subtle border border-ui-border-decorative text-ui-text">
                          {rep.report_id}
                        </span>
                      </div>

                      <p className="font-sans text-xs text-ui-text-secondary">
                        Created:{" "}
                        <span className="font-semibold text-ui-text">
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
                          <span className="text-ui-text-secondary block text-[10px] uppercase font-bold">
                            Generic Total:
                          </span>
                          <span className="font-serif font-bold text-ui-text">
                            {pmbjpTotal ? formatPaise(pmbjpTotal) : "₹--"}
                          </span>
                        </div>
                        <div>
                          <span className="text-ui-text-secondary block text-[10px] uppercase font-bold">
                            Potential Saving:
                          </span>
                          <span className="font-serif font-bold text-ui-success">
                            {saving ? formatPaise(saving) : "₹0"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                      <Link
                        href={`/prescriptions/${rep.report_id}`}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs rounded-lg shadow-sm transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-white" />
                        <span>Open & Print</span>
                      </Link>

                      <button
                        onClick={(e) => {
                          deleteTriggerRef.current = e.currentTarget;
                          setDeleteTargetId(rep.report_id);
                        }}
                        className="p-2.5 bg-ui-surface hover:bg-rose-50 border border-ui-border-decorative hover:border-rose-300 text-ui-text-secondary hover:text-rose-700 rounded-lg shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-danger"
                        title="Delete from local device"
                        aria-label={`Delete report ${rep.report_id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* Pagination Controls */}
            {reports.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-4 border-t border-ui-border-decorative text-xs font-sans">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3.5 py-1.5 border border-ui-border-decorative bg-ui-surface hover:bg-ui-surface-subtle text-ui-text rounded-lg font-semibold text-xs shadow-xs transition-colors disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="font-semibold text-ui-text">
                  Page {currentPage} of {Math.ceil(reports.length / PAGE_SIZE)} ({reports.length} total)
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) =>
                      Math.min(Math.ceil(reports.length / PAGE_SIZE), p + 1)
                    )
                  }
                  disabled={currentPage >= Math.ceil(reports.length / PAGE_SIZE)}
                  className="px-3.5 py-1.5 border border-ui-border-decorative bg-ui-surface hover:bg-ui-surface-subtle text-ui-text rounded-lg font-semibold text-xs shadow-xs transition-colors disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal (F36) */}
      {deleteTargetId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-report-title"
          className="fixed inset-0 z-50 bg-[#172B4D]/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTargetId(null);
          }}
        >
          <div
            ref={deleteDialogRef}
            className="bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-modal max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-2.5 text-ui-danger">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <h4 id="delete-report-title" className="font-serif font-semibold text-lg text-ui-text">
                Delete Local Report?
              </h4>
            </div>
            <p className="font-sans text-xs text-ui-text-secondary leading-relaxed">
              This report will be permanently removed from this device&apos;s IndexedDB. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                ref={deleteCancelBtnRef}
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 border border-ui-border-decorative bg-ui-surface hover:bg-ui-surface-subtle text-ui-text font-semibold text-xs rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-ui-danger hover:bg-[#911C13] text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-danger"
              >
                {isDeleting ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </ContainerTag>
  );

  if (hideNavbar) {
    return content;
  }

  return (
    <div className="min-h-screen bg-ui-canvas text-ui-text flex flex-col font-sans">
      <Navbar activeTab="history" />
      <div className="flex-1">{content}</div>
    </div>
  );
}
