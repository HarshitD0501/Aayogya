"use client";

import React from "react";
import { Pill, CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";

export default function SearchSuggestions({
  candidates = [],
  highlightedIndex = -1,
  onSelectCandidate,
  isOffline = false,
}) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-2 z-30 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch overflow-hidden divide-y-2 divide-brand-navy/10 animate-in fade-in-50 duration-150">
      {isOffline && (
        <div className="p-2.5 bg-brand-orange/20 border-b-2 border-brand-navy/20 flex items-center gap-2 text-xs font-bold text-brand-navy">
          <AlertCircle className="w-4 h-4 text-brand-orange flex-shrink-0" />
          <span>Offline Catalogue: Showing stored label suggestions. Live price comparison paused.</span>
        </div>
      )}

      <ul className="max-h-80 overflow-y-auto" role="listbox">
        {candidates.map((cand, idx) => {
          const isSelected = highlightedIndex === idx;
          return (
            <li
              key={cand.medicine_id || idx}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelectCandidate && onSelectCandidate(cand)}
              className={`p-3 sm:p-4 cursor-pointer transition-colors flex items-center justify-between gap-4 ${
                isSelected
                  ? "bg-brand-peach/40 text-brand-navy font-semibold"
                  : "hover:bg-brand-cream text-brand-navy"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-brand-orange/20 border border-brand-navy/30 rounded-sm mt-0.5">
                  <Pill className="w-4 h-4 text-brand-navy" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-serif font-black text-sm sm:text-base text-brand-navy">
                      {cand.matched_text || cand.molecule_label}
                    </span>
                    {cand.strength_label && (
                      <span className="text-[11px] font-sans font-bold px-2 py-0.5 bg-brand-navy text-brand-cream rounded-sm uppercase tracking-wider">
                        {cand.strength_label}
                      </span>
                    )}
                    {cand.form && (
                      <span className="text-[11px] font-sans font-medium px-2 py-0.5 bg-brand-peach/40 text-brand-navy rounded-sm">
                        {cand.form}
                      </span>
                    )}
                  </div>

                  <p className="font-sans text-xs text-brand-gray mt-1">
                    <span className="font-bold text-brand-navy">Molecule:</span> {cand.molecule_label} •{" "}
                    <span className="font-bold text-brand-navy">Pack:</span> {cand.pack_label || "Standard Unit"}
                  </p>

                  {cand.brands && cand.brands.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-brand-gray uppercase tracking-wider">
                        Popular Brands:
                      </span>
                      {cand.brands.map((b) => (
                        <span
                          key={b.brand_id}
                          className="text-[10px] font-semibold bg-brand-cream border border-brand-navy/20 px-1.5 py-0.5 rounded text-brand-navy"
                        >
                          {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-mono font-bold bg-brand-navy/5 border border-brand-navy/20 px-2 py-1 rounded text-brand-navy">
                  Match: {cand.match_score ?? 85}%
                </span>
                <ChevronRight className="w-4 h-4 text-brand-gray" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
