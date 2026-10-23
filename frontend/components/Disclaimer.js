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
        className="flex items-center gap-2 p-3 bg-brand-peach/20 border border-brand-navy/30 text-xs text-brand-navy/90 rounded-sm"
      >
        <ShieldAlert className="w-4 h-4 text-brand-orange flex-shrink-0" />
        <span className="font-sans font-medium">{t.disclaimerText}</span>
      </aside>
    );
  }

  return (
    <aside
      role="note"
      aria-label="Medical notice"
      className="p-4 sm:p-5 bg-brand-peach/30 border-2 border-brand-navy sketchy-box shadow-sketch my-6"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-orange/30 border-2 border-brand-navy flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5 text-brand-navy" />
        </div>
        <div>
          <h4 className="font-serif font-black text-sm uppercase tracking-wider text-brand-navy mb-1 flex items-center gap-2">
            <span>{t.disclaimerTitle}</span>
            <span className="text-[10px] font-sans font-bold bg-brand-navy text-brand-cream px-2 py-0.5 uppercase tracking-widest rounded-full">
              Legal Compliance
            </span>
          </h4>
          <p className="font-sans text-xs sm:text-sm text-brand-navy/80 font-medium leading-relaxed">
            {t.disclaimerText}
          </p>
        </div>
      </div>
    </aside>
  );
}
