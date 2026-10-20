"use client";

import { useEffect, useState } from "react";
import { useScrollReveal, useScrollCountUp } from "@/lib/gsap";
import { BrandMark } from "@/components/ui";
import { getPublicPrices, DEMO_USERS, login } from "@/lib/api";
import {
  ScanLine, ShieldAlert, MessageCircleHeart, Tag, MapPin, Bell,
  ArrowRight, Stethoscope, Lock, CheckCircle2, Search,
  Users, AlertTriangle, CircleDollarSign, CalendarClock,
  Pill, ChevronRight, ShieldCheck, Database, HeartPulse, PhoneCall, Play,
  Radio, Pause,
} from "lucide-react";

// ---- Hero benefit ticker (auto-advancing one-liners) ----
const HERO_SLIDES = [
  "One record across every doctor.",
  "Dangerous drug combinations, caught early.",
  "WhatsApp reminders your parents actually read.",
  "Family can watch over elders from anywhere.",
];

// ---- Interactive "problem" visualiser (bars animate on facet change) ----
const PROBLEMS = [
  {
    key: "adherence", label: "Missed doses", Icon: Pill,
    stat: "≈ 50%", statLabel: "of patients with chronic illness don't take medicines as prescribed (WHO)",
    bars: [
      { name: "Taken as prescribed", value: 50, tone: "ok" },
      { name: "Missed or irregular", value: 50, tone: "bad" },
    ],
    note: "Half of every long-term prescription is effectively wasted — not because the medicine fails, but because doses are missed.",
  },
  {
    key: "multidoctor", label: "Many doctors, no shared view", Icon: Users,
    stat: "3+", statLabel: "specialists a chronic patient sees — none seeing each other's notes",
    bars: [
      { name: "Cardiologist's script", value: 100, tone: "neutral" },
      { name: "Physician's script", value: 100, tone: "neutral" },
      { name: "Orthopaedic's script", value: 100, tone: "neutral" },
      { name: "One shared record", value: 10, tone: "bad" },
    ],
    note: "Prescriptions pile up on paper. No single doctor sees the whole list — so combinations like Ibuprofen + Aspirin slip through.",
  },
  {
    key: "price", label: "Overpaying for medicines", Icon: CircleDollarSign,
    stat: "up to 80%", statLabel: "cheaper on Jan Aushadhi generics vs branded retail",
    bars: [
      { name: "Branded retail", value: 100, tone: "bad" },
      { name: "NPPA price ceiling", value: 62, tone: "neutral" },
      { name: "Jan Aushadhi generic", value: 22, tone: "ok" },
    ],
    note: "The same salt and strength can cost a fraction at a Jan Aushadhi Kendra — most families simply never see the comparison.",
  },
  {
    key: "followup", label: "Missed follow-ups", Icon: CalendarClock,
    stat: "1 in 4", statLabel: "follow-up visits slip, breaking the treatment thread",
    bars: [
      { name: "Attended on time", value: 74, tone: "ok" },
      { name: "Missed or late", value: 26, tone: "bad" },
    ],
    note: "When the next review date lives on a paper slip, it gets forgotten — and the condition drifts untracked between visits.",
  },
];

// ---- Interactive feature explorer ----
const FEATURES = [
  { key: "ocr", Icon: ScanLine, title: "Prescription OCR", body: "Snap any script — printed or handwritten. We read the brand, salt, strength and dosage, then let you confirm before anything is saved." },
  { key: "safety", Icon: ShieldAlert, title: "Interaction safety check", body: "Checks interactions across the salts of every active medicine you hold — across all your doctors. Never called “guaranteed safe”.", tag: "Safety moat" },
  { key: "explain", Icon: MessageCircleHeart, title: "Plain-language explanations", body: "What each medicine is for, in your language, grounded in real drug data — always deferring the final word to your doctor." },
  { key: "price", Icon: Tag, title: "Fair price comparison", body: "Match by salt and strength across branded retail, NPPA ceilings, and Jan Aushadhi generic alternatives." },
  { key: "map", Icon: MapPin, title: "Nearby chemists", body: "Find local pharmacies on a live map, confirm stock by phone, and get turn-by-turn directions in a tap." },
  { key: "whatsapp", Icon: Bell, title: "WhatsApp reminders", body: "Gentle dose and follow-up reminders on the app people already open every day. Confirm a dose with a single tap." },
];

