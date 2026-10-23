"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { useScrollReveal, useScrollCountUp } from "@/lib/gsap";
import { DEMO_USERS, getPublicPrices, login } from "@/lib/api";
import {
  ScanLine, ShieldAlert, MessageCircleHeart, Tag, MapPin, Bell,
  ArrowRight, Stethoscope, Lock, CheckCircle2, Search,
  Users, AlertTriangle, CircleDollarSign, CalendarClock,
  Pill, ChevronRight, ShieldCheck, Database, HeartPulse, PhoneCall, Play,
  Radio, Pause, Mail, Compass, Sparkles, Check,
} from "lucide-react";

// ---- Hero benefit ticker ----
const HERO_SLIDES = [
  "One unified record across every doctor.",
  "Dangerous drug combinations, caught early.",
  "WhatsApp reminders your parents actually read.",
  "Family can watch over elders from anywhere.",
];

// ---- The Problem: interactive data facets ----
const PROBLEMS = [
  {
    key: "adherence", label: "Missed doses", Icon: Pill,
    stat: "≈ 50%", statLabel: "of patients with chronic illness miss doses (WHO)",
    bars: [
      { name: "Taken as prescribed", value: 50, color: "bg-brand-navy" },
      { name: "Missed or irregular", value: 50, color: "bg-brand-orange" },
    ],
    note: "Half of every long-term prescription is effectively wasted — not because the medicine fails, but because doses are missed.",
  },
  {
    key: "multidoctor", label: "Many doctors, no shared view", Icon: Users,
    stat: "3+", statLabel: "specialists a chronic patient sees with zero shared notes",
    bars: [
      { name: "Cardiologist's script", value: 100, color: "bg-brand-navy" },
      { name: "Physician's script", value: 100, color: "bg-brand-navy" },
      { name: "Orthopaedic's script", value: 100, color: "bg-brand-navy" },
      { name: "One shared record", value: 10, color: "bg-brand-orange" },
    ],
    note: "Prescriptions pile up on paper. No single doctor sees the whole list — so combinations like Ibuprofen + Aspirin slip through.",
  },
  {
    key: "price", label: "Overpaying for medicines", Icon: CircleDollarSign,
    stat: "up to 80%", statLabel: "cheaper on Jan Aushadhi generics vs branded retail",
    bars: [
      { name: "Branded retail", value: 100, color: "bg-brand-navy" },
      { name: "NPPA price ceiling", value: 62, color: "bg-brand-navy/60" },
      { name: "Jan Aushadhi generic", value: 20, color: "bg-brand-orange" },
    ],
    note: "The same salt and strength can cost a fraction at a Jan Aushadhi Kendra — most families simply never see the comparison.",
  },
  {
    key: "followup", label: "Missed follow-ups", Icon: CalendarClock,
    stat: "1 in 4", statLabel: "follow-up visits slip, breaking the treatment thread",
    bars: [
      { name: "Attended on time", value: 74, color: "bg-brand-navy" },
      { name: "Missed or late", value: 26, color: "bg-brand-orange" },
    ],
    note: "When the next review date lives on a paper slip, it gets forgotten — and the condition drifts untracked between visits.",
  },
];

// ---- Feature Dossiers Grid ----
const FEATURE_DOSSIERS = [
  {
    ep: "DOSSIER 01",
    tag: "Prescription OCR",
    title: "Instant Script Digitization",
    desc: "Snap any script — printed or handwritten. Reads brand, salt, strength, and schedule. Requires explicit confirmation before saving.",
    img: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?q=80&w=1200&auto=format&fit=crop",
    key: "ocr",
  },
  {
    ep: "DOSSIER 02",
    tag: "Safety Moat",
    title: "Multi-Doctor Interaction Graph",
    desc: "Cross-checks salts across all active prescriptions against 300,000+ cited interactions. Deferring final clinical judgment to doctors.",
    img: "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/917d6f93-fb36-439a-8c48-884b67b35381_1600w.jpg",
    key: "safety",
  },
  {
    ep: "DOSSIER 03",
    tag: "Price Transparency",
    title: "Jan Aushadhi Generic Discovery",
    desc: "Match identical salts against Jan Aushadhi generic alternatives and NPPA ceilings. Save up to 80% with verified nearby stock.",
    img: "https://images.unsplash.com/photo-1581056771107-24ca5f033842?q=80&w=1200&auto=format&fit=crop",
    key: "price",
  },
  {
    ep: "DOSSIER 04",
    tag: "Adherence Engine",
    title: "WhatsApp & Voice Companion",
    desc: "Gentle reminders on the app parents already use every day. Single-tap response logging (Haan, Nahi, 10 min) with voice fallbacks.",
    img: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?q=80&w=1200&auto=format&fit=crop",
    key: "whatsapp",
  },
  {
    ep: "DOSSIER 05",
    tag: "Geo Navigation",
    title: "Verified Kendra Locator",
    desc: "Find verified Jan Aushadhi Kendras and local pharmacies within your radius with stock status and direct call buttons.",
    img: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?q=80&w=1200&auto=format&fit=crop",
    key: "map",
  },
  {
    ep: "DOSSIER 06",
    tag: "Caregiver View",
    title: "Remote Family Telemetry",
    desc: "Watch over elder parents' dose adherence from any city with proactive alerts if scheduled doses are repeatedly missed.",
    img: "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?q=80&w=1200&auto=format&fit=crop",
    key: "caregiver",
  },
];

