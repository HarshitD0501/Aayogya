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
  const [showSlip, setShowSlip] = useState(false);

  // Load report from IndexedDB
  const loadReport = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    try {
      const stored = await getPrescriptionReport(id);
      if (!stored) {
        setNotFound(true);
      } else {
        setReport(stored);
      }
    } catch (err) {
      setNotFound(true);
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

  if (notFound || !report) {
    return (
      <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
        <Navbar />
        <div className="flex-1 max-w-xl mx-auto p-8 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-brand-orange mx-auto" />
          <h2 className="font-serif font-black text-2xl">Prescription Report Not Found</h2>
          <p className="font-sans text-sm text-brand-gray">
            This report may have been deleted or was created on another device.
          </p>
          <Link
            href="/search"
            className="inline-block px-5 py-2.5 bg-brand-navy text-brand-cream border-2 border-brand-navy font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch"
          >
            Create New Prescription Report
          </Link>
        </div>
      </div>
    );
  }

  const totals = report.totals || report.totals_snapshot || computeReportTotals(report.items || []);

  return (
    <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full space-y-8">
        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-brand-navy/10 pb-5">
          <div>
            <Link
              href="/history"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-gray hover:text-brand-navy uppercase tracking-wider mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Saved Reports</span>
            </Link>
            <h1 className="font-serif font-black text-3xl sm:text-4xl text-brand-navy tracking-tight">
              {report.patient_label || "Prescription Report"}
            </h1>
            <p className="font-sans text-xs text-brand-gray mt-1">
              Case Ref: <span className="font-mono font-bold text-brand-navy">{report.report_id}</span> • Created on{" "}
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
            className="flex items-center gap-2 px-5 py-3 bg-brand-orange text-brand-navy border-2 border-brand-navy font-serif font-black text-sm uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover"
          >
            <Printer className="w-4 h-4" />
            <span>Print Chemist Slip</span>
          </button>
        </div>

        {/* Aggregate Potential Savings Callout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-brand-gray">
              Total Branded Market Cost
            </span>
            <div className="font-serif font-black text-3xl text-brand-navy/70 line-through mt-1">
              {totals.market_total_paise ? formatPaise(totals.market_total_paise) : "₹--"}
            </div>
          </div>

          <div className="p-5 bg-brand-cream border-2 border-brand-navy sketchy-box shadow-sketch">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-brand-gray">
              Jan Aushadhi Generic Cost
            </span>
            <div className="font-serif font-black text-3xl text-brand-navy mt-1">
              {totals.pmbjp_total_paise ? formatPaise(totals.pmbjp_total_paise) : "₹--"}
            </div>
          </div>

          <div className="p-5 bg-brand-orange/20 border-2 border-brand-navy sketchy-box shadow-sketch">
            <span className="text-[10px] font-sans font-black uppercase tracking-wider text-brand-navy">
              Estimated Potential Savings
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif font-black text-3xl text-brand-navy">
                {totals.saving_total_paise ? formatPaise(totals.saving_total_paise) : "₹--"}
              </span>
              {totals.saving_percent && (
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                  {formatPercent(totals.saving_percent)} Saved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Verified Substitutions Table */}
        <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch overflow-hidden">
          <div className="p-4 bg-brand-cream border-b-2 border-brand-navy flex justify-between items-center">
            <h3 className="font-serif font-black text-base uppercase tracking-wider text-brand-navy">
              Confirmed Prescription Medicines ({report.items?.length || 0})
            </h3>
            <span className="text-[11px] font-mono font-bold text-brand-gray">
              Device-Local Storage
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-brand-white border-b-2 border-brand-navy/20 font-black text-brand-navy uppercase tracking-wider">
                <tr>
                  <th className="p-3">Molecule / Item</th>
                  <th className="p-3">PMBJP Code</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3">Generic Price</th>
                  <th className="p-3">Branded MRP</th>
                  <th className="p-3 text-right">Potential Saving</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy/10 font-sans">
                {(report.items || []).map((item, idx) => {
                  const pPrice = item.pmbjp_price || item.comparison_snapshot?.pmbjp_price;
                  const mPrice = item.market_price || item.comparison_snapshot?.market_price;
                  const savingPaise = item.saving_paise ?? item.comparison_snapshot?.saving_paise;
                  return (
                    <tr key={item.medicine_id || idx} className="hover:bg-brand-cream/40">
                      <td className="p-3 font-bold">
                        <div className="text-brand-navy text-sm">
                          {item.molecule_label || item.matched_text}
                        </div>
                        <div className="text-[11px] text-brand-gray font-normal">
                          {item.strength_label} • {item.form} • {item.pack_label || "10 tablets"}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-brand-navy">
                        {item.pmbjp_product_code || "Not verified"}
                      </td>
                      <td className="p-3 text-center font-bold text-brand-navy">
                        {item.pack_count || 1}
                      </td>
                      <td className="p-3 font-serif font-bold text-brand-navy">
                        {pPrice ? formatPaise(pPrice.amount_paise) : "₹--"}
                      </td>
                      <td className="p-3 font-serif line-through text-brand-gray">
                        {mPrice ? formatPaise(mPrice.amount_paise) : "₹--"}
                      </td>
                      <td className="p-3 text-right font-serif font-black text-emerald-800">
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
