"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function WorkspaceError({ error, reset }) {
  useEffect(() => {
    console.error("Workspace boundary caught rendering error:", error);
  }, [error]);

  return (
    <div className="workspace-v2 min-h-screen bg-ui-canvas text-ui-text flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-ui-surface border border-ui-border-decorative rounded-2xl p-6 sm:p-8 shadow-ui-card text-center space-y-4">
        <img
          src="/aayogya-logo.png"
          alt="Ayogya"
          className="h-9 w-auto object-contain mx-auto mb-2"
        />

        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-ui-danger flex items-center justify-center mx-auto" aria-hidden="true">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <h1 className="font-serif font-semibold text-2xl text-ui-text">
            Workspace Error
          </h1>
          <p className="text-xs sm:text-sm text-ui-text-secondary leading-relaxed">
            Could not render the requested clinical module. Your account session is active and no data was lost.
          </p>
        </div>

        {error?.message && (
          <div
            role="alert"
            className="p-3 bg-ui-surface-subtle border border-ui-border-decorative rounded-lg text-left text-xs font-mono text-ui-text-secondary overflow-x-auto max-h-28"
          >
            {error.message}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reload Module</span>
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
          >
            <Home className="w-3.5 h-3.5 text-ui-blue" aria-hidden="true" />
            <span>Return to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

