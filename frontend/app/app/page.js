"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, getToken, clearToken, loginAsDemo, setActivePatientId } from "@/lib/api";
import dynamic from "next/dynamic";
import Login from "@/components/Login";

const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center p-6 text-brand-navy">
      <img src="/aayogya-logo.png" alt="Ayogya" className="h-12 w-auto object-contain animate-pulse mb-4" />
      <p className="font-serif font-black text-xl tracking-tight">Opening Ayogya Patient Dashboard…</p>
    </div>
  ),
});

const Caregiver = dynamic(() => import("@/components/Caregiver"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center p-6 text-brand-navy">
      <img src="/aayogya-logo.png" alt="Ayogya" className="h-12 w-auto object-contain animate-pulse mb-4" />
      <p className="font-serif font-black text-xl tracking-tight">Opening Caregiver Hub…</p>
    </div>
  ),
});

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientParam = searchParams?.get("patient");
  const tabParam = searchParams?.get("tab");

  const [patient, setPatient] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1. If explicit ?patient= query, login as that demo patient
      if (patientParam) {
        try {
          const p = await loginAsDemo(patientParam);
          if (alive) {
            setPatient(p);
            if (p?.id) setActivePatientId(p.id);
            setReady(true);
            return;
          }
        } catch (e) {
          console.warn("Failed to load requested demo patient:", e);
        }
      }

      // 2. If token exists in storage, verify session
      if (getToken()) {
        try {
          const me = await api("/auth/me");
          if (alive) {
            setPatient(me);
            if (me?.id) setActivePatientId(me.id);
            setReady(true);
            return;
          }
        } catch {
          clearToken();
        }
      }

      // 3. Unauthenticated session: prompt for sign-in or explicit demo selection
      if (alive) {
        setPatient(null);
        setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [patientParam]);

  const handleGoHome = () => {
    router.push("/");
  };

  const handleLogout = () => {
    clearToken();
    setActivePatientId(null);
    setPatient(null);
  };

  const handleSwitchPatient = async (patientId) => {
    try {
      const p = await loginAsDemo(patientId);
      setPatient(p);
      if (p?.id) setActivePatientId(p.id);
      const url = new URL(window.location.href);
      url.searchParams.set("patient", patientId);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      alert("Failed to switch patient: " + (e.message || "Unknown error"));
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center p-6 text-brand-navy">
        <img src="/aayogya-logo.png" alt="Ayogya" className="h-12 w-auto object-contain animate-pulse mb-4" />
        <p className="font-serif font-black text-xl tracking-tight">
          Opening Ayogya Patient Dashboard…
        </p>
        <p className="font-sans text-xs text-brand-gray mt-1">
          Loading verified prescriptions and clinical modules
        </p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-brand-cream flex flex-col justify-center py-10 sm:px-6 lg:px-8">
        <Login onLogin={(p) => { setPatient(p); if (p?.id) setActivePatientId(p.id); }} onBack={handleGoHome} />
      </div>
    );
  }

  if (patient?.role === "caregiver") {
    return (
      <Caregiver
        caregiver={patient}
        onLogout={handleLogout}
        onGoHome={handleGoHome}
      />
    );
  }

  return (
    <Dashboard
      patient={patient}
      onLogout={handleLogout}
      onGoHome={handleGoHome}
      onSwitchPatient={handleSwitchPatient}
      initialSection={tabParam || "summary"}
    />
  );
}

export default function AppShell() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center p-6 text-brand-navy">
          <img src="/aayogya-logo.png" alt="Ayogya" className="h-12 w-auto object-contain animate-pulse mb-4" />
          <p className="font-serif font-black text-xl">Opening Ayogya Dashboard…</p>
        </div>
      }
    >
      <AppContent />
    </Suspense>
  );
}
