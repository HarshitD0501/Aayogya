"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { BrandMark, Pill, Note, Loader } from "@/components/ui";
import ShinyText from "@/components/reactbits/ShinyText";
import {
  Summary,
  Upload,
  Medicines,
  Interactions,
  Prices,
  Reports,
} from "@/components/sections";
import dynamic from "next/dynamic";

const Assistant = dynamic(() => import("@/components/Assistant"), {
  ssr: false,
  loading: () => <Loader text="Connecting to Sahayak Voice Assistant…" />,
});
import {
  getFamilyOverview,
  updatePatientContact,
  dispatchAiCall,
  whatsappLink,
  api,
  setActivePatientId,
  getActivePatientId,
} from "@/lib/api";
import { fetchWithResourceCache } from "@/lib/resourceCache";
import {
  Activity,
  UploadCloud,
  Pill as PillIcon,
  ShieldAlert,
  Tag,
  FileText,
  LogOut,
  Bot,
  Home,
  Users,
  Phone,
  MessageCircle,
  Calendar,
  ArrowLeft,
  CheckCircle2,
  Bot as BotIcon,
  Loader2,
  AlertCircle,
  Heart,
  Compass,
} from "lucide-react";
import Link from "next/link";

// Patient-detail nav reuses the existing sections unchanged — they already
// scope to X-Patient-Id through lib/api.js.
const SECTIONS = [
  { key: "summary", label: "Overview", Icon: Activity, Comp: Summary },
  { key: "assistant", label: "Ask Sahayak", Icon: Bot, Comp: Assistant },
  { key: "upload", label: "Upload Script", Icon: UploadCloud, Comp: Upload },
  { key: "medicines", label: "Medicines", Icon: PillIcon, Comp: Medicines },
  { key: "interactions", label: "Safety Check", Icon: ShieldAlert, Comp: Interactions },
  { key: "prices", label: "Prices", Icon: Tag, Comp: Prices },
  { key: "reports", label: "Records", Icon: FileText, Comp: Reports },
];

