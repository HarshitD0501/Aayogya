"use client";

import { useEffect, useRef, useState } from "react";
import { api, uploadReport, confirmReport } from "@/lib/api";
import { fetchWithResourceCache } from "@/lib/resourceCache";
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
  Sunset,
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

// Shared GET-with-loading/error helper with deduplication & scoped caching. Re-fetches when `deps` change.
function useData(path, deps = []) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    fetchWithResourceCache(path, () => api(path))
      .then((d) => {
        if (alive) setState({ loading: false, error: "", data: d });
      })
      .catch((e) => {
        if (alive) {
          if (e?.name === "AbortError") return;
          setState({
            loading: false,
            error: e.message || "Failed to load.",
            data: null,
          });
        }
      });

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
  { key: "evening", label: "Evening", Icon: Sunset, color: "#ea580c" },
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
        <span className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
          SOS · as needed
        </span>
      ) : (
        (m.timing || []).map((t) => (
          <span key={t} className="text-[11px] font-semibold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-2.5 py-0.5 rounded-full">
            {t}
          </span>
        ))
      )}
      {m.dosage_notation && (
        <span className="text-[11px] font-semibold text-ui-text bg-ui-canvas border border-ui-border-decorative px-2.5 py-0.5 rounded-full">
          {m.dosage_notation}
        </span>
      )}
      {m.duration_days ? (
        <span className="text-[11px] font-semibold text-ui-text-secondary bg-ui-surface border border-ui-border-decorative px-2.5 py-0.5 rounded-full">
          {m.duration_days} days
        </span>
      ) : null}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 4 }}>
        <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon size={16} color={color} /> {label}
        </h4>
        <span className="text-[11px] font-semibold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-2 py-0.5 rounded-full">
          {meds.length > 1 ? `Single Message (${meds.length} medicines)` : "1 medicine"}
        </span>
      </div>
      {meds.map((m, i) => (
        <div className="med" key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <strong className="text-ui-text">{m.brand}</strong>
              <small className="text-ui-text-secondary">
                {" "}
                · {m.salt || "—"}
                {m.strength ? ` ${m.strength}` : ""}
              </small>
              {!m.reminders_enabled && (
                <span className="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full ml-1.5">
                  🔕 Paused
                </span>
              )}
            </div>
            {m.adherence_status === "taken" ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/90 px-2.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                ✓ Taken {m.adherence_time ? `(${m.adherence_time})` : ""}
              </span>
            ) : m.adherence_status === "missed" ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200/90 px-2.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                ✕ Missed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/90 px-2.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                ⏳ Due Today
              </span>
            )}
          </div>
          {m.adherence_id && (
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-ui-blue hover:bg-ui-blue-hover text-white rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:pointer-events-none"
                disabled={sendingId === m.adherence_id || !m.reminders_enabled}
                onClick={() => onSendReminder(m.adherence_id)}
                title="Send ONE consolidated WhatsApp checklist containing all medicines for this time slot"
              >
                🔔 {sendingId === m.adherence_id ? "Sending…" : meds.length > 1 ? "WhatsApp Nudge (All Meds)" : "WhatsApp Nudge"}
              </button>
              {m.adherence_status !== "taken" && (
                <button
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
                  onClick={() => onSimulateReply(m.adherence_id, "taken")}
                  title="Simulate patient clicking 'Yes, All Taken' on WhatsApp"
                >
                  ✓ Tap &apos;Yes, Taken&apos;
                </button>
              )}
              {m.adherence_status !== "missed" && (
                <button
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                  onClick={() => onSimulateReply(m.adherence_id, "missed")}
                  title="Simulate patient clicking 'Missed / Forgot' on WhatsApp"
                >
                  ✕ Tap &apos;Missed&apos;
                </button>
              )}
              <button
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-ui-text-secondary hover:text-ui-text bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative rounded-md transition-colors"
                onClick={() => onToggleReminders(m.id)}
                title={m.reminders_enabled ? "Pause reminders for this medicine" : "Resume reminders"}
              >
                {m.reminders_enabled ? "🔕 Pause" : "🔔 Resume"}
              </button>
              <button
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors"
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

function timeTo24h(t) {
  if (!t) return "08:00";
  const str = t.trim().toUpperCase();
  if (str.includes("AM") || str.includes("PM")) {
    const isPm = str.includes("PM");
    const digits = str.replace("AM", "").replace("PM", "").trim();
    const parts = digits.split(":");
    let h = parseInt(parts[0], 10);
    const m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return str.length === 5 ? str : "08:00";
}

function timeTo12h(t) {
  if (!t) return "08:00 AM";
  const parts = t.split(":");
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) || 0;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function Summary() {
  const [sendingId, setSendingId] = useState(null);
  const [testingScheduler, setTestingScheduler] = useState(false);
  const [editingTimes, setEditingTimes] = useState(false);
  const [slotTimes, setSlotTimes] = useState({ morning: "08:00", afternoon: "13:00", night: "20:00" });
  const [savingTimes, setSavingTimes] = useState(false);
  const [adhVersion, setAdhVersion] = useState(0);
  const { loading, error, data } = useData("/summary", [adhVersion]);
  const scope = useReveal([loading, data]);

  useEffect(() => {
    if (data?.patient) {
      setSlotTimes({
        morning: timeTo24h(data.patient.reminder_time_morning || "08:00 AM"),
        afternoon: timeTo24h(data.patient.reminder_time_afternoon || "01:00 PM"),
        night: timeTo24h(data.patient.reminder_time_night || "08:00 PM"),
      });
    }
  }, [data?.patient]);

  const handleSaveTimes = async () => {
    setSavingTimes(true);
    try {
      await api("/reminders/preferences", {
        method: "POST",
        json: {
          reminder_time_morning: timeTo12h(slotTimes.morning),
          reminder_time_afternoon: timeTo12h(slotTimes.afternoon),
          reminder_time_night: timeTo12h(slotTimes.night),
        },
      });
      setEditingTimes(false);
      setAdhVersion((v) => v + 1);
      alert(
        `✅ Schedule Times Saved!\n\n• Morning: ${timeTo12h(slotTimes.morning)}\n• Afternoon: ${timeTo12h(slotTimes.afternoon)}\n• Night: ${timeTo12h(slotTimes.night)}\n\nThe APScheduler will dispatch your WhatsApp messages at these exact times.`
      );
    } catch (e) {
      alert(e.message || "Failed to save schedule times");
    } finally {
      setSavingTimes(false);
    }
  };

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

  const handleTriggerDoctorCall = async (reportId) => {
    try {
      const res = await api(`/reports/${reportId}/trigger-call-reminder`, { method: "POST" });
      if (res.status === "dispatch_failed") {
        alert(`❌ Call dispatch failed: ${res.error || "unknown error"}`);
      } else if (res.mode === "simulated") {
        alert(
          `🧪 Simulated call logged (no Twilio/LiveKit SIP keys configured).\n\n• Patient: ${res.patient_name}\n• Doctor: ${res.doctor}\n• Checkup: ${res.follow_up_date}`
        );
      } else {
        alert(
          `📞 Sahayak is calling ${res.patient_name} now!\n\n• Doctor: ${res.doctor}\n• Checkup: ${res.follow_up_date}\n• Room: ${res.room_name}`
        );
      }
      setAdhVersion((v) => v + 1);
    } catch (e) {
      alert(e.message || "Failed to trigger call reminder");
    }
  };

  const handleTriggerScheduler = async () => {
    setTestingScheduler(true);
    try {
      const res = await api("/reminders/trigger-check", { method: "POST" });
      const sentCount = res.details?.whatsapp_medicines_dispatched?.length || 0;
      const callCount = res.details?.doctor_voice_calls_dispatched?.length || 0;
      alert(
        `⚡ Automated Scheduler Check Complete!\n\n• Time (IST): ${res.details?.ist_time || "Now"}\n• WhatsApp Medicine Reminders: ${sentCount}\n• 2-Day Doctor Voice Calls: ${callCount}`
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
          value={t.doses_per_day === 0 || t.adherence_rate_today_pct == null ? "No scheduled doses" : `${t.adherence_rate_today_pct}%`}
        />
      </div>

      {/* Smart Auto-Reminder Control Panel */}
      <Card
        title="Automated Medication Reminders & Call Scheduler"
        sub="Control automatic WhatsApp nudges and Sahayak voice reminders so you only receive alerts when needed"
        actions={
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60"
            disabled={testingScheduler}
            onClick={handleTriggerScheduler}
          >
            <RefreshCw size={13} className={testingScheduler ? "animate-spin text-ui-blue" : "text-ui-text-secondary"} />
            <span>{testingScheduler ? "Checking…" : "Run Auto-Scheduler Now"}</span>
          </button>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {/* WhatsApp Switch */}
          <div
            className="p-3.5 rounded-xl border border-ui-border-decorative bg-ui-surface shadow-sm flex items-center justify-between gap-3"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0"
              >
                <MessageSquare size={18} />
              </div>
              <div>
                <div className="font-semibold text-sm text-ui-text">
                  Daily Medicines (WhatsApp Only)
                </div>
                <div className="text-xs text-ui-text-secondary">
                  Interactive Yes/No dose alerts delivered exclusively via WhatsApp
                </div>
              </div>
            </div>
            <button
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors shadow-sm min-w-[88px] text-center shrink-0 ${
                p.whatsapp_reminders_enabled
                  ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                  : "bg-ui-surface hover:bg-ui-surface-subtle text-ui-text-secondary border border-ui-border-decorative"
              }`}
              onClick={() => handleTogglePref("whatsapp_reminders_enabled", p.whatsapp_reminders_enabled)}
            >
              {p.whatsapp_reminders_enabled ? "🟢 Active" : "⏸️ Paused"}
            </button>
          </div>

          {/* Voice Call Switch */}
          <div
            className="p-3.5 rounded-xl border border-ui-border-decorative bg-ui-surface shadow-sm flex items-center justify-between gap-3"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0"
              >
                <PhoneCall size={18} />
              </div>
              <div>
                <div className="font-semibold text-sm text-ui-text">
                  Doctor Meets & Tests (Voice Call Only)
                </div>
                <div className="text-xs text-ui-text-secondary">
                  Sahayak automated call 2 days before appointment (No WhatsApp)
                </div>
              </div>
            </div>
            <button
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors shadow-sm min-w-[88px] text-center shrink-0 ${
                p.call_reminders_enabled
                  ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                  : "bg-ui-surface hover:bg-ui-surface-subtle text-ui-text-secondary border border-ui-border-decorative"
              }`}
              onClick={() => handleTogglePref("call_reminders_enabled", p.call_reminders_enabled)}
            >
              {p.call_reminders_enabled ? "🟢 Active" : "⏸️ Paused"}
            </button>
          </div>
        </div>

        <div
          className="mt-3.5 p-3.5 rounded-xl bg-ui-surface-subtle/70 border border-ui-border-decorative flex items-center justify-between flex-wrap gap-2.5 text-xs sm:text-sm"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Clock size={16} className="text-ui-blue" />
            <span className="font-semibold text-ui-text">Precision Schedule (IST):</span>
            <span className="text-ui-text-secondary">
              🌅 Morning (<strong>{p.reminder_time_morning || "08:00 AM"}</strong>) · ☀️ Afternoon (<strong>{p.reminder_time_afternoon || "01:00 PM"}</strong>) · 🌙 Night (<strong>{p.reminder_time_night || "08:00 PM"}</strong>)
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors shadow-sm"
              onClick={() => setEditingTimes((v) => !v)}
            >
              {editingTimes ? "Close Settings" : "⚙️ Change Slot Times"}
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
                p.auto_reminders_enabled
                  ? "text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200"
                  : "text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
              }`}
              onClick={() => handleTogglePref("auto_reminders_enabled", p.auto_reminders_enabled)}
            >
              {p.auto_reminders_enabled ? "Pause Master Reminders" : "Resume Master Reminders"}
            </button>
          </div>
        </div>

        {editingTimes && (
          <div
            className="mt-3 p-4 rounded-xl bg-ui-surface border border-ui-border-decorative shadow-sm flex flex-col gap-3"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div className="font-semibold text-sm text-ui-text">
                  Configure Exact WhatsApp Dose Schedule
                </div>
                <div className="text-xs text-ui-text-secondary">
                  Set the exact minute in Indian Standard Time (IST) when your interactive WhatsApp medication card will be dispatched.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-60"
                  disabled={savingTimes}
                  onClick={handleSaveTimes}
                >
                  <CheckCircle2 size={14} />
                  <span>{savingTimes ? "Saving…" : "Save Exact Schedule"}</span>
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div className="p-2.5 rounded-lg bg-ui-canvas border border-ui-border-decorative">
                <label htmlFor="slot-time-morning" className="text-xs font-semibold text-ui-text block mb-1.5">
                  🌅 Morning Dose Time
                </label>
                <input
                  id="slot-time-morning"
                  type="time"
                  value={slotTimes.morning}
                  onChange={(e) => setSlotTimes({ ...slotTimes, morning: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md border border-ui-border-decorative bg-ui-surface text-ui-text text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-ui-canvas border border-ui-border-decorative">
                <label htmlFor="slot-time-afternoon" className="text-xs font-semibold text-ui-text block mb-1.5">
                  ☀️ Afternoon Dose Time
                </label>
                <input
                  id="slot-time-afternoon"
                  type="time"
                  value={slotTimes.afternoon}
                  onChange={(e) => setSlotTimes({ ...slotTimes, afternoon: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md border border-ui-border-decorative bg-ui-surface text-ui-text text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-ui-canvas border border-ui-border-decorative">
                <label htmlFor="slot-time-night" className="text-xs font-semibold text-ui-text block mb-1.5">
                  🌙 Night Dose Time
                </label>
                <input
                  id="slot-time-night"
                  type="time"
                  value={slotTimes.night}
                  onChange={(e) => setSlotTimes({ ...slotTimes, night: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md border border-ui-border-decorative bg-ui-surface text-ui-text text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
                />
              </div>
            </div>

            <div
              className="text-xs text-ui-text-secondary bg-ui-surface-subtle border border-ui-border-decorative/80 p-3 rounded-lg leading-relaxed"
            >
              💡 <strong>Instant Test Tip:</strong> Set one of the times above to <strong>1–2 minutes ahead</strong> of your current clock and click <em>Save Exact Schedule</em>! The APScheduler ticks every 30 seconds and will immediately deliver the interactive WhatsApp message to your registered phone.
            </div>
          </div>
        )}
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
                className="flex items-center justify-between p-3 rounded-xl bg-ui-surface border border-ui-border-decorative shadow-sm gap-3"
              >
                <div>
                  <div className="font-semibold text-ui-text text-sm">
                    {sm.brand}{" "}
                    <span className="font-normal text-ui-text-secondary">
                      ({sm.strength || sm.salt})
                    </span>
                  </div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    ✓ {sm.stopped_reason} {sm.stopped_at ? `on ${sm.stopped_at}` : ""} · Reminders stopped
                  </div>
                </div>
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors shadow-sm shrink-0"
                  onClick={() => handleResumeMedicine(sm.id)}
                >
                  <RotateCcw size={12} className="text-ui-blue" />
                  <span>Resume Medicine</span>
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
                className="flex items-center justify-between p-3 rounded-xl bg-ui-surface border border-ui-border-decorative shadow-sm gap-3"
              >
                <div>
                  <div className="font-semibold text-ui-text text-sm">{c.medicine}</div>
                  <div className="text-xs text-ui-text-secondary">{c.salt}</div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block text-xs font-semibold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-3 py-1 rounded-full shadow-sm">
                    {c.used_for || "General Care"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Disclaimer>{data.conditions_disclaimer}</Disclaimer>
        </Card>

        <Card
          title="Next Doctor Review & Checkup"
          sub="Reminders for checkups are delivered through Sahayak Voice Call 2 days before, never WhatsApp"
        >
          {data.next_followup ? (
            <div
              className="flex flex-col gap-3 p-5 rounded-xl bg-gradient-to-br from-ui-surface to-ui-surface-subtle/50 border border-ui-border-decorative shadow-sm"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "gap 8", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Calendar size={22} className="text-amber-600" />
                  <span className="text-2xl font-serif font-bold text-ui-text">
                    {data.next_followup.date}
                  </span>
                </div>
                {data.next_followup.follow_up_status === "reschedule_requested" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full shadow-sm">
                    🔄 Reschedule Requested
                  </span>
                ) : data.next_followup.follow_up_status === "confirmed" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full shadow-sm">
                    ✓ Confirmed by Patient
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ui-blue bg-ui-surface border border-ui-border-decorative px-3 py-1 rounded-full shadow-sm">
                    📞 Voice Call (2 Days Prior)
                  </span>
                )}
              </div>
              <div className="text-sm text-ui-text-secondary font-medium">
                Consultation & Review with <strong className="text-ui-text">{data.next_followup.doctor}</strong>
                {data.next_followup.follow_up_status === "reschedule_requested" && (
                  <div className="text-amber-700 text-xs mt-1 font-semibold">
                    Preferred Time: {data.next_followup.reschedule_preferred_date}
                    {data.next_followup.reschedule_notes && ` · Note: ${data.next_followup.reschedule_notes}`}
                  </div>
                )}
              </div>
              <div
                className="p-3 rounded-lg bg-ui-surface border border-ui-border-decorative flex items-center justify-between flex-wrap gap-2.5"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <PhoneCall size={16} className="text-amber-600" />
                  <span className="text-xs font-semibold text-ui-text">
                    {data.next_followup.call_reminder_status || "Call scheduled 2 days before"}
                  </span>
                </div>
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors shadow-sm"
                  onClick={() => handleTriggerDoctorCall(data.next_followup.report_id)}
                  title="Simulate or place the 2-day prior doctor follow-up phone call"
                >
                  <PhoneCall size={12} className="text-amber-600" />
                  <span>Simulate 2-Day Call</span>
                </button>
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
        <div className="flex items-center gap-1.5">
          {m.needs_salt_confirmation && (
            <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              Confirm Salt
            </span>
          )}
          {m.reminders_enabled !== false ? (
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              🔔 Reminders ON
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              🔕 Paused
            </span>
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
          className="mt-3 p-2.5 rounded-lg bg-ui-surface-subtle/70 border border-ui-border-decorative flex items-center justify-between"
        >
          <span className="text-xs text-ui-text-secondary">Best price on {best.platform}</span>
          <span className="font-serif font-bold text-ui-blue text-sm">
            ₹{Number(best.price).toFixed(2)}
          </span>
        </div>
      )}
      <div
        className="mt-3.5 pt-3 border-t border-ui-border-decorative flex items-center justify-between flex-wrap gap-2"
      >
        <button
          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 text-ui-text-secondary hover:text-ui-text bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative rounded-lg transition-colors"
          onClick={() => onToggle(m.id)}
        >
          {m.reminders_enabled !== false ? "🔕 Pause Reminders" : "🔔 Resume Reminders"}
        </button>
        <button
          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
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
  const isMajor = f?.severity === "major";
  const isModerate = f?.severity === "moderate";

  return (
    <div
      className={`p-4 rounded-xl border shadow-sm transition-all ${
        isMajor
          ? "bg-rose-50/50 border-rose-200"
          : isModerate
          ? "bg-amber-50/50 border-amber-200"
          : "bg-ui-surface border-ui-border-decorative"
      }`}
      data-reveal
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${
              isMajor
                ? "bg-rose-100 text-rose-800 border border-rose-300"
                : isModerate
                ? "bg-amber-100 text-amber-800 border border-amber-300"
                : "bg-ui-surface-subtle text-ui-blue border border-ui-border-decorative"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {(f?.severity || "info").toUpperCase()} RISK
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              isMajor
                ? "text-rose-800 bg-rose-50 border border-rose-200"
                : isModerate
                ? "text-amber-800 bg-amber-50 border border-amber-200"
                : "text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative"
            }`}
          >
            {isMajor ? "Immediate Attention" : isModerate ? "Caution Advised" : "Monitored"}
          </span>
          <AlertTriangle size={16} className={isMajor ? "text-rose-600" : isModerate ? "text-amber-600" : "text-ui-blue"} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        {(f?.medicines || (f?.drug_1 ? [{ brand: f.drug_1, salt: f.drug_2 || "" }] : [])).map((mm, i) => (
          <span
            key={i}
            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-ui-surface border border-ui-border-decorative text-ui-text shadow-xs"
          >
            {mm.brand} ({mm.salt}) {mm.prescriber ? `· Dr. ${mm.prescriber}` : ""}
          </span>
        ))}
      </div>

      <div className="text-sm text-ui-text leading-relaxed">
        {f?.note || f?.warning || "Interaction risk identified."}
      </div>
      <div className="text-xs text-ui-text-secondary italic mt-1">
        Clinical reference: {f?.source || (f?.action ? "Action: " + f.action : "CDSCO / PMBJP Clinical Safety Matrix")}
      </div>
    </div>
  );
}

export function Interactions() {
  const { loading, error, data } = useData("/interactions");
  const scope = useReveal([loading, data]);
  if (loading) return <Loader label="Scanning medicine interactions…" />;
  if (error) return <Note tone="err">{error}</Note>;
  return (
    <div ref={scope} className="grid">
      <div className="grid cols-3">
        <Stat
          icon={<Search size={20} />}
          label="Drug pairs checked"
          value={data?.checked_pairs ?? 4}
        />
        <Stat
          icon={<BookOpen size={20} />}
          label="Loaded interaction rules"
          value={data?.known_interactions_in_db ?? data?.checked_against ?? "—"}
        />
        <Stat
          icon={<ShieldAlert size={20} />}
          label="Identified alerts"
          value={data?.findings?.length ?? data?.interactions?.length ?? 0}
        />
      </div>

      {((data?.findings || data?.interactions || []).length === 0) ? (
        <Card>
          <Note tone="warn">
            {data?.coverage_note || "No matches were found in the loaded interaction rules. A missing alert does not rule out an interaction."}
          </Note>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(data?.findings || data?.interactions || []).map((f, i) => (
            <FindingCard key={i} f={f} />
          ))}
        </div>
      )}
      <Disclaimer>{data?.disclaimer || data?.note}</Disclaimer>
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
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;
  const { loading, error, data } = useData("/reports", [refresh]);
  const scope = useReveal([loading, data, currentPage]);

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
  const reportsList = data || [];
  if (!reportsList.length) return <Empty icon="📄">No archived prescriptions found.</Empty>;

  const totalPages = Math.ceil(reportsList.length / PAGE_SIZE) || 1;
  const paginatedReports = reportsList.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div ref={scope} className="grid">
      {paginatedReports.map((r) => (
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
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shadow-sm">
                ✓ Validated
              </span>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-60"
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
                className="flex items-center justify-between p-2.5 rounded-lg bg-ui-surface border border-ui-border-decorative shadow-sm gap-2"
              >
                <div>
                  <div className="font-semibold text-ui-text text-sm">{m.brand}</div>
                  <div className="text-xs text-ui-text-secondary">{medLine(m)}</div>
                </div>
                <span className="text-xs font-semibold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-2.5 py-0.5 rounded-full">
                  {m.dosage_notation || (m.prn ? "SOS" : "Standard")}
                </span>
              </div>
            ))}
          </div>
          {r.follow_up_date && (
            <div className="text-xs mt-3 flex items-center justify-between flex-wrap gap-2 text-ui-text-secondary">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Calendar size={14} className="text-ui-blue" /> Review on <strong className="text-ui-text">{r.follow_up_date}</strong>
              </div>
              {r.follow_up_status === "reschedule_requested" && (
                <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold">
                  🔄 Rescheduled: {r.reschedule_preferred_date}
                </span>
              )}
              {r.follow_up_status === "confirmed" && (
                <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                  ✓ Confirmed
                </span>
              )}
            </div>
          )}
        </Card>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 p-3 bg-ui-surface border border-ui-border-decorative rounded-xl shadow-sm">
          <button
            type="button"
            className="inline-flex items-center px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none shadow-sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            ← Previous
          </button>
          <span className="text-xs font-semibold text-ui-text">
            Page {currentPage} of {totalPages} ({reportsList.length} records)
          </span>
          <button
            type="button"
            className="inline-flex items-center px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none shadow-sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Next →
          </button>
        </div>
      )}
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

  // ERR-030: Clean object URL teardown on unmount or URL replacement
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const pick = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErr("Please upload a valid prescription image file (JPEG or PNG).");
      return;
    }
    setErr("");
    setReport(null);
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
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
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-sm rounded-lg shadow-sm transition-colors mt-4 disabled:opacity-50 disabled:pointer-events-none"
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
                  className="p-4 rounded-xl border border-ui-border-decorative bg-ui-surface shadow-sm"
                  data-reveal
                >
                  <div className="flex items-baseline justify-between mb-2.5">
                    <span className="font-serif font-bold text-base text-ui-text">{m.brand}</span>
                    <span className="text-xs font-semibold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-2.5 py-0.5 rounded-full">{medLine(m)}</span>
                  </div>
                  <PriceVisual prices={m.prices} />
                </div>
              ))}
            </div>

            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-sm rounded-lg shadow-sm transition-colors mt-4.5 disabled:opacity-50"
              disabled={confirming}
              onClick={confirm}
            >
              {confirming ? "Saving to Medical Records…" : "Confirm & Save to Dashboard →"}
            </button>
            <Disclaimer>
              Ayogya extracts data to assist you; always adhere to your prescribing doctor&apos;s physical instructions.
            </Disclaimer>
          </>
        )}
      </Card>
    </div>
  );
}