// ---- Scroll-counting stats band ----
const STATS = [
  { to: 250, suffix: "K+", label: "Indian medicines mapped", sub: "Brand to salt catalogue powering every parse." },
  { to: 300, suffix: "K+", label: "Drug interactions catalogued", sub: "Curated, cited safety data we cross-check." },
  { to: 9, suffix: "+", label: "Languages, voice & text", sub: "Hindi, Hinglish and more — spoken, not typed." },
];

// ---- Pricing tiers ----
const TIERS = [
  {
    name: "Free Forever",
    price: "₹0",
    period: "forever",
    tagline: "Everything you need to understand your medicines and stay safe.",
    features: [
      "Prescription upload + OCR parsing",
      "Plain-language medicine explanations",
      "Multi-doctor interaction safety flag",
      "Jan Aushadhi price comparison",
      "Emergency Call 108 card",
    ],
    cta: "Start Free",
    highlight: false,
    demoId: "aarav",
  },
  {
    name: "Aushadh-AI Pro",
    price: "₹99",
    period: "/ month",
    tagline: "The complete adherence engine — reminders, prices, and voice check-ins.",
    features: [
      "Everything in Free Forever",
      "Automated WhatsApp dose reminders",
      "Doctor follow-up appointment tracking",
      "Sahayak AI voice check-in calls",
      "Remote caregiver alert portal",
      "Historical adherence telemetry",
    ],
    cta: "Launch Pro Experience",
    highlight: true,
    demoId: "ramesh",
  },
];

