"use client";

import { useEffect, useRef, useState } from "react";
import { api, uploadReport, confirmReport } from "@/lib/api";
import { useReveal } from "@/lib/gsap";
import {
  Card,
  Stat,
  Pill,
  Loader,
  Note,
  Empty,
  Disclaimer,
  Offers,
  PriceVisual,
} from "@/components/ui";
import {
  Sunrise,
  Sun,
  Moon,
  AlertCircle,
  Pill as PillIcon,
  Clock,
  MessageSquare,
  Bell,
  BellOff,
  PhoneCall,
  Calendar,
  Search,
  BookOpen,
  ShieldAlert,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  RotateCcw,
  RefreshCw,
} from "lucide-react";

// Shared GET-with-loading/error helper. Re-fetches when `deps` change.
function useData(path, deps = []) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: "", data: null });
    api(path)
      .then((d) => alive && setState({ loading: false, error: "", data: d }))
      .catch((e) =>
        alive &&
        setState({
          loading: false,
          error: e.message || "Failed to load.",
          data: null,
        })
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return state;
}

const SLOTS = [
  { key: "morning", label: "Morning", Icon: Sunrise, color: "#d97706" },
  { key: "afternoon", label: "Afternoon", Icon: Sun, color: "#2563eb" },
  { key: "night", label: "Night", Icon: Moon, color: "#1e3a8a" },
  { key: "sos", label: "As needed (SOS)", Icon: AlertCircle, color: "#dc2626" },
];

const SEV = { major: "danger", moderate: "warn", minor: "brand" };

function medLine(m) {
  return `${m.salt || "Salt unconfirmed"}${m.strength ? ` · ${m.strength}` : ""}`;
}

function TimingPills({ m }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {m.prn ? (
        <Pill tone="accent">SOS · as needed</Pill>
      ) : (
        (m.timing || []).map((t) => (
          <Pill key={t} tone="brand">
            {t}
          </Pill>
        ))
      )}
      {m.dosage_notation && <Pill>{m.dosage_notation}</Pill>}
      {m.duration_days ? <Pill>{m.duration_days} days</Pill> : null}
    </div>
  );
}

