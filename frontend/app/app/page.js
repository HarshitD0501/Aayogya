"use client";

import React, { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth/AuthProvider";
import { getToken } from "@/lib/api";
import { getWorkspaceRoleHint, preloadWorkspace } from "@/lib/workspacePreload";

function WorkspaceLoading({ label = "Opening workspace" }) {
  return (
    <div className="workspace-v2 min-h-screen flex bg-ui-canvas text-ui-text" role="status" aria-live="polite">
      <div className="hidden lg:flex w-[268px] shrink-0 flex-col gap-3 bg-ui-surface border-r border-ui-border-decorative p-4" aria-hidden="true">
        <img src="/aayogya-logo.png" alt="" className="h-8 w-auto object-contain self-start mb-5" />
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-10 rounded-lg bg-ui-surface-subtle" />)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-16 bg-ui-surface border-b border-ui-border-decorative flex items-center px-4 sm:px-8">
          <img src="/aayogya-logo.png" alt="" className="lg:hidden h-7 w-auto object-contain" />
          <span className="ml-3 lg:ml-0 font-serif font-semibold text-lg">{label}</span>
        </div>
        <div className="max-w-[1200px] mx-auto p-4 sm:p-8">
          <p className="text-sm text-ui-text-secondary mb-5">Preparing your account and dashboard…</p>
          <div className="grid sm:grid-cols-3 gap-4" aria-hidden="true">
            {[0, 1, 2].map((item) => <div key={item} className="h-24 bg-ui-surface border border-ui-border-decorative rounded-xl" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => <WorkspaceLoading label="Opening patient dashboard" />,
});

const Caregiver = dynamic(() => import("@/components/Caregiver"), {
  ssr: false,
  loading: () => <WorkspaceLoading label="Opening caregiver workspace" />,
});

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const { user, ready, sessionError, retrySession, openLogin, logout } = useAuth();
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (!getToken()) return;
    const roleHint = getWorkspaceRoleHint();
    if (roleHint) void preloadWorkspace(roleHint).catch(() => {});
  }, []);

  // If session check finished and user is not authenticated, prompt sign-in once
  useEffect(() => {
    if (ready && !user && !sessionError && !promptShownRef.current) {
      promptShownRef.current = true;
      openLogin("/app");
    }
  }, [ready, user, sessionError, openLogin]);

  const handleGoHome = () => {
    router.push("/");
  };

  if (!ready) {
    return <WorkspaceLoading label="Checking your session" />;
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-ui-canvas flex items-center justify-center p-4 text-ui-text">
        <div className="w-full max-w-md rounded-xl border border-ui-border-decorative bg-ui-surface p-6 shadow-ui-card">
          <h1 className="font-serif text-2xl font-semibold">Connection is taking longer than expected</h1>
          <p className="mt-2 text-sm text-ui-text-secondary">Your session is saved. We could not reach the server to verify it yet.</p>
          <p className="mt-2 text-xs text-ui-text-secondary" role="alert">{sessionError}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={retrySession} className="min-h-[44px] rounded-lg bg-ui-blue px-5 py-2 text-sm font-semibold text-white hover:bg-ui-blue-hover">Try again</button>
            <button type="button" onClick={handleGoHome} className="min-h-[44px] rounded-lg border border-ui-border-decorative px-5 py-2 text-sm font-semibold">Return home</button>
          </div>
        </div>
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
      fallback={<WorkspaceLoading />}
    >
      <AppContent />
    </Suspense>
  );
}
