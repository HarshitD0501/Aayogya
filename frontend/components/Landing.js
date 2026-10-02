"use client";

import { useReveal } from "@/lib/gsap";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import GlowPill from "@/components/reactbits/GlowPill";
import { BrandMark } from "@/components/ui";
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
} from "lucide-react";

const FEATURES = [
  {
    Icon: ScanLine,
    title: "Prescription OCR",
    body: "Snap any prescription — printed or handwritten. We read the brand, salt, strength and dosage, then let you confirm before anything is saved.",
  },
  {
    Icon: ShieldAlert,
    title: "Cross-doctor safety check",
    body: "The one thing no single doctor sees: interactions across every prescription you hold. Checked on salts of your active medicines, never called “guaranteed safe”.",
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
    body: "Match by salt and strength across trusted Indian pharmacies, so you never overpay for the same medicine.",
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
    title: "Stay safe across doctors",
    body: "See interactions across all your active medicines, prices, reminders and your next visit — in one place.",
  },
];

export default function Landing({ onEnter }) {
  const scope = useReveal([]);

  return (
    <div className="lp" ref={scope}>
      {/* ---- Navbar ---- */}
      <nav className="lp-nav">
        <BrandMark />
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#safety">Safety</a>
          <a href="#how">How it works</a>
        </div>
        <div className="lp-nav-actions">
          <button className="btn btn-primary" onClick={onEnter}>
            <span>Login</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </nav>

      {/* ---- Hero ---- */}
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
            Aarogya reads your prescriptions, explains them in plain language, and
            flags dangerous interactions across every doctor you see &mdash; while
            leaving every clinical decision with your own doctor.
          </p>
          <div className="lp-hero-cta" data-reveal>
            <button className="btn btn-primary btn-lg" onClick={onEnter}>
              <span>Open your dashboard</span>
              <ArrowRight size={18} />
            </button>
            <a className="btn btn-outline btn-lg" href="#how">
              See how it works
            </a>
          </div>
          <div className="lp-hero-stats" data-reveal>
            <div className="lp-hero-feat">
              <span className="lp-hero-feat-ic"><Tag size={18} /></span>
              <span className="lp-hero-feat-lbl">Price comparison</span>
            </div>
            <div className="lp-hero-feat">
              <span className="lp-hero-feat-ic"><MessageCircleHeart size={18} /></span>
              <span className="lp-hero-feat-lbl">WhatsApp follow-ups</span>
            </div>
            <div className="lp-hero-feat">
              <span className="lp-hero-feat-ic"><PhoneCall size={18} /></span>
              <span className="lp-hero-feat-lbl">Call reminders</span>
            </div>
          </div>
        </div>

        {/* Product preview: mirrors the real extraction output */}
        <div className="lp-hero-preview" data-reveal>
          <div className="lp-pv-card">
            <div className="lp-pv-head">
              <span className="lp-pv-dot" />
              <span className="lp-pv-dot" />
              <span className="lp-pv-dot" />
              <span className="lp-pv-title">
                <FileCheck2 size={14} /> Prescription read
              </span>
            </div>
            <div className="lp-pv-body">
              {[
                { brand: "Glycomet 500", salt: "Metformin · 500 mg", dose: "1-0-1", conf: 96 },
                { brand: "Amlong 5", salt: "Amlodipine · 5 mg", dose: "1-0-0", conf: 92 },
                { brand: "Ecosprin 75", salt: "Aspirin · 75 mg", dose: "0-0-1", conf: 88 },
              ].map((m) => (
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
          </div>
        </div>
      </header>

      {/* ---- Features ---- */}
      <section className="lp-section" id="features">
        <div className="lp-section-head" data-reveal>
          <GlowPill tone="blue">What you get</GlowPill>
          <h2 className="lp-h2">
            Everything your prescriptions need,{" "}
            <span className="lp-muted-txt">under one roof.</span>
          </h2>
          <p className="lp-section-sub">
            From reading a script to keeping you safe across doctors &mdash; the
            navigation and adherence tools a stack of paper can&rsquo;t give you.
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

      {/* ---- Safety / positioning ---- */}
      <section className="lp-section lp-safety" id="safety">
        <div className="lp-safety-grid">
          <div data-reveal>
            <GlowPill tone="green">Built to be trusted</GlowPill>
            <h2 className="lp-h2">
              A navigator, <span className="lp-muted-txt">not a doctor.</span>
            </h2>
            <p className="lp-section-sub">
              Aarogya never diagnoses, never prescribes, and never changes a dose.
              It explains what your prescription says and defers every clinical
              call to a registered medical practitioner.
            </p>
          </div>
          <div className="lp-safety-cards">
            <div className="lp-trust" data-reveal>
              <span className="lp-trust-ic"><Stethoscope size={18} /></span>
              <div>
                <strong>Defers to your doctor</strong>
                <span>Every clinical-adjacent answer ends with &ldquo;confirm with your doctor.&rdquo;</span>
              </div>
            </div>
            <div className="lp-trust" data-reveal>
              <span className="lp-trust-ic"><Lock size={18} /></span>
              <div>
                <strong>Your data, isolated</strong>
                <span>Every record is scoped to you alone &mdash; a hard security boundary, not a setting.</span>
              </div>
            </div>
            <div className="lp-trust" data-reveal>
              <span className="lp-trust-ic"><CheckCircle2 size={18} /></span>
              <div>
                <strong>You confirm everything</strong>
                <span>Nothing is scheduled or flagged until you review what we read.</span>
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

      {/* ---- CTA band ---- */}
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
          <p>Sign in and see your medicines the way your doctors never could &mdash; together.</p>
          <button className="btn btn-lg lp-cta-btn" onClick={onEnter}>
            <span>Login to your dashboard</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="lp-footer">
        <div className="lp-footer-top">
          <BrandMark />
          <div className="lp-footer-links">
            <a href="#features">Features</a>
            <a href="#safety">Safety</a>
            <a href="#how">How it works</a>
            <button className="lp-linkbtn" onClick={onEnter}>Login</button>
          </div>
        </div>
        <p className="lp-footer-note">
          &copy; 2026 Aarogya. Not a substitute for professional medical advice.
          Always consult your doctor. In an emergency, call 108.
        </p>
      </footer>
    </div>
  );
}