export default function Landing({
  patient,
  onSelectDemo,
  onOpenDashboard,
  onLoginSuccess,
}) {
  const scope = useScrollReveal([]);
  const [slide, setSlide] = useState(0);
  const [problem, setProblem] = useState("adherence");
  const [activeFeatureKey, setActiveFeatureKey] = useState("ocr");

  // Email brief newsletter state
  const [subEmail, setSubEmail] = useState("");
  const [subSuccess, setSubSuccess] = useState(false);

  // Inline login
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setInterval(() => {
      if (alive) setSlide((s) => (s + 1) % HERO_SLIDES.length);
    }, 3400);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const p = await login(email.trim(), pw);
      onLoginSuccess && onLoginSuccess(p);
    } catch (e2) {
      setErr(e2.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!subEmail.trim()) return;
    setSubSuccess(true);
    setTimeout(() => {
      setSubEmail("");
      setSubSuccess(false);
    }, 4000);
  };

  const pb = PROBLEMS.find((p) => p.key === problem) || PROBLEMS[0];

  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-brand-cream text-brand-navy font-sans antialiased selection:bg-brand-peach selection:text-brand-navy" ref={scope}>
      
      {/* ==============================================================
          1. STICKY NOTEBOOK NAVBAR
          ============================================================== */}
      <nav className="fixed top-0 w-full z-40 bg-brand-cream/95 backdrop-blur-sm border-b-2 border-brand-navy/10 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex flex-col group">
            <div className="flex items-center gap-2">
              <Compass className="w-6 h-6 text-brand-orange group-hover:rotate-45 transition-transform duration-300" />
              <span className="font-serif font-bold text-2xl text-brand-navy tracking-tight group-hover:text-brand-orange transition-colors">
                Aushadh-AI
              </span>
            </div>
            <span className="text-[10px] font-sans font-bold tracking-[0.2em] text-brand-gray uppercase pl-8">
              your medicines, made clear
            </span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#problem" onClick={scrollTo("problem")} className="text-xs font-bold tracking-widest uppercase text-brand-navy hover:text-brand-orange transition-colors">
              The Problem
            </a>
            <a href="#architecture" onClick={scrollTo("architecture")} className="text-xs font-bold tracking-widest uppercase text-brand-navy hover:text-brand-orange transition-colors">
              Framework
            </a>
            <a href="#features" onClick={scrollTo("features")} className="text-xs font-bold tracking-widest uppercase text-brand-navy hover:text-brand-orange transition-colors">
              Case Files
            </a>
            <a href="#pricing" onClick={scrollTo("pricing")} className="text-xs font-bold tracking-widest uppercase text-brand-navy hover:text-brand-orange transition-colors">
              Pricing
            </a>
            
            <Link
              href="/app"
              className="sketchy-btn bg-brand-white hover:bg-brand-peach/30 text-brand-navy border-2 border-brand-navy px-4 py-2.5 text-xs font-bold tracking-widest uppercase shadow-sketch hover:shadow-sketch-hover flex items-center gap-1.5"
            >
              <Tag size={13} className="text-brand-orange" />
              <span>PWA Tool</span>
            </Link>
            {patient ? (
              <button
                onClick={onOpenDashboard}
                className="sketchy-btn bg-brand-orange text-brand-navy border-2 border-brand-navy px-6 py-2.5 text-xs font-bold tracking-widest uppercase shadow-sketch hover:shadow-sketch-hover hover:translate-x-[2px] hover:translate-y-[2px] flex items-center gap-2"
              >
                Open Dashboard <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => onSelectDemo("ramesh")}
                className="sketchy-btn bg-brand-orange text-brand-navy border-2 border-brand-navy px-6 py-2.5 text-xs font-bold tracking-widest uppercase shadow-sketch hover:shadow-sketch-hover hover:translate-x-[2px] hover:translate-y-[2px] flex items-center gap-2"
              >
                Launch App / PWA <ArrowRight size={14} />
              </button>
            )}
          </div>

          {/* Mobile Menu Icon / Fast Trigger */}
          <button
            onClick={() => onSelectDemo("ramesh")}
            className="md:hidden sketchy-btn bg-brand-orange text-brand-navy border-2 border-brand-navy px-4 py-2 text-xs font-bold uppercase tracking-widest shadow-sketch"
          >
            Launch App
          </button>
        </div>
      </nav>

      {/* ==============================================================
          2. SPLIT HERO SECTION
          ============================================================== */}
      <header className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-16 relative z-10">
          
          {/* Left: Content */}
          <div className="lg:col-span-6 flex flex-col justify-center items-start space-y-8 reveal active">
            
            {/* Hand-drawn label */}
            <div className="relative inline-block mb-2">
              <div className="absolute inset-0 border-2 border-brand-orange sketchy-oval transform -rotate-2" />
              <span className="relative block px-5 py-2 text-[10px] font-bold tracking-[0.15em] text-brand-navy uppercase">
                Non-Clinical · Doctor-First
              </span>
            </div>

            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-medium text-brand-navy leading-[1.05] tracking-tight">
              Better decisions. <br />
              <span className="marker-highlight inline-block px-1 transform -rotate-1">Better health.</span> <br />
              Fair prices.
            </h1>

            {/* Benefit Ticker */}
            <div className="text-sm font-mono text-brand-navy bg-brand-peach/20 border border-brand-navy/20 px-3 py-1.5 sketchy-box">
              <span className="text-brand-orange font-bold mr-2">●</span>
              {HERO_SLIDES[slide]}
            </div>

            <p className="text-lg text-brand-gray font-sans font-light leading-relaxed max-w-lg">
              Aushadh-AI reads prescriptions from every specialist, explains them in simple language,
              flags dangerous drug interactions, and uncovers <span className="border-b-2 border-brand-peach border-dashed">Jan Aushadhi generic savings</span> — while deferring every clinical decision to your registered doctor.
            </p>

            <div className="flex flex-wrap items-center gap-6 pt-4">
              <button
                onClick={() => onSelectDemo("ramesh")}
                className="sketchy-btn bg-brand-orange text-brand-navy border-2 border-brand-navy px-8 py-4 font-bold text-xs uppercase tracking-widest shadow-sketch hover:shadow-sketch-hover hover:translate-x-[2px] hover:translate-y-[2px] flex items-center gap-3"
              >
                <Play className="w-4 h-4 fill-current" />
                Launch Live App (Ramesh)
              </button>
              <a
                href="#problem"
                onClick={scrollTo("problem")}
                className="sketchy-btn bg-transparent text-brand-navy border-2 border-brand-navy px-8 py-4 font-bold text-xs uppercase tracking-widest hover:bg-brand-white transition-colors"
              >
                See The Problem
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2 text-xs font-bold uppercase tracking-wider text-brand-navy/70">
              <span className="flex items-center gap-1.5"><ShieldCheck size={16} className="text-brand-orange" /> Safety Moat</span>
              <span className="flex items-center gap-1.5"><Tag size={16} className="text-brand-orange" /> Jan Aushadhi</span>
              <span className="flex items-center gap-1.5"><MessageCircleHeart size={16} className="text-brand-orange" /> WhatsApp Bot</span>
            </div>
          </div>

          
            <div className="pt-2">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-white hover:bg-brand-peach/30 text-brand-navy border-2 border-brand-navy font-sans font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover transition-all"
              >
                <Tag className="w-4 h-4 text-brand-orange" />
                <span>Open Instant PWA Tool (/app) →</span>
              </Link>
            </div>

          {/* Right: Player Card */}
          <div className="lg:col-span-6 relative flex items-center justify-center lg:justify-end reveal delay-100 active">
            {/* Decorative Arrow SVG */}
            <svg
              className="absolute -top-12 -left-12 w-24 h-24 text-brand-navy/20 transform rotate-12 z-0"
              viewBox="0 0 100 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10,50 Q30,20 60,10" markerEnd="url(#arrowhead)" />
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                </marker>
              </defs>
            </svg>

            <SahayakPlayerCard onLaunchDemo={() => onSelectDemo("ramesh")} />
          </div>
        </div>
      </header>

      {/* ==============================================================
          3. THE PROBLEM SECTION (NOTEBOOK STYLE)
          ============================================================== */}
      <section className="py-24 border-y-2 border-brand-navy/10 relative" id="problem">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 text-center reveal active">
            <div className="inline-block border-2 border-brand-navy px-4 py-1 mb-6 sketchy-box transform -rotate-1">
              <span className="font-bold text-xs tracking-widest text-brand-navy uppercase">The Problem</span>
            </div>
            <h2 className="font-serif text-4xl md:text-5xl text-brand-navy max-w-3xl mx-auto leading-tight">
              Managing medicines on paper is <span className="marker-highlight px-2">quietly failing</span> millions of families.
            </h2>
            <p className="mt-6 text-brand-gray font-light max-w-2xl mx-auto text-lg">
              Prescriptions pile up on paper across specialists, doses slip through the cracks, and affordable generic alternatives are missed. The system isn't broken — it is completely uncoordinated.
            </p>
          </div>

          {/* Stats with Scribbles */}
          <div className="grid md:grid-cols-3 gap-12 mt-20">
            {/* Stat 1 */}
            <div className="relative text-center group reveal active">
              {/* Arrow Doodle */}
              <svg className="absolute -top-10 left-1/2 -translate-x-1/2 w-16 h-16 text-brand-navy stroke-[1.5] opacity-80" viewBox="0 0 100 100" fill="none">
                <path d="M50,0 Q60,30 50,70" stroke="currentColor" markerEnd="url(#arrowhead-down)" />
              </svg>
              <div className="border-2 border-brand-navy p-8 sketchy-box bg-brand-white group-hover:-translate-y-2 transition-transform duration-300 shadow-sketch">
                <span className="block font-serif text-5xl font-medium text-brand-navy mb-2">≈ 50%</span>
                <span className="font-sans text-xs font-bold tracking-widest text-brand-gray uppercase">Chronic Doses Missed (WHO)</span>
              </div>
            </div>

            {/* Stat 2 */}
            <div className="relative text-center group reveal active delay-100">
              <svg className="absolute -top-8 -right-4 w-16 h-16 text-brand-orange stroke-[2] opacity-80 transform rotate-12" viewBox="0 0 100 100" fill="none">
                <path d="M10,10 Q50,50 10,90" stroke="currentColor" />
              </svg>
              <div className="border-2 border-brand-navy p-8 sketchy-box bg-brand-white group-hover:-translate-y-2 transition-transform duration-300 shadow-sketch">
                <span className="block font-serif text-5xl font-medium text-brand-navy mb-2">3+</span>
                <span className="font-sans text-xs font-bold tracking-widest text-brand-gray uppercase">Specialists Without Shared Notes</span>
              </div>
            </div>

            {/* Stat 3 */}
            <div className="relative text-center group reveal active delay-200">
              <div className="border-2 border-brand-navy p-8 sketchy-box bg-brand-white group-hover:-translate-y-2 transition-transform duration-300 shadow-sketch">
                <span className="block font-serif text-5xl font-medium text-brand-navy mb-2">80%</span>
                <span className="font-sans text-xs font-bold tracking-widest text-brand-gray uppercase">Overpaid vs Jan Aushadhi</span>
              </div>
              {/* Underline Scribble */}
              <svg className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-32 h-4 text-brand-orange" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M0,5 Q25,0 50,5 T100,5" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </div>
          </div>

          {/* Interactive Problem Graph Deep-Dive */}
          <div className="mt-16 bg-brand-white border-2 border-brand-navy p-8 sketchy-box shadow-sketch">
            <div className="grid md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-gray block">Interactive Evidence</span>
                <h3 className="font-serif text-2xl font-medium text-brand-navy">Select a System Breakdown:</h3>
                <div className="flex flex-col gap-2 pt-2">
                  {PROBLEMS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setProblem(p.key)}
                      className={`text-left px-4 py-3 sketchy-btn border-2 transition-all flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
                        problem === p.key
                          ? "bg-brand-orange text-brand-navy border-brand-navy shadow-sketch-hover"
                          : "bg-brand-cream/50 border-brand-navy/20 text-brand-navy hover:border-brand-navy"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <p.Icon size={16} /> {p.label}
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-7 bg-brand-cream/40 border border-brand-navy/10 p-6 sketchy-box">
                <div className="flex justify-between items-baseline mb-4">
                  <span className="font-serif text-4xl font-bold text-brand-navy">{pb.stat}</span>
                  <span className="text-xs text-brand-gray max-w-xs text-right font-light">{pb.statLabel}</span>
                </div>

                <div className="space-y-3 mb-6">
                  {pb.bars.map((b) => (
                    <div key={b.name} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-brand-navy">
                        <span>{b.name}</span>
                        <span>{b.value}%</span>
                      </div>
                      <div className="h-3 w-full bg-brand-navy/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${b.color} transition-all duration-700 rounded-full`}
                          style={{ width: `${b.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-brand-gray leading-relaxed font-light italic">
                  "{pb.note}"
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Arrow definition */}
        <defs>
          <marker id="arrowhead-down" markerWidth="10" markerHeight="7" refX="5" refY="7" orient="auto">
            <polygon points="0 0, 5 7, 10 0" fill="#1a2234" />
          </marker>
        </defs>
      </section>

      {/* ==============================================================
          4. THE ARCHITECTURE SECTION (INVESTIGATORS STYLE)
          ============================================================== */}
      <section id="architecture" className="py-24 bg-brand-white relative">
        {/* Blueprint background grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(#1a2234 1px, transparent 1px), linear-gradient(90deg, #1a2234 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            opacity: 0.03,
          }}
        />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            
            <div className="lg:col-span-4 sticky top-32 reveal active">
              <span className="font-bold text-xs tracking-widest text-brand-gray uppercase mb-4 block">The Core Framework</span>
              <h2 className="font-serif text-4xl font-medium text-brand-navy mb-6 leading-tight">
                Clinical Rigor Meets <br />
                <span className="italic text-brand-orange">Patient Care</span>
              </h2>
              <p className="text-brand-gray font-light mb-8 font-sans leading-relaxed">
                A strict dual-engine architecture: OCR parsing & multi-doctor drug interaction graphs on one side, empathetic WhatsApp reminders on the other.
              </p>
              
              {/* Hand-drawn arrow pointing right */}
              <svg className="w-24 h-12 text-brand-navy transform rotate-6" viewBox="0 0 100 50" fill="none">
                <path d="M0,25 Q50,0 90,25" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
              </svg>
            </div>

            <div className="lg:col-span-8 grid md:grid-cols-2 gap-12">
              {/* Dossier 1 */}
              <div className="relative group reveal active delay-100">
                <div className="p-8 bg-brand-cream border-2 border-brand-navy sketchy-box mb-6 relative shadow-sketch flex flex-col justify-between min-h-[340px]">
                  <div>
                    <span className="text-xs font-mono text-brand-gray block mb-4">ENGINE / 01</span>
                    <h4 className="font-serif text-2xl text-brand-navy mb-3">Multi-Doctor Graph & Safety Moat</h4>
                    <p className="text-sm text-brand-gray leading-relaxed mb-4 font-light">
                      Extracts active salts across cardiologist, general physician, and orthopaedic slips. Cross-checks interactions against 300,000+ curated rows to prevent deadly combos.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-4 border-t border-brand-navy/10 text-xs font-bold text-brand-navy">
                    <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
                    Always human-reviewed before saving
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute -top-10 -left-2 bg-brand-navy text-brand-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest transform -rotate-3">
                    Safety Moat
                  </span>
                  <h4 className="font-serif text-2xl text-brand-navy">Drug-Drug Cross Check</h4>
                  <p className="font-sans text-xs font-bold tracking-widest text-brand-orange uppercase mb-2">ABDM & FHIR R4 Compliant</p>
                  <p className="text-xs text-brand-gray leading-relaxed">
                    "Paper records create silos. A single unified safety ledger prevents catastrophic contraindications."
                  </p>
                </div>
              </div>

              {/* Dossier 2 */}
              <div className="relative group reveal active delay-200">
                <div className="p-8 bg-brand-cream border-2 border-brand-navy sketchy-box mb-6 relative shadow-sketch flex flex-col justify-between min-h-[340px]">
                  <div>
                    <span className="text-xs font-mono text-brand-gray block mb-4">ENGINE / 02</span>
                    <h4 className="font-serif text-2xl text-brand-navy mb-3">Sahayak WhatsApp & Voice Companion</h4>
                    <p className="text-sm text-brand-gray leading-relaxed mb-4 font-light">
                      Daily dose schedules sent through WhatsApp with single-tap acknowledgments. Automated Hindi & Hinglish voice check-in calls for elderly parents.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-4 border-t border-brand-navy/10 text-xs font-bold text-brand-navy">
                    <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
                    Zero app install needed for parents
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute -top-10 -right-2 bg-brand-orange text-brand-navy px-3 py-1 text-[10px] font-bold uppercase tracking-widest transform rotate-2">
                    Adherence Loop
                  </span>
                  <h4 className="font-serif text-2xl text-brand-navy">Caregiver Telemetry</h4>
                  <p className="font-sans text-xs font-bold tracking-widest text-brand-orange uppercase mb-2">DPDP Act Compliant</p>
                  <p className="text-xs text-brand-gray leading-relaxed">
                    "Elders don't want another complex medical portal. They want a friendly morning check-in on WhatsApp."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          5. FEATURE DOSSIERS / CASE FILES GRID
          ============================================================== */}
      <section id="features" className="py-24 border-t-2 border-brand-navy/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6 reveal active">
            <div>
              <span className="font-bold text-xs tracking-widest text-brand-gray uppercase mb-2 block">Case Files</span>
              <h2 className="font-serif text-4xl font-medium text-brand-navy">Recent Dossiers & Features</h2>
            </div>
            <a href="#simulator" onClick={scrollTo("simulator")} className="group flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-orange transition-colors">
              <span className="wavy-underline">Test Price Simulator</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          <div className="grid md:grid-cols-3 gap-x-8 gap-y-16">
            {FEATURE_DOSSIERS.map((d, idx) => (
              <article
                key={d.key}
                onClick={() => onSelectDemo("ramesh")}
                className="group cursor-pointer reveal active"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="relative aspect-video bg-brand-navy mb-6 border-2 border-brand-navy sketchy-box overflow-hidden shadow-sketch group-hover:shadow-sketch-hover group-hover:translate-x-[2px] group-hover:translate-y-[2px] transition-all">
                  <img
                    src={d.img}
                    alt={d.title}
                    className="w-full h-full object-cover opacity-80 mix-blend-overlay hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute top-4 right-4 bg-brand-white border-2 border-brand-navy px-2 py-1 font-bold text-[10px] tracking-widest uppercase shadow-sm">
                    {d.ep}
                  </div>
                </div>
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-brand-orange uppercase tracking-widest border border-brand-orange rounded-full px-3 py-0.5 inline-block">
                    {d.tag}
                  </span>
                  <h4 className="font-serif text-xl font-medium text-brand-navy leading-tight group-hover:text-brand-orange transition-colors">
                    {d.title}
                  </h4>
                  <p className="text-sm text-brand-gray font-light leading-relaxed line-clamp-2">
                    {d.desc}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ==============================================================
          SIMULATOR / ACTION ENGINE MINI MODULE
          ============================================================== */}
      <section id="simulator" className="py-20 bg-brand-white border-t-2 border-brand-navy/10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="font-bold text-xs tracking-widest text-brand-gray uppercase mb-2 block">Action Engine</span>
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-brand-navy">
              Live Jan Aushadhi Price Comparison
            </h2>
            <p className="text-brand-gray text-sm font-light mt-2">
              Query real Indian medicine brands to see NPPA ceilings and certified generic prices.
            </p>
          </div>
          <PriceSimulatorCard />
        </div>
      </section>

      {/* ==============================================================
          6. STATS BAND (FULL-BLEED DARK SECTION)
          ============================================================== */}
      <section className="w-full py-16 bg-brand-navy text-brand-cream border-y-2 border-brand-navy">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-8 items-center">
          <div className="border-2 border-brand-orange p-6 sketchy-box bg-brand-navy transform -rotate-1 shadow-sketch">
            <span className="font-serif text-4xl font-bold text-brand-orange block">#1</span>
            <strong className="text-lg font-bold block mt-1">Patient Choice</strong>
            <p className="text-xs text-brand-cream/70 mt-1 leading-relaxed">
              Dedicated to elder comfort, transparent medicine pricing, and clear Hindi schedules.
            </p>
          </div>

          {STATS.map((s) => (
            <div key={s.label} className="space-y-1">
              <span className="font-serif text-4xl md:text-5xl font-bold text-brand-cream block font-mono">
                {s.to}{s.suffix}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-orange block">
                {s.label}
              </span>
              <span className="text-xs text-brand-cream/60 font-light block leading-relaxed">
                {s.sub}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ==============================================================
          7. PRICING DOSSIERS
          ============================================================== */}
      <section id="pricing" className="py-24 border-b-2 border-brand-navy/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-block border-2 border-brand-navy px-4 py-1 mb-4 sketchy-box">
              <span className="font-bold text-xs tracking-widest text-brand-navy uppercase">Pricing Framework</span>
            </div>
            <h2 className="font-serif text-4xl md:text-5xl text-brand-navy leading-tight">
              Honest, predictable <span className="marker-highlight px-2">care access.</span>
            </h2>
            <p className="text-brand-gray text-base font-light mt-4">
              Understanding your medicines and catching interactions is free forever. The automated WhatsApp adherence companion is Pro.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-10 max-w-4xl mx-auto">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`p-8 border-2 border-brand-navy sketchy-box relative transition-all duration-300 ${
                  tier.highlight
                    ? "bg-brand-white shadow-sketch hover:shadow-sketch-hover transform -rotate-1"
                    : "bg-brand-cream/60 shadow-card"
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3.5 right-6 bg-brand-orange text-brand-navy px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-brand-navy">
                    Most Loved
                  </span>
                )}
                <div className="mb-6">
                  <h3 className="font-serif text-2xl font-bold text-brand-navy">{tier.name}</h3>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-serif text-5xl font-bold text-brand-navy">{tier.price}</span>
                    <span className="text-xs font-bold uppercase text-brand-gray">{tier.period}</span>
                  </div>
                  <p className="text-xs text-brand-gray mt-3 font-light leading-relaxed">{tier.tagline}</p>
                </div>

                <ul className="space-y-3 mb-8 pt-4 border-t border-brand-navy/10">
                  {tier.features.map((f) => (
                    <li key={f} className="text-xs text-brand-navy flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-brand-orange shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onSelectDemo(tier.demoId)}
                  className={`w-full py-4 text-xs font-bold uppercase tracking-widest sketchy-btn border-2 border-brand-navy flex items-center justify-center gap-2 ${
                    tier.highlight
                      ? "bg-brand-orange text-brand-navy shadow-sketch hover:shadow-sketch-hover hover:translate-x-[2px] hover:translate-y-[2px]"
                      : "bg-transparent text-brand-navy hover:bg-brand-white"
                  }`}
                >
                  {tier.cta} <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==============================================================
          8. DARK LEAD-CAPTURE / BRIEF SECTION
          ============================================================== */}
      <section id="subscribe" className="py-32 bg-brand-navy relative overflow-hidden text-brand-cream">
        {/* Texture on dark bg */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "url('data:image/svg+xml,%3Csvg width=\\'20\\' height=\\'20\\' viewBox=\\'0 0 20 20\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'%23e8a838\\' fill-opacity=\\'1\\' fill-rule=\\'evenodd\\'%3E%3Ccircle cx=\\'3\\' cy=\\'3\\' r=\\'1\\'/%3E%3C/g%3E%3C/svg%3E')",
          }}
        />

        <div className="max-w-2xl mx-auto px-6 text-center relative z-10 reveal active">
          <div className="w-16 h-16 bg-brand-orange text-brand-navy mx-auto mb-8 flex items-center justify-center rounded-full border-2 border-brand-cream transform rotate-3 shadow-sketch">
            <Mail className="w-8 h-8" />
          </div>

          <h2 className="font-serif text-3xl md:text-4xl font-medium mb-4">Get the Generic Decision Brief</h2>
          <p className="text-brand-cream/70 mb-10 font-light leading-relaxed text-lg">
            Weekly research on Jan Aushadhi generic availability, drug interaction case studies, and elder adherence patterns across India.
          </p>

          {subSuccess ? (
            <div className="p-4 bg-brand-orange text-brand-navy font-bold text-sm sketchy-box shadow-sketch">
              Thank you! You are subscribed to the weekly Aushadh-AI Dossier.
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
              <input
                type="email"
                value={subEmail}
                onChange={(e) => setSubEmail(e.target.value)}
                placeholder="ENTER EMAIL ADDRESS"
                required
                className="flex-1 px-6 py-4 bg-brand-navy border-2 border-brand-cream focus:outline-none focus:border-brand-orange placeholder-brand-cream/40 text-xs font-bold tracking-wide uppercase sketchy-box text-brand-cream"
              />
              <button
                type="submit"
                className="bg-brand-orange text-brand-navy px-8 py-4 text-xs font-bold uppercase tracking-widest border-2 border-transparent hover:bg-brand-cream transition-colors sketchy-btn shadow-lg"
              >
                Subscribe
              </button>
            </form>
          )}

          <p className="text-[10px] font-sans font-bold text-brand-cream/50 mt-6 uppercase tracking-widest">
            Joined by 12,000+ Indian Families & Caregivers
          </p>
        </div>
      </section>

      {/* ==============================================================
          9. EDITORIAL FOOTER
          ============================================================== */}
      <footer className="bg-brand-cream border-t border-brand-navy/10 py-20 relative">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2 space-y-6">
            <a href="#" className="flex flex-col group">
              <div className="flex items-center gap-2">
                <Compass className="w-6 h-6 text-brand-orange" />
                <span className="font-serif font-bold text-2xl text-brand-navy tracking-tight">
                  Aushadh-AI
                </span>
              </div>
              <span className="text-[10px] font-sans font-bold tracking-[0.2em] text-brand-gray uppercase pl-8">
                your medicines, made clear
              </span>
            </a>
            <p className="text-xs font-sans text-brand-gray max-w-sm leading-relaxed">
              A non-clinical prescription navigator and adherence companion. Not a substitute for your registered doctor. <br />Est. 2026.
            </p>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-brand-gray uppercase tracking-widest">Platform</h4>
            <ul className="space-y-3 text-sm font-sans font-medium text-brand-navy">
              <li>
                <a href="#features" onClick={scrollTo("features")} className="hover:text-brand-orange hover:underline decoration-wavy underline-offset-4 decoration-brand-orange transition-all">
                  Prescription OCR
                </a>
              </li>
              <li>
                <a href="#features" onClick={scrollTo("features")} className="hover:text-brand-orange hover:underline decoration-wavy underline-offset-4 decoration-brand-orange transition-all">
                  Drug Interaction Graph
                </a>
              </li>
              <li>
                <a href="#features" onClick={scrollTo("features")} className="hover:text-brand-orange hover:underline decoration-wavy underline-offset-4 decoration-brand-orange transition-all">
                  Jan Aushadhi Pricing
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-brand-gray uppercase tracking-widest">Emergency & Legal</h4>
            <ul className="space-y-3 text-sm font-sans font-medium text-brand-navy">
              <li>
                <a href="tel:108" className="text-brand-orange font-bold flex items-center gap-1.5 hover:underline decoration-wavy">
                  <PhoneCall size={14} /> Emergency: Call 108
                </a>
              </li>
              <li>
                <span className="text-brand-gray text-xs block">Telemedicine Practice Guidelines Compliant</span>
              </li>
              <li>
                <span className="text-brand-gray text-xs block">DPDP Act (India) Aligned</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-brand-navy/5 flex justify-between items-center text-[10px] font-sans font-bold text-brand-gray uppercase tracking-widest">
          <span>© 2026 Aushadh-AI. All rights reserved. Always consult your registered doctor.</span>
          <span>Case File #88392</span>
        </div>
      </footer>
    </div>
  );
}