function Slot({
  label,
  Icon,
  color,
  meds,
  onSendReminder,
  onSimulateReply,
  onStopMedicine,
  onToggleReminders,
  sendingId,
}) {
  if (!meds || !meds.length)
    return (
      <div className="slot empty">
        <Icon size={18} style={{ opacity: 0.6, marginBottom: 4 }} />
        <span>{label}</span>
      </div>
    );
  return (
    <div className="slot">
      <h4>
        <Icon size={16} color={color} /> {label}
      </h4>
      {meds.map((m, i) => (
        <div className="med" key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <strong>{m.brand}</strong>
              <small>
                {" "}
                · {m.salt || "—"}
                {m.strength ? ` ${m.strength}` : ""}
              </small>
              {!m.reminders_enabled && (
                <span className="pill tone-warn" style={{ fontSize: 10, padding: "1px 6px", marginLeft: 6 }}>
                  🔕 Paused
                </span>
              )}
            </div>
            {m.adherence_status === "taken" ? (
              <span className="pill tone-brand" style={{ fontSize: 11, padding: "2px 8px", whiteSpace: "nowrap" }}>
                ✓ Taken {m.adherence_time ? `(${m.adherence_time})` : ""}
              </span>
            ) : m.adherence_status === "missed" ? (
              <span className="pill tone-accent" style={{ fontSize: 11, padding: "2px 8px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", whiteSpace: "nowrap" }}>
                ✕ Missed
              </span>
            ) : (
              <span className="pill" style={{ fontSize: 11, padding: "2px 8px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", whiteSpace: "nowrap" }}>
                ⏳ Due Today
              </span>
            )}
          </div>
          {m.adherence_id && (
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6 }}
                disabled={sendingId === m.adherence_id || !m.reminders_enabled}
                onClick={() => onSendReminder(m.adherence_id)}
                title="Send interactive 2-button WhatsApp reminder to patient's phone"
              >
                🔔 {sendingId === m.adherence_id ? "Sending…" : "WhatsApp Nudge"}
              </button>
              {m.adherence_status !== "taken" && (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, padding: "2px 8px", color: "var(--brand-strong)", fontWeight: 600 }}
                  onClick={() => onSimulateReply(m.adherence_id, "taken")}
                  title="Simulate patient clicking 'Yes, Taken' on WhatsApp"
                >
                  ✓ Tap &apos;Yes, Taken&apos;
                </button>
              )}
              {m.adherence_status !== "missed" && (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, padding: "2px 8px", color: "#b91c1c", fontWeight: 600 }}
                  onClick={() => onSimulateReply(m.adherence_id, "missed")}
                  title="Simulate patient clicking 'Missed / Forgot' on WhatsApp"
                >
                  ✕ Tap &apos;Missed&apos;
                </button>
              )}
              <button
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, padding: "2px 6px", color: "#64748b" }}
                onClick={() => onToggleReminders(m.id)}
                title={m.reminders_enabled ? "Pause reminders for this medicine" : "Resume reminders"}
              >
                {m.reminders_enabled ? "🔕 Pause" : "🔔 Resume"}
              </button>
              <button
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, padding: "2px 6px", color: "#059669", fontWeight: 600 }}
                onClick={() => onStopMedicine(m.id, m.brand)}
                title="I'm feeling fit / recovered. Stop reminders completely for this medicine."
              >
                ✋ I&apos;m Fit / Stop
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Summary() {
  const [sendingId, setSendingId] = useState(null);
  const [testingScheduler, setTestingScheduler] = useState(false);
  const [adhVersion, setAdhVersion] = useState(0);
  const { loading, error, data } = useData("/summary", [adhVersion]);
  const scope = useReveal([loading, data]);

  const handleSendReminder = async (adherence_id) => {
    setSendingId(adherence_id);
    try {
      await api("/whatsapp/send-reminder", { method: "POST", json: { adherence_id } });
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to send WhatsApp reminder");
    } finally {
      setSendingId(null);
    }
  };

  const handleSimulateReply = async (adherence_id, action) => {
    try {
      await api("/whatsapp/simulate-reply", { method: "POST", json: { adherence_id, action } });
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to record adherence");
    }
  };

  const handleTogglePref = async (key, currentVal) => {
    try {
      await api("/reminders/preferences", { method: "POST", json: { [key]: !currentVal } });
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to update reminder settings");
    }
  };

  const handleToggleReminders = async (medId) => {
    try {
      await api(`/medicines/${medId}/toggle-reminders`, { method: "POST" });
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to toggle reminders");
    }
  };

  const handleStopMedicine = async (medId, brand) => {
    if (
      !confirm(
        `Are you feeling healthy and want to stop taking ${brand}?\n\nThis will halt all upcoming WhatsApp and call reminders for this medicine so you are not disturbed.`
      )
    )
      return;
    try {
      await api(`/medicines/${medId}/stop`, {
        method: "POST",
        json: { reason: "Patient feeling healthy / completed course" },
      });
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to stop medicine");
    }
  };

  const handleResumeMedicine = async (medId) => {
    try {
      await api(`/medicines/${medId}/resume`, { method: "POST" });
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to resume medicine");
    }
  };

  const handleTriggerScheduler = async () => {
    setTestingScheduler(true);
    try {
      const res = await api("/reminders/trigger-check", { method: "POST" });
      const sentCount = res.details?.whatsapp_dispatched?.length || 0;
      const callCount = res.details?.calls_queued?.length || 0;
      alert(
        `⚡ Automated Scheduler Check Complete!\n\n• Time (IST): ${res.details?.ist_time || "Now"}\n• WhatsApp Reminders Dispatched: ${sentCount}\n• Voice Call Reminders Queued: ${callCount}`
      );
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Scheduler trigger failed");
    } finally {
      setTestingScheduler(false);
    }
  };

  if (loading) return <Loader label="Loading your clinical overview…" />;
  if (error) return <Note tone="err">{error}</Note>;

  const t = data.tracking;
  const s = data.schedule;
  const p = data.patient;

  return (
    <div ref={scope} className="grid">
      <div className="grid cols-4">
        <Stat
          icon={<PillIcon size={20} />}
          label="Active medicines"
          value={t.active_medicines}
        />
        <Stat
          icon={<Clock size={20} />}
          label="Doses per day"
          value={t.doses_per_day}
        />
        <Stat
          icon={<MessageSquare size={20} />}
          label="WhatsApp nudges"
          value={t.whatsapp_reminders_sent}
        />
        <Stat
          icon={<CheckCircle2 size={20} />}
          label="Adherence Rate Today"
          value={t.adherence_rate_today_pct != null ? `${t.adherence_rate_today_pct}%` : "100%"}
        />
      </div>

      {/* Smart Auto-Reminder Control Panel */}
      <Card
        title="Automated Medication Reminders & Call Scheduler"
        sub="Control automatic WhatsApp nudges and Sahayak voice reminders so you only receive alerts when needed"
        actions={
          <button
            className="btn btn-sm btn-outline"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
            disabled={testingScheduler}
            onClick={handleTriggerScheduler}
          >
            <RefreshCw size={13} className={testingScheduler ? "animate-spin" : ""} />
            {testingScheduler ? "Checking…" : "Run Auto-Scheduler Now"}
          </button>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {/* WhatsApp Switch */}
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--line-light)",
              background: "var(--surface-2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "rgba(34, 197, 94, 0.12)",
                  color: "#16a34a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MessageSquare size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                  WhatsApp Auto-Reminders
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Interactive Yes/No dose alerts via Meta Cloud API
                </div>
              </div>
            </div>
            <button
              className={`btn btn-sm ${p.whatsapp_reminders_enabled ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: 12, minWidth: 80, fontWeight: 700 }}
              onClick={() => handleTogglePref("whatsapp_reminders_enabled", p.whatsapp_reminders_enabled)}
            >
              {p.whatsapp_reminders_enabled ? "🟢 Active" : "⏸️ Paused"}
            </button>
          </div>

          {/* Voice Call Switch */}
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--line-light)",
              background: "var(--surface-2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "rgba(37, 99, 235, 0.12)",
                  color: "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PhoneCall size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                  Voice Call Reminders
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Automated spoken calls from Sahayak Assistant
                </div>
              </div>
            </div>
            <button
              className={`btn btn-sm ${p.call_reminders_enabled ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: 12, minWidth: 80, fontWeight: 700 }}
              onClick={() => handleTogglePref("call_reminders_enabled", p.call_reminders_enabled)}
            >
              {p.call_reminders_enabled ? "🟢 Active" : "⏸️ Paused"}
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} />
            <span>
              Scheduled dose times: Morning ({p.reminder_time_morning}), Afternoon ({p.reminder_time_afternoon}), Night ({p.reminder_time_night})
            </span>
          </div>
          <div>
            <button
              className="btn btn-sm btn-ghost"
              style={{
                fontSize: 12,
                color: p.auto_reminders_enabled ? "#b91c1c" : "var(--brand-strong)",
                fontWeight: 600,
              }}
              onClick={() => handleTogglePref("auto_reminders_enabled", p.auto_reminders_enabled)}
            >
              {p.auto_reminders_enabled ? "Pause All Reminders" : "Resume All Reminders"}
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Daily Dose Schedule & WhatsApp Adherence"
        sub="Interactive WhatsApp reminders with instant 'Yes, Taken' / 'Missed' status tracking"
      >
        <div className="schedule">
          {SLOTS.map(({ key, label, Icon, color }) => (
            <Slot
              key={key}
              label={label}
              Icon={Icon}
              color={color}
              meds={s[key]}
              onSendReminder={handleSendReminder}
              onSimulateReply={handleSimulateReply}
              onStopMedicine={handleStopMedicine}
              onToggleReminders={handleToggleReminders}
              sendingId={sendingId}
            />
          ))}
        </div>
      </Card>

      {/* Completed & Stopped Prescriptions section */}
      {data.stopped_medicines && data.stopped_medicines.length > 0 && (
        <Card
          title="Completed & Stopped Prescriptions"
          sub="Medicines you finished or stopped taking because you felt healthy (Reminders inactive)"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.stopped_medicines.map((sm) => (
              <div
                key={sm.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-light)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>
                    {sm.brand}{" "}
                    <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                      ({sm.strength || sm.salt})
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#059669", marginTop: 2 }}>
                    ✓ {sm.stopped_reason} {sm.stopped_at ? `on ${sm.stopped_at}` : ""} · Reminders stopped
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}
                  onClick={() => handleResumeMedicine(sm.id)}
                >
                  <RotateCcw size={12} /> Resume Medicine
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid cols-2">
        <Card title="Conditions & Indications" sub="Informational, not a formal diagnosis">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.conditions.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-light)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.medicine}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.salt}</div>
                </div>
                <div style={{ textAlign: "right", maxWidth: 200 }}>
                  <Pill tone="brand">{c.used_for || "General Care"}</Pill>
                </div>
              </div>
            ))}
          </div>
          <Disclaimer>{data.conditions_disclaimer}</Disclaimer>
        </Card>

        <Card title="Next Doctor Review" sub="Earliest scheduled follow-up">
          {data.next_followup ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "20px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(30, 58, 138, 0.05))",
                border: "1px solid rgba(37, 99, 235, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Calendar size={22} color="#2563eb" />
                <span style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)" }}>
                  {data.next_followup.date}
                </span>
              </div>
              <div style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>
                Consultation with <strong>{data.next_followup.doctor}</strong>
              </div>
            </div>
          ) : (
            <Empty icon="📅">No upcoming doctor visits scheduled.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

function MedCard({ m, onStop, onToggle }) {
  const best = m.prices?.matched ? m.prices.offers[0] : null;
  return (
    <Card
      title={m.brand}
      sub={medLine(m)}
      actions={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {m.needs_salt_confirmation && <Pill tone="warn">confirm salt</Pill>}
          {m.reminders_enabled !== false ? (
            <Pill tone="brand">🔔 Reminders ON</Pill>
          ) : (
            <Pill tone="warn">🔕 Paused</Pill>
          )}
        </div>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <TimingPills m={m} />
      </div>
      <div className="small muted">Prescribed by {m.prescriber_name || "Doctor"}</div>
      {best && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(30, 58, 138, 0.06))",
            border: "1px solid rgba(37, 99, 235, 0.15)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Best price on {best.platform}</span>
          <span style={{ fontWeight: 800, color: "var(--brand-strong)", fontSize: 14 }}>
            ₹{Number(best.price).toFixed(2)}
          </span>
        </div>
      )}
      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px solid var(--line-light)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <button
          className="btn btn-sm btn-ghost"
          style={{ fontSize: 12, color: "#64748b" }}
          onClick={() => onToggle(m.id)}
        >
          {m.reminders_enabled !== false ? "🔕 Pause Reminders" : "🔔 Resume Reminders"}
        </button>
        <button
          className="btn btn-sm btn-outline"
          style={{ fontSize: 12, color: "#059669", borderColor: "rgba(5, 150, 105, 0.3)" }}
          onClick={() => onStop(m.id, m.brand)}
          title="Patient feeling healthy / completed course. Stops all upcoming reminders."
        >
          ✋ I&apos;m Fit / Stop Medicine
        </button>
      </div>
    </Card>
  );
}

