"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { BrandMark, Pill } from "@/components/ui";
import ShinyText from "@/components/reactbits/ShinyText";
import {
  Summary,
  Upload,
  Medicines,
  Interactions,
  Prices,
  Reports,
} from "@/components/sections";
import Pharmacies from "@/components/Pharmacies";
import Assistant from "@/components/Assistant";
import {
  Activity,
  UploadCloud,
  Pill as PillIcon,
  ShieldAlert,
  Tag,
  MapPin,
  FileText,
  LogOut,
  User,
  HeartPulse,
  Bot,
  Home,
  Users,
} from "lucide-react";

const SECTIONS = [
  {
    key: "summary",
    label: "Overview",
    Icon: Activity,
    Comp: Summary,
    title: "Health Overview",
    sub: "Your conditions, daily dose schedule, and next doctor review at a glance.",
  },
  {
    key: "assistant",
    label: "Ask Sahayak",
    Icon: Bot,
    Comp: Assistant,
    title: "Voice Assistant",
    sub: "Talk or type to ask about your medicines, interactions, prices and next visit.",
  },
  {
    key: "upload",
    label: "Upload Script",
    Icon: UploadCloud,
    Comp: Upload,
    title: "Upload Prescription",
    sub: "Snap or pick a photo — Gemini Vision extracts meds, you confirm safety.",
  },
  {
    key: "medicines",
    label: "Active Medicines",
    Icon: PillIcon,
    Comp: Medicines,
    title: "Your Active Medicines",
    sub: "Consolidated list across all your treating physicians.",
  },
  {
    key: "interactions",
    label: "Safety Check",
    Icon: ShieldAlert,
    Comp: Interactions,
    title: "Drug Interaction Safety Check",
    sub: "Automated conflict detection to prevent dangerous drug-drug interactions.",
  },
  {
    key: "prices",
    label: "Price Comparison",
    Icon: Tag,
    Comp: Prices,
    title: "Fair Price Comparison",
    sub: "Real-time pricing across trusted Indian pharmacy partners.",
  },
  {
    key: "pharmacies",
    label: "Nearby Chemists",
    Icon: MapPin,
    Comp: Pharmacies,
    title: "Nearby Pharmacies",
    sub: "Find local stores, confirm stock, and get instant turn-by-turn directions.",
  },
  {
    key: "reports",
    label: "Records & History",
    Icon: FileText,
    Comp: Reports,
    title: "Prescription History",
    sub: "Secure archival of all uploaded prescriptions and doctor notes.",
  },
];

export default function Dashboard({ patient, onLogout, onGoHome, onSwitchPatient }) {
  const [active, setActive] = useState("summary");
  const mainRef = useRef(null);
  const current = SECTIONS.find((s) => s.key === active) || SECTIONS[0];
  const Comp = current.Comp;

  // GSAP smooth section entrance
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
      );
    }, el);
    return () => ctx.revert();
  }, [active]);

  const initials = patient?.name
    ? patient.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "PT";

  return (
    <div className="shell">
      <aside className="sidebar">
        <BrandMark />

        {onGoHome && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onGoHome}
            title="Return to Public Landing Page"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              width: "100%",
              justifyContent: "flex-start",
              marginTop: 10,
              marginBottom: 4,
              color: "var(--ink-secondary)",
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 10px",
              borderRadius: 8,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
            }}
          >
            <Home size={14} color="#e8a838" />
            <span>← Landing Page</span>
          </button>
        )}

        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {SECTIONS.map((s) => {
            const Icon = s.Icon;
            const isActive = s.key === active;
            return (
              <button
                key={s.key}
                className={`nav-item ${isActive ? "active" : ""}`.trim()}
                onClick={() => setActive(s.key)}
              >
                <span className="ic">
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                </span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="nav-spacer" />

        <div className="who-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #e8a838, #b07f14)",
                color: "#1a2234",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 13,
                boxShadow: "0 4px 10px rgba(232, 168, 56, 0.35)",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="nm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#f8fafc", fontWeight: 700, fontSize: 13.5 }}>
                {patient.name}
              </div>
              <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
                {patient.email || patient.phone}
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <Pill tone={patient.plan === "pro" ? "brand" : "accent"}>
              {patient.plan === "pro" ? "Pro Member" : "Free Account"}
            </Pill>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onLogout}
              title="Sign out of Aayogya"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px" }}
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>

          {onSwitchPatient && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <Users size={12} />
                <span>Switch Demo Patient:</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "ramesh", label: "Ramesh" },
                  { id: "shanti", label: "Shanti" },
                  { id: "aarav", label: "Aarav" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`lp-chip ${patient?.id === p.id ? "active" : ""}`}
                    onClick={() => onSwitchPatient(p.id)}
                    style={{
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        <div className="topbar">
          <div className="topbar-header">
            <div>
              <h2 className="topbar-title">{current.title}</h2>
              <p className="topbar-sub">{current.sub}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="live-sync-badge">
                <HeartPulse size={14} color="#e8a838" className="animate-pulse" />
                Live Sync
              </span>
            </div>
          </div>
        </div>

        <Comp patient={patient} goto={setActive} />
      </main>
    </div>
  );
}