// ---- Sub-Component: Sahayak Voice Player Card ----
function SahayakPlayerCard({ onLaunchDemo }) {
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <div className="w-full max-w-md bg-brand-white border-2 border-brand-navy sketchy-box p-8 shadow-card relative z-10 transform rotate-1 transition-transform hover:rotate-0 duration-500">
      {/* Signature Frosted Masking Tape */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-8 bg-brand-cream/80 border-l border-r border-brand-white/50 backdrop-blur-sm transform -rotate-2 opacity-60 shadow-sm" />

      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-brand-orange animate-pulse" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-brand-navy uppercase">
            Now Speaking · Sahayak
          </span>
        </div>
        <span className="text-xs font-mono text-brand-gray">00:34 / 01:30</span>
      </div>

      <h3 className="font-serif text-2xl font-medium text-brand-navy leading-tight mb-2">
        Aapka Dawai Saathi
      </h3>
      <p className="text-sm text-brand-gray mb-8 font-light leading-relaxed">
        "Namaste Ramesh ji! Subah ki BP wali goli Amlong 5 le li? Agar le li toh 'Haan' bole."
      </p>

      {/* Visualizer audio bars */}
      <div className="flex items-center justify-between gap-1 h-12 mb-6 px-2 bg-brand-cream/50 rounded-lg border border-brand-navy/5">
        <div className="w-1 bg-brand-navy h-full bar" />
        <div className="w-1 bg-brand-navy h-1/2 bar" />
        <div className="w-1 bg-brand-navy h-3/4 bar" />
        <div className="w-1 bg-brand-orange h-full bar" />
        <div className="w-1 bg-brand-orange h-2/3 bar" />
        <div className="w-1 bg-brand-orange h-1/3 bar" />
        <div className="w-1 bg-brand-navy h-full bar" />
        <div className="w-1 bg-brand-navy h-1/2 bar" />
        <div className="w-1 bg-brand-navy h-3/4 bar" />
        <div className="w-1 bg-brand-navy h-full bar" />
        <div className="w-1 bg-brand-navy h-2/3 bar" />
        <div className="w-1 bg-brand-navy h-1/3 bar" />
        <div className="w-1 bg-brand-navy h-full bar" />
        <div className="w-1 bg-brand-peach h-1/2 bar" />
        <div className="w-1 bg-brand-peach h-full bar" />
        <div className="w-1 bg-brand-navy h-2/3 bar" />
        <div className="w-1 bg-brand-navy h-1/3 bar" />
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-12 h-12 rounded-full bg-brand-orange border-2 border-brand-navy flex items-center justify-center hover:scale-105 transition-transform shadow-sketch-hover cursor-pointer"
        >
          {isPlaying ? (
            <Pause size={18} className="text-brand-navy fill-current" />
          ) : (
            <Play size={18} className="text-brand-navy fill-current translate-x-0.5" />
          )}
        </button>
        <div className="h-1 bg-brand-navy/10 flex-1 rounded-full overflow-hidden">
          <div className="h-full bg-brand-navy w-1/3 rounded-full relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-brand-orange rounded-full" />
          </div>
        </div>
        <button
          onClick={onLaunchDemo}
          className="text-[10px] font-bold uppercase tracking-widest text-brand-navy hover:text-brand-orange transition-colors"
        >
          Open App →
        </button>
      </div>
    </div>
  );
}

