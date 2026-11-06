"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Disclaimer({ compact = false }) {
  const { t } = useLanguage();

  if (compact) {
    return (
      <aside
        role="note"
        aria-label="Medical notice"
        className="flex items-center gap-2.5 p-3 bg-ui-surface border border-ui-border-decorative text-xs text-ui-text rounded-lg shadow-xs"
      >
        <ShieldAlert className="w-4 h-4 text-ui-blue flex-shrink-0" />
        <span className="font-sans font-medium">{t.disclaimerText}</span>
      </aside>
    );
  }

  return (
    <aside
      role="note"
      aria-label="Medical notice"
      className="p-4 sm:p-5 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card my-6"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-ui-surface-subtle border border-ui-border-decorative flex items-center justify-center flex-shrink-0 mt-0.5 text-ui-blue">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-serif font-semibold text-sm text-ui-text mb-1 flex items-center gap-2">
            <span>{t.disclaimerTitle}</span>
            <span className="text-[10px] font-sans font-semibold bg-ui-surface-subtle text-ui-text border border-ui-border-decorative px-2 py-0.5 uppercase tracking-wider rounded-full">
              Medical Guidance Notice
            </span>
          </h4>
          <p className="font-sans text-xs sm:text-sm text-ui-text-secondary leading-relaxed">
            {t.disclaimerText}
          </p>
        </div>
      </div>
    </aside>
  );
}
