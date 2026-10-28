"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import dynamic from "next/dynamic";

function ModuleLoadingFallback({ title = "Loading information…", sub = "Please wait while records and data are prepared…" }) {
  return (
    <div className="rounded-xl border border-ui-border-decorative bg-ui-surface p-8 text-center max-w-lg mx-auto shadow-ui-card my-6" role="status" aria-live="polite">
      <div className="w-8 h-8 border-3 border-ui-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" aria-hidden="true" />
      <p className="font-serif font-semibold text-ui-text text-base">{title}</p>
      <p className="text-xs text-ui-text-secondary mt-1">{sub}</p>
    </div>
  );
}

// Keep the workspace shell interactive while the selected clinical module loads.
// All named imports below share the same deferred sections chunk.
const sectionFallback = () => (
  <ModuleLoadingFallback title="Loading health overview…" sub="Retrieving conditions, schedule and prescriptions…" />
);
const Summary = dynamic(() => import("@/components/sections").then((module) => module.Summary), { loading: sectionFallback });
const Medicines = dynamic(() => import("@/components/sections").then((module) => module.Medicines), { loading: sectionFallback });
const Interactions = dynamic(() => import("@/components/sections").then((module) => module.Interactions), { loading: sectionFallback });

// Code-split heavy tool tabs to guarantee sub-second initial dashboard entry
const Assistant = dynamic(() => import("@/components/Assistant"), {
  loading: () => <ModuleLoadingFallback title="Connecting to Sahayak Voice Assistant…" sub="Establishing secure real-time consultation channel…" />,
  ssr: false,
});

const SearchView = dynamic(() => import("@/components/views/SearchView"), {
  loading: () => <ModuleLoadingFallback title="Loading Price Discovery…" sub="Accessing verified PMBJP Kendra and NPPA database…" />,
  ssr: false,
});

const ScanView = dynamic(() => import("@/components/views/ScanView"), {
  loading: () => <ModuleLoadingFallback title="Loading Prescription Scanner…" sub="Preparing high-accuracy clinical OCR engine…" />,
  ssr: false,
});

const StoresView = dynamic(() => import("@/components/views/StoresView"), {
  loading: () => <ModuleLoadingFallback title="Loading Kendra Locator & Map…" sub="Locating nearest Jan Aushadhi Kendras…" />,
  ssr: false,
});