function initialsOf(name) {
  return (name || "P")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function dueTone(days) {
  if (days == null) return "muted";
  if (days <= 3) return "danger";
  if (days <= 7) return "warn";
  return "ok";
}

// --- Family card grid -------------------------------------------------------

function FamilyGrid({ caregiver, cards, loading, err, onOpenPatient }) {
  const cardsRef = useRef(null);

  useEffect(() => {
    if (!cards?.length || !cardsRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardsRef.current.children,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power2.out" }
      );
    }, cardsRef);
    return () => ctx.revert();
  }, [cards]);

  if (err) return <Note tone="err">{err}</Note>;
  if (loading || !cards) return <Loader label="Loading your family…" />;

  return (
    <div className="cg-family">
      <div className="cg-family-head">
        <div>
          <ShinyText
            text={`Namaste, ${caregiver.name?.split(" ")[0]}`}
            speed={5}
            gradient="linear-gradient(135deg, #111827 0%, #9a6b26 60%, #b07f14 100%)"
          />
          <p className="cg-sub">
            {cards.length > 0
              ? `You manage ${cards.length} family member${cards.length === 1 ? "" : "s"}. Tap a card to open their full health profile.`
              : "Welcome to your family caregiving hub. Link family members to begin monitoring their prescriptions."}
          </p>
        </div>
      </div>

      {cards.length === 0 ? (
        <div
          className="cg-empty"
          style={{
            padding: "36px 24px",
            background: "#ffffff",
            borderRadius: 12,
            border: "2px dashed #9a6b26",
            textAlign: "center",
            marginTop: 20,
          }}
        >
          <Users size={36} color="#9a6b26" style={{ margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px", color: "#111827" }}>
            No Family Members Linked Yet
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "#6b7280",
              maxWidth: 480,
              margin: "0 auto 16px",
              lineHeight: 1.5,
            }}
          >
            You are registered as a Caregiver. Once a patient links you with your registered contact (
            <strong style={{ color: "#111827" }}>{caregiver.phone || caregiver.email}</strong>
            ), their active medicines, upcoming doctor appointments, and daily dose schedules will appear here.
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "rgba(154, 107, 38, 0.08)",
              borderRadius: 6,
              fontSize: 13,
              color: "#9a6b26",
              fontWeight: 600,
            }}
          >
            <Heart size={14} />
            <span>Ready for patient linking</span>
          </div>
        </div>
      ) : (
        <div className="cg-cards" ref={cardsRef}>
          {cards.map((p) => {
            const fu = p.next_followup;
            const tone = fu ? dueTone(fu.days_until) : "muted";
            const adherPct = p.doses_today ? Math.round((p.taken_today / p.doses_today) * 100) : null;
            return (
              <button key={p.id} className="cg-card" onClick={() => onOpenPatient(p.id)}>
                <div className="cg-card-top">
                  <div className="cg-avatar">{initialsOf(p.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="cg-name">{p.name}</div>
                    <div className="cg-relation">
                      {p.relation} · {p.plan === "pro" ? "Pro" : "Free"}
                    </div>
                  </div>
                </div>

                <div className="cg-stats">
                  <span>
                    <PillIcon size={13} /> {p.active_medicines} medicines
                  </span>
                  <span>
                    <Calendar size={13} />
                    {fu ? `${fu.days_until}d to doctor` : "No visit set"}
                  </span>
                </div>

                {adherPct != null && (
                  <div className="cg-adher">
                    <div className="cg-adher-bar">
                      <div className="cg-adher-fill" style={{ width: `${adherPct}%` }} />
                    </div>
                    <span>
                      {p.taken_today}/{p.doses_today} doses taken today
                    </span>
                  </div>
                )}

                {fu && fu.days_until != null && fu.days_until <= 3 && (
                  <div className={`cg-alert ${tone === "danger" ? "danger" : "warn"}`}>
                    <AlertCircle size={14} />
                    <span>
                      {fu.doctor ? `Dr. ${fu.doctor.replace(/^Dr\.?\s*/i, "")}` : "Doctor"} visit in{" "}
                      {fu.days_until === 0 ? "today" : `${fu.days_until} day${fu.days_until === 1 ? "" : "s"}`} — remind them?
                    </span>
                  </div>
                )}
                {fu?.follow_up_status === "reschedule_requested" && (
                  <div className="cg-alert warn">
                    <Calendar size={14} />
                    <span>Reschedule requested: {fu.reschedule_preferred_date}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Action panel (per selected patient) ------------------------------------

function ActionPanel({ patientCard, medsList, onContactSaved }) {
  const [phone, setPhone] = useState(patientCard?.phone || "");
  const [saveMsg, setSaveMsg] = useState("");
  const [callMsg, setCallMsg] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setPhone(patientCard?.phone || "");
    setSaveMsg("");
    setCallMsg("");
  }, [patientCard?.id, patientCard?.phone]);

  if (!patientCard) return null;
  const fu = patientCard.next_followup;

  const saveContact = async () => {
    setBusy("save");
    setSaveMsg("");
    try {
      await updatePatientContact(patientCard.id, phone);
      setSaveMsg("Saved — call & WhatsApp buttons now use this number.");
      onContactSaved(patientCard.id, phone);
    } catch (e) {
      setSaveMsg(e.message);
    } finally {
      setBusy("");
    }
  };

  const waText = [
    `Namaste ${patientCard.name?.split(" ")[0]}! 🔔`,
    "Aapki dawaiyan (from Ayogya):",
    ...(medsList && medsList.length
      ? medsList.map((m) => `• ${m.brand} ${m.strength || ""} (${m.dosage_notation || "as advised"})`)
      : ["• Apni dawaiyan samay par lein"]),
    "Kripya samay par le lein. — sent via Ayogya Caregiver",
  ].join("\n");

  const placeAiCall = async () => {
    setBusy("call");
    setCallMsg("");
    try {
      const res = await dispatchAiCall(fu?.report_id, true);
      setCallMsg(
        res.mode === "simulated"
          ? "AI call logged in simulation mode (no Twilio/LiveKit keys) — the full telephony flow ran."
          : `AI call dispatched to ${res.patient_phone}. Room: ${res.room_name}`
      );
    } catch (e) {
      setCallMsg(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="cg-actions">
      <div className="cg-actions-title">
        <Phone size={15} color="#9a6b26" />
        <span>Reach {patientCard.name?.split(" ")[0]}</span>
      </div>

      {fu && (
        <div className={`cg-countdown ${dueTone(fu.days_until)}`}>
          <Calendar size={15} />
          <span>
            {fu.doctor ? `${fu.doctor} — ` : ""}
            {fu.days_until === 0
              ? "visit is TODAY"
              : fu.days_until === 1
              ? "visit is TOMORROW"
              : `visit in ${fu.days_until} days`}
            {fu.days_until != null && fu.days_until <= 3 ? " — time to remind!" : ""}
          </span>
        </div>
      )}

      <div className="cg-action-btns">
        <a
          className="btn btn-primary cg-btn"
          href={`tel:${patientCard.phone || ""}`}
          key={patientCard.phone}
        >
          <Phone size={15} />
          <span>Call {patientCard.name?.split(" ")[0]}</span>
        </a>

        <a
          className="btn cg-btn cg-btn-wa"
          href={whatsappLink(patientCard.phone, waText)}
          target="_blank"
          rel="noopener noreferrer"
          key={`wa-${patientCard.phone}`}
        >
          <MessageCircle size={15} />
          <span>WhatsApp reminder</span>
        </a>

        {fu?.report_id && (
          <button
            className="btn cg-btn cg-btn-ai"
            onClick={placeAiCall}
            disabled={busy === "call"}
          >
            {busy === "call" ? <Loader2 size={15} className="spin" /> : <BotIcon size={15} />}
            <span>{busy === "call" ? "Calling…" : "Let Sahayak call"}</span>
          </button>
        )}
      </div>

      <div className="cg-contact">
        <label htmlFor="cg-phone">Number Sahayak should call</label>
        <div className="cg-contact-row">
          <input
            id="cg-phone"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
          <button className="btn btn-sm" onClick={saveContact} disabled={busy === "save"}>
            {busy === "save" ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />}
            <span>Save</span>
          </button>
        </div>
        {saveMsg && <div className="cg-msg">{saveMsg}</div>}
        {callMsg && <div className="cg-msg">{callMsg}</div>}
      </div>
    </div>
  );
}

// --- Patient detail (sections + action panel) -------------------------------

function PatientDetail({ patientCard, onBack, onContactSaved }) {
  const [active, setActive] = useState("summary");
  const [sectionVersion, setSectionVersion] = useState(0);
  const [medsList, setMedsList] = useState(null);
  const mainRef = useRef(null);
  const current = SECTIONS.find((s) => s.key === active) || SECTIONS[0];
  const Comp = current.Comp;

  // Med list for the WhatsApp prefilled text (and for the Medicines tab reuse).
  // Fix F09: Use ?include_prices=false to avoid expensive price provider lookup on text prefetch
  useEffect(() => {
    let alive = true;
    setMedsList(null);
    fetchWithResourceCache(
      "/medicines?include_prices=false",
      () => api("/medicines?include_prices=false")
    )
      .then((meds) => alive && setMedsList(meds))
      .catch(() => {}); // offline: WhatsApp text falls back to a generic nudge
    return () => {
      alive = false;
    };
  }, [patientCard.id]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    }, el);
    return () => ctx.revert();
  }, [active]);

  // Adherence polls so a WhatsApp "Taken" tap reflects here within seconds.
  useEffect(() => {
    const t = setInterval(() => setSectionVersion((v) => v + 1), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="cg-detail">
      <div className="cg-detail-top">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} />
          <span>Family</span>
        </button>
        <div className="cg-detail-title">
          {patientCard.name}
          <span className="cg-detail-sub">
            {patientCard.relation} · {patientCard.active_medicines} medicines
            {patientCard.next_followup ? ` · ${patientCard.next_followup.days_until}d to doctor` : ""}
          </span>
        </div>
      </div>

      <ActionPanel
        patientCard={patientCard}
        medsList={medsList}
        onContactSaved={onContactSaved}
      />

      <div className="cg-section-tabs">
        {SECTIONS.map((s) => {
          const Icon = s.Icon;
          const isActive = s.key === active;
          return (
            <button
              key={s.key}
              className={`cg-tab ${isActive ? "active" : ""}`}
              onClick={() => setActive(s.key)}
            >
              <Icon size={14} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Fix F07 & F08: Key by actor/patient identity and active tab only. Never include sectionVersion in key to prevent destroying active chat/forms/voice */}
      <div ref={mainRef} key={`${patientCard.id}-${active}`}>
        <Comp patient={patientCard} goto={setActive} pollVersion={sectionVersion} />
      </div>
    </div>
  );
}

// --- Shell -------------------------------------------------------------------

export default function Caregiver({ caregiver, onLogout, onGoHome }) {
  const [openId, setOpenId] = useState(null);
  const [cards, setCards] = useState(null);
  const [gridErr, setGridErr] = useState("");
  const [version, setVersion] = useState(0); // bump to refetch the overview

  // Single fetch point for the family cards.
  useEffect(() => {
    let alive = true;
    getFamilyOverview()
      .then((d) => {
        if (!alive) return;
        const pts = d.patients || [];
        setCards(pts);

        // Check if URL has ?patient= param that matches an authorized linked patient
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const urlPid = params.get("patient");
          if (urlPid && pts.some((p) => p.id === urlPid)) {
            setActivePatientId(urlPid);
            setOpenId(urlPid);
          }
        }
      })
      .catch((e) => alive && setGridErr(e.message));
    return () => {
      alive = false;
    };
  }, [version]);

  // Restore last-open patient, if any (per-viewer convenience).
  useEffect(() => {
    const stored = getActivePatientId();
    if (stored) setOpenId(stored);
  }, []);

  const handleOpen = (pid) => {
    setActivePatientId(pid);
    setOpenId(pid);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("patient", pid);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleBack = () => {
    setActivePatientId(null);
    setOpenId(null);
    setVersion((v) => v + 1); // refresh cards when returning to the grid
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("patient");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleContactSaved = (pid, phone) => {
    setCards((cs) =>
      cs ? cs.map((c) => (c.id === pid ? { ...c, phone } : c)) : cs
    );
  };

  const cardFor = () => cards?.find((c) => c.id === openId) || null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <BrandMark />

        {onGoHome && (
          <button className="home-link" onClick={onGoHome} title="Back to landing page">
            <Home size={14} />
            <span>Home</span>
          </button>
        )}

        <div className="nav-group">
          <div className="nav-group-label">Family</div>
          <button
            className={`nav-item ${openId === null ? "active" : ""}`}
            onClick={handleBack}
          >
            <span className="ic">
              <Users size={18} strokeWidth={openId === null ? 2.5 : 2} />
            </span>
            <span>Family Overview</span>
          </button>
          {(cards || []).map((p) => (
            <button
              key={p.id}
              className={`nav-item ${openId === p.id ? "active" : ""}`}
              onClick={() => handleOpen(p.id)}
            >
              <span className="ic">
                <Heart size={18} strokeWidth={openId === p.id ? 2.5 : 2} />
              </span>
              <span>{p.name?.split(" ")[0]} ({p.relation})</span>
            </button>
          ))}
        </div>

        <div className="nav-spacer" />

        <div className="who-card">
          <div className="who-row">
            <div className="who-avatar">{initialsOf(caregiver.name)}</div>
            <div className="who-meta">
              <div className="nm">{caregiver.name}</div>
              <div className="em">{caregiver.email || caregiver.phone}</div>
            </div>
          </div>
          <div className="who-actions">
            <span className="plan-badge free">Caregiver</span>
            <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Sign out">
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <div className="topbar-eyebrow" style={{ color: "#9a6b26" }}>
              <Users size={13} />
              <span>{openId ? "Patient Detail" : "Family Overview"}</span>
            </div>
            <h1>{openId ? cardFor()?.name || "Family member" : "Your Family"}</h1>
            <p>
              {openId
                ? `Viewing ${cardFor()?.relation || "family member"}’s medicines, schedule and reminders.`
                : "Everyone you care for, side by side — medicines, adherence and next visits."}
            </p>
          </div>
          <div className="topbar-side">
            <span className="live-chip">
              <Heart size={14} className="live-pulse" />
              Linked
            </span>
          </div>
        </header>
        {openId && cardFor() ? (
          <PatientDetail
            patientCard={cardFor()}
            onBack={handleBack}
            onContactSaved={handleContactSaved}
          />
        ) : (
          <FamilyGrid
            caregiver={caregiver}
            cards={cards}
            loading={!gridErr && !cards}
            err={gridErr}
            onOpenPatient={handleOpen}
          />
        )}
      </main>
    </div>
  );
}
