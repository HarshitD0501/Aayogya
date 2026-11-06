"use client";

import React, { useEffect, useRef } from "react";
import { formatPaise } from "@/lib/currency";
import { Printer, ShieldAlert, X } from "lucide-react";

export default function ChemistSlip({ report, onClose }) {
  const dialogRef = useRef(null);
  const printButtonRef = useRef(null);

  useEffect(() => {
    // Preserve triggering element to restore focus on close
    const previousFocus = typeof document !== "undefined" ? document.activeElement : null;

    // Scroll lock on body
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Set initial focus to primary print action
    const timer = setTimeout(() => {
      printButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
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
      if (previousFocus && typeof previousFocus.focus === "function") {
        try {
          previousFocus.focus();
        } catch {}
      }
    };
  }, [onClose]);

  if (!report) return null;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chemist-slip-title"
      className="fixed inset-0 z-50 bg-[#172B4D]/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-modal w-full max-w-2xl p-6 sm:p-8 space-y-6 relative my-8 print:my-0 print:p-0 print:border-none print:shadow-none print:max-w-none"
      >
        {/* Top Controls (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-ui-border-decorative pb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span id="chemist-slip-title" className="font-serif font-semibold text-lg text-ui-text">
              Counter Print Slip
            </span>
            <span className="text-[10px] font-sans font-semibold bg-ui-surface-subtle text-ui-blue border border-ui-border-decorative px-2 py-0.5 rounded-full uppercase tracking-wider">
              Chemist Ready
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              ref={printButtonRef}
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg font-semibold text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              <Printer className="w-4 h-4" />
              <span>Print Slip</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 border border-ui-border-decorative bg-ui-surface hover:bg-ui-surface-subtle text-ui-text rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
                aria-label="Close Preview"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Printable Prescription Requisition Document */}
        <div className="space-y-6 text-ui-text print:text-black">
          {/* Header */}
          <div className="text-center border-b-2 border-ui-text/80 pb-4 print:border-black">
            <h2 className="font-serif font-black text-2xl uppercase tracking-tight">
              Ayogya — Generic Medicine Requisition
            </h2>
            <p className="text-xs font-sans font-bold tracking-widest uppercase text-ui-text-secondary mt-1">
              Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP) Verification Slip
            </p>
            <div className="flex justify-between items-center text-[11px] font-mono mt-3 text-ui-text-secondary border-t border-ui-border-decorative pt-2">
              <span>Report ID: {report.report_id}</span>
              <span>Generated: {new Date(report.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          </div>

          {/* Table of Confirmed Substitutions */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-ui-text/80 text-[10px] uppercase font-black text-ui-text tracking-wider print:border-black">
                <th className="py-2">Item / Molecule Description</th>
                <th className="py-2">Strength & Form</th>
                <th className="py-2">PMBJP Code</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Generic Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-decorative font-sans print:divide-black/20">
              {(report.items || []).map((item, idx) => {
                const pPrice = item.pmbjp_price || item.comparison_snapshot?.pmbjp_price;
                return (
                  <tr key={item.medicine_id || idx} className="py-2">
                    <td className="py-2.5 font-bold">
                      <div>{item.molecule_label || item.matched_text}</div>
                      {item.brand_name && (
                        <div className="text-[10px] text-ui-text-secondary font-normal">
                          Prescribed as: {item.brand_name}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5">
                      {item.strength_label} • {item.form}
                    </td>
                    <td className="py-2.5 font-mono font-bold">
                      {item.pmbjp_product_code || "Not verified"}
                    </td>
                    <td className="py-2.5 text-center font-bold">
                      {item.pack_count || 1}
                    </td>
                    <td className="py-2.5 text-right font-bold">
                      {pPrice ? formatPaise(pPrice.amount_paise) : "₹--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Total & Savings Snapshot */}
          <div className="p-4 bg-ui-surface-subtle border border-ui-border-decorative flex justify-between items-center text-xs print:border-black">
            <span className="font-bold uppercase tracking-wider text-ui-text">
              Estimated Total Generic Cost:
            </span>
            <span className="font-serif font-black text-xl text-ui-text print:text-black">
              {(report.totals?.pmbjp_total_paise || report.totals_snapshot?.pmbjp_total_paise)
                ? formatPaise(report.totals?.pmbjp_total_paise || report.totals_snapshot?.pmbjp_total_paise)
                : "₹--"}
            </span>
          </div>

          {/* Mandatory Medical Disclaimer Stamp */}
          <div className="p-3 border-2 border-ui-border-decorative border-dashed text-[11px] leading-relaxed text-ui-text print:border-black">
            <div className="font-black uppercase tracking-wider mb-0.5 flex items-center gap-1.5 text-ui-warning">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Mandatory Medical Notice</span>
            </div>
            <p className="text-ui-text-secondary print:text-black">
              Informational only — confirm with doctor or pharmacist before substituting. / 
              केवल सूचनात्मक — दवा बदलने से पहले डॉक्टर या फार्मासिस्ट से पुष्टि करें।
            </p>
          </div>

          {/* Pharmacist Signature Block */}
          <div className="pt-6 border-t border-ui-border-decorative flex justify-between items-end text-[10px] text-ui-text-secondary print:border-black print:text-black">
            <div>
              <p>Dispensing Kendra Name / Code: _____________________</p>
              <p className="mt-1">Chemist Reg No: _____________________________</p>
            </div>
            <div className="text-right">
              <div className="w-40 border-b border-ui-text mb-1 print:border-black" />
              <span>Pharmacist Signature & Stamp</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
