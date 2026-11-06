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
    <div className="absolute top-full left-0 right-0 mt-2 z-30 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-xl overflow-hidden divide-y divide-ui-border-decorative/60 animate-in fade-in-50 duration-150">
      {isOffline && (
        <div className="p-2.5 bg-ui-surface-subtle border-b border-ui-border-decorative flex items-center gap-2 text-xs font-semibold text-ui-text">
          <AlertCircle className="w-4 h-4 text-ui-warning flex-shrink-0" />
          <span>Offline Catalogue: Showing stored label suggestions. Live price comparison paused.</span>
        </div>
      )}

      <ul id="search-suggestions-listbox" className="max-h-80 overflow-y-auto" role="listbox">
        {candidates.map((cand, idx) => {
          const isSelected = highlightedIndex === idx;
          return (
            <li
              id={`suggestion-${idx}`}
              key={cand.medicine_id || idx}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelectCandidate && onSelectCandidate(cand)}
              className={`p-3.5 sm:p-4 cursor-pointer transition-colors flex items-center justify-between gap-4 ${
                isSelected
                  ? "bg-ui-surface-subtle text-ui-blue font-semibold"
                  : "hover:bg-ui-surface-subtle/50 text-ui-text"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-ui-surface-subtle border border-ui-border-decorative rounded-lg mt-0.5 text-ui-blue">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-serif font-semibold text-sm sm:text-base text-ui-text">
                      {cand.matched_text || cand.molecule_label}
                    </span>
                    {cand.strength_label && (
                      <span className="text-[11px] font-sans font-semibold px-2 py-0.5 bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded uppercase tracking-wider">
                        {cand.strength_label}
                      </span>
                    )}
                    {cand.form && (
                      <span className="text-[11px] font-sans font-medium px-2 py-0.5 bg-ui-surface-subtle text-ui-text-secondary border border-ui-border-decorative rounded">
                        {cand.form}
                      </span>
                    )}
                  </div>

                  <p className="font-sans text-xs text-ui-text-secondary mt-1">
                    <span className="font-semibold text-ui-text">Molecule:</span> {cand.molecule_label} •{" "}
                    <span className="font-semibold text-ui-text">Pack:</span> {cand.pack_label || "Standard Unit"}
                  </p>

                  {cand.brands && cand.brands.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-semibold text-ui-text-secondary uppercase tracking-wider">
                        Popular Brands:
                      </span>
                      {cand.brands.map((b) => (
                        <span
                          key={b.brand_id}
                          className="text-[10px] font-medium bg-ui-surface-subtle border border-ui-border-decorative px-1.5 py-0.5 rounded text-ui-text"
                        >
                          {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {cand.match_score != null ? (
                  <span className="text-[10px] font-mono font-bold bg-ui-surface-subtle border border-ui-border-decorative px-2 py-1 rounded text-ui-blue">
                    Match: {Math.round(cand.match_score)}%
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-medium text-ui-text-secondary bg-ui-surface-subtle border border-ui-border-decorative px-2 py-1 rounded">
                    Candidate
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-ui-text-secondary" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
