"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  Summary,
  Upload,
  Medicines,
  Interactions,
  Prices,
  Reports,
} from "@/components/sections";
import Assistant from "@/components/Assistant";
import SearchPage from "@/app/search/page";
import ScanPage from "@/app/scan/page";
import StoresPage from "@/app/stores/page";
import HistoryPage from "@/app/history/page";
import {
  Activity,
  UploadCloud,
  Pill as PillIcon,
  ShieldAlert,
  Tag,
  MapPin,
  FileText,
  LogOut,
  Compass,
  HeartPulse,
  Bot,
  Home,
  Users,
  Search,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

const SECTIONS = [
  {
    key: "summary",
    label: "Health Overview",
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
    title: "Sahayak Voice Assistant",
    sub: "Real-time 2-way WebRTC live voice consultation & multilingual health assistant.",
  },
  {
    key: "search",
    label: "Search & Compare",
    Icon: Search,
    Comp: ({ goto }) => <SearchPage hideNavbar={true} onNavigateTab={goto} />,
    title: "Jan Aushadhi Price Discovery",
    sub: "Verify Jan Aushadhi (PMBJP) generic alternatives against branded MRP and NPPA caps.",
    isTool: true,
  },
  {
    key: "scan",
    label: "Scan Prescription",
    Icon: UploadCloud,
    Comp: ({ goto }) => <ScanPage hideNavbar={true} onNavigateTab={goto} />,
    title: "Scan & OCR Review",
    sub: "Upload or photograph a medicine box or prescription for OCR review and manual verification.",
    isTool: true,
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
    title: "Drug Conflict Safety Check",
    sub: "Automated conflict detection across 300,000+ interactions to prevent dangerous drug combinations.",
  },
  {
    key: "stores",
    label: "Find Kendra",
    Icon: MapPin,
    Comp: ({ goto }) => <StoresPage hideNavbar={true} onNavigateTab={goto} />,
    title: "Jan Aushadhi Kendra Locator",
    sub: "Locate genuine PMBJP Kendras with verified addresses, opening hours, and driving routes.",
    isTool: true,
  },
  {
    key: "history",
    label: "Saved History",
    Icon: FileText,
    Comp: ({ goto }) => <HistoryPage hideNavbar={true} onNavigateTab={goto} />,
    title: "Device-Local Report History",
    sub: "Locally stored prescription summaries on this device with printable chemist counter slips.",
    isTool: true,
  },
];

export default function Dashboard({
  patient,
  onLogout,
  onGoHome,
  onSwitchPatient,
  initialSection = "summary",
}) {
  const [active, setActive] = useState(initialSection);
  const mainRef = useRef(null);
  const current = SECTIONS.find((s) => s.key === active) || SECTIONS[0];
  const Comp = current.Comp;

  useEffect(() => {
    if (initialSection && SECTIONS.some((s) => s.key === initialSection)) {
      setActive(initialSection);
    }
  }, [initialSection]);

  // GSAP smooth section entrance
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" }
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
    <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col md:flex-row relative">
      {/* 
        1. STATIONARY LEFT VERTICAL NAVBAR DOCK
        Firmly anchored on scrolls, distinct individual section with 2px ink divider
      */}
      <aside className="w-full md:w-72 lg:w-80 md:fixed md:top-0 md:left-0 md:bottom-0 md:h-screen bg-brand-cream border-b-2 md:border-b-0 md:border-r-2 border-brand-navy flex flex-col p-4 md:p-5 z-40 md:overflow-hidden shrink-0 select-none shadow-sm stationary-sidebar">
        
        {/* Brand Lockup Header */}
        <div className="flex items-center gap-3 pb-3.5 border-b-2 border-brand-navy/15">
          <div className="w-10 h-10 bg-brand-orange text-brand-navy border-2 border-brand-navy sketchy-box flex items-center justify-center shadow-sketch-hover">
            <Compass className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-black text-xl text-brand-navy tracking-tight truncate">
              Aushadh-AI
            </span>
            <span className="text-[10px] font-sans font-black tracking-widest text-brand-gray uppercase truncate">
              Aapki Dawai, Sahi Daam
            </span>
          </div>
        </div>

        {/* Presentation Return Button */}
        {onGoHome && (
          <button
            onClick={onGoHome}
            className="my-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-white hover:bg-brand-peach/30 text-brand-navy border-2 border-brand-navy font-sans font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover transition-all"
            title="Return to Presentation Landing Page"
          >
            <Home className="w-3.5 h-3.5 text-brand-orange shrink-0" />
            <span className="truncate">← Presentation Showcase</span>
          </button>
        )}

        {/* Navigation Dossier Section Tabs */}
        <nav className="my-1 space-y-1 flex-1 min-h-0 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(26,34,52,0.25) transparent' }}>
          <div className="text-[10px] font-sans font-black uppercase tracking-wider text-brand-gray px-2 py-1">
            PWA Workspace Modules
          </div>
          {SECTIONS.map((s) => {
            const Icon = s.Icon;
            const isActive = s.key === active;
            return (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-black uppercase tracking-wider transition-all text-left rounded-sm ${
                  isActive
                    ? "bg-brand-navy text-brand-cream border-2 border-brand-navy sketchy-btn shadow-sketch"
                    : "text-brand-navy/80 hover:text-brand-navy hover:bg-brand-peach/30 border-2 border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-brand-orange" : "text-brand-navy/60"}`} />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 
          2. USER INFO DOSSIER BADGE
          Guaranteed zero-overflow container with truncated identity & flex-wrapped demo chips
        */}
        <div className="mt-auto shrink-0 pt-3 border-t-2 border-brand-navy/20">
          <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-3 space-y-2.5 max-w-full overflow-hidden">
            
            {/* Identity Row */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-brand-orange text-brand-navy border-2 border-brand-navy font-serif font-black text-xs flex items-center justify-center shrink-0 shadow-sketch-hover">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif font-black text-sm text-brand-navy truncate leading-tight" title={patient?.name}>
                  {patient?.name}
                </div>
                <div className="font-sans text-[11px] font-medium text-brand-gray truncate" title={patient?.email || patient?.phone}>
                  {patient?.email || patient?.phone || "Verified Patient"}
                </div>
              </div>
            </div>

            {/* Plan Badge & Sign Out Button */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-brand-navy/10">
              <span className="font-sans text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-brand-peach/40 text-brand-navy border border-brand-navy rounded-sm shrink-0">
                {patient?.plan === "pro" ? "Pro Dossier" : "Free Access"}
              </span>
              <button
                onClick={onLogout}
                className="flex items-center gap-1 px-2.5 py-1 bg-brand-cream hover:bg-brand-peach/30 text-brand-navy border border-brand-navy font-sans text-xs font-bold rounded-sm transition-colors shrink-0"
                title="Sign out of Aushadh-AI"
              >
                <LogOut className="w-3 h-3 text-brand-orange" />
                <span>Sign out</span>
              </button>
            </div>

            {/* Switch Demo Patient Section (wrapped, zero-overflow) */}
            {onSwitchPatient && (
              <div className="pt-2 border-t border-dashed border-brand-navy/20">
                <div className="text-[10px] font-sans font-black uppercase tracking-wider text-brand-gray flex items-center gap-1.5 mb-1.5">
                  <Users className="w-3 h-3 text-brand-orange" />
                  <span>Switch Demo Patient:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "ramesh", label: "Ramesh" },
                    { id: "shanti", label: "Shanti" },
                    { id: "aarav", label: "Aarav" },
                  ].map((p) => {
                    const isSelected = patient?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSwitchPatient(p.id)}
                        className={`px-2 py-0.5 text-[10px] font-sans font-bold border border-brand-navy rounded-sm transition-all ${
                          isSelected
                            ? "bg-brand-orange text-brand-navy font-black shadow-sketch"
                            : "bg-brand-cream text-brand-navy hover:bg-brand-peach/30"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 
        3. MAIN WORKSPACE WITH UNIVERSAL DITTO TYPOGRAPHY
      */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen bg-brand-cream/60 md:ml-72 lg:ml-80" ref={mainRef}>
        
        {/* Sticky Top Dossier Header */}
        <header className="sticky top-0 z-20 bg-brand-cream/95 backdrop-blur-md border-b-2 border-brand-navy px-4 sm:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif font-black text-xl sm:text-2xl text-brand-navy tracking-tight truncate">
              {current.title}
            </h1>
            <p className="font-sans text-xs text-brand-gray font-medium truncate mt-0.5">
              {current.sub}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-brand-orange/20 border-2 border-brand-navy text-brand-navy font-mono text-xs font-bold sketchy-box shadow-sketch-hover">
              <HeartPulse className="w-3.5 h-3.5 text-brand-orange animate-pulse" />
              <span>Live Sync</span>
            </span>
          </div>
        </header>

        {/* Section Dynamic View Container */}
        <div className="p-3 sm:p-6 flex-1">
          <Comp patient={patient} goto={setActive} />
        </div>
      </main>
    </div>
  );
}
