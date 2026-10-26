"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

import { useEffect, useState } from "react";
import { useScrollReveal } from "@/lib/gsap";
import { getPublicPrices } from "@/lib/api";
import {
  ShieldCheck,
  CheckCircle2,
  Tag,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  PhoneCall,
  Mail,
  Lock,
  Check,
  Radio,
  Pause,
  Play,
  ArrowRight,
  MessageCircleHeart,
  Pill,
  CalendarClock,
  Sparkles,
} from "lucide-react";

// ---- Verified FAQs (WAI-ARIA Accordion) ----
const FAQS = [
  {
    q: "What is Ayogya and who is it designed for?",
    a: "Ayogya is a prescription review, medicine comparison, and family adherence companion. It is designed for patients managing multi-doctor prescriptions and caregivers who want to ensure their family members take the right medicines on time without overpaying.",
  },
  {
    q: "How does the safety interaction check work?",
    a: "Ayogya cross-checks active medicine salts across your uploaded prescriptions against our loaded clinical interaction rules. It is a decision-support guide, not an exhaustive diagnostic system. A missing alert does not guarantee safety, and any warnings should be reviewed with your doctor.",
  },
  {
    q: "Does Ayogya prescribe medicines or advise substitutions?",
    a: "No. Ayogya is strictly non-clinical. We never diagnose conditions, prescribe medications, or recommend brand switches without doctor oversight. All generic alternatives are provided for price transparency and discussion with your doctor or pharmacist.",
  },
  {
    q: "How do caregivers access a patient's records?",
    a: "Caregivers can only access a patient's health records after the patient grants explicit linked consent. Access is authenticated server-side on every request, ensuring complete privacy and isolation between family accounts.",
  },
  {
    q: "What are Jan Aushadhi generic medicines?",
    a: "Under the Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP), the Government of India provides certified quality generic medicines at 50% to 80% lower cost than branded alternatives. They contain the identical therapeutic active salts.",
  },
  {
    q: "Where is my prescription data stored?",
    a: "Unconfirmed prescriptions remain temporary until you explicitly confirm and save them. Device-local records stay in your browser's private storage, and authenticated account records are encrypted and protected by strict role-based access control.",
  },
];

