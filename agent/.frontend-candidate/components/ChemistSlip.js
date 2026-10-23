"use client";

import React from "react";
import { formatPaise } from "@/lib/currency";
import { Printer, ShieldAlert, X } from "lucide-react";

export default function ChemistSlip({ report, onClose }) {
  if (!report) return null;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-brand-navy/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch w-full max-w-2xl p-6 sm:p-8 space-y-6 relative my-8 print:m-0 print:p-0 print:border-none print:shadow-none">
        
        {/* Top Controls (Hidden in Print) */}
        <div className="flex items-center justify-between border-b-2 border-brand-navy/20 pb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-serif font-black text-lg text-brand-navy">
              Counter Print Slip
            </span>
            <span className="text-[10px] font-sans font-bold bg-brand-orange text-brand-navy px-2 py-0.5 rounded uppercase tracking-widest border border-brand-navy">
              Chemist Ready
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover"
            >
              <Printer className="w-4 h-4" />
              <span>Print Slip</span>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 border-2 border-brand-navy bg-brand-cream text-brand-navy rounded hover:bg-brand-peach/40"
                aria-label="Close Preview"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Printable Prescription Requisition Document */}
        <div className="space-y-6 text-brand-navy print:text-black">
          
          {/* Header */}
          <div className="text-center border-b-2 border-brand-navy pb-4">
            <h2 className="font-serif font-black text-2xl uppercase tracking-tight">
              Aushadh-AI — Generic Medicine Requisition
            </h2>
            <p className="text-xs font-sans font-bold tracking-widest uppercase text-brand-gray mt-1">
              Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP) Verification Slip
            </p>
            <div className="flex justify-between items-center text-[11px] font-mono mt-3 text-brand-navy/70 border-t border-brand-navy/10 pt-2">
              <span>Report ID: {report.report_id}</span>
              <span>Generated: {new Date(report.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          </div>

          {/* Table of Confirmed Substitutions */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-brand-navy text-[10px] uppercase font-black text-brand-navy tracking-wider">
                <th className="py-2">Item / Molecule Description</th>
                <th className="py-2">Strength & Form</th>
                <th className="py-2">PMBJP Code</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Generic Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy/20 font-sans">
              {(report.items || []).map((item, idx) => (
                <tr key={item.medicine_id || idx} className="py-2">
                  <td className="py-2.5 font-bold">
                    <div>{item.molecule_label || item.matched_text}</div>
                    {item.brand_name && (
                      <div className="text-[10px] text-brand-gray font-normal">
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
                    {item.pmbjp_price ? formatPaise(item.pmbjp_price.amount_paise) : "₹--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total & Savings Snapshot */}
          <div className="p-4 bg-brand-cream/60 border border-brand-navy/40 flex justify-between items-center text-xs">
            <span className="font-bold uppercase tracking-wider">
              Estimated Total Generic Cost:
            </span>
            <span className="font-serif font-black text-xl">
              {report.totals?.pmbjp_total_paise ? formatPaise(report.totals.pmbjp_total_paise) : "₹--"}
            </span>
          </div>

          {/* Mandatory Medical Disclaimer Stamp */}
          <div className="p-3 border-2 border-brand-navy border-dashed text-[11px] leading-relaxed text-brand-navy">
            <div className="font-black uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-brand-orange" />
              <span>Mandatory Medical Notice</span>
            </div>
            <p>
              Informational only — confirm with doctor or pharmacist before substituting. / 
              केवल सूचनात्मक — दवा बदलने से पहले डॉक्टर या फार्मासिस्ट से पुष्टि करें।
            </p>
          </div>

          {/* Pharmacist Signature Block */}
          <div className="pt-6 border-t border-brand-navy/20 flex justify-between items-end text-[10px] text-brand-gray">
            <div>
              <p>Dispensing Kendra Name / Code: _____________________</p>
              <p className="mt-1">Chemist Reg No: _____________________________</p>
            </div>
            <div className="text-right">
              <div className="w-40 border-b border-brand-navy mb-1" />
              <span>Pharmacist Signature & Stamp</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
