"use client";

import React, { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { login, register as registerAccount, googleAuth } from "@/lib/api";
import { preloadWorkspace } from "@/lib/workspacePreload";
import {
  X,
  Lock,
  Mail,
  User,
  Phone,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Users,
} from "lucide-react";

const DEMO_PW = "pass1234";
const DEMOS_ENABLED = process.env.NODE_ENV !== "production";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export default function LoginDialog({
  isOpen,
  onClose,
  onSuccess,
  initialMessage = "",
}) {
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState("patient"); // 'patient' | 'caregiver'
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [googleReady, setGoogleReady] = useState(false);

  const dialogRef = useRef(null);
  const firstInputRef = useRef(null);
  const googleButton = useRef(null);
  const googleHandler = useRef(null);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    // Set initial focus
    const timer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);

    // Scroll lock on body
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Google OAuth handler
  googleHandler.current = async (credential) => {
    setBusy(true);
    setErr("");
    void preloadWorkspace(role).catch(() => {});
    try {
      const user = await googleAuth({
        credential,
        mode: isRegister ? "register" : "login",
        role,
      });
      onSuccess(user);
    } catch (e) {
      setErr(e.message || "Google authentication failed");
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
        callback: (res) => window.__aayogyaGoogleCredentialHandler?.(res.credential),
      });
      window.__aayogyaGoogleInitialized = true;
    }

    googleButton.current.replaceChildren();
    window.google.accounts.id.renderButton(googleButton.current, {
      theme: "outline",
      size: "large",
      text: isRegister ? "signup_with" : "signin_with",
      shape: "rectangular",
      width: 320,
    });
  }, [googleReady, isRegister, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    void preloadWorkspace(role).catch(() => {});

    try {
      if (isRegister) {
        const user = await registerAccount({
          name: name.trim(),
          email: id.trim(),
          phone: phone.trim(),
          password: pw,
          role,
        });
        onSuccess(user);
      } else {
        const user = await login(id.trim(), pw, role);
        onSuccess(user);
      }
    } catch (e) {
      setErr(e.message || "Authentication failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  const handleSelectDemo = (demoType) => {
    if (demoType === "caregiver") {
      void preloadWorkspace("caregiver").catch(() => {});
      setId("meera@demo.in");
      setPw(DEMO_PW);
      setRole("caregiver");
      setIsRegister(false);
      setErr("");
    } else if (demoType === "patient_pro") {
      void preloadWorkspace("patient").catch(() => {});
      setId("shanti@demo.in");
      setPw(DEMO_PW);
      setRole("patient");
      setIsRegister(false);
      setErr("");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="ui-modal-root fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#172B4D]/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {GOOGLE_CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGoogleReady(true)}
        />
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
        className="w-full max-w-[408px] max-h-[calc(100dvh-32px)] bg-ui-surface border border-ui-border-decorative rounded-2xl shadow-ui-modal flex flex-col overflow-hidden"
      >
        {/* Dialog Header */}
        <div className="flex items-center justify-between p-5 border-b border-ui-border-decorative/60 bg-ui-canvas/40">
          <div className="flex items-center gap-2.5">
            <img src="/aayogya-logo.png" alt="Ayogya" className="h-7 w-auto object-contain" />
            <span className="text-xs font-semibold uppercase tracking-wider text-ui-text-secondary">
              Secure Access
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication dialog"
            className="p-1.5 text-ui-text-secondary hover:text-ui-text hover:bg-ui-surface-subtle rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Dialog Body (Scrollable) */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {initialMessage && (
            <div className="p-3 bg-[#FFF8E6] border border-[#F1D699] rounded-lg text-xs font-medium text-ui-warning flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-ui-warning" aria-hidden="true" />
              <span>{initialMessage}</span>
            </div>
          )}

          <div>
            <h2 id="login-dialog-title" className="font-serif text-2xl font-semibold text-ui-text tracking-tight">
              {isRegister ? "Create your account" : "Sign in to Ayogya"}
            </h2>
            <p className="text-xs text-ui-text-secondary mt-1">
              {isRegister
                ? "Start managing prescription safety and family adherence."
                : "Enter your credentials or choose an approved testing demo."}
            </p>
          </div>

          {/* Role Selection Tabs */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-ui-text block">Select workspace role:</span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-ui-canvas border border-ui-border-decorative rounded-xl">
              <button
                type="button"
                onClick={() => setRole("patient")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  role === "patient"
                    ? "bg-ui-surface text-ui-blue shadow-sm border border-ui-border-decorative/60"
                    : "text-ui-text-secondary hover:text-ui-text"
                }`}
              >
                <User size={14} aria-hidden="true" />
                <span>Patient</span>
              </button>
              <button
                type="button"
                onClick={() => setRole("caregiver")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  role === "caregiver"
                    ? "bg-ui-surface text-ui-blue shadow-sm border border-ui-border-decorative/60"
                    : "text-ui-text-secondary hover:text-ui-text"
                }`}
              >
                <Users size={14} aria-hidden="true" />
                <span>Caregiver</span>
              </button>
            </div>
          </div>

          {/* Error Notice */}
          {err && (
            <div role="alert" className="p-3 bg-[#FDF0EE] border border-[#F5B5AE] text-ui-danger text-xs font-semibold rounded-lg flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-ui-danger" aria-hidden="true" />
              <span>{err}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegister && (
              <div>
                <label htmlFor="reg-name" className="text-xs font-semibold text-ui-text block mb-1">
                  Full Name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-ui-surface text-ui-text border border-ui-control-border rounded-lg placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-identifier" className="text-xs font-semibold text-ui-text block mb-1">
                {isRegister ? "Email Address" : "Email or Identifier"}
              </label>
              <input
                ref={firstInputRef}
                id="auth-identifier"
                type="email"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="name@example.com"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-ui-surface text-ui-text border border-ui-control-border rounded-lg placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue"
              />
            </div>

            {isRegister && (
              <div>
                <label htmlFor="reg-phone" className="text-xs font-semibold text-ui-text block mb-1">
                  Phone (for WhatsApp adherence)
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-ui-surface text-ui-text border border-ui-control-border rounded-lg placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-password" className="text-xs font-semibold text-ui-text block mb-1">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="••••••••"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-ui-surface text-ui-text border border-ui-control-border rounded-lg placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] py-2.5 px-4 bg-ui-blue hover:bg-ui-blue-hover text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  <span>Verifying credentials…</span>
                </>
              ) : (
                <span>{isRegister ? "Create Account" : "Sign In"}</span>
              )}
            </button>
          </form>

          {/* Google Sign In option if enabled */}
          {GOOGLE_CLIENT_ID && (
            <div className="pt-2 border-t border-ui-border-decorative/60">
              <div ref={googleButton} className="flex justify-center" />
            </div>
          )}

          {/* Exactly Two Approved Demo Options (Section 10.2) */}
          {DEMOS_ENABLED && (
            <div className="pt-3 border-t border-ui-border-decorative space-y-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ui-text-secondary block">
                Development Test Accounts (2 Choices)
              </span>
              <div className="grid grid-cols-1 gap-2">
                {/* 1. Caregiver Demo */}
                <button
                  type="button"
                  onClick={() => handleSelectDemo("caregiver")}
                  className={`p-3 text-left border rounded-xl transition-all ${
                    id === "meera@demo.in" && role === "caregiver"
                      ? "bg-ui-surface-subtle border-ui-blue ring-1 ring-ui-blue"
                      : "bg-ui-surface border-ui-border-decorative hover:bg-ui-canvas"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ui-text">Meera Kulkarni</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EAF5EC] text-ui-success">
                      Caregiver Hub
                    </span>
                  </div>
                  <p className="text-[11px] text-ui-text-secondary mt-1">
                    Family overview for 4 members with active telemetry and scheduled WhatsApp check-ins.
                  </p>
                </button>

                {/* 2. Patient PRO Demo */}
                <button
                  type="button"
                  onClick={() => handleSelectDemo("patient_pro")}
                  className={`p-3 text-left border rounded-xl transition-all ${
                    id === "shanti@demo.in" && role === "patient"
                      ? "bg-ui-surface-subtle border-ui-blue ring-1 ring-ui-blue"
                      : "bg-ui-surface border-ui-border-decorative hover:bg-ui-canvas"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ui-text">Shanti Devi</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EBF3FC] text-ui-blue">
                      Patient PRO
                    </span>
                  </div>
                  <p className="text-[11px] text-ui-text-secondary mt-1">
                    Multi-doctor prescription review with detected clinical drug-drug interactions.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Toggle between Register and Login */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setErr("");
              }}
              className="text-xs font-semibold text-ui-blue hover:text-ui-blue-hover transition-colors"
            >
              {isRegister
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