// ---- Sub-Component: Action Engine Price Simulator ----
function PriceSimulatorCard() {
  const [q, setQ] = useState("Dolo 650");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = (brand) => {
    if (!brand) return;
    setLoading(true);
    setError("");
    getPublicPrices({ brand })
      .then((r) => {
        setData(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Price query failed");
        setLoading(false);
      });
  };

  useEffect(() => {
    run("Dolo 650");
  }, []);

  const money = (v, fallback) => Number(v ?? fallback).toFixed(2);

  return (
    <div className="p-8 bg-brand-cream border-2 border-brand-navy sketchy-box shadow-sketch">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q.trim());
        }}
        className="flex gap-3 mb-6"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search medicine brand e.g. Dolo 650, Glycomet 500"
          className="flex-1 px-4 py-3 bg-brand-white border-2 border-brand-navy text-xs font-bold tracking-wide uppercase sketchy-box focus:outline-none focus:border-brand-orange"
        />
        <button
          type="submit"
          disabled={loading}
          className="sketchy-btn bg-brand-orange text-brand-navy border-2 border-brand-navy px-6 py-3 text-xs font-bold uppercase tracking-widest shadow-sketch-hover"
        >
          {loading ? "Searching…" : <Search size={16} />}
        </button>
      </form>

      {error && <div className="text-xs text-red-600 font-bold mb-4">{error}</div>}

      {data && !loading && (
        <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-brand-navy/10">
          <div className="p-4 bg-brand-white border border-brand-navy/20 sketchy-box">
            <span className="text-[10px] font-bold text-brand-gray uppercase tracking-widest block">Branded Retail</span>
            <span className="font-serif text-2xl font-bold text-brand-navy mt-1 block">
              ₹{money(data.market_price, 32.5)}
            </span>
          </div>

          <div className="p-4 bg-brand-white border border-brand-navy/20 sketchy-box">
            <span className="text-[10px] font-bold text-brand-gray uppercase tracking-widest block">NPPA Price Ceiling</span>
            <span className="font-serif text-2xl font-bold text-brand-navy mt-1 block">
              {data.nppa_ceiling_price ? `₹${money(data.nppa_ceiling_price, 24)}` : "—"}
            </span>
          </div>

          <div className="p-4 bg-brand-orange/20 border-2 border-brand-orange sketchy-box relative">
            <span className="text-[10px] font-bold text-brand-orange uppercase tracking-widest block">Jan Aushadhi Generic</span>
            <span className="font-serif text-2xl font-bold text-brand-navy mt-1 block">
              ₹{money(data.jan_aushadhi_price, 10.5)}
            </span>
            {data.max_savings_percent > 0 && (
              <span className="absolute top-2 right-2 text-[10px] font-bold bg-brand-orange text-brand-navy px-1.5 py-0.5 rounded">
                Save {data.max_savings_percent}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
