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
    <div className="bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card p-5 sm:p-7 space-y-6 animate-in zoom-in-95 duration-200">
      
      {/* Header: Exact Medicine Identity */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-ui-border-decorative/60 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-sans font-semibold uppercase tracking-wider bg-ui-surface-subtle text-ui-text px-2.5 py-0.5 rounded-full border border-ui-border-decorative">
              PMBJP Code: {item.pmbjp_product_code || "Not verified"}
            </span>
            {item.release_type && (
              <span className="text-[10px] font-sans font-medium bg-ui-surface-subtle text-ui-text-secondary px-2 py-0.5 rounded border border-ui-border-decorative">
                {item.release_type}
              </span>
            )}
          </div>
          <h3 className="font-serif font-semibold text-2xl sm:text-3xl text-ui-text tracking-tight">
            {item.matched_text || item.molecule_label}
          </h3>
          <p className="font-sans text-sm text-ui-text-secondary mt-1">
            <span className="font-semibold text-ui-text">Molecule:</span> {item.molecule_label} •{" "}
            <span className="font-semibold text-ui-text">Strength:</span> {item.strength_label} •{" "}
            <span className="font-semibold text-ui-text">Form:</span> {item.form} •{" "}
            <span className="font-semibold text-ui-text">Pack:</span> {item.pack_label}
          </p>
        </div>

        {/* Quantity Stepper */}
        <div className="flex items-center gap-2 self-start bg-ui-surface border border-ui-control-border rounded-lg px-3 py-1.5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-ui-text mr-1">Qty:</span>
          <button
            onClick={() => onPackCountChange && onPackCountChange(Math.max(1, packCount - 1))}
            className="w-6 h-6 bg-ui-surface border border-ui-control-border rounded flex items-center justify-center font-bold text-ui-text hover:bg-ui-surface-subtle transition-colors"
            disabled={packCount <= 1}
            aria-label="Decrease pack quantity"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="font-mono font-bold text-sm text-ui-text px-2">{packCount}</span>
          <button
            onClick={() => onPackCountChange && onPackCountChange(packCount + 1)}
            className="w-6 h-6 bg-ui-surface border border-ui-control-border rounded flex items-center justify-center font-bold text-ui-text hover:bg-ui-surface-subtle transition-colors"
            aria-label="Increase pack quantity"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Pricing Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Jan Aushadhi (PMBJP) Price */}
        <div className="p-5 bg-ui-surface-subtle border border-ui-border-decorative rounded-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <span className="text-[10px] font-sans font-semibold bg-ui-blue text-white px-2 py-0.5 uppercase tracking-wider rounded">
              Govt Generic
            </span>
          </div>
          <div>
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-ui-text-secondary">
              Pradhan Mantri Jan Aushadhi
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif font-bold text-3xl sm:text-4xl text-ui-text">
                {hasPmbjp ? formatPaise(item.pmbjp_price.amount_paise) : "₹--"}
              </span>
              <span className="text-xs font-sans text-ui-text-secondary font-medium">
                /{item.pmbjp_price?.unit || "pack"}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-ui-border-decorative/60 text-[11px] text-ui-text-secondary space-y-0.5">
            <div className="flex justify-between">
              <span>Source:</span>
              <span className="font-medium text-ui-text">
                {item.pmbjp_price?.source || "PMBJP Official Catalogue"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Verified On:</span>
              <span>{item.pmbjp_price?.checked_on || "Not provided"}</span>
            </div>
          </div>
        </div>

        {/* Branded Market MRP */}
        <div className="p-5 bg-ui-surface border border-ui-border-decorative rounded-xl flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-ui-text-secondary">
              Branded Market Price
            </span>
            {item.brand_name && (
              <span className="text-[9px] font-semibold bg-ui-surface-subtle text-ui-text border border-ui-border-decorative px-1.5 py-0.5 rounded">
                {item.brand_name}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif font-bold text-3xl sm:text-4xl text-ui-text/50 line-through">
              {hasMarket ? formatPaise(item.market_price.amount_paise) : "₹--"}
            </span>
            <span className="text-xs font-sans text-ui-text-secondary font-medium">
              /{item.market_price?.unit || "pack"}
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-ui-border-decorative/60 text-[11px] text-ui-text-secondary space-y-0.5">
            <div className="flex justify-between">
              <span>Source:</span>
              <span className="font-medium text-ui-text">
                {item.market_price?.source || "Retail Reference Database"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Verified On:</span>
              <span>{item.market_price?.checked_on || "Not provided"}</span>
            </div>
          </div>
        </div>

        {/* NPPA Ceiling Price */}
        <div className="p-5 bg-ui-surface border border-ui-border-decorative rounded-xl flex flex-col justify-between">
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-ui-text-secondary">
            NPPA Ceiling Cap
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif font-bold text-2xl sm:text-3xl text-ui-text">
              {item.nppa_ceiling_price ? formatPaise(item.nppa_ceiling_price.amount_paise) : "No Cap Set"}
            </span>
            {item.nppa_ceiling_price && (
              <span className="text-xs font-sans text-ui-text-secondary">
                /{item.nppa_ceiling_price.unit}
              </span>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-ui-border-decorative/60 text-[11px] text-ui-text-secondary space-y-0.5">
            <div className="flex justify-between">
              <span>Regulation:</span>
              <span className="font-medium text-ui-text">DPCO 2013</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="text-ui-success font-semibold">Price Regulated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Verified Savings Callout Hero */}
      {hasSavings ? (
        <div className="p-5 bg-[#EAF5EC] border border-[#BDDDC2] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ui-success text-white flex items-center justify-center flex-shrink-0 font-bold">
              ✓
            </div>
            <div>
              <span className="text-xs font-sans font-bold uppercase tracking-wider text-ui-success">
                Verified Potential Savings
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-serif font-bold text-2xl sm:text-3xl text-ui-success">
                  Save {formatPaise(item.saving_paise)}
                </span>
                <span className="text-xs font-sans font-bold text-ui-success bg-white/70 border border-[#BDDDC2] px-2.5 py-0.5 rounded-full">
                  {formatPercent(item.saving_percent)} Less
                </span>
              </div>
            </div>
          </div>

          {/* Action: Add to Report */}
          <button
            onClick={() => onAddToReport && onAddToReport(item, packCount)}
            disabled={isAdding}
            className={`px-5 py-3 font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 ${
              addedSuccess
                ? "bg-ui-success text-white border border-ui-success"
                : "bg-ui-blue hover:bg-ui-blue-hover text-white"
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
        <div className="p-4 bg-ui-surface-subtle border border-dashed border-ui-border-decorative rounded-xl text-xs text-ui-text-secondary font-medium flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-ui-warning flex-shrink-0" />
          <span>No verified comparison available for this exact brand match. Showing individual pricing for transparency.</span>
        </div>
      )}

      {/* Mandatory Medical Disclaimer */}
      <Disclaimer compact />
    </div>
  );
}
