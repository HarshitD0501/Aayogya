"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, getToken, clearToken, loginAsDemo, setActivePatientId } from "@/lib/api";
import Login from "@/components/Login";
import Dashboard from "@/components/Dashboard";
import Caregiver from "@/components/Caregiver";

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientParam = searchParams.get("patient");
  const tabParam = searchParams.get("tab");
  const [patient, setPatient] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Demo selection is explicit; normal visits keep the current session.
        const me = patientParam ? await loginAsDemo(patientParam) : getToken() ? await api("/auth/me") : null;
        if (alive) setPatient(me);
      } catch {
        clearToken();
        if (alive) setPatient(null);
      } finally {
        if (alive) setReady(true);
      }
    })();
    const onLogout = () => {
      clearToken();
      setPatient(null);
    };
    window.addEventListener("aayogya:logout", onLogout);
    window.addEventListener("aarogya:logout", onLogout);
    return () => {
      alive = false;
      window.removeEventListener("aayogya:logout", onLogout);
      window.removeEventListener("aarogya:logout", onLogout);
    };
  }, [patientParam]);

  const handleLogout = () => {
    clearToken();
    setActivePatientId(null);
    setPatient(null);
    router.push("/");
  };

  const handleSwitchPatient = async (id) => {
    try {
      const me = await loginAsDemo(id);
      setPatient(me);
      router.replace(`/app?patient=${encodeURIComponent(id)}`);
    } catch (error) {
      alert(`Failed to switch patient: ${error.message || "Unknown error"}`);
    }
  };

  if (!ready) {
    return <div className="boot"><span className="spinner" /></div>;
  }

  if (!patient) {
    return <Login onLogin={setPatient} onBack={() => router.push("/")} />;
  }

  if (patient.role === "caregiver") {
    return <Caregiver caregiver={patient} onLogout={handleLogout} onGoHome={() => router.push("/")} />;
  }

  return (
    <Dashboard
      patient={patient}
      onLogout={handleLogout}
      onGoHome={() => router.push("/")}
      onSwitchPatient={handleSwitchPatient}
      initialSection={tabParam || "summary"}
    />
  );
}

export default function AppShell() {
  return (
    <Suspense fallback={<div className="boot"><span className="spinner" /></div>}>
      <AppContent />
    </Suspense>
  );
}