const TRUST = [
  { Icon: Stethoscope, title: "Defers to your doctor", body: "Aayogya never diagnoses, prescribes, or changes a dose. Every clinical-adjacent answer ends by asking you to confirm with your doctor." },
  { Icon: Lock, title: "Per-patient isolation", body: "Every query and every record is bounded to your authenticated session. No cross-patient leakage, by design." },
  { Icon: CheckCircle2, title: "Human-in-the-loop", body: "Nothing is scheduled, flagged, or saved until you review and confirm exactly what we read from your prescription." },
  { Icon: Database, title: "Sourced interaction data", body: "Interactions are checked against curated, cited rows — shown as “checked against N known interactions”, never an absolute guarantee." },
];

const CRED = [
  "FastAPI + LangGraph", "Gemini Vision OCR", "HL7 FHIR R4 (ABDM)", "DPDP-aligned", "Data localized in India",
];

// ---- Scroll-counting stats band (count up on scroll into view) ----
const STATS = [
  { to: 250, suffix: "K+", label: "Indian medicines mapped", sub: "Brand → salt catalogue powering every parse." },
  { to: 300, suffix: "K+", label: "Drug interactions catalogued", sub: "Curated, cited safety data we check against." },
  { to: 9, suffix: "+", label: "Languages, voice & text", sub: "Hindi, Hinglish and more — spoken, not typed." },
];

// ---- Pricing tiers (DESIGN §2 feature split) ----
const TIERS = [
  {
    name: "Free", price: "₹0", period: "forever",
    tagline: "Everything you need to understand your medicines and stay safe.",
    features: [
      "Prescription upload + OCR parsing",
      "Plain-language explanations",
      "Drug-interaction safety flag",
      "Health records timeline",
      "Emergency “Call 108” card",
    ],
    cta: "Start free",
  },
  {
    name: "Pro", price: "₹99", period: "/ month", highlight: true,
    tagline: "The full adherence engine — reminders, prices, follow-ups and voice.",
    features: [
      "Everything in Free",
      "Medicine price comparison + nearby chemists",
      "WhatsApp dose reminders",
      "Follow-up appointment reminders",
      "Voice check-in calls (usage-limited)",
      "Adherence tracking + trends",
    ],
    cta: "Go Pro",
  },
];