export function Medicines() {
  const [version, setVersion] = useState(0);
  const { loading, error, data } = useData("/medicines", [version]);
  const scope = useReveal([loading, data]);

  const handleStop = async (id, brand) => {
    if (
      !confirm(
        `Are you feeling healthy and want to stop taking ${brand}?\n\nThis will halt all upcoming WhatsApp and call reminders for this medicine so you are not disturbed.`
      )
    )
      return;
    try {
      await api(`/medicines/${id}/stop`, {
        method: "POST",
        json: { reason: "Patient feeling healthy / completed course" },
      });
      setVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to stop medicine");
    }
  };

  const handleToggle = async (id) => {
    try {
      await api(`/medicines/${id}/toggle-reminders`, { method: "POST" });
      setVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to toggle reminders");
    }
  };

  if (loading) return <Loader label="Retrieving active prescription list…" />;
  if (error) return <Note tone="err">{error}</Note>;
  if (!data.length)
    return <Empty icon="💊">No active medicines found. Upload a prescription to get started.</Empty>;
  return (
    <div ref={scope} className="grid cols-2">
      {data.map((m) => (
        <MedCard key={m.id} m={m} onStop={handleStop} onToggle={handleToggle} />
      ))}
    </div>
  );
}

function FindingCard({ f }) {
  const sevClass = f.severity === "major" ? "danger" : f.severity === "moderate" ? "warn" : "brand";
  return (
    <div className={`finding-card ${sevClass}`} data-reveal>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill tone={SEV[f.severity] || "brand"} dot>
            {f.severity.toUpperCase()} RISK
          </Pill>
          {f.cross_doctor && <Pill tone="accent">Cross-Doctor Conflict</Pill>}
        </div>
        <AlertTriangle size={18} color={f.severity === "major" ? "#dc2626" : "#d97706"} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
        {f.medicines.map((mm, i) => (
          <span
            key={i}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 6,
              background: "rgba(15, 23, 42, 0.05)",
              color: "var(--ink)",
            }}
          >
            {mm.brand} ({mm.salt}) {mm.prescriber ? `· Dr. ${mm.prescriber}` : ""}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 14, color: "var(--ink-secondary)", lineHeight: 1.5 }}>
        {f.note}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
        Clinical reference: {f.source}
      </div>
    </div>
  );
}

