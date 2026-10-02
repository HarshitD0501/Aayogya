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
  Calendar,
  Search,
  BookOpen,
  ShieldAlert,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
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

function Slot({ label, Icon, color, meds }) {
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
        <div className="med" key={i}>
          {m.brand}
          <small>
            {" "}
            · {m.salt || "—"}
            {m.strength ? ` ${m.strength}` : ""}
          </small>
        </div>
      ))}
    </div>
  );
}

export function Summary() {
  const { loading, error, data } = useData("/summary");
  const scope = useReveal([loading, data]);
  if (loading) return <Loader label="Loading your clinical overview…" />;
  if (error) return <Note tone="err">{error}</Note>;

  const t = data.tracking;
  const s = data.schedule;

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
          icon={<Bell size={20} />}
          label="Total reminders sent"
          value={t.reminders_sent}
        />
      </div>

      <Card
        title="Daily Dose Schedule"
        sub="Personalized regimen based on doctors' prescriptions"
      >
        <div className="schedule">
          {SLOTS.map(({ key, label, Icon, color }) => (
            <Slot
              key={key}
              label={label}
              Icon={Icon}
              color={color}
              meds={s[key]}
            />
          ))}
        </div>
      </Card>

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

function MedCard({ m }) {
  const best = m.prices?.matched ? m.prices.offers[0] : null;
  return (
    <Card
      title={m.brand}
      sub={medLine(m)}
      actions={m.needs_salt_confirmation ? <Pill tone="warn">confirm salt</Pill> : null}
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
    </Card>
  );
}

export function Medicines() {
  const { loading, error, data } = useData("/medicines");
  const scope = useReveal([loading, data]);
  if (loading) return <Loader label="Retrieving active prescription list…" />;
  if (error) return <Note tone="err">{error}</Note>;
  if (!data.length)
    return <Empty icon="💊">No active medicines found. Upload a prescription to get started.</Empty>;
  return (
    <div ref={scope} className="grid cols-2">
      {data.map((m) => (
        <MedCard key={m.id} m={m} />
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
