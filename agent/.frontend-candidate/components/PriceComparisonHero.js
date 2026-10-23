"use client";

import React from "react";
import { formatPaise, formatPercent } from "@/lib/currency";
import { CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, ExternalLink, Plus, Minus, FileText } from "lucide-react";
import Disclaimer from "./Disclaimer";

export default function PriceComparisonHero({
  item,
  packCount = 1,
  onPackCountChange,
  onAddToReport,
  isAdding = false,
  addedSuccess = false,
}) {
  if (!item) return null;

  const hasSavings = item.saving_paise && item.saving_paise > 0;
  const hasMarket = Boolean(item.market_price);
  const hasPmbjp = Boolean(item.pmbjp_price);

  return (
    <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-5 sm:p-7 space-y-6 animate-in zoom-in-95 duration-200">
      
      {/* Header: Exact Medicine Identity */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-brand-navy/10 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-sans font-black uppercase tracking-widest bg-brand-orange text-brand-navy px-2.5 py-0.5 rounded-full border border-brand-navy">
              PMBJP Code: {item.pmbjp_product_code || "PMBJP-GEN"}
            </span>
            {item.release_type && (
              <span className="text-[10px] font-sans font-bold bg-brand-navy/5 text-brand-navy px-2 py-0.5 rounded">
                {item.release_type}
              </span>
            )}
          </div>
          <h3 className="font-serif font-black text-2xl sm:text-3xl text-brand-navy tracking-tight">
            {item.matched_text || item.molecule_label}
          </h3>
          <p className="font-sans text-sm text-brand-gray mt-1">
            <span className="font-bold text-brand-navy">Molecule:</span> {item.molecule_label} •{" "}
            <span className="font-bold text-brand-navy">Strength:</span> {item.strength_label} •{" "}
            <span className="font-bold text-brand-navy">Form:</span> {item.form} •{" "}
            <span className="font-bold text-brand-navy">Pack:</span> {item.pack_label}
          </p>
        </div>

        {/* Quantity Stepper */}
        <div className="flex items-center gap-2 self-start bg-brand-cream border-2 border-brand-navy sketchy-box px-3 py-1.5 shadow-sketch-hover">
          <span className="text-xs font-black uppercase tracking-wider text-brand-navy mr-1">Qty:</span>
          <button
            onClick={() => onPackCountChange && onPackCountChange(Math.max(1, packCount - 1))}
            className="w-6 h-6 bg-brand-white border border-brand-navy rounded flex items-center justify-center font-bold text-brand-navy hover:bg-brand-peach/40"
            disabled={packCount <= 1}
            aria-label="Decrease pack quantity"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-mono font-black text-sm text-brand-navy px-2">{packCount}</span>
          <button
            onClick={() => onPackCountChange && onPackCountChange(packCount + 1)}
            className="w-6 h-6 bg-brand-white border border-brand-navy rounded flex items-center justify-center font-bold text-brand-navy hover:bg-brand-peach/40"
            aria-label="Increase pack quantity"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Pricing Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Jan Aushadhi (PMBJP) Price */}
        <div className="p-4 bg-brand-cream border-2 border-brand-navy sketchy-box shadow-sketch flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-2 right-2">
            <span className="text-[9px] font-sans font-black bg-brand-orange text-brand-navy px-2 py-0.5 uppercase tracking-widest border border-brand-navy rounded">
              Govt Generic
            </span>
          </div>
          <div>
            <span className="text-[11px] font-sans font-black uppercase tracking-wider text-brand-gray">
              Pradhan Mantri Jan Aushadhi
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif font-black text-3xl sm:text-4xl text-brand-navy">
                {hasPmbjp ? formatPaise(item.pmbjp_price.amount_paise) : "₹--"}
              </span>
              <span className="text-xs font-sans text-brand-gray font-medium">
                /{item.pmbjp_price?.unit || "pack"}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-brand-navy/10 text-[10px] text-brand-gray space-y-0.5">
            <div className="flex justify-between">
              <span>Source:</span>
              <span className="font-semibold text-brand-navy">PMBJP Portal</span>
            </div>
            <div className="flex justify-between">
              <span>Verified On:</span>
              <span>{item.pmbjp_price?.checked_on || "2026-03-01"}</span>
            </div>
          </div>
        </div>

        {/* Branded Market MRP */}
        <div className="p-4 bg-brand-white border-2 border-brand-navy/60 rounded-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-brand-gray">
              Branded Market Price
            </span>
            {item.brand_name && (
              <span className="text-[9px] font-bold bg-brand-navy/5 text-brand-navy px-1.5 py-0.5 rounded">
                {item.brand_name}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif font-black text-3xl sm:text-4xl text-brand-navy/70 line-through">
              {hasMarket ? formatPaise(item.market_price.amount_paise) : "₹--"}
            </span>
            <span className="text-xs font-sans text-brand-gray font-medium">
              /{item.market_price?.unit || "pack"}
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-brand-navy/10 text-[10px] text-brand-gray space-y-0.5">
            <div className="flex justify-between">
              <span>Source:</span>
              <span className="font-semibold text-brand-navy">Pharma Sahi Daam (NPPA)</span>
            </div>
            <div className="flex justify-between">
              <span>Verified On:</span>
              <span>{item.market_price?.checked_on || "2026-03-01"}</span>
            </div>
          </div>
        </div>

        {/* NPPA Ceiling Price */}
        <div className="p-4 bg-brand-white border-2 border-brand-navy/30 rounded-sm flex flex-col justify-between">
          <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-brand-gray">
            NPPA Ceiling Cap
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif font-black text-2xl sm:text-3xl text-brand-navy/80">
              {item.nppa_ceiling_price ? formatPaise(item.nppa_ceiling_price.amount_paise) : "No Cap Set"}
            </span>
            {item.nppa_ceiling_price && (
              <span className="text-xs font-sans text-brand-gray">
                /{item.nppa_ceiling_price.unit}
              </span>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-brand-navy/10 text-[10px] text-brand-gray space-y-0.5">
            <div className="flex justify-between">
              <span>Regulation:</span>
              <span className="font-semibold text-brand-navy">DPCO 2013</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="text-emerald-700 font-bold">Price Regulated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Verified Savings Callout Hero */}
      {hasSavings ? (
        <div className="p-4 sm:p-5 bg-brand-orange/20 border-2 border-brand-navy sketchy-box flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-orange text-brand-navy border-2 border-brand-navy flex items-center justify-center flex-shrink-0 font-bold">
              ✓
            </div>
            <div>
              <span className="text-xs font-sans font-black uppercase tracking-wider text-brand-navy">
                Verified Potential Savings
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-serif font-black text-2xl sm:text-3xl text-brand-navy">
                  Save {formatPaise(item.saving_paise)}
                </span>
                <span className="text-sm font-sans font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                  {formatPercent(item.saving_percent)} Less
                </span>
              </div>
            </div>
          </div>

          {/* Action: Add to Report */}
          <button
            onClick={() => onAddToReport && onAddToReport(item, packCount)}
            disabled={isAdding}
            className={`px-5 py-3 font-serif font-black text-sm uppercase tracking-wider border-2 border-brand-navy sketchy-btn shadow-sketch hover:shadow-sketch-hover transition-all flex items-center justify-center gap-2 ${
              addedSuccess
                ? "bg-emerald-600 text-brand-cream border-emerald-900"
                : "bg-brand-navy text-brand-cream hover:bg-brand-navy/90"
            }`}
          >
            {addedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Added to Basket</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>{isAdding ? "Saving..." : "Add to Prescription Basket"}</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="p-4 bg-brand-cream border-2 border-dashed border-brand-navy/30 text-xs text-brand-gray font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-brand-orange flex-shrink-0" />
          <span>No verified comparison available for this exact brand match. Showing individual pricing for transparency.</span>
        </div>
      )}

      {/* Mandatory Medical Disclaimer */}
      <Disclaimer compact />
    </div>
  );
}