export default function Landing({
  patient,
  onSelectDemo,
  onOpenDashboard,
  onLoginSuccess,
  onOpenAuth,
}) {
  const router = useRouter();
  const scope = useScrollReveal([]);
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const handleAuthAction = () => {
    if (onOpenAuth) {
      onOpenAuth();
    } else {
      router.push("/app");
    }
  };

  return (
    <div
      className="landing-v2 min-h-screen bg-ui-canvas text-ui-text font-sans antialiased selection:bg-ui-surface-subtle selection:text-ui-text"
      ref={scope}
    >
      {/* ==============================================================
          PERSISTENT CHROME: NAVBAR
          ============================================================== */}
      <Navbar isLanding={true} onOpenAuth={onOpenAuth} />

      {/* ==============================================================
          SECTION 1: HERO (#home)
          ============================================================== */}
      <header id="home" className="relative py-14 sm:py-16 lg:py-20 overflow-hidden">
        <div
          id="main-content"
          className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-10 lg:gap-12 items-start relative z-10"
        >
          {/* Left: Verified Value Proposition (5/12 on lg) */}
          <div className="lg:col-span-5 flex flex-col justify-start items-start space-y-6 pt-2">
            {/* Context Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ui-surface border border-ui-border-decorative text-ui-text text-xs font-semibold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-ui-blue" aria-hidden="true" />
              <span>Prescription clarity for patients and caregivers</span>
            </div>

            {/* Concise, Balanced H1 */}
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-[44px] font-semibold text-ui-text leading-[1.15] tracking-tight">
              Understand prescriptions, safety warnings, and fair prices.
            </h1>

            {/* Support Copy with Medical Disclaimer */}
            <p className="text-base sm:text-lg text-ui-text-secondary font-sans leading-relaxed">
              Ayogya helps families digitize prescriptions, track multi-doctor medication schedules, catch potential interaction warnings, and discover verified Jan Aushadhi generic savings — while deferring every diagnosis and clinical treatment decision to your doctor.
            </p>

            {/* Call to Actions */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2 w-full sm:w-auto">
              <a
                href="#product"
                className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2"
              >
                <span>Explore the product</span>
                <ChevronRight className="w-4 h-4 ml-1.5" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={handleAuthAction}
                className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative hover:border-ui-control-border rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2"
              >
                Sign in
              </button>
            </div>

            {/* Credibility micro-points */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs font-medium text-ui-text-secondary border-t border-ui-border-decorative/60 w-full">
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-ui-success" aria-hidden="true" /> Non-clinical assistance
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-ui-success" aria-hidden="true" /> Verified Jan Aushadhi catalogue
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-ui-success" aria-hidden="true" /> Patient-consented access
              </span>
            </div>
          </div>

          {/* Right: Protected Player Card (7/12 on lg) */}
          <div className="lg:col-span-7 relative flex items-center justify-center lg:justify-end w-full">
            {/* Decorative arrow: visible on tablet/desktop, hidden on small mobile */}
            <svg
              className="absolute -top-10 -left-8 w-20 h-20 text-brand-navy/20 transform rotate-12 z-0 hidden md:block pointer-events-none"
              viewBox="0 0 100 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M10,50 Q30,20 60,10" markerEnd="url(#hero-arrowhead)" />
              <defs>
                <marker id="hero-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                </marker>
              </defs>
            </svg>

            <SahayakPlayerCard onLaunchDemo={onOpenAuth || (() => onSelectDemo("ramesh"))} />
          </div>
        </div>
      </header>

      {/* ==============================================================
          SECTION 2: TRUST & CREDIBILITY (#trust)
          ============================================================== */}
      <section id="trust" className="py-16 sm:py-20 border-t border-ui-border-decorative scroll-mt-20">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-semibold text-ui-blue uppercase tracking-widest block mb-2">
              Safety & Data Boundaries
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-ui-text tracking-tight">
              Built for patient consent, safety, and transparency
            </h2>
            <p className="mt-3 text-sm sm:text-base text-ui-text-secondary leading-relaxed">
              Every workflow operates strictly within transparent data governance and non-clinical guidelines.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
              <div className="w-10 h-10 rounded-lg bg-ui-surface-subtle flex items-center justify-center text-ui-blue mb-4">
                <CheckCircle2 size={20} aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ui-text mb-2">Human Confirmation</h3>
              <p className="text-xs text-ui-text-secondary leading-relaxed">
                Extracted medicines, dosages, and schedules always require your explicit review and confirmation before being saved to your active record.
              </p>
            </div>

            <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
              <div className="w-10 h-10 rounded-lg bg-ui-surface-subtle flex items-center justify-center text-ui-blue mb-4">
                <Tag size={20} aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ui-text mb-2">Source-Labelled Prices</h3>
              <p className="text-xs text-ui-text-secondary leading-relaxed">
                Generic price alternatives are mapped directly to official Jan Aushadhi (PMBJP) catalogues and NPPA price control ceilings with clear provenance.
              </p>
            </div>

            <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
              <div className="w-10 h-10 rounded-lg bg-ui-surface-subtle flex items-center justify-center text-ui-blue mb-4">
                <ShieldCheck size={20} aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ui-text mb-2">Caregiver Authorization</h3>
              <p className="text-xs text-ui-text-secondary leading-relaxed">
                Family caregivers can only view records for elders who have granted explicit linked consent. Access is verified server-side on every request.
              </p>
            </div>

            <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card">
              <div className="w-10 h-10 rounded-lg bg-ui-surface-subtle flex items-center justify-center text-ui-blue mb-4">
                <AlertTriangle size={20} aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-ui-text mb-2">Interaction Moat</h3>
              <p className="text-xs text-ui-text-secondary leading-relaxed">
                Multi-doctor prescriptions are checked against cited clinical rules. Coverage is decision-support only; consult your doctor for any alerts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          SECTION 3: ABOUT / HOW IT WORKS (#how-it-works)
          ============================================================== */}
      <section
        id="how-it-works"
        className="py-16 sm:py-20 border-t border-ui-border-decorative bg-ui-surface-subtle/40 scroll-mt-20"
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            {/* Left Narrative Column (4/12) */}
            <div className="lg:col-span-4 space-y-4">
              <span className="text-xs font-semibold text-ui-blue uppercase tracking-widest block">
                Workflow
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-ui-text leading-tight tracking-tight">
                From paper slips to a coordinated family schedule.
              </h2>
              <p className="text-sm text-ui-text-secondary leading-relaxed">
                Chronic care often involves multiple specialists with separate paper prescriptions. Ayogya organizes them into one clear picture without altering your doctor's clinical decisions.
              </p>
              <div className="pt-2">
                <a
                  href="#product"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ui-blue hover:text-ui-blue-hover transition-colors"
                >
                  <span>See generic price comparison</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Right Three-Step Rail (8/12) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card flex flex-col sm:flex-row items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-ui-blue text-white flex items-center justify-center text-xs font-bold shrink-0">
                  01
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ui-text mb-1">
                    Digitize and parse prescription details
                  </h3>
                  <p className="text-xs sm:text-sm text-ui-text-secondary leading-relaxed">
                    Upload a photo of your printed or handwritten prescription. OCR extracts brand names, active salts, strengths, and dose frequencies for your inspection.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card flex flex-col sm:flex-row items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-ui-blue text-white flex items-center justify-center text-xs font-bold shrink-0">
                  02
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ui-text mb-1">
                    Review safety warnings and generic alternatives
                  </h3>
                  <p className="text-xs sm:text-sm text-ui-text-secondary leading-relaxed">
                    Cross-check active medications for potential multi-doctor contraindications and compare branded retail prices directly against verified Jan Aushadhi generic equivalents.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card flex flex-col sm:flex-row items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-ui-blue text-white flex items-center justify-center text-xs font-bold shrink-0">
                  03
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ui-text mb-1">
                    Confirm active schedule and synchronize with family
                  </h3>
                  <p className="text-xs sm:text-sm text-ui-text-secondary leading-relaxed">
                    Save reviewed records to receive daily adherence check-ins via WhatsApp or automated phone calls, giving distant caregivers peace of mind.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          SECTION 4: PRODUCT EXPERIENCE (#product)
          ============================================================== */}
      <section id="product" className="py-16 sm:py-20 border-t border-ui-border-decorative scroll-mt-20">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-semibold text-ui-blue uppercase tracking-widest block mb-2">
              Action Engine
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-ui-text tracking-tight">
              Live Jan Aushadhi generic price discovery
            </h2>
            <p className="mt-2 text-sm text-ui-text-secondary leading-relaxed">
              Search any Indian medicine brand below to check verified active salt matches, NPPA price ceilings, and generic savings.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <PriceSimulatorCard />
            <p className="text-[11px] text-ui-text-secondary text-center mt-3">
              Data mapped to official PMBJP and NPPA reference catalogues. Never substitute prescribed medicines without physician guidance.
            </p>
          </div>
        </div>
      </section>

      {/* ==============================================================
          SECTION 5: SECONDARY DASHBOARD LOGIN CTA (#dashboard)
          ============================================================== */}
      <section
        id="dashboard"
        className="py-16 sm:py-20 border-t border-ui-border-decorative bg-ui-surface-subtle/50 scroll-mt-20"
      >
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl p-8 sm:p-12 shadow-ui-card">
            <span className="inline-block px-3 py-1 rounded-full bg-ui-surface-subtle text-ui-blue text-xs font-semibold mb-4">
              Secure Workspace Access
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-ui-text tracking-tight mb-3">
              Ready to review your prescriptions?
            </h2>
            <p className="text-sm sm:text-base text-ui-text-secondary max-w-lg mx-auto mb-8 leading-relaxed">
              Sign in to manage your active medication schedule, run drug-drug safety reviews, and track adherence telemetry from any device.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleAuthAction}
                className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-8 py-3 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2"
              >
                Sign in to Dashboard
              </button>
              <Link
                href="/search"
                className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-6 py-3 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
              >
                Public Search & Compare
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          SECTION 6: FAQ (#faq)
          ============================================================== */}
      <section id="faq" className="py-16 sm:py-20 border-t border-ui-border-decorative scroll-mt-20">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold text-ui-blue uppercase tracking-widest block mb-2">
              Common Questions
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-ui-text tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="mt-2 text-sm text-ui-text-secondary leading-relaxed">
              Clear answers on clinical boundaries, privacy, caregiver consent, and generic medicines.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="border border-ui-border-decorative rounded-xl bg-ui-surface overflow-hidden transition-colors"
              >
                <h3>
                  <button
                    type="button"
                    id={`faq-btn-${idx}`}
                    aria-expanded={openFaq === idx}
                    aria-controls={`faq-panel-${idx}`}
                    onClick={() => toggleFaq(idx)}
                    className="w-full min-h-[52px] px-5 py-4 text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-base text-ui-text hover:text-ui-blue transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-ui-blue transition-transform duration-200 ${
                        openFaq === idx ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                {openFaq === idx && (
                  <div
                    id={`faq-panel-${idx}`}
                    role="region"
                    aria-labelledby={`faq-btn-${idx}`}
                    className="px-5 pb-5 pt-1 text-sm text-ui-text-secondary leading-relaxed border-t border-ui-border-decorative/50"
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==============================================================
          SECTION 7: SUBSCRIBE (#subscribe)
          ============================================================== */}
      <section
        id="subscribe"
        className="py-16 sm:py-20 border-t border-ui-border-decorative bg-ui-surface-subtle/30 scroll-mt-20"
      >
        <div className="max-w-[640px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl p-6 sm:p-8 shadow-ui-card">
            <div className="w-12 h-12 bg-ui-surface-subtle text-ui-blue mx-auto mb-4 flex items-center justify-center rounded-full">
              <Mail className="w-6 h-6" aria-hidden="true" />
            </div>

            <h2 className="font-serif text-2xl font-semibold text-ui-text mb-2">
              Healthcare Brief & Adherence Updates
            </h2>
            <p className="text-xs sm:text-sm text-ui-text-secondary mb-6 leading-relaxed">
              Research on Jan Aushadhi generic availability, healthcare accessibility, and elder care adherence patterns.
            </p>

            <div className="p-4 bg-ui-surface-subtle border border-ui-border-decorative rounded-xl text-xs text-ui-text-secondary leading-relaxed">
              <strong className="text-ui-text block mb-1">Subscriptions in Private Preview</strong>
              Public newsletter signups are currently paused while our messaging infrastructure is configured. Registered patients and caregivers receive active adherence check-ins directly via WhatsApp and the web dashboard.
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          SECTION 8: FOOTER (LANDMARK)
          ============================================================== */}
      <footer className="bg-ui-surface border-t border-ui-border-decorative py-14 sm:py-16">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Col 1: Brand & Purpose */}
            <div className="space-y-4">
              <Link href="/" className="inline-block">
                <img
                  src="/aayogya-logo.png"
                  alt="Ayogya"
                  className="h-9 w-auto object-contain"
                />
              </Link>
              <p className="text-xs text-ui-text-secondary leading-relaxed">
                A non-clinical prescription navigator and adherence companion. Not a substitute for licensed medical consultation.
              </p>
            </div>

            {/* Col 2: Navigation Anchors */}
            <div>
              <h4 className="text-xs font-semibold text-ui-text uppercase tracking-wider mb-3">
                Overview
              </h4>
              <ul className="space-y-2 text-xs text-ui-text-secondary">
                <li>
                  <a href="#home" className="hover:text-ui-blue transition-colors">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#trust" className="hover:text-ui-blue transition-colors">
                    Safety & Boundaries
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-ui-blue transition-colors">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#product" className="hover:text-ui-blue transition-colors">
                    Generic Comparison
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-ui-blue transition-colors">
                    Frequently Asked Questions
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Public Tools */}
            <div>
              <h4 className="text-xs font-semibold text-ui-text uppercase tracking-wider mb-3">
                Public Tools
              </h4>
              <ul className="space-y-2 text-xs text-ui-text-secondary">
                <li>
                  <Link href="/search" className="hover:text-ui-blue transition-colors">
                    Search & Compare Medicines
                  </Link>
                </li>
                <li>
                  <Link href="/scan" className="hover:text-ui-blue transition-colors">
                    Prescription OCR Scanner
                  </Link>
                </li>
                <li>
                  <Link href="/stores" className="hover:text-ui-blue transition-colors">
                    Find Jan Aushadhi Kendra
                  </Link>
                </li>
                <li>
                  <Link href="/history" className="hover:text-ui-blue transition-colors">
                    Saved Local History
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 4: Emergency Assistance */}
            <div>
              <h4 className="text-xs font-semibold text-ui-text uppercase tracking-wider mb-3">
                Emergency Contact
              </h4>
              <div className="space-y-2 text-xs text-ui-text-secondary">
                <a
                  href="tel:108"
                  className="inline-flex items-center gap-1.5 font-bold text-ui-danger hover:underline text-sm"
                >
                  <PhoneCall size={14} aria-hidden="true" />
                  <span>National Emergency: 108</span>
                </a>
                <p className="text-[11px] leading-relaxed pt-1">
                  For sudden chest pain, breathing difficulty, or acute emergencies, call 108 immediately or visit the nearest emergency room.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-ui-border-decorative/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ui-text-secondary">
            <span>
              © 2026 Ayogya. All rights reserved. Always consult your registered medical practitioner.
            </span>
            <span className="text-[11px]">
              PMBJP & NPPA Reference Data Aligned
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---- Sub-Component: Sahayak Voice Player Card (Preserved byte-for-byte in structure & content) ----
function SahayakPlayerCard({ onLaunchDemo }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [response, setResponse] = useState("confirmed"); // 'confirmed' | 'snooze' | 'missed'

  return (
    <div className="w-full max-w-xl bg-brand-white border-2 border-brand-navy sketchy-box p-6 sm:p-8 shadow-[6px_6px_0px_0px_#1a2234] relative z-10 transform rotate-1 transition-all hover:rotate-0 duration-500">
      {/* Signature Frosted Masking Tape */}
      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-36 h-7 bg-brand-cream/90 border-l border-r border-brand-white/70 backdrop-blur-sm transform -rotate-1 opacity-80 shadow-sm flex items-center justify-center">
        <span className="text-[9px] font-mono font-bold tracking-widest text-brand-navy/70 uppercase">
          EVIDENCE CASE #04
        </span>
      </div>

      {/* Top Header: Telemetry Status + Duration */}
      <div className="flex justify-between items-center mb-5 pb-3 border-b-2 border-brand-navy/10">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-orange"></span>
          </span>
          <span className="text-[11px] font-bold tracking-[0.2em] text-brand-navy uppercase flex items-center gap-1.5">
            <Radio size={14} className="text-brand-orange" />
            Live Adherence Telemetry
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-brand-navy text-brand-white rounded">
            HINDI · HINGLISH
          </span>
          <span className="text-xs font-mono text-brand-gray font-bold">00:34 / 01:30</span>
        </div>
      </div>

      {/* Patient Dossier Strip */}
      <div className="flex items-center justify-between bg-brand-cream/60 border border-brand-navy/15 rounded-lg p-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-peach/40 border border-brand-navy/30 flex items-center justify-center font-serif font-bold text-brand-navy text-sm">
            RK
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-serif font-bold text-sm text-brand-navy leading-none">Ramesh Kumar</h4>
              <span className="text-[10px] font-sans font-semibold bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded">
                71 yrs
              </span>
            </div>
            <p className="text-[11px] text-brand-gray mt-0.5">Hypertension + Type-2 Diabetes</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-mono font-bold text-brand-orange block uppercase tracking-wider">
            Morning Dose
          </span>
          <span className="text-[11px] font-mono text-brand-navy">08:15 AM · Scheduled</span>
        </div>
      </div>

      {/* Active Prescription Medicine Box */}
      <div className="p-3.5 bg-brand-white border-2 border-brand-navy/20 sketchy-box mb-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-brand-orange/15 rounded border border-brand-orange/40 text-brand-navy mt-0.5">
              <Pill size={16} className="text-brand-orange" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-base text-brand-navy">Amlong 5mg</span>
                <span className="text-[10px] font-mono bg-brand-peach/30 text-brand-navy px-1.5 py-0.5 rounded font-semibold">
                  1 Tab · Post-Breakfast
                </span>
              </div>
              <p className="text-xs text-brand-gray mt-0.5">
                Salt: <span className="font-mono text-brand-navy">Amlodipine Besylate IP 5mg</span>
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="inline-block text-[10px] font-bold text-brand-navy bg-brand-orange/20 border border-brand-orange/50 px-2 py-0.5 rounded">
              Jan Aushadhi: ₹6 (Save 82%)
            </span>
          </div>
        </div>
      </div>

      {/* Voice Transcript Speech Bubble */}
      <div className="relative mb-5 p-4 bg-brand-cream/80 border-2 border-brand-navy sketchy-box">
        <div className="flex items-center gap-2 mb-1.5">
          <PhoneCall size={13} className="text-brand-orange" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-navy">
            Sahayak Voice Bot (AI Agent)
          </span>
        </div>
        <p className="font-serif text-base sm:text-lg text-brand-navy leading-snug italic">
          "Namaste Ramesh ji! Subah ki BP wali goli{" "}
          <span className="font-semibold underline decoration-brand-orange decoration-2">
            Amlong 5
          </span>{" "}
          le li? Agar le li toh 'Haan' bole."
        </p>

        {/* Audio Visualizer Waveform */}
        <div className="flex items-center justify-between gap-1 h-9 mt-3 px-3 bg-brand-white/80 rounded border border-brand-navy/10 overflow-hidden">
          {[40, 65, 80, 45, 90, 70, 30, 85, 100, 60, 40, 95, 75, 50, 85, 60, 35, 70, 90, 55, 30, 80, 65, 45, 85, 50, 30, 60].map(
            (h, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-300 ${
                  i % 4 === 1
                    ? "bg-brand-orange"
                    : i % 4 === 3
                    ? "bg-brand-peach"
                    : "bg-brand-navy"
                }`}
                style={{
                  height: isPlaying ? `${Math.max(15, (h * ((i % 3) + 1)) % 100)}%` : "20%",
                  opacity: isPlaying ? 0.9 : 0.35,
                }}
              />
            )
          )}
        </div>
      </div>

      {/* Single-Tap Interactive Patient Response Buttons */}
      <div className="mb-5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-gray block mb-2">
          Voice or Tap Confirmation:
        </span>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setResponse("confirmed")}
            className={`px-3 py-2 text-xs font-bold rounded border-2 transition-all flex items-center justify-center gap-1.5 ${
              response === "confirmed"
                ? "bg-brand-navy text-brand-white border-brand-navy shadow-sketch-hover"
                : "bg-brand-white text-brand-navy border-brand-navy/30 hover:border-brand-navy"
            }`}
          >
            <Check size={14} className={response === "confirmed" ? "text-brand-orange" : "text-brand-gray"} />
            <span>Haan, Le Li</span>
          </button>
          <button
            type="button"
            onClick={() => setResponse("snooze")}
            className={`px-3 py-2 text-xs font-bold rounded border-2 transition-all flex items-center justify-center gap-1.5 ${
              response === "snooze"
                ? "bg-brand-navy text-brand-white border-brand-navy shadow-sketch-hover"
                : "bg-brand-white text-brand-navy border-brand-navy/30 hover:border-brand-navy"
            }`}
          >
            <CalendarClock size={14} className={response === "snooze" ? "text-brand-orange" : "text-brand-gray"} />
            <span>15 Min Baad</span>
          </button>
          <button
            type="button"
            onClick={() => setResponse("missed")}
            className={`px-3 py-2 text-xs font-bold rounded border-2 transition-all flex items-center justify-center gap-1.5 ${
              response === "missed"
                ? "bg-brand-navy text-brand-white border-brand-navy shadow-sketch-hover"
                : "bg-brand-white text-brand-navy border-brand-navy/30 hover:border-brand-navy"
            }`}
          >
            <AlertTriangle size={14} className={response === "missed" ? "text-brand-orange" : "text-brand-gray"} />
            <span>Nahi Li</span>
          </button>
        </div>
      </div>

      {/* Audio Controller & CTA Strip */}
      <div className="flex items-center gap-4 pt-3 border-t-2 border-brand-navy/10">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-12 h-12 rounded-full bg-brand-orange border-2 border-brand-navy flex items-center justify-center hover:scale-105 transition-transform shadow-sketch hover:shadow-sketch-hover cursor-pointer shrink-0"
          title={isPlaying ? "Pause voice preview" : "Play voice preview"}
        >
          {isPlaying ? (
            <Pause size={18} className="text-brand-navy fill-current" />
          ) : (
            <Play size={18} className="text-brand-navy fill-current translate-x-0.5" />
          )}
        </button>

        <div className="flex-1">
          <div className="flex justify-between text-[11px] font-mono text-brand-gray mb-1">
            <span className="font-bold text-brand-navy">{isPlaying ? "Playing voice sample" : "Paused"}</span>
            <span>00:34 / 01:30</span>
          </div>
          <div className="h-2 bg-brand-navy/10 rounded-full overflow-hidden">
            <div className="h-full bg-brand-navy w-[38%] rounded-full relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-brand-orange rounded-full border border-brand-navy" />
            </div>
          </div>
        </div>

        <button
          onClick={onLaunchDemo}
          className="sketchy-btn bg-brand-navy text-brand-white hover:bg-brand-orange hover:text-brand-navy border-2 border-brand-navy px-4 py-2.5 text-xs font-bold uppercase tracking-widest shadow-sketch transition-all shrink-0 flex items-center gap-1.5"
        >
          <span>Demo</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Caregiver WhatsApp sync footer notice */}
      <div className="mt-4 pt-3 border-t border-dashed border-brand-navy/15 flex items-center justify-between text-[11px] text-brand-gray">
        <span className="flex items-center gap-1.5">
          <MessageCircleHeart size={14} className="text-brand-orange shrink-0" />
          <span>Caregiver WhatsApp alert: <strong>Papa marked dose taken ✓</strong></span>
        </span>
        <span className="font-mono text-[10px] text-brand-navy/60 font-semibold uppercase">08:16 AM</span>
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

  const money = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "—");

  return (
    <div className="bg-ui-surface border border-ui-border-decorative rounded-2xl p-6 sm:p-8 shadow-ui-card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q.trim());
        }}
        className="flex flex-col sm:flex-row gap-3 mb-6"
      >
        <div className="flex-1 relative">
          <input
            id="price-simulator-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search medicine brand e.g. Dolo 650, Glycomet 500"
            aria-label="Search medicine brand for price comparison"
            className="w-full min-h-[44px] px-4 py-2.5 text-base bg-ui-canvas/60 text-ui-text border border-ui-control-border rounded-lg placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue focus:border-ui-blue"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="min-h-[44px] px-6 py-2.5 bg-ui-blue hover:bg-ui-blue-hover disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              <span>Checking…</span>
            </>
          ) : (
            <>
              <Search size={16} aria-hidden="true" />
              <span>Compare Prices</span>
            </>
          )}
        </button>
      </form>

      {error && (
        <div role="alert" className="p-3 bg-[#FDF0EE] border border-[#F5B5AE] text-ui-danger text-xs font-semibold rounded-lg mb-4 flex items-center gap-2">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {data && !loading && (
        <>
          {data._development_fixture && (
            <p className="text-xs font-semibold text-ui-warning bg-[#FFF8E6] border border-[#F1D699] p-2.5 rounded-lg mb-4">
              Note: Offline development sample values shown.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-ui-border-decorative">
            <div className="p-4 bg-ui-canvas/60 border border-ui-border-decorative rounded-xl">
              <span className="text-xs font-medium text-ui-text-secondary block">Branded Retail</span>
              <span className="text-2xl font-serif font-bold text-ui-text mt-1 block">
                ₹{money(data.market_price)}
              </span>
              <span className="text-[11px] text-ui-text-secondary mt-0.5 block">MRP estimation</span>
            </div>

            <div className="p-4 bg-ui-canvas/60 border border-ui-border-decorative rounded-xl">
              <span className="text-xs font-medium text-ui-text-secondary block">NPPA Price Ceiling</span>
              <span className="text-2xl font-serif font-bold text-ui-text mt-1 block">
                {data.nppa_ceiling_price != null ? `₹${money(data.nppa_ceiling_price)}` : "—"}
              </span>
              <span className="text-[11px] text-ui-text-secondary mt-0.5 block">Official price control</span>
            </div>

            <div className="p-4 bg-[#EAF5EC] border border-[#BDDDC2] rounded-xl relative">
              <span className="text-xs font-semibold text-ui-success block">Jan Aushadhi Generic</span>
              <span className="text-2xl font-serif font-bold text-ui-success mt-1 block">
                ₹{money(data.jan_aushadhi_price)}
              </span>
              {data.max_savings_percent > 0 && (
                <span className="inline-block mt-1 text-[11px] font-bold bg-ui-success text-white px-2 py-0.5 rounded-full">
                  Save up to {data.max_savings_percent}%
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