export function Interactions() {
  const { loading, error, data } = useData("/interactions");
  const scope = useReveal([loading, data]);
  if (loading) return <Loader label="Scanning cross-doctor interactions…" />;
  if (error) return <Note tone="err">{error}</Note>;
  return (
    <div ref={scope} className="grid">
      <div className="grid cols-3">
        <Stat
          icon={<Search size={20} />}
          label="Drug pairs checked"
          value={data.checked_pairs}
        />
        <Stat
          icon={<BookOpen size={20} />}
          label="Verified interaction rules"
          value={data.known_interactions_in_db}
        />
        <Stat
          icon={<ShieldAlert size={20} />}
          label="Identified alerts"
          value={data.findings.length}
        />
      </div>

      {data.findings.length === 0 ? (
        <Card>
          <Empty icon="✅">No negative drug-drug interactions detected across your active medicines.</Empty>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.findings.map((f, i) => (
            <FindingCard key={i} f={f} />
          ))}
        </div>
      )}
      <Disclaimer>{data.disclaimer}</Disclaimer>
    </div>
  );
}

export function Prices() {
  const { loading, error, data } = useData("/medicines");
  const scope = useReveal([loading, data]);
  if (loading) return <Loader label="Querying partner pharmacy catalogues…" />;
  if (error) return <Note tone="err">{error}</Note>;
  if (!data.length) return <Empty icon="🏷️">Upload a prescription to compare medicine prices.</Empty>;
  return (
    <div ref={scope} className="grid cols-2">
      {data.map((m) => (
        <Card key={m.id} title={m.brand} sub={medLine(m)}>
          <Offers prices={m.prices} />
        </Card>
      ))}
    </div>
  );
}

