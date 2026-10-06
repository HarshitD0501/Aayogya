"use client";

import { useEffect, useState } from "react";
import { useReveal } from "@/lib/gsap";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import GlowPill from "@/components/reactbits/GlowPill";
import { BrandMark } from "@/components/ui";
import {
  getPublicStats,
  getPublicPrices,
  DEMO_USERS,
  login,
} from "@/lib/api";
import {
  ScanLine,
  ShieldAlert,
  MessageCircleHeart,
  Tag,
  MapPin,
  Bell,
  ArrowRight,
  Stethoscope,
  Lock,
  FileCheck2,
  UploadCloud,
  CheckCircle2,
  PhoneCall,
  Search,
  Activity,
  Sparkles,
  TrendingDown,
  LogOut,
  X,
  ExternalLink,
  ChevronRight,
  User,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

const FEATURES = [
  {
    Icon: ScanLine,
    title: "Prescription OCR",
    body: "Snap any prescription — printed or handwritten. We read the brand, salt, strength and dosage, then let you confirm before anything is saved.",
  },
  {
    Icon: ShieldAlert,
    title: "Interaction safety check",
    body: "Interactions across every active medicine you hold, checked on salts of your active medicines, never called “guaranteed safe”.",
    highlight: true,
  },
  {
    Icon: MessageCircleHeart,
    title: "Plain-language explanations",
    body: "What each medicine is for, in your language, grounded in real drug data — always deferring the final word to your doctor.",
  },
  {
    Icon: Tag,
    title: "Fair price comparison",
    body: "Match by salt and strength across PharmEasy, NPPA price ceilings, and PMBJP Jan Aushadhi generic alternatives.",
  },
  {
    Icon: MapPin,
    title: "Nearby chemists",
    body: "Find local pharmacies on a live map, confirm stock by phone, and get turn-by-turn directions in a tap.",
  },
  {
    Icon: Bell,
    title: "WhatsApp reminders",
    body: "Gentle dose and follow-up reminders on the app people already open every day. Confirm a dose with a single tap.",
  },
];

const STEPS = [
  {
    Icon: UploadCloud,
    step: "01",
    title: "Upload your prescription",
    body: "Photograph a script from any doctor. Our vision model extracts the medicines in seconds.",
  },
  {
    Icon: FileCheck2,
    step: "02",
    title: "Confirm what we read",
    body: "You review and confirm every medicine. Nothing schedules or flags until you say it’s right.",
  },
  {
    Icon: ShieldAlert,
    step: "03",
    title: "Stay safe across medicines",
    body: "See interactions across all your active medicines, prices, reminders and your next visit — in one place.",
  },
];

const PREVIEW_SCENARIOS = {
  ramesh: {
    title: "Single Doctor (Diabetes & BP)",
    doctor: "Dr. Anjali Deshmukh · General Medicine",
    meds: [
      { brand: "Glycomet 500", salt: "Metformin · 500 mg", dose: "1-0-1", conf: 96 },
      { brand: "Amlong 5", salt: "Amlodipine · 5 mg", dose: "1-0-0", conf: 92 },
      { brand: "Ecosprin 75", salt: "Aspirin · 75 mg", dose: "0-0-1", conf: 88 },
      { brand: "Pan 40", salt: "Pantoprazole · 40 mg", dose: "1-0-0", conf: 95 },
    ],
  },
  shanti: {
    title: "Interaction Detected",
    doctor: "Dr. Mehta & Dr. Rao (Cardio + Ortho)",
    warning: "Alert: Ibuprofen + Aspirin interaction detected",
    meds: [
      { brand: "Ecosprin 75", salt: "Aspirin · 75 mg", dose: "0-1-0", conf: 94 },
      { brand: "Brufen 400", salt: "Ibuprofen · 400 mg", dose: "1-0-1", conf: 91 },
      { brand: "Thyronorm 50", salt: "Levothyroxine · 50 mcg", dose: "1-0-0", conf: 97 },
    ],
  },
  aarav: {
    title: "Active Course & Reminders",
    doctor: "Dr. Verma · General Physician",
    meds: [
      { brand: "Pan 40", salt: "Pantoprazole · 40 mg", dose: "1-0-0", conf: 96 },
      { brand: "Digene", salt: "Antacid Oral Suspension", dose: "SOS", conf: 90 },
    ],
  },
};

const POPULAR_MEDICINES = [
  "Dolo 650",
  "Augmentin 625",
  "Glycomet 500",
  "Amlong 5",
  "Pan 40",
  "Thyronorm 50",
  "Calpol 500",
];

export default function Landing({
  patient,
  onSelectDemo,
  onOpenDashboard,
  onLoginSuccess,
  onLogout,
}) {
  const scope = useReveal([]);

  // Telemetry stats state (fetched via REST API)
  const [stats, setStats] = useState({
    verified_medicines: 120,
    nppa_caps_tracked: 38,
    jan_aushadhi_generics: 34,
    status: "online",
  });

  // Hero interactive sandbox tab
  const [activeTab, setActiveTab] = useState("ramesh");

  // Real-time price explorer state (fetched via REST API)
  const [priceQuery, setPriceQuery] = useState("Dolo 650");
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceData, setPriceData] = useState(null);
  const [priceError, setPriceError] = useState("");

  // In-place Auth Modal
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("ramesh@demo.in");
  const [authPassword, setAuthPassword] = useState("pass1234");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  // Fetch initial telemetry stats via REST API
  useEffect(() => {
    let alive = true;
    getPublicStats().then((data) => {
      if (alive && data) setStats(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Fetch initial medicine price comparison via REST API
  useEffect(() => {
    let alive = true;
    setPriceLoading(true);
    setPriceError("");
    getPublicPrices({ brand: priceQuery })
      .then((res) => {
        if (alive) {
          setPriceData(res);
          setPriceLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setPriceError(e.message || "Failed to fetch price comparison");
          setPriceLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [priceQuery]);

  const handlePriceSearch = (e) => {
    e.preventDefault();
    if (!priceQuery.trim()) return;
    setPriceLoading(true);
    setPriceError("");
    getPublicPrices({ brand: priceQuery.trim() })
      .then((res) => {
        setPriceData(res);
        setPriceLoading(false);
      })
      .catch((err) => {
        setPriceError(err.message || "Price query failed");
        setPriceLoading(false);
      });
  };

  const handleModalLogin = async (e) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const p = await login(authEmail, authPassword);
      setShowAuthModal(false);
      if (onLoginSuccess) onLoginSuccess(p);
    } catch (err) {
      setAuthError(err.message || "Sign in failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const activeScenario = PREVIEW_SCENARIOS[activeTab] || PREVIEW_SCENARIOS.ramesh;

  return (
    <div className="lp" ref={scope}>
      {/* ---- Navbar ---- */}
      <nav className="lp-nav">
        <BrandMark />
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing-explorer">Live Prices</a>
          <a href="#demo">Live Demos</a>
          <a href="#safety">Safety Moat</a>
          <a href="#how">How it works</a>
        </div>
        <div className="lp-nav-actions">
          {patient ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--surface-2)",
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--brand)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {patient.name?.[0] || "P"}
                </span>
                <span>{patient.name}</span>
              </div>
              <button className="btn btn-primary" onClick={onOpenDashboard}>
                <Activity size={16} />
                <span>Go to Dashboard</span>
                <ArrowRight size={16} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={onLogout}
                title="Sign out"
                style={{ padding: "6px 10px" }}
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAuthModal(true)}
              >
                Sign In
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onSelectDemo("ramesh")}
              >
                <span>Try Live Demo</span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ---- Hero Section ---- */}
      <header className="lp-hero">
        <div className="lp-hero-copy">
          <div data-reveal>
            <GlowPill tone="green">Non-clinical &middot; Doctor-first</GlowPill>
          </div>
          <h1 className="lp-h1" data-reveal>
            Your medicines,{" "}
            <span className="lp-h1-muted">made clear.</span>
          </h1>
          <p className="lp-sub" data-reveal>
            Aayogya reads prescriptions, explains them in plain language, flags dangerous
            drug interactions, and tracks fair generic prices &mdash; keeping all
            clinical decisions strictly with your registered doctor.
          </p>

          <div className="lp-hero-cta" data-reveal>
            {patient ? (
              <button className="btn btn-primary btn-lg" onClick={onOpenDashboard}>
                <Activity size={18} />
                <span>Open Dashboard for {patient.name.split(" ")[0]}</span>
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => onSelectDemo("ramesh")}
              >
                <span>Launch Interactive Dashboard</span>
                <ArrowRight size={18} />
              </button>
            )}

            <a className="btn btn-outline btn-lg" href="#pricing-explorer">
              Check Medicine Prices
            </a>
          </div>

          <div className="lp-hero-stats" data-reveal>
            <div className="lp-hero-feat">
              <span className="lp-hero-feat-ic"><Tag size={18} /></span>
              <span className="lp-hero-feat-lbl">Price comparison</span>
            </div>
            <div className="lp-hero-feat">
              <span className="lp-hero-feat-ic"><ShieldAlert size={18} /></span>
              <span className="lp-hero-feat-lbl">Interaction safety</span>
            </div>
            <div className="lp-hero-feat">
              <span className="lp-hero-feat-ic"><MessageCircleHeart size={18} /></span>
              <span className="lp-hero-feat-lbl">WhatsApp tracking</span>
            </div>
          </div>
        </div>

        {/* ---- Interactive Hero Prescription Sandbox ---- */}
        <div className="lp-hero-preview" data-reveal>
          <div className="lp-pv-card" style={{ width: 440 }}>
            {/* Sandbox Tabs */}
            <div className="lp-sandbox-tabs">
              <button
                className={`lp-sandbox-tab ${activeTab === "ramesh" ? "active" : ""}`}
                onClick={() => setActiveTab("ramesh")}
              >
                Cardio & Diabetes
              </button>
              <button
                className={`lp-sandbox-tab ${activeTab === "shanti" ? "active" : ""}`}
                onClick={() => setActiveTab("shanti")}
              >
                Conflict Alert Demo
              </button>
              <button
                className={`lp-sandbox-tab ${activeTab === "aarav" ? "active" : ""}`}
                onClick={() => setActiveTab("aarav")}
              >
                Schedule & SOS
              </button>
            </div>

            <div className="lp-pv-head">
              <span className="lp-pv-dot" />
              <span className="lp-pv-dot" />
              <span className="lp-pv-dot" />
              <span className="lp-pv-title">
                <FileCheck2 size={14} /> {activeScenario.doctor}
              </span>
            </div>

            {activeScenario.warning && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  margin: "8px 12px 4px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlertTriangle size={14} />
                <span>{activeScenario.warning}</span>
              </div>
            )}

            <div className="lp-pv-body">
              {activeScenario.meds.map((m) => (
                <div className="lp-pv-med" key={m.brand}>
                  <div className="lp-pv-med-info">
                    <span className="lp-pv-brand">{m.brand}</span>
                    <span className="lp-pv-salt">{m.salt}</span>
                  </div>
                  <span className="lp-pv-dose">{m.dose}</span>
                  <span className="lp-pv-conf">
                    <span className="lp-pv-conf-bar">
                      <span style={{ width: `${m.conf}%` }} />
                    </span>
                    {m.conf}%
                  </span>
                </div>
              ))}
            </div>

            <div className="lp-sandbox-action" style={{ padding: "10px 14px 14px" }}>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                Live REST API test patient
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onSelectDemo(activeTab)}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                <span>Launch in Dashboard</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ---- Live REST API Telemetry Strip ---- */}
      <div className="lp-telemetry-strip" data-reveal>
        <div className="lp-telemetry-item">
          <span className="lp-telemetry-dot" />
          <span className="lp-telemetry-label">Backend Status:</span>
          <strong className="lp-telemetry-val">Live Sync ({stats.status})</strong>
        </div>
        <div className="lp-telemetry-item">
          <Tag size={15} color="#2563eb" />
          <span className="lp-telemetry-label">Essential Medicines:</span>
          <strong className="lp-telemetry-val">{stats.verified_medicines}+ Formularies</strong>
        </div>
        <div className="lp-telemetry-item">
          <ShieldAlert size={15} color="#d97706" />
          <span className="lp-telemetry-label">NPPA Price Caps:</span>
          <strong className="lp-telemetry-val">{stats.nppa_caps_tracked} Tracked</strong>
        </div>
        <div className="lp-telemetry-item">
          <CheckCircle2 size={15} color="#059669" />
          <span className="lp-telemetry-label">Jan Aushadhi Subsidies:</span>
          <strong className="lp-telemetry-val">{stats.jan_aushadhi_generics} PMBJP Generics</strong>
        </div>
      </div>

      {/* ---- Section 1: Live Medicine Fair-Price Explorer (REST API /api/prices) ---- */}
      <section className="lp-section" id="pricing-explorer">
        <div className="lp-section-head" data-reveal>
          <GlowPill tone="blue">Real-Time REST API</GlowPill>
          <h2 className="lp-h2">
            Live Medicine <span className="lp-muted-txt">Fair-Price Discovery.</span>
          </h2>
          <p className="lp-section-sub">
            Query live market retail prices from PharmEasy alongside official NPPA price ceilings
            and Jan Aushadhi generic alternatives through our real-time backend engine.
          </p>
        </div>

        <div className="lp-price-box" data-reveal>
          <form onSubmit={handlePriceSearch} className="lp-price-search-bar">
            <input
              type="text"
              value={priceQuery}
              onChange={(e) => setPriceQuery(e.target.value)}
              placeholder="Search by brand or salt (e.g. Dolo 650, Augmentin 625, Glycomet 500)…"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={priceLoading}
              style={{ minWidth: 120 }}
            >
              {priceLoading ? (
                <span>Querying…</span>
              ) : (
                <>
                  <Search size={16} />
                  <span>Compare</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Selection Chips */}
          <div className="lp-chips">
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Trending Medicines:
            </span>
            {POPULAR_MEDICINES.map((item) => (
              <button
                key={item}
                type="button"
                className={`lp-chip ${priceQuery.toLowerCase() === item.toLowerCase() ? "active" : ""}`}
                onClick={() => setPriceQuery(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {/* Pricing Results Preview */}
          {priceError && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                padding: "14px 18px",
                borderRadius: "var(--radius)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {priceError}
            </div>
          )}

          {priceData && (
            <div className="lp-price-result">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
                    {priceData.brand || priceQuery}
                  </h3>
                  <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                    Active Salt: <strong>{priceData.salt || "Standard Formulation"}</strong> {priceData.strength || ""}
                  </span>
                </div>
                {priceData.max_savings_percent > 0 && (
                  <span
                    style={{
                      background: "#dcfce7",
                      color: "#166534",
                      padding: "4px 12px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Save {priceData.max_savings_percent}% with Generic
                  </span>
                )}
              </div>

              {/* 3 Pillars Grid */}
              <div className="lp-pillars-grid">
                {/* Pillar 1: PharmEasy */}
                <div className="lp-pillar-card">
                  <div>
                    <div className="lp-pillar-badge" style={{ color: "#2563eb" }}>
                      Live Market Retail
                    </div>
                    <div className="lp-pillar-name">PharmEasy India</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Current branded retail market rate
                    </div>
                  </div>
                  <div>
                    <div className="lp-pillar-price">
                      ₹{priceData.market_price ? Number(priceData.market_price).toFixed(2) : "32.00"}
                    </div>
                    {priceData.market_mrp && priceData.market_mrp > priceData.market_price && (
                      <span style={{ fontSize: 12, color: "var(--muted)", textDecoration: "line-through" }}>
                        MRP: ₹{Number(priceData.market_mrp).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pillar 2: NPPA Govt Cap */}
                <div className="lp-pillar-card">
                  <div>
                    <div className="lp-pillar-badge" style={{ color: "#d97706" }}>
                      Statutory Legal Limit
                    </div>
                    <div className="lp-pillar-name">NPPA Ceiling Price</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Pharma Sahi Daam / DPCO Cap
                    </div>
                  </div>
                  <div>
                    <div className="lp-pillar-price">
                      {priceData.nppa_ceiling_price
                        ? `₹${Number(priceData.nppa_ceiling_price).toFixed(2)}`
                        : "Exempt / Non-NLEM"}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Govt Max Permissible Rate
                    </span>
                  </div>
                </div>

                {/* Pillar 3: Jan Aushadhi Generic */}
                <div className="lp-pillar-card highlight">
                  <div>
                    <div className="lp-pillar-badge" style={{ color: "#15803d" }}>
                      Subsidized Generic
                    </div>
                    <div className="lp-pillar-name">PMBJP Jan Aushadhi</div>
                    <div style={{ fontSize: 12, color: "#166534" }}>
                      Bureau of Pharma PSUs of India
                    </div>
                  </div>
                  <div>
                    <div className="lp-pillar-price" style={{ color: "#166534" }}>
                      ₹{priceData.jan_aushadhi_price ? Number(priceData.jan_aushadhi_price).toFixed(2) : "10.50"}
                    </div>
                    <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>
                      Quality generic at Kendra
                    </span>
                  </div>
                </div>
              </div>

              {/* Savings Action Banner */}
              <div className="lp-savings-banner">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    Consumer Cost-Saving Insight
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.9 }}>
                    {priceData.max_savings_amount
                      ? `Switching to the PMBJP generic alternative saves ₹${priceData.max_savings_amount} (${priceData.max_savings_percent}%) on every strip.`
                      : "Verified against official DPCO ceiling list and commercial catalog."}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => onSelectDemo("ramesh")}
                  style={{
                    background: "#ffffff",
                    color: "var(--brand)",
                    border: "none",
                    fontWeight: 700,
                  }}
                >
                  <span>Track this in Dashboard</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---- Section 2: Experience the Live Dashboard (REST API Auth Bridge) ---- */}
      <section className="lp-section" id="demo">
        <div className="lp-section-head" data-reveal>
          <GlowPill tone="green">Instant 1-Click Access</GlowPill>
          <h2 className="lp-h2">
            Experience the Dashboard, <span className="lp-muted-txt">Live.</span>
          </h2>
          <p className="lp-section-sub">
            No signup friction. Select any pre-configured clinical scenario below. Our REST API
            will authenticate you instantly and load the real interactive dashboard.
          </p>
        </div>

        <div className="lp-demo-grid" data-reveal>
          {DEMO_USERS.map((user) => (
            <div className="lp-demo-card" key={user.id}>
              <div>
                <div className="lp-demo-card-head">
                  <div
                    className="lp-demo-avatar"
                    style={{ background: user.color }}
                  >
                    {user.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="lp-demo-name">{user.name}</div>
                    <div className="lp-demo-role">{user.tag}</div>
                  </div>
                </div>
                <p className="lp-demo-desc">{user.desc}</p>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => onSelectDemo(user.id)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                <span>Launch {user.name.split(" ")[0]}&apos;s Dashboard</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Features Section ---- */}
      <section className="lp-section" id="features">
        <div className="lp-section-head" data-reveal>
          <GlowPill tone="blue">What you get</GlowPill>
          <h2 className="lp-h2">
            Everything your prescriptions need,{" "}
            <span className="lp-muted-txt">under one roof.</span>
          </h2>
          <p className="lp-section-sub">
            From reading handwritten scripts to catching multi-doctor drug conflicts &mdash; the
            navigation tools a stack of physical papers cannot give you.
          </p>
        </div>
        <div className="lp-feature-grid">
          {FEATURES.map((f) => (
            <SpotlightCard
              key={f.title}
              className={`lp-feature ${f.highlight ? "lp-feature-hi" : ""}`.trim()}
              spotlightColor="rgba(37, 99, 235, 0.12)"
              borderColor="rgba(37, 99, 235, 0.4)"
            >
              <span className="lp-feature-ic">
                <f.Icon size={22} strokeWidth={2} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              {f.highlight && <span className="lp-feature-tag">Our safety moat</span>}
            </SpotlightCard>
          ))}
        </div>
      </section>

      {/* ---- Safety / Positioning ---- */}
      <section className="lp-section lp-safety" id="safety">
        <div className="lp-safety-grid">
          <div data-reveal>
            <GlowPill tone="green">Built to be trusted</GlowPill>
            <h2 className="lp-h2">
              A navigator, <span className="lp-muted-txt">not a doctor.</span>
            </h2>
            <p className="lp-section-sub">
              Aayogya never diagnoses, never prescribes, and never alters a dose.
              It parses your prescriptions and defers every clinical call to a registered
              medical practitioner.
            </p>
          </div>
          <div className="lp-safety-cards">
            <div className="lp-trust" data-reveal>
              <span className="lp-trust-ic"><Stethoscope size={18} /></span>
              <div>
                <strong>Defers to your doctor</strong>
                <span>Every clinical answer reminds you to confirm with your doctor.</span>
              </div>
            </div>
            <div className="lp-trust" data-reveal>
              <span className="lp-trust-ic"><Lock size={18} /></span>
              <div>
                <strong>Per-patient cryptographic isolation</strong>
                <span>Every query is bounded to your authenticated session via Bearer JWT.</span>
              </div>
            </div>
            <div className="lp-trust" data-reveal>
              <span className="lp-trust-ic"><CheckCircle2 size={18} /></span>
              <div>
                <strong>Human-in-the-loop confirmation</strong>
                <span>Nothing is scheduled or saved until you explicitly review what we read.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="lp-section" id="how">
        <div className="lp-section-head" data-reveal>
          <GlowPill tone="blue">How it works</GlowPill>
          <h2 className="lp-h2">
            Three steps to <span className="lp-muted-txt">clarity.</span>
          </h2>
        </div>
        <div className="lp-steps">
          {STEPS.map((s) => (
            <div className="lp-step" key={s.step} data-reveal>
              <span className="lp-step-ic"><s.Icon size={20} strokeWidth={2} /></span>
              <span className="lp-step-num">{s.step}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- CTA Band ---- */}
      <section className="lp-cta" data-reveal>
        <div className="lp-cta-inner">
          <h2 className="lp-cta-h">
            Ready to understand{" "}
            <ShinyText
              text="every prescription?"
              speed={5}
              gradient="linear-gradient(135deg, #ffffff 0%, #93c5fd 50%, #ffffff 100%)"
            />
          </h2>
          <p>
            Sign in now or try a live demo scenario to see your medications, interaction safety,
            and prices together.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
            <button className="btn btn-lg lp-cta-btn" onClick={() => onSelectDemo("ramesh")}>
              <span>Launch Live Dashboard</span>
              <ArrowRight size={18} />
            </button>
            <button
              className="btn btn-lg btn-outline"
              onClick={() => setShowAuthModal(true)}
              style={{ color: "#ffffff", borderColor: "rgba(255,255,255,0.3)" }}
            >
              Custom Sign In
            </button>
          </div>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="lp-footer">
        <div className="lp-footer-top">
          <BrandMark />
          <div className="lp-footer-links">
            <a href="#features">Features</a>
            <a href="#pricing-explorer">Live Prices</a>
            <a href="#demo">Live Demos</a>
            <a href="#safety">Safety</a>
            <a href="#how">How it works</a>
            <button className="lp-linkbtn" onClick={() => setShowAuthModal(true)}>
              Login
            </button>
          </div>
        </div>
        <p className="lp-footer-note">
          &copy; 2026 Aayogya. Powered by FastAPI, LangGraph &amp; Gemini Vision. Not a substitute for
          professional medical advice. Always consult your doctor. In an emergency, call 108.
        </p>
      </footer>

      {/* ---- In-Place REST API Auth Modal ---- */}
      {showAuthModal && (
        <div className="lp-modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div className="lp-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="lp-modal-close"
              onClick={() => setShowAuthModal(false)}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <BrandMark />
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", margin: "0 0 6px" }}>
              Sign in to Aayogya
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 20px" }}>
              Authenticate via REST API to access your personalized prescription records.
            </p>

            {authError && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                {authError}
              </div>
            )}

            <form onSubmit={handleModalLogin}>
              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-secondary)" }}>
                  Email or Phone
                </label>
                <input
                  className="input"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="ramesh@demo.in"
                  required
                />
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-secondary)" }}>
                  Password
                </label>
                <input
                  className="input"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="pass1234"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={authBusy}
                style={{ width: "100%", justifyContent: "center", marginTop: 20 }}
              >
                {authBusy ? <span>Authenticating…</span> : <span>Sign in to Dashboard</span>}
              </button>
            </form>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, display: "block", marginBottom: 8 }}>
                Or 1-click test login as:
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="lp-chip"
                    onClick={() => {
                      setShowAuthModal(false);
                      onSelectDemo(u.id);
                    }}
                  >
                    {u.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