const HistoryView = dynamic(() => import("@/components/views/HistoryView"), {
  loading: () => <ModuleLoadingFallback title="Loading Saved Records…" sub="Accessing your device-local prescription history…" />,
  ssr: false,
});

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
  Menu,
  X,
  CheckCircle2,
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
    Comp: ({ goto, patient }) => <SearchView hideNavbar={true} onNavigateTab={goto} patient={patient} />,
    title: "Jan Aushadhi Price Discovery",
    sub: "Verify Jan Aushadhi (PMBJP) generic alternatives against branded MRP and NPPA caps.",
    isTool: true,
  },
  {
    key: "scan",
    label: "Scan Prescription",
    Icon: UploadCloud,
    Comp: ({ goto, patient }) => <ScanView hideNavbar={true} onNavigateTab={goto} patient={patient} />,
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
    sub: "Checks a limited set of cited interaction rules; a missing alert does not rule out risk.",
  },
  {
    key: "stores",
    label: "Find Kendra",
    Icon: MapPin,
    Comp: ({ goto, patient }) => <StoresView hideNavbar={true} onNavigateTab={goto} patient={patient} />,
    title: "Jan Aushadhi Kendra Locator",
    sub: "Locate genuine PMBJP Kendras with verified addresses, opening hours, and driving routes.",
    isTool: true,
  },
  {
    key: "history",
    label: "Saved History",
    Icon: FileText,
    Comp: ({ goto, patient }) => <HistoryView hideNavbar={true} onNavigateTab={goto} patient={patient} />,
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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const mainRef = useRef(null);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const current = SECTIONS.find((s) => s.key === active) || SECTIONS[0];
  const Comp = current.Comp;

  useEffect(() => {
    if (initialSection && SECTIONS.some((s) => s.key === initialSection)) {
      setActive(initialSection);
    }
  }, [initialSection]);

  // Handle section selection and sync to URL query parameter (?tab=)
  const handleSelectSection = (key) => {
    setActive(key);
    setMobileDrawerOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Escape key close and focus return for mobile drawer
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setMobileDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileDrawerOpen]);

  // GSAP smooth section entrance (gated for reduced motion)
  useEffect(() => {
    const el = mainRef.current;
    if (!el || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.24, ease: "power2.out" }
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
    <div className="workspace-v2 min-h-screen bg-ui-canvas text-ui-text font-sans antialiased flex flex-col lg:flex-row relative">
      {/* 
        ==============================================================
        1. DESKTOP SIDEBAR (≥1024px)
        Fixed 268px sidebar, fits all 8 links at ≥700px height without scroll
        ==============================================================
      */}
      <aside className="hidden lg:flex w-[268px] fixed top-0 left-0 bottom-0 h-screen bg-ui-surface border-r border-ui-border-decorative flex-col p-4 z-30 select-none shadow-sm">
        
        {/* Brand Header (~52px) */}
        <div className="flex items-center justify-between pb-3 border-b border-ui-border-decorative/60 shrink-0">
          <Link href="/" className="flex items-center gap-2 group py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue rounded">
            <img
              src="/aayogya-logo.png"
              alt="Ayogya"
              className="h-8 w-auto object-contain transition-transform group-hover:scale-[1.02]"
            />
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ui-text-secondary px-2 py-0.5 bg-ui-canvas border border-ui-border-decorative rounded">
            Patient
          </span>
        </div>

        {/* Home Return Button (~36px) */}
        {onGoHome && (
          <button
            type="button"
            onClick={onGoHome}
            className="mt-3 mb-2 w-full flex items-center justify-center gap-2 px-3 py-1.5 min-h-[36px] bg-ui-canvas hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue shrink-0"
            title="Return to Home Showcase"
          >
            <Home className="w-3.5 h-3.5 text-ui-blue shrink-0" aria-hidden="true" />
            <span className="truncate">Return to Home</span>
          </button>
        )}

        {/* Navigation Landmark: 40-44px rows, fits all 8 links at ≥700px height, scrollable on short viewports */}
        <nav
          aria-label="Workspace modules"
          tabIndex={0}
          className="my-1 space-y-1 flex-1 min-h-0 overflow-y-auto pr-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ui-blue rounded-md"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(23,43,77,0.2) transparent" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ui-text-secondary px-2 py-1">
            Workspace Modules
          </div>
          {SECTIONS.map((s) => {
            const Icon = s.Icon;
            const isActive = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => handleSelectSection(s.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 min-h-[40px] text-xs font-semibold rounded-lg transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue ${
                  isActive
                    ? "bg-ui-blue text-white shadow-sm"
                    : "text-ui-text hover:bg-ui-surface-subtle hover:text-ui-blue"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-ui-text-secondary"}`}
                  aria-hidden="true"
                />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Pinned Identity Card & Sign Out Footer (~76px) */}
        <div className="mt-auto shrink-0 pt-3 border-t border-ui-border-decorative/60">
          <div className="bg-ui-canvas border border-ui-border-decorative rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-ui-surface border border-ui-border-decorative text-ui-blue font-serif font-bold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-ui-text truncate leading-tight" title={patient?.name}>
                  {patient?.name || "Patient Account"}
                </div>
                <div className="text-[11px] text-ui-text-secondary truncate" title={patient?.email || patient?.phone}>
                  {patient?.email || patient?.phone || "Verified"}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-ui-border-decorative/40">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-ui-surface text-ui-blue border border-ui-border-decorative rounded">
                {patient?.plan === "pro" ? "PRO" : "Standard"}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1 px-2.5 py-1 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative text-[11px] font-semibold rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
                title="Sign out of Ayogya"
              >
                <LogOut className="w-3 h-3 text-ui-text-secondary" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 
        ==============================================================
        2. TABLET / MOBILE TOPBAR & DRAWER (<1024px)
        ==============================================================
      */}
      <div className="lg:hidden sticky top-0 z-30 bg-ui-surface/95 backdrop-blur-md border-b border-ui-border-decorative px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/aayogya-logo.png" alt="Ayogya" className="h-7 w-auto object-contain shrink-0" />
          <span className="font-serif font-semibold text-sm text-ui-text truncate">
            {current.title}
          </span>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-expanded={mobileDrawerOpen}
          aria-controls="mobile-dashboard-drawer"
          aria-label="Open workspace navigation"
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-ui-text hover:text-ui-blue bg-ui-canvas border border-ui-border-decorative rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue shrink-0"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Mobile Drawer Modal Sheet */}
      {mobileDrawerOpen && (
        <div
          id="mobile-dashboard-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation drawer"
          className="lg:hidden fixed inset-0 z-50 flex bg-[#172B4D]/50 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileDrawerOpen(false);
          }}
        >
          <div
            ref={drawerRef}
            className="w-[min(320px,calc(100vw-24px))] h-full bg-ui-surface border-r border-ui-border-decorative flex flex-col p-5 shadow-ui-modal overflow-y-auto"
          >
            {/* Drawer Top Header */}
            <div className="flex items-center justify-between pb-4 border-b border-ui-border-decorative">
              <img src="/aayogya-logo.png" alt="Ayogya" className="h-8 w-auto object-contain" />
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close navigation drawer"
                className="p-2 text-ui-text-secondary hover:text-ui-text bg-ui-canvas rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Account Dossier in Drawer */}
            <div className="my-4 p-3 bg-ui-canvas border border-ui-border-decorative rounded-xl">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-ui-surface border border-ui-border-decorative text-ui-blue font-serif font-bold text-xs flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-ui-text truncate">
                    {patient?.name || "Patient Account"}
                  </div>
                  <div className="text-[11px] text-ui-text-secondary truncate">
                    {patient?.email || patient?.phone || "Verified"}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Links in Drawer */}
            <nav className="space-y-1.5 flex-1 min-h-0">
              {SECTIONS.map((s) => {
                const Icon = s.Icon;
                const isActive = s.key === active;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleSelectSection(s.key)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] text-sm font-semibold rounded-lg transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue ${
                      isActive
                        ? "bg-ui-blue text-white shadow-sm"
                        : "text-ui-text hover:bg-ui-surface-subtle"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-ui-text-secondary"}`} aria-hidden="true" />
                    <span className="truncate">{s.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Drawer Actions at Bottom */}
            <div className="pt-4 mt-auto border-t border-ui-border-decorative space-y-2">
              {onGoHome && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    onGoHome();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] bg-ui-canvas hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
                >
                  <Home className="w-4 h-4 text-ui-blue" aria-hidden="true" />
                  <span>Return to Home</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] bg-ui-surface hover:bg-ui-surface-subtle text-ui-danger border border-ui-border-decorative text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
        ==============================================================
        3. MAIN WORKSPACE VIEWPORT
        Constrained ~1440px on large displays, lg:ml-[268px] desktop offset
        ==============================================================
      */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen bg-ui-canvas lg:ml-[268px]" ref={mainRef}>
        
        {/* Top Header in Workspace (Desktop) */}
        <header className="hidden lg:flex sticky top-0 z-20 bg-ui-canvas/95 backdrop-blur-md border-b border-ui-border-decorative px-6 lg:px-8 py-4 items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif font-semibold text-2xl text-ui-text tracking-tight truncate">
              {current.title}
            </h1>
            <p className="text-xs text-ui-text-secondary font-sans truncate mt-0.5">
              {current.sub}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-ui-surface border border-ui-border-decorative text-ui-text text-xs font-semibold rounded-full shadow-sm">
              <span className="w-2 h-2 rounded-full bg-ui-success" aria-hidden="true" />
              <span>Verified Prescriptions</span>
            </span>
          </div>
        </header>

        {/* Section View Container */}
        <div className="p-4 sm:p-6 lg:p-8 flex-1 max-w-[1440px] w-full mx-auto">
          <Comp patient={patient} goto={handleSelectSection} />
        </div>
      </main>
    </div>
  );
}
