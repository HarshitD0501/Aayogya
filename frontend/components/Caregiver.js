"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Note, Loader } from "@/components/ui";
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
  loading: () => <Loader label="Connecting to Sahayak Voice Assistant…" />,
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
  Menu,
  X,
  RefreshCw,
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

function FamilyGrid({ caregiver, cards, loading, err, onOpenPatient, onRetry }) {
  if (err) return <div className="cg-error"><Note tone="err">{err}</Note><button type="button" className="cg-retry" onClick={onRetry}><RefreshCw size={16} /> Try again</button></div>;
  if (loading || !cards) return <Loader label="Loading your family…" />;

  const medicines = cards.reduce((total, patient) => total + (patient.active_medicines || 0), 0);
  const visits = cards.filter((patient) => patient.next_followup).length;

  return (
    <div className="cg-family">
      <div className="cg-family-head">
        <div>
          <span className="cg-eyebrow">Family care</span>
          <h2>Good to see you, {caregiver.name?.split(" ")[0] || "caregiver"}</h2>
          <p className="cg-sub">
            {cards.length > 0
              ? "Choose a family member to review their medicines, schedule and records."
              : "Welcome to your family caregiving hub. Link family members to begin monitoring their prescriptions."}
          </p>
        </div>
      </div>

      {cards.length > 0 && <div className="cg-overview-stats" aria-label="Family summary">
        <div><strong>{cards.length}</strong><span>Linked family members</span></div>
        <div><strong>{medicines}</strong><span>Active medicines</span></div>
        <div><strong>{visits}</strong><span>Upcoming visits</span></div>
      </div>}

      {cards.length === 0 ? (
        <div className="cg-empty">
          <Users size={32} aria-hidden="true" />
          <h3>No family members linked yet</h3>
          <p>Ask a patient to link your registered contact, <strong>{caregiver.phone || caregiver.email}</strong>. Their information will appear here once access is granted.</p>
        </div>
      ) : (
        <div className="cg-cards">
          {cards.map((p) => {
            const fu = p.next_followup;
            const tone = fu ? dueTone(fu.days_until) : "muted";
            const adherPct = p.doses_today ? Math.round((p.taken_today / p.doses_today) * 100) : null;
            return (
              <button key={p.id} type="button" className="cg-card" onClick={() => onOpenPatient(p.id)} aria-label={`Open ${p.name}'s health profile`}>
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
      const result = await updatePatientContact(patientCard.id, phone);
      setPhone(result.phone);
      setSaveMsg("Contact number saved. Calls and WhatsApp now use this number.");
      onContactSaved(patientCard.id, result.phone);
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
        <Phone size={15} aria-hidden="true" />
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
          className="cg-action-button cg-action-primary"
          href={patientCard.phone ? `tel:${patientCard.phone}` : undefined}
          aria-disabled={!patientCard.phone}
          tabIndex={patientCard.phone ? undefined : -1}
          key={patientCard.phone}
        >
          <Phone size={15} />
          <span>Call {patientCard.name?.split(" ")[0]}</span>
        </a>

        <a
          className="cg-action-button cg-action-secondary"
          href={patientCard.phone ? whatsappLink(patientCard.phone, waText) : undefined}
          aria-disabled={!patientCard.phone}
          tabIndex={patientCard.phone ? undefined : -1}
          target="_blank"
          rel="noopener noreferrer"
          key={`wa-${patientCard.phone}`}
        >
          <MessageCircle size={15} />
          <span>WhatsApp reminder</span>
        </a>

        {fu?.report_id && (
          <button
            className="cg-action-button cg-action-secondary"
            onClick={placeAiCall}
            disabled={busy === "call" || !patientCard.phone}
          >
            {busy === "call" ? <Loader2 size={15} className="spin" /> : <BotIcon size={15} />}
            <span>{busy === "call" ? "Calling…" : "Let Sahayak call"}</span>
          </button>
        )}
      </div>

      <div className="cg-contact">
        <label htmlFor="cg-phone">Patient contact number</label>
        <p className="cg-contact-help">This also updates the patient’s registered phone number.</p>
        <div className="cg-contact-row">
          <input
            id="cg-phone"
            className="cg-phone-input"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
          <button type="button" className="cg-save-button" onClick={saveContact} disabled={busy === "save" || !phone.trim()}>
            {busy === "save" ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />}
            <span>Save</span>
          </button>
        </div>
        {!patientCard.phone && <p className="cg-msg">Save a contact number to enable phone and WhatsApp reminders.</p>}
        {saveMsg && <div className="cg-msg" role="status">{saveMsg}</div>}
        {callMsg && <div className="cg-msg" role="status">{callMsg}</div>}
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
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
        <button type="button" className="cg-back" onClick={onBack}>
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
              type="button"
              className={`cg-tab ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeButton = drawerRef.current?.querySelector("button");
    closeButton?.focus();
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const onDesktop = (event) => { if (event.matches) setMobileDrawerOpen(false); };
    desktopQuery.addEventListener("change", onDesktop);
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
      if (event.key !== "Tab") return;
      const controls = [...(drawerRef.current?.querySelectorAll("button, a[href]") || [])].filter((control) => !control.disabled);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", onKeyDown); desktopQuery.removeEventListener("change", onDesktop); };
  }, [mobileDrawerOpen]);

  // Single fetch point for the family cards.
  useEffect(() => {
    let alive = true;
    setGridErr("");
    getFamilyOverview()
      .then((d) => {
        if (!alive) return;
        const pts = d.patients || [];
        setCards(pts);

        // Restore only patients confirmed by the caregiver's current links.
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const requested = params.get("patient") || getActivePatientId();
          if (requested && pts.some((p) => p.id === requested)) {
            setActivePatientId(requested);
            setOpenId(requested);
          } else if (requested) {
            setActivePatientId(null);
            setOpenId(null);
            if (params.has("patient")) {
              const url = new URL(window.location.href);
              url.searchParams.delete("patient");
              window.history.replaceState({}, "", url.toString());
            }
          }
        }
      })
      .catch((e) => alive && setGridErr(e.message));
    return () => {
      alive = false;
    };
  }, [version]);

  const handleOpen = (pid) => {
    if (!cards?.some((card) => card.id === pid)) return;
    setActivePatientId(pid);
    setOpenId(pid);
    if (mobileDrawerOpen) menuButtonRef.current?.focus();
    setMobileDrawerOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("patient", pid);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleBack = () => {
    setActivePatientId(null);
    setOpenId(null);
    if (mobileDrawerOpen) menuButtonRef.current?.focus();
    setMobileDrawerOpen(false);
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
  const selectedPatient = cardFor();
  const closeDrawer = () => {
    setMobileDrawerOpen(false);
    menuButtonRef.current?.focus();
  };

  const familyNav = (mobile = false) => (
    <>
      <button
        type="button"
        className={`cg-nav-item ${!openId ? "active" : ""}`}
        aria-current={!openId ? "page" : undefined}
        onClick={handleBack}
      >
        <Users size={17} aria-hidden="true" />
        <span>Family overview</span>
      </button>
      {(cards || []).map((patient) => (
        <button
          key={patient.id}
          type="button"
          className={`cg-nav-item ${openId === patient.id ? "active" : ""}`}
          aria-current={openId === patient.id ? "page" : undefined}
          onClick={() => handleOpen(patient.id)}
        >
          <span className="cg-nav-initials" aria-hidden="true">{initialsOf(patient.name)}</span>
          <span className="cg-nav-label">{patient.name}<small>{patient.relation}</small></span>
        </button>
      ))}
      {mobile && !cards && <span className="cg-nav-loading">Loading family…</span>}
    </>
  );

  return (
    <div className="workspace-v2 caregiver-workspace">
      <aside className="cg-sidebar" aria-label="Caregiver workspace">
        <div className="cg-sidebar-brand">
          <Link href="/" aria-label="Ayogya home"><img src="/aayogya-logo.png" alt="" /></Link>
          <span>Caregiver</span>
        </div>
        {onGoHome && (
          <button type="button" className="cg-home-link" onClick={onGoHome}>
            <Home size={16} aria-hidden="true" /> Return to home
          </button>
        )}
        <nav className="cg-sidebar-nav" aria-label="Family members">
          <span className="cg-nav-heading">Your family</span>
          {familyNav()}
        </nav>
        <div className="cg-sidebar-account">
          <div className="cg-account-row">
            <span className="cg-account-avatar">{initialsOf(caregiver.name)}</span>
            <span><strong>{caregiver.name}</strong><small>{caregiver.email || caregiver.phone}</small></span>
          </div>
          <button type="button" onClick={onLogout}><LogOut size={15} aria-hidden="true" /> Sign out</button>
        </div>
      </aside>

      <div className="cg-mobile-bar">
        <Link href="/" aria-label="Ayogya home"><img src="/aayogya-logo.png" alt="" /></Link>
        <span>{selectedPatient?.name || "Family overview"}</span>
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open family navigation"
          aria-controls="caregiver-mobile-menu"
          aria-expanded={mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen(true)}
        ><Menu size={21} aria-hidden="true" /></button>
      </div>
      {mobileDrawerOpen && (
        <div className="cg-drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
          <div id="caregiver-mobile-menu" ref={drawerRef} role="dialog" aria-modal="true" aria-label="Family navigation" className="cg-drawer">
            <div className="cg-drawer-head">
              <strong>Family navigation</strong>
              <button type="button" onClick={closeDrawer} aria-label="Close navigation"><X size={20} /></button>
            </div>
            <div className="cg-drawer-account">
              <span className="cg-account-avatar">{initialsOf(caregiver.name)}</span>
              <span><strong>{caregiver.name}</strong><small>{caregiver.email || caregiver.phone}</small></span>
            </div>
            <nav aria-label="Family members">{familyNav(true)}</nav>
            <div className="cg-drawer-actions">
              {onGoHome && <button type="button" onClick={() => { closeDrawer(); onGoHome(); }}><Home size={16} /> Return to home</button>}
              <button type="button" onClick={() => { closeDrawer(); onLogout(); }}><LogOut size={16} /> Sign out</button>
            </div>
          </div>
        </div>
      )}

      <main className="cg-main" id="main-content">
        <header className="cg-page-header">
          <div>
            <span className="cg-eyebrow">{selectedPatient ? "Family member" : "Caregiver workspace"}</span>
            <h1>{selectedPatient?.name || "Your family"}</h1>
            <p>{selectedPatient ? `Review ${selectedPatient.relation || "your family member"}'s medicines, schedule and records.` : "Medicines, doses and visits for the people linked to your account."}</p>
          </div>
          <span className="cg-role-pill"><Heart size={14} aria-hidden="true" /> Caregiver</span>
        </header>
        <div className="cg-content">
          {selectedPatient ? (
            <PatientDetail key={selectedPatient.id} patientCard={selectedPatient} onBack={handleBack} onContactSaved={handleContactSaved} />
          ) : (
            <FamilyGrid caregiver={caregiver} cards={cards} loading={!gridErr && !cards} err={gridErr} onRetry={() => setVersion((value) => value + 1)} onOpenPatient={handleOpen} />
          )}
        </div>
      </main>
    </div>
  );
}
