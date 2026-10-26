"use client";

import React, { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth/AuthProvider";

const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-ui-canvas flex flex-col items-center justify-center p-6 text-ui-text">
      <img src="/aayogya-logo.png" alt="Ayogya" className="h-10 w-auto object-contain animate-pulse mb-4" />
      <p className="font-serif font-semibold text-lg tracking-tight">Opening Ayogya Patient Dashboard…</p>
    </div>
  ),
});

const Caregiver = dynamic(() => import("@/components/Caregiver"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-ui-canvas flex flex-col items-center justify-center p-6 text-ui-text">
      <img src="/aayogya-logo.png" alt="Ayogya" className="h-10 w-auto object-contain animate-pulse mb-4" />
      <p className="font-serif font-semibold text-lg tracking-tight">Opening Caregiver Hub…</p>
    </div>
  ),
});

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const { user, ready, openLogin, logout } = useAuth();
  const promptShownRef = useRef(false);

  // If session check finished and user is not authenticated, prompt sign-in once
  useEffect(() => {
    if (ready && !user && !promptShownRef.current) {
      promptShownRef.current = true;
      openLogin("/app");
    }
  }, [ready, user, openLogin]);

  const handleGoHome = () => {
    router.push("/");
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-ui-canvas flex flex-col items-center justify-center p-6 text-ui-text">
        <img src="/aayogya-logo.png" alt="Ayogya" className="h-10 w-auto object-contain animate-pulse mb-4" />
        <p className="font-serif font-semibold text-lg tracking-tight">
          Opening Ayogya Workspace…
        </p>
        <p className="text-xs text-ui-text-secondary mt-1">
          Verifying session credentials and clinical modules
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-ui-canvas flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 text-center">
        <div className="w-full max-w-md bg-ui-surface border border-ui-border-decorative rounded-2xl p-8 shadow-ui-card">
          <img src="/aayogya-logo.png" alt="Ayogya" className="h-10 w-auto object-contain mx-auto mb-4" />
          <h2 className="font-serif text-2xl font-semibold text-ui-text tracking-tight mb-2">
            Ayogya Workspace
          </h2>
          <p className="text-xs sm:text-sm text-ui-text-secondary mb-6 leading-relaxed">
            Please sign in with your patient or caregiver credentials to access clinical summaries, prescriptions, and adherence telemetry.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => openLogin("/app")}
              className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white text-sm font-semibold rounded-lg transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={handleGoHome}
              className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user?.role === "caregiver") {
    return (
      <Caregiver
        caregiver={user}
        onLogout={logout}
        onGoHome={handleGoHome}
      />
    );
  }

  return (
    <Dashboard
      patient={user}
      onLogout={logout}
      onGoHome={handleGoHome}
      initialSection={tabParam || "summary"}
    />
  );
}

export default function AppShell() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ui-canvas flex flex-col items-center justify-center p-6 text-ui-text">
          <img src="/aayogya-logo.png" alt="Ayogya" className="h-10 w-auto object-contain animate-pulse mb-4" />
          <p className="font-serif font-semibold text-lg">Opening Ayogya Dashboard…</p>
        </div>
      }
    >
      <AppContent />
    </Suspense>
  );
}
