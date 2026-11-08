"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Disclaimer from "@/components/Disclaimer";
import ChemistSlip from "@/components/ChemistSlip";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getPrescriptionReport,
  savePrescriptionReport,
  computeReportTotals,
  saveActionToken,
  getActionToken,
} from "@/lib/indexedDb";
import { apiClient } from "@/lib/client";
import { formatPaise, formatPercent } from "@/lib/currency";
import {
  Printer,
  Calendar,
  ShieldCheck,
  FileText,
  ArrowLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

export default function PrescriptionDetailPage() {
  const params = useParams();
  const id = params?.id;
  const { t } = useLanguage();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [showSlip, setShowSlip] = useState(false);

  // Load report from IndexedDB
  const loadReport = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    setStorageError(null);
    try {
      const stored = await getPrescriptionReport(id);
      if (!stored) {
        setNotFound(true);
      } else {
        setReport(stored);
      }
    } catch (err) {
      console.error("Failed to read report from IndexedDB:", err);
      setStorageError("Failed to read prescription report from browser storage. IndexedDB may be blocked or unavailable.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (storageError) {
    return (
      <div className="min-h-screen bg-ui-canvas text-ui-text flex flex-col font-sans">
        <Navbar />
        <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center p-8 focus:outline-none">
          <div className="max-w-md w-full bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-ui-danger mx-auto" />
            <h2 className="font-serif font-semibold text-2xl text-ui-text">Storage Access Error</h2>
            <p className="font-sans text-sm text-ui-text-secondary">
              {storageError}
            </p>
            <button
              type="button"
              onClick={loadReport}
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              Retry Reading Report
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="min-h-screen bg-ui-canvas text-ui-text flex flex-col font-sans">
        <Navbar />
        <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center p-8 focus:outline-none">
          <div className="max-w-md w-full bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-ui-warning mx-auto" />
            <h2 className="font-serif font-semibold text-2xl text-ui-text">Prescription Report Not Found</h2>
            <p className="font-sans text-sm text-ui-text-secondary">
              This report may have been deleted or was created on another device.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              Create New Prescription Report
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const totals = report.totals || report.totals_snapshot || computeReportTotals(report.items || []);

  return (
    <div className="min-h-screen bg-ui-canvas text-ui-text flex flex-col font-sans">
      <Navbar />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full space-y-8 focus:outline-none">
        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ui-border-decorative/60 pb-5">
          <div>
            <Link
              href="/history"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ui-text-secondary hover:text-ui-blue uppercase tracking-wider mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Saved Reports</span>
            </Link>
            <h1 className="font-serif font-semibold text-3xl sm:text-4xl text-ui-text tracking-tight">
              {report.patient_label || "Prescription Report"}
            </h1>
            <p className="font-sans text-xs text-ui-text-secondary mt-1">
              Case Ref: <span className="font-mono font-bold text-ui-text">{report.report_id}</span> • Created on{" "}
              {new Date(report.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Action: Print Chemist Slip */}
          <button
            onClick={() => setShowSlip(true)}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print Chemist Slip</span>
          </button>
        </div>

        {/* Aggregate Potential Savings Callout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-ui-text-secondary">
              Total Branded Market Cost
            </span>
            <div className="font-serif font-bold text-3xl text-ui-text/50 line-through mt-1">
              {totals.market_total_paise ? formatPaise(totals.market_total_paise) : "₹--"}
            </div>
          </div>

          <div className="p-5 bg-ui-surface-subtle border border-ui-border-decorative rounded-xl shadow-ui-card">
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-ui-text-secondary">
              Jan Aushadhi Generic Cost
            </span>
            <div className="font-serif font-bold text-3xl text-ui-text mt-1">
              {totals.pmbjp_total_paise ? formatPaise(totals.pmbjp_total_paise) : "₹--"}
            </div>
          </div>

          <div className="p-5 bg-[#EAF5EC] border border-[#BDDDC2] rounded-xl shadow-ui-card">
            <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-ui-success">
              Estimated Potential Savings
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif font-bold text-3xl text-ui-success">
                {totals.saving_total_paise ? formatPaise(totals.saving_total_paise) : "₹--"}
              </span>
              {totals.saving_percent && (
                <span className="text-xs font-bold text-ui-success bg-white/70 border border-[#BDDDC2] px-2.5 py-0.5 rounded-full">
                  {formatPercent(totals.saving_percent)} Saved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Verified Substitutions Table */}
        <div className="bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card overflow-hidden">
          <div className="p-4 bg-ui-surface-subtle border-b border-ui-border-decorative flex justify-between items-center">
            <h3 className="font-serif font-semibold text-base text-ui-text">
              Confirmed Prescription Medicines ({report.items?.length || 0})
            </h3>
            <span className="text-[11px] font-mono font-medium text-ui-text-secondary">
              Device-Local Storage
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-ui-surface-subtle/50 border-b border-ui-border-decorative font-semibold text-ui-text uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3.5">Molecule / Item</th>
                  <th className="p-3.5">PMBJP Code</th>
                  <th className="p-3.5 text-center">Qty</th>
                  <th className="p-3.5">Generic Price</th>
                  <th className="p-3.5">Branded MRP</th>
                  <th className="p-3.5 text-right">Potential Saving</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-decorative/60 font-sans">
                {(report.items || []).map((item, idx) => {
                  const pPrice = item.pmbjp_price || item.comparison_snapshot?.pmbjp_price;
                  const mPrice = item.market_price || item.comparison_snapshot?.market_price;
                  const savingPaise = item.saving_paise ?? item.comparison_snapshot?.saving_paise;
                  return (
                    <tr key={item.medicine_id || idx} className="hover:bg-ui-surface-subtle/40 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-ui-text text-sm">
                          {item.molecule_label || item.matched_text}
                        </div>
                        <div className="text-[11px] text-ui-text-secondary font-normal">
                          {item.strength_label} • {item.form} • {item.pack_label || "Standard unit"}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono font-medium text-ui-text">
                        {item.pmbjp_product_code || "Not verified"}
                      </td>
                      <td className="p-3.5 text-center font-semibold text-ui-text">
                        {item.pack_count || 1}
                      </td>
                      <td className="p-3.5 font-serif font-bold text-ui-text">
                        {pPrice ? formatPaise(pPrice.amount_paise) : "₹--"}
                      </td>
                      <td className="p-3.5 font-serif line-through text-ui-text-secondary">
                        {mPrice ? formatPaise(mPrice.amount_paise) : "₹--"}
                      </td>
                      <td className="p-3.5 text-right font-serif font-bold text-ui-success">
                        {savingPaise ? `Save ${formatPaise(savingPaise)}` : "No saving"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cloud Dispatch Notice (U08) */}
        <div className="bg-ui-surface border border-ui-border-decorative rounded-xl p-6 sm:p-7 space-y-4 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg bg-ui-surface-subtle border border-ui-border-decorative text-ui-blue flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-ui-blue" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif font-bold text-base text-ui-text">
                Live Cloud Reminders & Checkup Calls
              </h3>
              <p className="text-xs text-ui-text-secondary leading-relaxed">
                This dossier is an offline price comparison saved on your device. Automated daily WhatsApp dosage reminders and outbound tele-verification checkup calls are managed through your authenticated Patient Workspace for confirmed active medical prescriptions.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-ui-blue hover:bg-ui-blue-hover text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <span>Open Patient Workspace</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
            <span className="text-xs text-ui-text-secondary">
              Review or upload prescriptions directly to activate automated alerts.
            </span>
          </div>
        </div>

        {/* Print Slip Modal */}
        {showSlip && (
          <ChemistSlip report={report} onClose={() => setShowSlip(false)} />
        )}

        <Disclaimer />
      </main>
    </div>
  );
}