export default function Landing({
  patient, onSelectDemo, onOpenDashboard, onLoginSuccess, onLogout,
}) {
  const scope = useScrollReveal([]);

  const [slide, setSlide] = useState(0);
  const [problem, setProblem] = useState("adherence");
  const [feature, setFeature] = useState("safety");

  // Inline login (the "Login" section)
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setInterval(
      () => alive && setSlide((s) => (s + 1) % HERO_SLIDES.length), 3200
    );
    return () => { alive = false; clearInterval(t); };
  }, []);

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const p = await login(email.trim(), pw);
      onLoginSuccess && onLoginSuccess(p);
    } catch (e2) {
      setErr(e2.message || "Sign in failed");
    } finally { setBusy(false); }
  };

  const pb = PROBLEMS.find((p) => p.key === problem) || PROBLEMS[0];
  const ft = FEATURES.find((f) => f.key === feature) || FEATURES[0];

  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="ed" ref={scope}>
      {/* ===== NAV ===== */}
      <nav className="ed-nav">
        <BrandMark />
        <div className="ed-nav-links">
          <a href="#problem" onClick={scrollTo("problem")}>The Problem</a>
          <a href="#features" onClick={scrollTo("features")}>Features</a>
          <a href="#trust" onClick={scrollTo("trust")}>Trust</a>
          <a href="#pricing" onClick={scrollTo("pricing")}>Pricing</a>
        </div>
        <div className="ed-nav-actions">
          {patient ? (
            <>
              <span className="ed-who"><span className="ed-who-dot">{patient.name?.[0] || "P"}</span>{patient.name?.split(" ")[0]}</span>
              <button className="ed-btn ed-btn-ink" onClick={onOpenDashboard}>Dashboard <ArrowRight size={15} /></button>
            </>
          ) : (
            <>
              <a href="#login" className="ed-btn ed-btn-ghost" onClick={scrollTo("login")}>Sign In</a>
              <button className="ed-btn ed-btn-gold" onClick={() => onSelectDemo("ramesh")}>Try Live Demo <ArrowRight size={15} /></button>
            </>
          )}
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <header className="ed-hero">
        <div className="ed-hero-copy">
          <span className="ed-eyebrow" data-reveal><span className="ed-eyebrow-dot" /> Non-clinical · Doctor-first</span>
          <h1 className="ed-display" data-reveal>
            Your medicines,<br />finally <mark className="ed-mark">made clear.</mark>
          </h1>
          <div className="ed-ticker" data-reveal>
            {HERO_SLIDES.map((s, i) => (
              <span key={i} className={`ed-ticker-item ${i === slide ? "on" : ""}`}>{s}</span>
            ))}
          </div>
          <p className="ed-lead" data-reveal>
            Aayogya reads prescriptions from every doctor, explains them in plain language,
            flags dangerous drug interactions, and tracks fair generic prices — while keeping
            every clinical decision strictly with your registered doctor.
          </p>
          <div className="ed-hero-cta" data-reveal>
            <button className="ed-btn ed-btn-gold ed-btn-lg" onClick={() => onSelectDemo("ramesh")}>
              Launch Live Demo <ArrowRight size={18} />
            </button>
            <a href="#problem" className="ed-btn ed-btn-outline ed-btn-lg" onClick={scrollTo("problem")}>
              See the problem
            </a>
          </div>
          <div className="ed-hero-trust" data-reveal>
            <span><ShieldCheck size={15} /> Interaction safety</span>
            <span><Tag size={15} /> Fair prices</span>
            <span><MessageCircleHeart size={15} /> WhatsApp tracking</span>
          </div>
        </div>

        {/* Sahayak voice-agent player — same shape/angle as the reference card */}
        <div className="ed-hero-right" data-reveal data-anim="zoom">
          <SahayakPlayer />
        </div>
      </header>
      {/* ===== THE PROBLEM (interactive graph) ===== */}
      <section className="ed-section ed-problem" id="problem">
        <div className="ed-head" data-reveal data-anim="left">
          <span className="ed-pill">The Problem</span>
          <h2 className="ed-h2">
            Managing medicines on paper is <mark className="ed-mark">quietly failing</mark> millions of families.
          </h2>
          <p className="ed-sub">
            Pick a problem below to see what it really costs — then see how Aayogya closes the gap.
          </p>
        </div>

        <div className="ed-problem-grid" data-reveal data-anim="right">
          {/* facet selector */}
          <div className="ed-facets">
            {PROBLEMS.map((p) => (
              <button
                key={p.key}
                className={`ed-facet ${problem === p.key ? "on" : ""}`}
                onClick={() => setProblem(p.key)}
              >
                <span className="ed-facet-ic"><p.Icon size={18} /></span>
                <span className="ed-facet-lbl">{p.label}</span>
                <ChevronRight size={16} className="ed-facet-arrow" />
              </button>
            ))}
          </div>

          {/* animated chart */}
          <div className="ed-chart" key={pb.key}>
            <div className="ed-chart-stat">
              <span className="ed-chart-big">{pb.stat}</span>
              <span className="ed-chart-lbl">{pb.statLabel}</span>
            </div>
            <div className="ed-bars">
              {pb.bars.map((b, i) => (
                <div className="ed-bar-row" key={b.name}>
                  <span className="ed-bar-name">{b.name}</span>
                  <span className="ed-bar-track">
                    <span
                      className={`ed-bar-fill t-${b.tone}`}
                      style={{ width: `${b.value}%`, animationDelay: `${i * 90}ms` }}
                    />
                  </span>
                  <span className="ed-bar-val">{b.value}%</span>
                </div>
              ))}
            </div>
            <p className="ed-chart-note">{pb.note}</p>
          </div>
        </div>
        <p className="ed-foot-note" data-reveal>
          Adherence figure: WHO, <em>Adherence to Long-Term Therapies</em>. Price and visit figures are illustrative of patterns Aayogya is built to fix.
        </p>
      </section>
      {/* ===== FEATURES (interactive explorer) ===== */}
      <section className="ed-section" id="features">
        <div className="ed-head" data-reveal data-anim="zoom">
          <span className="ed-pill">What you get</span>
          <h2 className="ed-h2">
            Everything your prescriptions need, <mark className="ed-mark">under one roof.</mark>
          </h2>
          <p className="ed-sub">Tap a capability to see it in action.</p>
        </div>

        <div className="ed-feat-explorer" data-reveal>
          <div className="ed-feat-list">
            {FEATURES.map((f) => (
              <button
                key={f.key}
                className={`ed-feat-item ${feature === f.key ? "on" : ""}`}
                onClick={() => setFeature(f.key)}
              >
                <span className="ed-feat-ic"><f.Icon size={18} /></span>
                <span className="ed-feat-txt">
                  <strong>{f.title}</strong>
                  {f.tag && <span className="ed-feat-tag">{f.tag}</span>}
                </span>
                <ChevronRight size={16} className="ed-feat-arrow" />
              </button>
            ))}
          </div>

          <div className="ed-feat-detail" key={ft.key}>
            <span className="ed-feat-detail-ic"><ft.Icon size={26} /></span>
            <h3>{ft.title}</h3>
            <p>{ft.body}</p>
            <FeatureVisual k={ft.key} />
          </div>
        </div>
      </section>
      {/* ===== STATS BAND (scroll count-up) ===== */}
      <section className="ed-band-section">
        <div className="ed-band">
          <div className="ed-band-inner" data-reveal>
            <div className="ed-band-hero">
              <span className="ed-band-rank">#1</span>
              <strong>Patient Choice</strong>
              <p>We're dedicated to your family's comfort and health — making Aayogya a trusted choice across India.</p>
            </div>
            <div className="ed-band-stats">
              {STATS.map((s) => <CountStat key={s.label} {...s} />)}
            </div>
          </div>
        </div>
      </section>
      {/* ===== TRUST & CREDIBILITY ===== */}
      <section className="ed-section ed-trust" id="trust">
        <div className="ed-trust-grid">
          <div className="ed-trust-copy" data-reveal data-anim="left">
            <span className="ed-pill">Built to be trusted</span>
            <h2 className="ed-h2">
              A navigator, <mark className="ed-mark">not a doctor.</mark>
            </h2>
            <p className="ed-sub">
              Under India's Telemedicine Practice Guidelines, an AI platform may not diagnose or
              prescribe. Aayogya is built around that line — it explains and organises, and defers
              every clinical call to a registered medical practitioner.
            </p>
            <div className="ed-cred">
              {CRED.map((c) => <span key={c} className="ed-cred-chip">{c}</span>)}
            </div>
          </div>
          <div className="ed-trust-cards">
            {TRUST.map((t) => (
              <div className="ed-trust-card" key={t.title} data-reveal data-anim="right">
                <span className="ed-trust-ic"><t.Icon size={20} /></span>
                <div>
                  <strong>{t.title}</strong>
                  <span>{t.body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ===== PRICING / SUBSCRIPTION ===== */}
      <section className="ed-section ed-pricing" id="pricing">
        <div className="ed-head" data-reveal>
          <span className="ed-pill">Simple pricing</span>
          <h2 className="ed-h2">
            One plan. <mark className="ed-mark">₹99 a month.</mark>
          </h2>
          <p className="ed-sub">
            No insurance paperwork, no per-feature upsells. Safety and understanding are free forever;
            the adherence engine is Pro.
          </p>
        </div>

        <div className="ed-tiers" data-reveal data-anim="rotate">
          {TIERS.map((t) => (
            <div className={`ed-tier ${t.highlight ? "hi" : ""}`} key={t.name}>
              {t.highlight && <span className="ed-tier-flag">Most loved</span>}
              <div className="ed-tier-name">{t.name}</div>
              <div className="ed-tier-price">
                <span className="ed-tier-amt">{t.price}</span>
                <span className="ed-tier-per">{t.period}</span>
              </div>
              <p className="ed-tier-tag">{t.tagline}</p>
              <ul className="ed-tier-feats">
                {t.features.map((f) => (
                  <li key={f}><CheckCircle2 size={16} /> {f}</li>
                ))}
              </ul>
              <button
                className={`ed-btn ${t.highlight ? "ed-btn-gold" : "ed-btn-outline"} ed-btn-block`}
                onClick={() => (t.highlight ? onSelectDemo("shanti") : onSelectDemo("aarav"))}
              >
                {t.cta} <ArrowRight size={15} />
              </button>
            </div>
          ))}
        </div>
        <p className="ed-pay-note" data-reveal>
          <HeartPulse size={14} /> Pay by UPI or card. In this demo, Pro unlocks instantly — no gateway, no charge.
        </p>
      </section>
      {/* ===== LOGIN ===== */}
      <section className="ed-section ed-login" id="login">
        <div className="ed-login-grid">
          <div className="ed-login-copy" data-reveal data-anim="left">
            <span className="ed-pill">Welcome back</span>
            <h2 className="ed-h2">
              Sign in, or <mark className="ed-mark">try a live patient.</mark>
            </h2>
            <p className="ed-sub">
              Pick a pre-loaded scenario to explore the real dashboard instantly — no signup — or sign
              in with your own credentials.
            </p>
            <div className="ed-demo-row">
              {DEMO_USERS.map((u) => (
                <button key={u.id} className="ed-demo-chip" onClick={() => onSelectDemo(u.id)}>
                  <span className="ed-demo-av" style={{ background: u.color }}>
                    {u.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <span className="ed-demo-meta">
                    <strong>{u.name.split(" ")[0]}</strong>
                    <span>{u.tag}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form className="ed-login-card" onSubmit={doLogin} data-reveal data-anim="right">
            <h3>Sign in to Aayogya</h3>
            {err && <div className="ed-login-err"><AlertTriangle size={14} /> {err}</div>}
            <label>Email or phone</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ramesh@demo.in" required />
            <label>Password</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="pass1234" required />
            <button type="submit" className="ed-btn ed-btn-ink ed-btn-block" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="ed-login-hint">Demo accounts use password <code>pass1234</code>.</p>
          </form>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="ed-footer">
        <div className="ed-footer-top">
          <div className="ed-footer-brand">
            <BrandMark />
            <p>Your medicines, made clear. A non-clinical explainer and adherence companion — never a substitute for your doctor.</p>
          </div>
          <div className="ed-footer-cols">
            <div>
              <span className="ed-footer-h">Product</span>
              <a href="#features" onClick={scrollTo("features")}>Features</a>
              <a href="#pricing" onClick={scrollTo("pricing")}>Pricing</a>
              <a href="#problem" onClick={scrollTo("problem")}>The problem</a>
            </div>
            <div>
              <span className="ed-footer-h">Trust</span>
              <a href="#trust" onClick={scrollTo("trust")}>Safety & compliance</a>
              <a href="#login" onClick={scrollTo("login")}>Sign in</a>
            </div>
            <div className="ed-footer-sos">
              <span className="ed-footer-h">Emergency</span>
              <a href="tel:108" className="ed-sos"><PhoneCall size={15} /> Call 108</a>
              <span className="ed-footer-fine">In a medical emergency, call 108 immediately.</span>
            </div>
          </div>
        </div>
        <div className="ed-footer-bar">
          <span>© 2026 Aayogya. Not medical advice — always consult your doctor.</span>
          <span>Data localized in India · DPDP-aligned</span>
        </div>
      </footer>
    </div>
  );
}
function CountStat({ to, fmt, suffix = "", label, sub }) {
  const ref = useScrollCountUp(to, fmt);
  return (
    <div className="ed-cstat">
      <span className="ed-cstat-val"><span ref={ref}>0</span>{suffix}</span>
      <span className="ed-cstat-lbl">{label}</span>
      <span className="ed-cstat-sub">{sub}</span>
    </div>
  );
}

const PLAYER_BARS = [
  { h: 42, c: "c-navy" }, { h: 74, c: "c-navy" }, { h: 32, c: "c-orange" }, { h: 58, c: "c-peach" },
  { h: 88, c: "c-navy" }, { h: 36, c: "c-muted" }, { h: 68, c: "c-orange" }, { h: 82, c: "c-navy" },
  { h: 54, c: "c-peach" }, { h: 30, c: "c-navy" }, { h: 64, c: "c-orange" }, { h: 96, c: "c-navy" },
  { h: 48, c: "c-peach" }, { h: 28, c: "c-muted" }, { h: 78, c: "c-navy" }, { h: 62, c: "c-orange" },
  { h: 38, c: "c-navy" }, { h: 68, c: "c-peach" }, { h: 84, c: "c-navy" }, { h: 46, c: "c-orange" },
  { h: 32, c: "c-muted" }, { h: 66, c: "c-navy" }, { h: 92, c: "c-peach" }, { h: 52, c: "c-orange" },
  { h: 76, c: "c-navy" }, { h: 36, c: "c-navy" }, { h: 48, c: "c-muted" }, { h: 82, c: "c-orange" },
  { h: 60, c: "c-peach" }, { h: 42, c: "c-navy" }, { h: 74, c: "c-navy" }, { h: 86, c: "c-orange" },
  { h: 50, c: "c-peach" }, { h: 34, c: "c-muted" }, { h: 68, c: "c-navy" }, { h: 44, c: "c-orange" },
];

function SahayakPlayer() {
  const [isPlaying, setIsPlaying] = useState(true);
  const played = 0.37; // 12:45 / 34:28 fill from benchmark

  return (
    <div className="ed-player-wrapper">
      {/* Decorative hand-drawn sketchy arrow pointing to card */}
      <svg
        className="ed-hero-arrow"
        width="90"
        height="70"
        viewBox="0 0 100 80"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          d="M12 68 C 25 15, 60 12, 86 28"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="4 3"
        />
        <path
          d="M72 18 L 88 28 L 82 44"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      <div className="ed-player">
        {/* Signature frosted paper tape strip at top center */}
        <div className="ed-player-tape" aria-hidden="true" />

        <div className="ed-player-head">
          <span className="ed-player-now">
            <Radio size={13} className="ed-radio-pulse" />
            NOW SPEAKING • SAHAYAK
          </span>
          <span className="ed-player-time">00:34 / 01:30</span>
        </div>

        <h3 className="ed-player-title">Aapka dawai saathi</h3>
        <p className="ed-player-line">
          Har dose ka reminder, aur aapki report saral bhasha mein — har clinical faisla aapke doctor ke paas.
        </p>

        <div className="ed-wave-box">
          <div className={`ed-wave ${isPlaying ? "playing" : "paused"}`} aria-hidden="true">
            {PLAYER_BARS.map((b, i) => (
              <span
                key={i}
                className={`ed-wave-bar ${b.c}`}
                style={{
                  height: `${b.h}%`,
                  animationDelay: `${(i % 8) * 110}ms`,
                  animationDuration: `${0.85 + (i % 5) * 0.12}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="ed-player-ctrl">
          <button
            type="button"
            className="ed-player-play"
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? "Pause voice preview" : "Play voice preview"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
          </button>
          <div className="ed-player-track">
            <span className="ed-player-fill" style={{ width: `${played * 100}%` }} />
            <i className="ed-player-knob" style={{ left: `${played * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureVisual({ k }) {
  if (k === "price") return <PriceMini />;
  if (k === "safety")
    return (
      <div className="ed-fv ed-fv-safety">
        <span className="ed-fv-chip">Aspirin</span>
        <span className="ed-fv-x">×</span>
        <span className="ed-fv-chip">Ibuprofen</span>
        <span className="ed-fv-flag"><AlertTriangle size={13} /> Bleeding risk — confirm with your doctor</span>
      </div>
    );
  if (k === "ocr")
    return (
      <div className="ed-fv ed-fv-ocr">
        <div className="ed-fv-line"><span>Glycomet 500</span><em>Metformin · 500 mg</em><b>1-0-1</b></div>
        <div className="ed-fv-line"><span>Amlong 5</span><em>Amlodipine · 5 mg</em><b>1-0-0</b></div>
        <span className="ed-fv-tag"><CheckCircle2 size={12} /> You confirm before anything is saved</span>
      </div>
    );
  if (k === "whatsapp")
    return (
      <div className="ed-fv ed-fv-wa">
        <div className="ed-fv-bubble">Namaste 🌼 Subah ki dawa le li?</div>
        <div className="ed-fv-replies"><span>✅ Haan</span><span>❌ Nahi</span><span>⏰ 10 min</span></div>
      </div>
    );
  if (k === "map")
    return (
      <div className="ed-fv ed-fv-map"><MapPin size={16} /> 4 chemists within 1.2 km · tap any pin for directions</div>
    );
  return (
    <div className="ed-fv ed-fv-explain">
      “Pantoprazole reduces stomach acid — take it before food.”
      <em>— not medical advice; confirm with your doctor.</em>
    </div>
  );
}
function PriceMini() {
  const [q, setQ] = useState("Dolo 650");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = (brand) => {
    if (!brand) return;
    setLoading(true); setError("");
    getPublicPrices({ brand })
      .then((r) => { setData(r); setLoading(false); })
      .catch((e) => { setError(e.message || "Price lookup failed"); setLoading(false); });
  };
  useEffect(() => { run("Dolo 650"); }, []);

  const money = (v, d) => Number(v ?? d).toFixed(2);

  return (
    <div className="ed-pm">
      <form className="ed-pm-bar" onSubmit={(e) => { e.preventDefault(); run(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Dolo 650" />
        <button type="submit" className="ed-btn ed-btn-ink" disabled={loading}>
          <Search size={14} />
        </button>
      </form>
      {loading && <div className="ed-pm-note">Querying live prices…</div>}
      {error && <div className="ed-pm-note err">{error}</div>}
      {data && !loading && (
        <div className="ed-pm-rows">
          <div className="ed-pm-row"><span>Branded retail</span><b>₹{money(data.market_price, 32)}</b></div>
          <div className="ed-pm-row"><span>NPPA ceiling</span><b>{data.nppa_ceiling_price ? `₹${money(data.nppa_ceiling_price)}` : "—"}</b></div>
          <div className="ed-pm-row best"><span>Jan Aushadhi generic</span><b>₹{money(data.jan_aushadhi_price, 10.5)}</b></div>
          {data.max_savings_percent > 0 && (
            <div className="ed-pm-save">Save {data.max_savings_percent}% with the generic</div>
          )}
        </div>
      )}
    </div>
  );
}