export function Reports() {
  const [refresh, setRefresh] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const { loading, error, data } = useData("/reports", [refresh]);
  const scope = useReveal([loading, data]);

  const confirm = async (id) => {
    setBusyId(id);
    try {
      await confirmReport(id);
      setRefresh((x) => x + 1);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loader label="Loading archival records…" />;
  if (error) return <Note tone="err">{error}</Note>;
  if (!data.length) return <Empty icon="📄">No archived prescriptions found.</Empty>;

  return (
    <div ref={scope} className="grid">
      {data.map((r) => (
        <Card
          key={r.id}
          title={r.prescriber_name || "Doctor's Prescription"}
          sub={[
            r.prescriber_specialty,
            r.prescription_date || (r.created_at ? r.created_at.slice(0, 10) : null),
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={
            r.confirmed ? (
              <Pill tone="brand" dot>
                Validated
              </Pill>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                disabled={busyId === r.id}
                onClick={() => confirm(r.id)}
              >
                {busyId === r.id ? "Validating…" : "Confirm & Activate"}
              </button>
            )
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {r.medicines.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-light)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{m.brand}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{medLine(m)}</div>
                </div>
                <Pill tone="accent">{m.dosage_notation || (m.prn ? "SOS" : "Standard")}</Pill>
              </div>
            ))}
          </div>
          {r.follow_up_date && (
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={14} color="#2563eb" /> Review on <strong>{r.follow_up_date}</strong>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export function Upload({ goto }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState("");
  const [report, setReport] = useState(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const scope = useReveal([report]);

  const pick = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErr("Please upload a valid prescription image file (JPEG or PNG).");
      return;
    }
    setErr("");
    setReport(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const extract = async () => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      setReport(await uploadReport(file));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!report) return;
    setConfirming(true);
    try {
      await confirmReport(report.id);
      goto?.("reports");
    } catch (e) {
      setErr(e.message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div ref={scope} className="grid cols-2">
      <Card
        title="Upload Medical Prescription"
        sub="Supported formats: JPG, PNG · Ensure doctor's handwritten notes are legible"
      >
        <div
          className="upload-drop"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <div className="ic-cloud">
            <UploadCloud size={28} />
          </div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
            Drag and drop prescription image here
          </h3>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            or click to browse from your device
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />

        {preview && (
          <div
            style={{
              marginTop: 16,
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              border: "1px solid var(--line)",
              maxHeight: 280,
              display: "flex",
              justifyContent: "center",
              background: "#0f172a",
            }}
          >
            <img
              src={preview}
              alt="prescription preview"
              style={{ objectFit: "contain", maxHeight: 280, width: "100%" }}
            />
          </div>
        )}

        {err && (
          <div style={{ marginTop: 14 }}>
            <Note tone="err">{err}</Note>
          </div>
        )}

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 16 }}
          disabled={!file || busy}
          onClick={extract}
        >
          {busy ? (
            <span>Analyzing Prescription with Gemini Vision…</span>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Extract & Verify Medicines</span>
            </>
          )}
        </button>
      </Card>

      <Card
        title="AI Analysis & Pricing"
        sub="Extracted medicines and indicative market prices"
      >
        {!report ? (
          <Empty icon="🧾">
            Upload an image to trigger OCR extraction, structured dosages, and price checks.
          </Empty>
        ) : (
          <>
            {report.mock && (
              <Note tone="warn">
                Demonstration Mode — Active demo prescription extracted.
              </Note>
            )}

            <div style={{ marginTop: report.mock ? 14 : 6, display: "flex", flexDirection: "column", gap: 16 }}>
              {report.medicines.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "16px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                  }}
                  data-reveal
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>{m.brand}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{medLine(m)}</span>
                  </div>
                  <PriceVisual prices={m.prices} />
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 18 }}
              disabled={confirming}
              onClick={confirm}
            >
              {confirming ? "Saving to Medical Records…" : "Confirm & Save to Dashboard →"}
            </button>
            <Disclaimer>
              Aayogya extracts data to assist you; always adhere to your prescribing doctor&apos;s physical instructions.
            </Disclaimer>
          </>
        )}
      </Card>
    </div>
  );
}
