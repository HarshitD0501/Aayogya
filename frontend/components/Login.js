"use client";

import { useState } from "react";
import { login } from "@/lib/api";
import { useReveal } from "@/lib/gsap";
import { BrandMark, Note, Pill } from "@/components/ui";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import { ArrowRight, ArrowLeft, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";

const DEMOS = [
  { name: "Ramesh Kulkarni", email: "ramesh@demo.in", plan: "Free", desc: "Sample prescription with diabetes & BP meds" },
  { name: "Shanti Devi", email: "shanti@demo.in", plan: "Pro", desc: "Multi-doctor safety demo with detected drug interactions" },
  { name: "Aarav Sharma", email: "aarav@demo.in", plan: "Free", desc: "Active medication schedule demo" },
];
const DEMO_PW = "pass1234";

export default function Login({ onLogin, onBack }) {
  const [id, setId] = useState("ramesh@demo.in");
  const [pw, setPw] = useState(DEMO_PW);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scope = useReveal([]);

  const go = async (identifier, password) => {
    setBusy(true);
    setErr("");
    try {
      const p = await login(identifier, password);
      onLogin(p);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login" ref={scope}>
      <SpotlightCard
        className="login-card"
        spotlightColor="rgba(99, 102, 241, 0.15)"
        borderColor="rgba(37, 99, 235, 0.4)"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <BrandMark />
          <Pill tone="brand">AI Health Companion</Pill>
        </div>

        {onBack && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            style={{ marginTop: 14, padding: "5px 10px", alignSelf: "flex-start" }}
          >
            <ArrowLeft size={14} />
            <span>Back to home</span>
          </button>
        )}

        <h1 data-reveal style={{ marginTop: 24 }}>
          Your medicines, <ShinyText text="made clear." />
        </h1>
        <p className="sub" data-reveal>
          Sign in to analyze prescriptions, monitor your daily schedule, check cross-doctor interactions, and compare local pharmacy prices.
        </p>

        <form
          data-reveal
          onSubmit={(e) => {
            e.preventDefault();
            go(id, pw);
          }}
        >
          <div className="field">
            <label htmlFor="id" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Mail size={14} /> Email or Phone Number
            </label>
            <input
              id="id"
              className="input"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              placeholder="e.g. ramesh@demo.in"
            />
          </div>

          <div className="field">
            <label htmlFor="pw" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Lock size={14} /> Password
            </label>
            <input
              id="pw"
              type="password"
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {err && <Note tone="err">{err}</Note>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            style={{ marginTop: 14 }}
            disabled={busy}
          >
            {busy ? (
              <span>Authenticating…</span>
            ) : (
              <>
                <span>Access Health Dashboard</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="demo-list" data-reveal>
          <div className="lbl" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={13} color="#2563eb" />
            <span>Instant Demo Accounts (pass1234)</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {DEMOS.map((d) => (
              <div className="demo-row" key={d.email}>
                <div className="who" style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{d.name}</span>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: d.plan === "Pro" ? "rgba(30, 58, 138, 0.1)" : "rgba(37, 99, 235, 0.1)",
                        color: d.plan === "Pro" ? "#1e3a8a" : "#2563eb",
                      }}
                    >
                      {d.plan}
                    </span>
                  </div>
                  <small style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.desc}
                  </small>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setId(d.email);
                    setPw(DEMO_PW);
                    go(d.email, DEMO_PW);
                  }}
                  style={{ marginLeft: 8 }}
                >
                  Enter →
                </button>
              </div>
            ))}
          </div>
        </div>
      </SpotlightCard>
    </div>
  );
}
