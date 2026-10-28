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
  UIError,
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
  Check,
  X,
  HeartPulse,
  Stethoscope,
  Info,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Sliders,
  Send,
  ShieldCheck,
  Activity,
  CheckCircle,
} from "lucide-react";

// Shared GET-with-loading/error helper with deduplication & scoped caching. Re-fetches when `deps` change.
function useData(path, deps = []) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    fetchWithResourceCache(
      path,
      (sig) => api(path, { signal: sig }),
      { signal: controller.signal }
    )
      .then((d) => {
        if (alive) setState({ loading: false, error: "", data: d });
      })
      .catch((e) => {
        if (alive) {
          const isUserAbort =
            e?.name === "AbortError" &&
            !e?.message?.toLowerCase().includes("timeout") &&
            controller.signal.reason?.name !== "TimeoutError";
          if (isUserAbort) return;
          setState({
            loading: false,
            error: e.message || "Failed to load data. Please try again.",
            data: null,
          });
        }
      });

    return () => {
      alive = false;
      controller.abort(new DOMException("Component unmounted or deps changed", "AbortError"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return state;
}

const ROUTINE_SLOTS = [
  {
    key: "morning",
    label: "Morning Dose",
    defaultTime: "08:00 AM",
    prefKey: "reminder_time_morning",
    Icon: Sunrise,
    headerBg: "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent",
    iconBg: "bg-amber-100 text-amber-800 border-amber-200",
    windowHint: "Breakfast window · 1 consolidated message",
  },
  {
    key: "afternoon",
    label: "Afternoon Dose",
    defaultTime: "01:00 PM",
    prefKey: "reminder_time_afternoon",
    Icon: Sun,
    headerBg: "bg-gradient-to-r from-amber-600/10 via-amber-600/5 to-transparent",
    iconBg: "bg-amber-100 text-amber-900 border-amber-200",
    windowHint: "Lunch window · 1 consolidated message",
  },
  {
    key: "evening",
    label: "Evening Dose",
    defaultTime: "05:00 PM",
    prefKey: null,
    Icon: Sunset,
    headerBg: "bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent",
    iconBg: "bg-orange-100 text-orange-800 border-orange-200",
    windowHint: "Sunset / Tea window · 1 consolidated message",
  },
  {
    key: "night",
    label: "Night Dose",
    defaultTime: "08:00 PM",
    prefKey: "reminder_time_night",
    Icon: Moon,
    headerBg: "bg-gradient-to-r from-slate-900/10 via-slate-900/5 to-transparent",
    iconBg: "bg-slate-100 text-slate-800 border-slate-200",
    windowHint: "Dinner / Bedtime window · 1 consolidated message",
  },
];

const SLOTS = ROUTINE_SLOTS;
const SEV = { major: "danger", moderate: "warn", minor: "brand" };

function medLine(m) {
  return `${m.salt || "Salt unconfirmed"}${m.strength ? ` · ${m.strength}` : ""}`;
}

function TimingPills({ m }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {m.prn ? (
        <span className="text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-200/90 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          SOS · As needed
        </span>
      ) : (
        (m.timing || []).map((t) => (
          <span
            key={t}
            className="text-[10px] font-bold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-2.5 py-0.5 rounded-full uppercase tracking-wider"
          >
            {t}
          </span>
        ))
      )}
      {m.dosage_notation && (
        <span className="text-[10px] font-semibold text-ui-text bg-ui-canvas border border-ui-border-decorative px-2 py-0.5 rounded-full">
          {m.dosage_notation}
        </span>
      )}
      {m.duration_days ? (
        <span className="text-[10px] font-medium text-ui-text-secondary bg-ui-surface border border-ui-border-decorative px-2 py-0.5 rounded-full">
          {m.duration_days} days
        </span>
      ) : null}
    </div>
  );
}

function SlotCard({
  slot,
  meds = [],
  scheduledTime,
  onSendReminder,
  onSimulateReply,
  onStopMedicine,
  onToggleReminders,
  sendingId,
}) {
  const Icon = slot.Icon;
  const hasMeds = meds && meds.length > 0;
  const firstWithAdh = hasMeds ? meds.find((m) => m.adherence_id) : null;
  const isSending = Boolean(firstWithAdh && sendingId === firstWithAdh.adherence_id);
  const anyRemindersEnabled = hasMeds && meds.some((m) => m.reminders_enabled !== false);

  return (
    <div className="flex flex-col rounded-2xl bg-ui-surface border border-ui-border-decorative shadow-xs overflow-hidden transition-all hover:shadow-md hover:border-brand-orange/30">
      {/* Top Banner / Time Header */}
      <div className={`p-4 border-b border-ui-border-decorative/60 ${slot.headerBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${slot.iconBg}`}>
              <Icon size={16} />
            </div>
            <div className="min-w-0">
              <h4 className="font-serif font-bold text-sm text-ui-text truncate leading-tight">
                {slot.label}
              </h4>
              <div className="text-[11px] font-medium text-ui-text-secondary truncate mt-0.5">
                ⏰ {scheduledTime} IST
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
              hasMeds
                ? "bg-ui-surface text-ui-text border-ui-border-decorative"
                : "bg-ui-surface-subtle text-ui-text-secondary border-ui-border-decorative/60"
            }`}
          >
            {hasMeds ? (meds.length === 1 ? "1 Medicine" : `${meds.length} Medicines`) : "Dose-free"}
          </span>
        </div>

        {/* Slot-level WhatsApp Nudge Bar when medicines exist */}
        {hasMeds && firstWithAdh && (
          <div className="mt-3 pt-2.5 border-t border-ui-border-decorative/50 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ui-text-secondary truncate">
              {slot.windowHint}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-xs transition-colors shrink-0 disabled:opacity-50 disabled:pointer-events-none"
              disabled={isSending || !anyRemindersEnabled}
              onClick={() => onSendReminder(firstWithAdh.adherence_id)}
              title="Send 1 consolidated WhatsApp checklist containing all medicines for this time slot"
            >
              <MessageSquare size={12} />
              <span>{isSending ? "Sending…" : "WhatsApp Nudge"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Medicines List or Empty State */}
      <div className="p-3.5 flex-1 flex flex-col gap-3 bg-ui-canvas/20">
        {!hasMeds ? (
          <div className="py-8 px-4 rounded-xl border border-dashed border-ui-border-decorative/80 bg-ui-surface/60 text-center flex flex-col items-center justify-center flex-1 min-h-[140px]">
            <div className="w-8 h-8 rounded-full bg-ui-surface-subtle border border-ui-border-decorative flex items-center justify-center text-ui-success mb-2">
              <Check size={14} />
            </div>
            <span className="font-serif font-semibold text-xs text-ui-text">Dose-Free Interval</span>
            <span className="text-[11px] text-ui-text-secondary mt-0.5">No doses scheduled for this window</span>
          </div>
        ) : (
          meds.map((m, i) => (
            <div
              key={m.id || i}
              className="p-3 rounded-xl bg-ui-surface border border-ui-border-decorative/90 shadow-xs flex flex-col gap-2.5 transition-all hover:border-brand-orange/40 hover:shadow-sm"
            >
              {/* Medicine Brand & Adherence Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-serif font-bold text-sm text-ui-text truncate" title={m.brand}>
                    {m.brand}
                  </div>
                  <div className="text-[11px] text-ui-text-secondary truncate mt-0.5">
                    {m.salt || "—"}{m.strength ? ` · ${m.strength}` : ""}
                  </div>
                </div>

                {/* Adherence Status Pill */}
                {m.adherence_status === "taken" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/90 px-2 py-0.5 rounded-full shrink-0 shadow-xs">
                    ✓ Taken {m.adherence_time ? `(${m.adherence_time})` : ""}
                  </span>
                ) : m.adherence_status === "missed" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200/90 px-2 py-0.5 rounded-full shrink-0 shadow-xs">
                    ✕ Missed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-full shrink-0 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Due Today
                  </span>
                )}
              </div>

              {/* Timing & Tags */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <TimingPills m={m} />
                {!m.reminders_enabled && (
                  <span className="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                    🔕 Paused
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              {m.adherence_id && (
                <div className="pt-2 border-t border-ui-border-decorative/60 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {m.adherence_status !== "taken" ? (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
                        onClick={() => onSimulateReply(m.adherence_id, "taken")}
                        title="Simulate patient tapping 'Yes, All Taken' on WhatsApp"
                      >
                        <Check size={12} />
                        <span>Taken</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50/60 rounded-md">
                        ✓ Recorded
                      </span>
                    )}

                    {m.adherence_status !== "missed" ? (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                        onClick={() => onSimulateReply(m.adherence_id, "missed")}
                        title="Simulate patient tapping 'Missed / Forgot' on WhatsApp"
                      >
                        <X size={12} />
                        <span>Missed</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-semibold text-rose-700 bg-rose-50/60 rounded-md">
                        ✕ Missed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] pt-0.5">
                    <button
                      type="button"
                      className="text-ui-text-secondary hover:text-ui-text hover:underline transition-colors font-medium"
                      onClick={() => onToggleReminders(m.id)}
                      title={m.reminders_enabled ? "Pause reminders for this medicine" : "Resume reminders"}
                    >
                      {m.reminders_enabled ? "🔕 Pause" : "🔔 Resume"}
                    </button>
                    <button
                      type="button"
                      className="text-teal-800 hover:text-teal-900 hover:underline transition-colors font-medium"
                      onClick={() => onStopMedicine(m.id, m.brand)}
                      title="Patient completed course or feeling fit"
                    >
                      ✋ I&apos;m Fit / Stop
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const Slot = SlotCard;

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
    <div ref={scope} className="flex flex-col gap-6">
      {/* 1. At-A-Glance Health Telemetry */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={<PillIcon size={20} className="text-amber-600" />}
          label="Active Medicines"
          value={t.active_medicines}
        />
        <Stat
          icon={<Clock size={20} className="text-ui-blue" />}
          label="Daily Scheduled Doses"
          value={t.doses_per_day}
        />
        <Stat
          icon={<MessageSquare size={20} className="text-emerald-600" />}
          label="WhatsApp Alerts Sent"
          value={t.whatsapp_reminders_sent}
        />
        <Stat
          icon={<CheckCircle2 size={20} className="text-emerald-700" />}
          label="Today's Dose Adherence"
          value={t.doses_per_day === 0 || t.adherence_rate_today_pct == null ? "No doses" : `${t.adherence_rate_today_pct}%`}
        />
      </div>

      {/* 2. Automated Medication Reminders & Call Scheduler */}
      <Card
        title="Automated Medication Reminders & Call Scheduler"
        sub="Control automatic WhatsApp nudges and Sahayak voice reminders so you only receive alerts when needed"
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-60"
            disabled={testingScheduler}
            onClick={handleTriggerScheduler}
          >
            <RefreshCw size={13} className={testingScheduler ? "animate-spin text-ui-blue" : "text-ui-text-secondary"} />
            <span>{testingScheduler ? "Checking…" : "Run Auto-Scheduler Now"}</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* WhatsApp Switch */}
          <div className="p-3.5 rounded-xl border border-ui-border-decorative bg-ui-surface shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <MessageSquare size={19} />
              </div>
              <div className="min-w-0">
                <div className="font-serif font-bold text-sm text-ui-text truncate">
                  Daily Medicines (WhatsApp Only)
                </div>
                <div className="text-xs text-ui-text-secondary truncate mt-0.5">
                  Interactive Yes/No dose alerts delivered exclusively via WhatsApp
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors shadow-xs min-w-[88px] text-center shrink-0 ${
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
          <div className="p-3.5 rounded-xl border border-ui-border-decorative bg-ui-surface shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <PhoneCall size={19} />
              </div>
              <div className="min-w-0">
                <div className="font-serif font-bold text-sm text-ui-text truncate">
                  Doctor Meets &amp; Tests (Voice Call Only)
                </div>
                <div className="text-xs text-ui-text-secondary truncate mt-0.5">
                  Sahayak automated call 2 days before appointment (No WhatsApp)
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors shadow-xs min-w-[88px] text-center shrink-0 ${
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

        <div className="mt-3.5 p-3.5 rounded-xl bg-ui-surface-subtle/70 border border-ui-border-decorative flex items-center justify-between flex-wrap gap-2.5 text-xs sm:text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Clock size={16} className="text-ui-blue shrink-0" />
            <span className="font-semibold text-ui-text">Precision Schedule (IST):</span>
            <span className="text-ui-text-secondary">
              🌅 Morning (<strong>{p.reminder_time_morning || "08:00 AM"}</strong>) · ☀️ Afternoon (<strong>{p.reminder_time_afternoon || "01:00 PM"}</strong>) · 🌙 Night (<strong>{p.reminder_time_night || "08:00 PM"}</strong>)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors shadow-xs"
              onClick={() => setEditingTimes((v) => !v)}
            >
              {editingTimes ? "Close Settings" : "⚙️ Change Slot Times"}
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-xs ${
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
          <div className="mt-3 p-4 rounded-xl bg-ui-surface border border-ui-border-decorative shadow-xs flex flex-col gap-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <div className="font-serif font-bold text-sm text-ui-text">
                  Configure Exact WhatsApp Dose Schedule
                </div>
                <div className="text-xs text-ui-text-secondary mt-0.5">
                  Set the exact minute in Indian Standard Time (IST) when your interactive WhatsApp medication card will be dispatched.
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-xs font-semibold transition-colors shadow-xs disabled:opacity-60"
                disabled={savingTimes}
                onClick={handleSaveTimes}
              >
                <CheckCircle2 size={14} />
                <span>{savingTimes ? "Saving…" : "Save Exact Schedule"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-ui-canvas border border-ui-border-decorative">
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

              <div className="p-3 rounded-lg bg-ui-canvas border border-ui-border-decorative">
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

              <div className="p-3 rounded-lg bg-ui-canvas border border-ui-border-decorative">
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

            <div className="text-xs text-ui-text-secondary bg-ui-surface-subtle border border-ui-border-decorative/80 p-3 rounded-lg leading-relaxed">
              💡 <strong>Instant Test Tip:</strong> Set one of the times above to <strong>1–2 minutes ahead</strong> of your current clock and click <em>Save Exact Schedule</em>! The APScheduler ticks every 30 seconds and will immediately deliver the interactive WhatsApp message to your registered phone.
            </div>
          </div>
        )}
      </Card>

      {/* 3. Daily Dose Schedule & WhatsApp Adherence (The Core Medication Timeline) */}
      <Card
        title="Daily Dose Schedule & WhatsApp Adherence"
        sub="Interactive medication timeline with real-time dose confirmation and WhatsApp telemetry"
        actions={
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-ui-surface-subtle text-ui-text text-xs font-semibold rounded-full border border-ui-border-decorative">
            <span className="w-2 h-2 rounded-full bg-ui-success" />
            <span>Today&apos;s Active Regimen</span>
          </span>
        }
      >
        {/* Responsive 4-Column Routine Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {ROUTINE_SLOTS.map((slot) => {
            const timeVal = slot.prefKey && p[slot.prefKey] ? p[slot.prefKey] : slot.defaultTime;
            return (
              <SlotCard
                key={slot.key}
                slot={slot}
                meds={s[slot.key]}
                scheduledTime={timeVal}
                onSendReminder={handleSendReminder}
                onSimulateReply={handleSimulateReply}
                onStopMedicine={handleStopMedicine}
                onToggleReminders={handleToggleReminders}
                sendingId={sendingId}
              />
            );
          })}
        </div>

        {/* Dedicated As-Needed (SOS / PRN) Medications Shelf */}
        {s.sos && s.sos.length > 0 && (
          <div className="mt-5 p-4 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/70 via-amber-50/30 to-ui-surface shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                  <AlertCircle size={17} />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sm text-ui-text">
                    As-Needed (SOS) &amp; Symptomatic Relief Prescriptions
                  </h4>
                  <p className="text-[11px] text-ui-text-secondary mt-0.5">
                    Take only when acute symptoms arise (e.g. pain, fever, acidity). These do not trigger automated daily clock alarms.
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-amber-900 bg-amber-100/80 border border-amber-300 px-3 py-0.5 rounded-full">
                {s.sos.length} {s.sos.length === 1 ? "Medicine" : "Medicines"} (PRN)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {s.sos.map((m, i) => (
                <div
                  key={m.id || i}
                  className="p-3.5 rounded-xl bg-ui-surface border border-ui-border-decorative shadow-xs flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-serif font-bold text-sm text-ui-text">
                        {m.brand}
                      </div>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        SOS · PRN
                      </span>
                    </div>
                    <div className="text-xs text-ui-text-secondary mt-0.5">
                      {m.salt || "—"}{m.strength ? ` · ${m.strength}` : ""}
                    </div>
                  </div>

                  {m.adherence_id && (
                    <div className="pt-2 border-t border-ui-border-decorative/60 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 py-1 px-2.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
                        onClick={() => onSimulateReply(m.adherence_id, "taken")}
                        title="Record taking this SOS dose today"
                      >
                        <Check size={12} />
                        <span>Taken Today</span>
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-teal-800 hover:text-teal-900 hover:underline transition-colors font-medium"
                        onClick={() => onStopMedicine(m.id, m.brand)}
                      >
                        Stop
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 4. Completed & Stopped Prescriptions section */}
      {data.stopped_medicines && data.stopped_medicines.length > 0 && (
        <Card
          title="Completed & Stopped Prescriptions"
          sub="Medicines you finished or stopped taking because you felt healthy (Reminders inactive)"
        >
          <div className="flex flex-col gap-2.5">
            {data.stopped_medicines.map((sm) => (
              <div
                key={sm.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-ui-surface border border-ui-border-decorative shadow-xs gap-3 hover:border-brand-orange/30 transition-colors"
              >
                <div>
                  <div className="font-serif font-bold text-ui-text text-sm">
                    {sm.brand}{" "}
                    <span className="font-normal font-sans text-ui-text-secondary text-xs">
                      ({sm.strength || sm.salt})
                    </span>
                  </div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    ✓ {sm.stopped_reason} {sm.stopped_at ? `on ${sm.stopped_at}` : ""} · Reminders stopped
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors shadow-xs shrink-0"
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

      {/* 5. Conditions Dossier & Next Doctor Review */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Conditions & Indications */}
        <Card
          title="Clinical Indications & Drug Dossier"
          sub="Informational summary of active salts and therapeutic indications (Non-diagnostic)"
        >
          <div className="flex flex-col gap-2.5">
            {data.conditions.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3.5 rounded-xl bg-ui-surface border border-ui-border-decorative shadow-xs gap-3 hover:border-brand-orange/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-ui-surface-subtle border border-ui-border-decorative flex items-center justify-center shrink-0 text-ui-blue">
                    <PillIcon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif font-bold text-ui-text text-sm truncate">{c.medicine}</div>
                    <div className="text-xs text-ui-text-secondary truncate mt-0.5">{c.salt}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block text-xs font-semibold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-3 py-1 rounded-full shadow-xs">
                    {c.used_for || "General Care"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Disclaimer>{data.conditions_disclaimer}</Disclaimer>
        </Card>

        {/* Next Doctor Review & Checkup */}
        <Card
          title="Next Doctor Review & Checkup"
          sub="Reminders for checkups are delivered through Sahayak Voice Call 2 days before, never WhatsApp"
        >
          {data.next_followup ? (
            <div className="flex flex-col gap-3.5 p-5 rounded-xl bg-gradient-to-br from-ui-surface via-ui-surface to-ui-surface-subtle/50 border border-ui-border-decorative shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-secondary block">
                      Appointment Date
                    </span>
                    <span className="text-2xl font-serif font-bold text-ui-text">
                      {data.next_followup.date}
                    </span>
                  </div>
                </div>
                {data.next_followup.follow_up_status === "reschedule_requested" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full shadow-xs">
                    🔄 Reschedule Requested
                  </span>
                ) : data.next_followup.follow_up_status === "confirmed" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full shadow-xs">
                    ✓ Confirmed by Patient
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ui-blue bg-ui-surface-subtle border border-ui-border-decorative px-3 py-1 rounded-full shadow-xs">
                    📞 Voice Call (2 Days Prior)
                  </span>
                )}
              </div>

              <div className="text-sm text-ui-text-secondary font-medium pt-1">
                Consultation &amp; Review with <strong className="text-ui-text font-serif text-base">{data.next_followup.doctor}</strong>
                {data.next_followup.follow_up_status === "reschedule_requested" && (
                  <div className="text-amber-700 text-xs mt-1 font-semibold">
                    Preferred Time: {data.next_followup.reschedule_preferred_date}
                    {data.next_followup.reschedule_notes && ` · Note: ${data.next_followup.reschedule_notes}`}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-ui-surface border border-ui-border-decorative flex items-center justify-between flex-wrap gap-2.5">
                <div className="flex items-center gap-2">
                  <PhoneCall size={15} className="text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold text-ui-text">
                    {data.next_followup.call_reminder_status || "Call scheduled 2 days before"}
                  </span>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ui-canvas hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative rounded-lg text-xs font-semibold transition-colors shadow-xs"
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
        <div className="flex items-center gap-1.5 flex-wrap">
          {m.needs_salt_confirmation && (
            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full shadow-xs">
              Confirm Salt
            </span>
          )}
          {m.reminders_enabled !== false ? (
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shadow-xs">
              🔔 Reminders ON
            </span>
          ) : (
            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full shadow-xs">
              🔕 Paused
            </span>
          )}
        </div>
      }
    >
      <div className="mb-3">
        <TimingPills m={m} />
      </div>
      <div className="text-xs text-ui-text-secondary">
        Prescribed by <strong className="text-ui-text font-serif">{m.prescriber_name || "Treating Physician"}</strong>
      </div>
      {best && (
        <div className="mt-3 p-3 rounded-xl bg-ui-surface-subtle/80 border border-ui-border-decorative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ui-text-secondary">Verified Jan Aushadhi / Best Price:</span>
            <span className="text-xs font-semibold text-ui-text">{best.platform}</span>
          </div>
          <span className="font-serif font-bold text-ui-blue text-base">
            ₹{Number(best.price).toFixed(2)}
          </span>
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-ui-border-decorative flex items-center justify-between flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 text-ui-text-secondary hover:text-ui-text bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative rounded-lg transition-colors shadow-xs"
          onClick={() => onToggle(m.id)}
        >
          {m.reminders_enabled !== false ? "🔕 Pause Reminders" : "🔔 Resume Reminders"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shadow-xs"
          onClick={() => onStop(m.id, m.brand)}
          title="Patient feeling healthy / completed course. Stops all upcoming reminders."
        >
          ✋ I&apos;m Fit / Stop Medicine
        </button>
      </div>
    </Card>
  );
}

export function Medicines({ pollVersion }) {
  const [version, setVersion] = useState(0);
  const [priceMap, setPriceMap] = useState({});
  const { loading, error, data } = useData("/medicines?include_prices=false", [version, pollVersion]);
  const scope = useReveal([loading, data]);

  // Progressive background enrichment for live pharmacy comparison without blocking active prescription render
  useEffect(() => {
    if (!data?.length) return;
    let alive = true;
    fetchWithResourceCache(
      "/medicines?include_prices=true",
      () => api("/medicines?include_prices=true"),
      { maxAgeMs: 60000 }
    )
      .then((medsWithPrices) => {
        if (!alive || !Array.isArray(medsWithPrices)) return;
        const map = {};
        for (const m of medsWithPrices) {
          if (m?.prices?.matched) {
            map[m.id] = m.prices;
          }
        }
        setPriceMap(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [data]);

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
  if (error) {
    return (
      <UIError
        title="Could not retrieve prescription list"
        message={error}
        onRetry={() => setVersion((v) => v + 1)}
      />
    );
  }
  if (!data?.length)
    return <Empty icon="💊">No active medicines found. Upload a prescription to get started.</Empty>;
  return (
    <div ref={scope} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.map((m) => (
        <MedCard
          key={m.id}
          m={{ ...m, prices: priceMap[m.id] || m.prices }}
          onStop={handleStop}
          onToggle={handleToggle}
        />
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
    <div ref={scope} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
    <div ref={scope} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    <div ref={scope} className="flex flex-col gap-4">
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
    <div ref={scope} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
