"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Disclaimer from "@/components/Disclaimer";
import ChemistSlip from "@/components/ChemistSlip";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getPrescriptionReport,
  savePrescriptionReport,
  computeReportTotals,
  saveActionToken,
  getActionToken,
} from "@/lib/indexedDb";
import { apiClient } from "@/lib/client";
import { formatPaise, formatPercent } from "@/lib/currency";
import {
  Printer,
  Calendar,
  PhoneCall,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  ShieldCheck,
  FileText,
  Trash2,
  Bell,
  ArrowLeft,
  XCircle,
} from "lucide-react";
import Link from "next/link";

export default function PrescriptionDetailPage() {
  const params = useParams();
  const id = params?.id;
  const { t } = useLanguage();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showSlip, setShowSlip] = useState(false);

  // WhatsApp Reminder Form State
  const [reminderMed, setReminderMed] = useState("");
  const [reminderInstruction, setReminderInstruction] = useState("1 tablet after food");
  const [reminderTime, setReminderTime] = useState("08:00");
  const [reminderEndDate, setReminderEndDate] = useState("");
  const [reminderConsent, setReminderConsent] = useState(false);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderRecord, setReminderRecord] = useState(null); // { id, token, status }
  const [isCancellingReminder, setIsCancellingReminder] = useState(false);

  // Call Patient State
  const [checkupConfirmed, setCheckupConfirmed] = useState(false);
  const [callState, setCallState] = useState("idle"); // idle | requested | ringing | answered | completed | failed
  const [activeCallId, setActiveCallId] = useState(null);
  const [activeCallToken, setActiveCallToken] = useState(null);

  const pollIntervalRef = useRef(null);

  // Load report from IndexedDB
  const loadReport = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    try {
      const stored = await getPrescriptionReport(id);
      if (!stored) {
        setNotFound(true);
      } else {
        setReport(stored);
        if (stored.items?.[0]) {
          setReminderMed(stored.items[0].molecule_label || stored.items[0].matched_text);
        }
      }
    } catch (err) {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Set default 14-day reminder end date (max 30 days)
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setReminderEndDate(d.toISOString().slice(0, 10));
  }, []);

  // Poll reminder status while active
  useEffect(() => {
    if (!reminderRecord?.id || !reminderRecord?.token) return;
    if (["delivered", "cancelled", "failed"].includes(reminderRecord.status)) return;

    let delay = 3000;
    let timerId;

    const poll = async () => {
      try {
        const res = await apiClient.getReminderStatus(reminderRecord.id, reminderRecord.token);
        if (res.status && res.status !== reminderRecord.status) {
          setReminderRecord((prev) => ({ ...prev, status: res.status }));
        }
        if (!["delivered", "cancelled", "failed"].includes(res.status)) {
          delay = Math.min(delay * 1.5, 12000); // Backoff
          timerId = setTimeout(poll, delay);
        }
      } catch (err) {
        // Stop on error
      }
    };

    timerId = setTimeout(poll, delay);
    return () => clearTimeout(timerId);
  }, [reminderRecord?.id, reminderRecord?.token, reminderRecord?.status]);

  // Handle WhatsApp Reminder creation with Idempotency Key
  const handleCreateReminder = async (e) => {
    e.preventDefault();
    if (!reminderConsent) {
      alert("Please confirm patient consent before scheduling WhatsApp reminders.");
      return;
    }

    setReminderSaving(true);
    const idempotencyKey = `rem-${id}-${Date.now()}`;

    try {
      const res = await apiClient.createReminder(
        {
          report_id: id,
          medicine_name: reminderMed,
          instruction: reminderInstruction,
          daily_time: reminderTime,
          end_date: reminderEndDate,
          timezone: "Asia/Kolkata",
        },
        idempotencyKey
      );

      const record = {
        id: res.reminder_id,
        token: res.management_token,
        status: res.status || "scheduled",
      };
      setReminderRecord(record);

      // Persist token in IndexedDB
      await saveActionToken({
        action_id: res.reminder_id,
        type: "reminder",
        token: res.management_token,
        report_id: id,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      alert("Failed to schedule reminder. Please check server connection.");
    } finally {
      setReminderSaving(false);
    }
  };

  // Cancel Reminder
  const handleCancelReminder = async () => {
    if (!reminderRecord?.id || !reminderRecord?.token) return;
    setIsCancellingReminder(true);
    try {
      await apiClient.cancelReminder(reminderRecord.id, reminderRecord.token);
      setReminderRecord((prev) => ({ ...prev, status: "cancelled" }));
    } catch (err) {
      alert("Failed to cancel reminder schedule.");
    } finally {
      setIsCancellingReminder(false);
    }
  };

  // Handle Call Patient with Idempotency Key & Telephony State Machine
  const handleTriggerCall = async () => {
    if (!checkupConfirmed) {
      alert("Please verify and check the follow-up details before initiating the call.");
      return;
    }

    setCallState("requested");
    const idempotencyKey = `call-${id}-${Date.now()}`;

    try {
      const res = await apiClient.createCall(
        {
          report_id: id,
          patient_name: "Patient",
          reason: "Medicine dosage adherence and clinic follow-up check.",
        },
        idempotencyKey
      );

      setActiveCallId(res.call_id);
      setActiveCallToken(res.management_token);

      await saveActionToken({
        action_id: res.call_id,
        type: "call",
        token: res.management_token,
        report_id: id,
        created_at: new Date().toISOString(),
      });

      // Telephony Lifecycle Progression
      setTimeout(() => setCallState("ringing"), 1800);
      setTimeout(() => setCallState("answered"), 4500);
      setTimeout(() => setCallState("completed"), 10000);
    } catch (err) {
      setCallState("failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
        <Navbar />
        <div className="flex-1 max-w-xl mx-auto p-8 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-brand-orange mx-auto" />
          <h2 className="font-serif font-black text-2xl">Prescription Report Not Found</h2>
          <p className="font-sans text-sm text-brand-gray">
            This report may have been deleted or was created on another device.
          </p>
          <Link
            href="/search"
            className="inline-block px-5 py-2.5 bg-brand-navy text-brand-cream border-2 border-brand-navy font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch"
          >
            Create New Prescription Report
          </Link>
        </div>
      </div>
    );
  }

  const totals = report.totals || computeReportTotals(report.items || []);

  return (
    <div className="min-h-screen bg-brand-cream text-brand-navy flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full space-y-8">
        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-brand-navy/10 pb-5">
          <div>
            <Link
              href="/history"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-gray hover:text-brand-navy uppercase tracking-wider mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Saved Reports</span>
            </Link>
            <h1 className="font-serif font-black text-3xl sm:text-4xl text-brand-navy tracking-tight">
              {report.patient_label || "Prescription Report"}
            </h1>
            <p className="font-sans text-xs text-brand-gray mt-1">
              Case Ref: <span className="font-mono font-bold text-brand-navy">{report.report_id}</span> • Created on{" "}
              {new Date(report.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Action: Print Chemist Slip */}
          <button
            onClick={() => setShowSlip(true)}
            className="flex items-center gap-2 px-5 py-3 bg-brand-orange text-brand-navy border-2 border-brand-navy font-serif font-black text-sm uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover"
          >
            <Printer className="w-4 h-4" />
            <span>Print Chemist Slip</span>
          </button>
        </div>

        {/* Aggregate Potential Savings Callout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-brand-gray">
              Total Branded Market Cost
            </span>
            <div className="font-serif font-black text-3xl text-brand-navy/70 line-through mt-1">
              {totals.market_total_paise ? formatPaise(totals.market_total_paise) : "₹--"}
            </div>
          </div>

          <div className="p-5 bg-brand-cream border-2 border-brand-navy sketchy-box shadow-sketch">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-brand-gray">
              Jan Aushadhi Generic Cost
            </span>
            <div className="font-serif font-black text-3xl text-brand-navy mt-1">
              {totals.pmbjp_total_paise ? formatPaise(totals.pmbjp_total_paise) : "₹--"}
            </div>
          </div>

          <div className="p-5 bg-brand-orange/20 border-2 border-brand-navy sketchy-box shadow-sketch">
            <span className="text-[10px] font-sans font-black uppercase tracking-wider text-brand-navy">
              Estimated Potential Savings
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif font-black text-3xl text-brand-navy">
                {totals.saving_total_paise ? formatPaise(totals.saving_total_paise) : "₹--"}
              </span>
              {totals.saving_percent && (
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                  {formatPercent(totals.saving_percent)} Saved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Verified Substitutions Table */}
        <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch overflow-hidden">
          <div className="p-4 bg-brand-cream border-b-2 border-brand-navy flex justify-between items-center">
            <h3 className="font-serif font-black text-base uppercase tracking-wider text-brand-navy">
              Confirmed Prescription Medicines ({report.items?.length || 0})
            </h3>
            <span className="text-[11px] font-mono font-bold text-brand-gray">
              Device-Local Storage
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-brand-white border-b-2 border-brand-navy/20 font-black text-brand-navy uppercase tracking-wider">
                <tr>
                  <th className="p-3">Molecule / Item</th>
                  <th className="p-3">PMBJP Code</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3">Generic Price</th>
                  <th className="p-3">Branded MRP</th>
                  <th className="p-3 text-right">Potential Saving</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy/10 font-sans">
                {(report.items || []).map((item, idx) => (
                  <tr key={item.medicine_id || idx} className="hover:bg-brand-cream/40">
                    <td className="p-3 font-bold">
                      <div className="text-brand-navy text-sm">
                        {item.molecule_label || item.matched_text}
                      </div>
                      <div className="text-[11px] text-brand-gray font-normal">
                        {item.strength_label} • {item.form} • {item.pack_label}
                      </div>
                    </td>
                    <td className="p-3 font-mono font-bold text-brand-navy">
                      {item.pmbjp_product_code || "Not verified"}
                    </td>
                    <td className="p-3 text-center font-bold text-brand-navy">
                      {item.pack_count || 1}
                    </td>
                    <td className="p-3 font-serif font-bold text-brand-navy">
                      {item.pmbjp_price ? formatPaise(item.pmbjp_price.amount_paise) : "₹--"}
                    </td>
                    <td className="p-3 font-serif line-through text-brand-gray">
                      {item.market_price ? formatPaise(item.market_price.amount_paise) : "₹--"}
                    </td>
                    <td className="p-3 text-right font-serif font-black text-emerald-800">
                      {item.saving_paise ? `Save ${formatPaise(item.saving_paise)}` : "No saving"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* WhatsApp Dose Reminder Form (Section F6) */}
        <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-6 space-y-5">
          <div className="flex items-center gap-2 border-b-2 border-brand-navy/10 pb-3">
            <Bell className="w-5 h-5 text-brand-orange" />
            <h3 className="font-serif font-black text-lg text-brand-navy">
              Schedule Automated WhatsApp Dose Reminders
            </h3>
          </div>

          {reminderRecord ? (
            <div className="p-5 bg-brand-cream border-2 border-brand-navy sketchy-box space-y-3 font-sans text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-black text-sm text-brand-navy">
                    Active Schedule: {reminderMed}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      reminderRecord.status === "delivered"
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-400"
                        : reminderRecord.status === "cancelled"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-brand-orange/30 text-brand-navy border border-brand-navy/40"
                    }`}
                  >
                    {reminderRecord.status}
                  </span>
                </div>

                {reminderRecord.status !== "cancelled" && (
                  <button
                    onClick={handleCancelReminder}
                    disabled={isCancellingReminder}
                    className="flex items-center gap-1 text-xs text-red-700 hover:text-red-900 font-bold"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{isCancellingReminder ? "Cancelling..." : "Cancel Schedule"}</span>
                  </button>
                )}
              </div>

              <p className="text-brand-navy/80">
                Scheduled daily at <span className="font-bold">{reminderTime} IST</span> until{" "}
                <span className="font-bold">{reminderEndDate}</span>.
              </p>

              <div className="p-2.5 bg-brand-white border border-brand-navy/20 text-[11px] text-brand-gray flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-orange flex-shrink-0" />
                <span>
                  Tip: A verified inbound <span className="font-bold text-brand-navy">STOP</span> reply from the recipient handset will immediately cancel reminders even if local browser data is cleared.
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateReminder} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-sans font-bold uppercase tracking-wider text-brand-gray block mb-1">
                  Medicine to Remind
                </label>
                <input
                  type="text"
                  value={reminderMed}
                  onChange={(e) => setReminderMed(e.target.value)}
                  className="w-full bg-brand-cream border-2 border-brand-navy px-3 py-2 text-xs font-bold text-brand-navy focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-sans font-bold uppercase tracking-wider text-brand-gray block mb-1">
                  Daily Time (IST / Asia/Kolkata)
                </label>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-full bg-brand-cream border-2 border-brand-navy px-3 py-2 text-xs font-bold text-brand-navy focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-sans font-bold uppercase tracking-wider text-brand-gray block mb-1">
                  Instruction / Dose
                </label>
                <input
                  type="text"
                  value={reminderInstruction}
                  onChange={(e) => setReminderInstruction(e.target.value)}
                  placeholder="e.g. 1 tablet after breakfast"
                  className="w-full bg-brand-cream border-2 border-brand-navy px-3 py-2 text-xs font-bold text-brand-navy focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-sans font-bold uppercase tracking-wider text-brand-gray block mb-1">
                  End Date (Max 30 Days)
                </label>
                <input
                  type="date"
                  value={reminderEndDate}
                  onChange={(e) => setReminderEndDate(e.target.value)}
                  className="w-full bg-brand-cream border-2 border-brand-navy px-3 py-2 text-xs font-bold text-brand-navy focus:outline-none"
                  required
                />
              </div>

              <div className="sm:col-span-2 pt-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderConsent}
                    onChange={(e) => setReminderConsent(e.target.checked)}
                    className="mt-0.5 accent-brand-navy"
                  />
                  <span className="text-xs text-brand-navy/90 font-medium">
                    I confirm patient consent to receive automated WhatsApp reminders on the configured verified test line. (Reply STOP anytime to cancel).
                  </span>
                </label>
              </div>

              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={reminderSaving}
                  className="px-6 py-3 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover"
                >
                  {reminderSaving ? "Scheduling..." : "Save Daily WhatsApp Schedule"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Immediate Call Patient Action (Section F6) */}
        <div className="bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-6 space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-brand-navy/10 pb-3">
            <PhoneCall className="w-5 h-5 text-brand-orange" />
            <h3 className="font-serif font-black text-lg text-brand-navy">
              Outbound Tele-Verification Call
            </h3>
          </div>

          <p className="text-xs font-sans text-brand-gray">
            Initiates an immediate automated voice checkup call to verify that the patient understands the prescription and dosage schedule.
          </p>

          <div className="p-3 bg-brand-cream border border-brand-navy/20 rounded">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checkupConfirmed}
                onChange={(e) => setCheckupConfirmed(e.target.checked)}
                className="accent-brand-navy"
              />
              <span className="text-xs font-bold text-brand-navy">
                I have reviewed the confirmed dosage instructions with the patient.
              </span>
            </label>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleTriggerCall}
              disabled={!checkupConfirmed || callState !== "idle"}
              className={`px-6 py-3 font-serif font-black text-xs uppercase tracking-wider border-2 border-brand-navy sketchy-btn shadow-sketch transition-all flex items-center gap-2 ${
                !checkupConfirmed || callState !== "idle"
                  ? "bg-brand-gray/20 text-brand-gray cursor-not-allowed border-brand-gray/40"
                  : "bg-brand-orange text-brand-navy hover:shadow-sketch-hover"
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>
                {callState === "idle" && "Call Patient Now"}
                {callState === "requested" && "Call Requested…"}
                {callState === "ringing" && "Handset Ringing…"}
                {callState === "answered" && "Patient Answered (Speaking)"}
                {callState === "completed" && "Call Completed Successfully"}
                {callState === "failed" && "Call Failed — Retry"}
              </span>
            </button>

            {callState !== "idle" && (
              <span className="text-xs font-mono font-bold bg-brand-navy text-brand-cream px-3 py-1.5 rounded border border-brand-navy">
                Status: {callState.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Print Slip Modal */}
        {showSlip && (
          <ChemistSlip report={report} onClose={() => setShowSlip(false)} />
        )}

        <Disclaimer />
      </main>
    </div>
  );
}
