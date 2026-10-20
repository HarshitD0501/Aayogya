"use client";

import { useEffect, useState } from "react";
import { api, getToken, clearToken, loginAsDemo, setActivePatientId } from "@/lib/api";
import Landing from "@/components/Landing";
import Login from "@/components/Login";
import Dashboard from "@/components/Dashboard";
import Caregiver from "@/components/Caregiver";

export default function Home() {
  const [patient, setPatient] = useState(null);
  const [view, setView] = useState("landing"); // "landing" | "login" | "dashboard"
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (getToken()) {
        try {
          const me = await api("/auth/me");
          if (alive) {
            setPatient(me);
            setView("dashboard");
          }
        } catch {
          clearToken();
        }
      }
      if (alive) setReady(true);
    })();

    const onLogout = () => {
      clearToken();
      setPatient(null);
      setView("landing");
    };
    window.addEventListener("aayogya:logout", onLogout);
    window.addEventListener("aarogya:logout", onLogout);
    return () => {
      alive = false;
      window.removeEventListener("aayogya:logout", onLogout);
      window.removeEventListener("aarogya:logout", onLogout);
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    setActivePatientId(null);
    setPatient(null);
    setView("landing");
  };

  const handleSelectDemo = async (patientId) => {
    try {
      const p = await loginAsDemo(patientId);
      setPatient(p);
      setView("dashboard");
    } catch (e) {
      alert("Failed to sign in demo patient: " + (e.message || "Unknown error"));
    }
  };

  const handleLoginSuccess = (p) => {
    setPatient(p);
    setView("dashboard");
  };

  if (!ready) {
    return (
      <div className="boot">
        <span className="spinner" />
      </div>
    );
  }

  // If in dashboard view and authenticated, show the right shell by role
  if (view === "dashboard" && patient) {
    if (patient.role === "caregiver") {
      return (
        <Caregiver
          caregiver={patient}
          onLogout={handleLogout}
          onGoHome={() => setView("landing")}
        />
      );
    }
    return (
      <Dashboard
        patient={patient}
        onLogout={handleLogout}
        onGoHome={() => setView("landing")}
        onSwitchPatient={handleSelectDemo}
      />
    );
  }

  // Fallback explicit login view
  if (view === "login") {
    return (
      <Login
        onLogin={handleLoginSuccess}
        onBack={() => setView("landing")}
      />
    );
  }

  // Default Landing page with live REST API integration
  return (
    <Landing
      patient={patient}
      onEnter={() => setView("login")}
      onSelectDemo={handleSelectDemo}
      onOpenDashboard={() => setView("dashboard")}
      onLoginSuccess={handleLoginSuccess}
      onLogout={handleLogout}
    />
  );
}
