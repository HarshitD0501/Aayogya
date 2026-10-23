"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { googleAuth, login, register as registerAccount } from "@/lib/api";
import { useReveal } from "@/lib/gsap";
import { BrandMark, Note, Pill } from "@/components/ui";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import { ArrowRight, ArrowLeft, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";

const DEMOS = [
  { name: "Ramesh Kulkarni (Caregiver)", email: "ramesh.caregiver@demo.in", role: "caregiver", plan: "Caregiver", desc: "Caregiver dashboard for Ram Sharma" },
  { name: "Ram Sharma (Patient)", email: "ram@demo.in", role: "patient", plan: "Free", desc: "Patient dashboard with a sample prescription" },
  { name: "Meera Kulkarni (Caregiver)", email: "meera@demo.in", plan: "Caregiver", desc: "Family dashboard — manage 4 members, call & WhatsApp them" },
  { name: "Ramesh Kulkarni", email: "ramesh@demo.in", plan: "Free", desc: "Sample prescription with diabetes & BP meds" },
  { name: "Shanti Devi", email: "shanti@demo.in", plan: "Pro", desc: "Multi-doctor safety demo with detected drug interactions" },
  { name: "Aarav Sharma", email: "aarav@demo.in", plan: "Free", desc: "Active medication schedule demo" },
];
const DEMO_PW = "pass1234";
const DEMOS_ENABLED = process.env.NODE_ENV !== "production";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export default function Login({ onLogin, onBack }) {
  const [id, setId] = useState(DEMOS_ENABLED ? "ramesh@demo.in" : "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("patient");
  const [pw, setPw] = useState(DEMOS_ENABLED ? DEMO_PW : "");
  const [registering, setRegistering] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scope = useReveal([]);
  const googleButton = useRef(null);
  const googleHandler = useRef(null);

  const go = async (identifier, password) => {
    setBusy(true);
    setErr("");
    try {
      const p = await login(identifier, password, role);
      onLogin(p);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    setBusy(true);
    setErr("");
    try {
      const p = await registerAccount({ name, email, phone, password: pw, role });
      onLogin(p);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  googleHandler.current = async (credential) => {
    setBusy(true);
    setErr("");
    try {
      const p = await googleAuth({
        credential,
        mode: registering ? "register" : "login",
        role,
      });
      onLogin(p);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!googleReady || !GOOGLE_CLIENT_ID || !window.google?.accounts?.id || !googleButton.current) return;

    window.__aayogyaGoogleCredentialHandler = (credential) => {
      googleHandler.current?.(credential);
    };
    if (!window.__aayogyaGoogleInitialized) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => window.__aayogyaGoogleCredentialHandler?.(response.credential),
      });
      window.__aayogyaGoogleInitialized = true;
    }
    googleButton.current.replaceChildren();
    window.google.accounts.id.renderButton(googleButton.current, {
      theme: "outline",
      size: "large",
      text: registering ? "signup_with" : "signin_with",
      shape: "rectangular",
      width: Math.min(googleButton.current.clientWidth || 360, 360),
    });

    return () => {
      window.__aayogyaGoogleCredentialHandler = null;
    };
  }, [googleReady, registering]);

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
          {registering ? "Create your account." : <>Your medicines, <ShinyText text="made clear." /></>}
        </h1>
        <p className="sub" data-reveal>
          {registering
            ? `Create a ${role} account to save prescription reviews and manage your medicines.`
            : "Sign in to analyze prescriptions, monitor your daily schedule, check medicine interactions, and compare local pharmacy prices."}
        </p>

        <div role="group" aria-label="Account type" style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {["patient", "caregiver"].map((accountRole) => (
            <button
              key={accountRole}
              type="button"
              className={`btn btn-sm ${role === accountRole ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={role === accountRole}
              onClick={() => setRole(accountRole)}
            >
              {accountRole === "patient" ? "Patient" : "Caregiver"}
            </button>
          ))}
        </div>

        <form
          data-reveal
          onSubmit={(e) => {
            e.preventDefault();
            if (registering) createAccount();
            else go(id, pw);
          }}
        >
          {registering ? (
            <>
              <div className="field">
                <label htmlFor="register-name">Full name</label>
                <input
                  id="register-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label htmlFor="register-email">Email address</label>
                <input
                  id="register-email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </div>
              <div className="field">
                <label htmlFor="register-phone">Indian mobile number</label>
                <input
                  id="register-phone"
                  type="tel"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  required
                />
              </div>
            </>
          ) : (
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
                required
              />
            </div>
          )}

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
              autoComplete={registering ? "new-password" : "current-password"}
              minLength={registering ? 8 : undefined}
              maxLength={128}
              required
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
                <span>{registering ? `Create ${role} account` : "Sign in"}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {GOOGLE_CLIENT_ID ? (
          <>
            <div style={{ margin: "14px 0 8px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
              or continue with Google
            </div>
            <div ref={googleButton} style={{ display: "flex", justifyContent: "center", minHeight: 40 }} />
            <Script
              src="https://accounts.google.com/gsi/client"
              strategy="afterInteractive"
              onLoad={() => setGoogleReady(true)}
              onError={() => setErr("Google sign-in could not load. Please use your password instead.")}
            />
          </>
        ) : (
          <p className="small muted" style={{ marginTop: 12, textAlign: "center" }}>
            Google sign-in is unavailable until the OAuth client ID is configured.
          </p>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 8 }}
          onClick={() => {
            setRegistering((value) => !value);
            setErr("");
          }}
          disabled={busy}
        >
          {registering ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>

        {DEMOS_ENABLED && !registering && <div className="demo-list" data-reveal>
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
                        background:
                          d.plan === "Caregiver"
                            ? "rgba(124, 58, 237, 0.12)"
                            : d.plan === "Pro"
                            ? "rgba(30, 58, 138, 0.1)"
                            : "rgba(37, 99, 235, 0.1)",
                        color:
                          d.plan === "Caregiver"
                            ? "#7c3aed"
                            : d.plan === "Pro"
                            ? "#1e3a8a"
                            : "#2563eb",
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
                    setRole(d.role || (d.plan === "Caregiver" ? "caregiver" : "patient"));
                    setErr("");
                  }}
                  style={{ marginLeft: 8 }}
                >
                  Use account
                </button>
              </div>
            ))}
          </div>
        </div>}
      </SpotlightCard>
    </div>
  );
}
