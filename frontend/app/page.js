"use client";

import { useEffect, useState } from "react";
import { api, getToken, clearToken } from "@/lib/api";
import Landing from "@/components/Landing";
import Login from "@/components/Login";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const [patient, setPatient] = useState(null);
  const [view, setView] = useState("landing"); // landing | login
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (getToken()) {
        try {
          const me = await api("/auth/me");
          if (alive) setPatient(me);
        } catch {
          clearToken();
        }
      }
      if (alive) setReady(true);
    })();

    const onLogout = () => {
      setPatient(null);
      setView("landing");
    };
    window.addEventListener("aarogya:logout", onLogout);
    return () => {
      alive = false;
      window.removeEventListener("aarogya:logout", onLogout);
    };
  }, []);

  if (!ready)
    return (
      <div className="boot">
        <span className="spinner" />
      </div>
    );

  if (patient)
    return (
      <Dashboard
        patient={patient}
        onLogout={() => {
          clearToken();
          setPatient(null);
          setView("landing");
        }}
      />
    );

  if (view === "login")
    return <Login onLogin={setPatient} onBack={() => setView("landing")} />;

  return <Landing onEnter={() => setView("login")} />;
}
