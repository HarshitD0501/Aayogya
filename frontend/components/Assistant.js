"use client";

import { useEffect, useRef, useState } from "react";
import { askAssistant, getAssistantHealth } from "@/lib/api";
import { useReveal } from "@/lib/gsap";
import { Card, Note } from "@/components/ui";
import dynamic from "next/dynamic";

const LiveVoiceAgent = dynamic(() => import("@/components/LiveVoiceAgent"), {
  ssr: false,
  loading: () => (
    <div className="p-8 text-center bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card max-w-lg mx-auto my-6">
      <div className="w-8 h-8 border-2 border-ui-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
      <p className="font-serif font-semibold text-ui-text">Initializing Live Voice System…</p>
    </div>
  ),
});
import {
  Mic,
  Send,
  Volume2,
  VolumeX,
  Bot,
  PhoneCall,
  MessageSquare,
  Sparkles,
} from "lucide-react";

// Ayogya Assistant: Combines real-time 2-way WebRTC Live Voice Agent
// (LiveKit + Deepgram Nova-3 + Gemini 2.5 + Murf Falcon) with text chat fallback.
const STARTERS = [
  "मेरी दवाइयाँ कौन सी हैं?",
  "Any dangerous interactions?",
  "Doctor ke paas kab jana hai?",
];

export default function Assistant({ patient }) {
  // 'voice' (default real-time 2-way voice call) or 'chat' (turn-by-turn text chat)
  const [mode, setMode] = useState("voice");
  const [messages, setMessages] = useState([]); // [{role:"user"|"model", text}]
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [assistantAvailable, setAssistantAvailable] = useState(null);
  const [healthCheckNonce, setHealthCheckNonce] = useState(0);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [lang, setLang] = useState("hi-IN");
  const [srSupported, setSrSupported] = useState(false);
  const logRef = useRef(null);
  const recRef = useRef(null);
  const sendRef = useRef(null);
  const scope = useReveal([]);

  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speakText = (text) => {
    if (!speak || !ttsSupported || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      window.speechSynthesis.speak(u);
    } catch {
      /* TTS unavailable — ignore, text is already on screen */
    }
  };

  const send = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setErr("");
    setInput("");
    const prior = messages;
    setMessages([...prior, { role: "user", text }]); // optimistic user bubble
    setBusy(true);
    try {
      const data = await askAssistant(text, prior);
      setAssistantAvailable(true);
      setMessages(data.history);
      speakText(data.history[data.history.length - 1]?.text);
    } catch (e) {
      const unavailable = e.message.toLowerCase().includes("text assistant is temporarily unavailable");
      if (unavailable) {
        setAssistantAvailable(false);
      } else {
        setErr(e.message); // keep the user bubble; surface the reason
      }
    } finally {
      setBusy(false);
    }
  };
  sendRef.current = send; // keep the recognizer's callback on the latest closure

  // Wire the Web Speech recognizer once for text chat dictation.
  useEffect(() => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;
    setSrSupported(true);
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript?.trim();
      if (t) sendRef.current?.(t);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* nothing to abort */
      }
    };
  }, []);

  // Check the backend's authenticated agent-health proxy while text chat is open.
  useEffect(() => {
    if (mode !== "chat") return undefined;
    let active = true;
    const check = async () => {
      try {
        const health = await getAssistantHealth();
        if (active) setAssistantAvailable(Boolean(health.available));
      } catch {
        if (active) setAssistantAvailable(false);
      }
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mode, healthCheckNonce, patient?.id]);

  // Autoscroll to the newest message in chat mode.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const toggleListen = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    try {
      rec.lang = lang;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const actions = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {/* Mode Switchers: Live Voice vs Text */}
      <div
        style={{
          display: "inline-flex",
          background: "var(--surface-2)",
          padding: 3,
          borderRadius: 10,
          border: "1px solid var(--line)",
          gap: 2,
        }}
      >
        <button
          className={`btn btn-sm ${mode === "voice" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("voice")}
          style={{
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 7,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <PhoneCall size={13} />
          <span>Live Voice</span>
        </button>
        <button
          className={`btn btn-sm ${mode === "chat" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("chat")}
          style={{
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 7,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <MessageSquare size={13} />
          <span>Text Chat</span>
        </button>
      </div>

      {mode === "chat" && (
        <>
          <button
            className="btn btn-sm"
            onClick={() => setLang((l) => (l === "hi-IN" ? "en-IN" : "hi-IN"))}
            title="Voice language"
          >
            {lang === "hi-IN" ? "हिंदी" : "English"}
          </button>
          {ttsSupported && (
            <button
              className={`btn btn-sm ${speak ? "btn-primary" : ""}`.trim()}
              onClick={() => {
                if (speak) window.speechSynthesis.cancel();
                setSpeak((s) => !s);
              }}
              title={speak ? "Replies are spoken aloud" : "Replies are silent"}
            >
              {speak ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div ref={scope} className="grid">
      <Card
        title={mode === "voice" ? "Sahayak Live Voice Agent" : "Sahayak Assistant"}
        sub={
          mode === "voice"
            ? "Two-way live interactive voice call for dosage timing, schedule check-in, and safety reminders."
            : "Ask about your medicines, dosage timing, safety checks or prices — clinical decisions stay with your doctor."
        }
        actions={actions}
      >
        {mode === "voice" ? (
          <div>
            {/* Live 2-Way Voice Agent Interface */}
            <LiveVoiceAgent
              patient={patient}
              onSwitchToChat={() => setMode("chat")}
            />

            {/* Quick Starters & Recent Context */}
            {messages.length > 0 && (
              <div className="mt-4 pt-4 border-t border-ui-border-decorative space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-ui-text-secondary">
                    Recent Text History ({messages.length} messages)
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-ui-blue hover:underline"
                    onClick={() => setMode("chat")}
                  >
                    Open Full Chat
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {messages.slice(-3).map((m, i) => (
                    <div
                      key={i}
                      className={`text-xs p-2 rounded-lg border ${
                        m.role === "user"
                          ? "bg-ui-surface-subtle text-ui-blue font-medium border-ui-border-decorative"
                          : "bg-ui-surface text-ui-text font-normal border-ui-border-decorative"
                      }`}
                    >
                      <strong>{m.role === "user" ? "You: " : "Sahayak: "}</strong>
                      {m.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="chat">
            {/* Quick switch banner in chat mode */}
            <div className="flex items-center justify-between p-3 bg-ui-surface-subtle border border-ui-border-decorative rounded-xl mb-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-ui-blue" />
                <span className="text-xs font-semibold text-ui-text">
                  Want real-time two-way voice conversation?
                </span>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
                onClick={() => setMode("voice")}
              >
                <PhoneCall size={12} />
                <span>Start Live Call</span>
              </button>
            </div>

            <div className="chat-log" ref={logRef}>
              {messages.length === 0 ? (
                <div className="chat-greeting">
                  <div className="chat-bot-badge">
                    <Bot size={22} />
                  </div>
                  <p>
                    Namaste{patient?.name ? `, ${patient.name.split(" ")[0]}` : ""}! Main aapki
                    medicines, safety aur prices mein madad karta hoon. Poochhiye ya boliye.
                  </p>
                  <div className="chat-starters">
                    {STARTERS.map((s) => (
                      <button key={s} className="chat-chip" onClick={() => send(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`chat-msg ${m.role}`}>
                    {m.text}
                  </div>
                ))
              )}
              {busy && (
                <div className="chat-msg model chat-typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>

            {assistantAvailable === false && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-between gap-3 p-3 mt-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs shadow-xs"
              >
                <span className="font-medium">
                  Text assistant is temporarily unavailable. Try again shortly or switch to Live Voice.
                </span>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-rose-800 hover:bg-rose-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex-shrink-0"
                  onClick={() => setHealthCheckNonce((n) => n + 1)}
                >
                  Retry
                </button>
              </div>
            )}

            {err && (
              <div style={{ marginTop: 10 }}>
                <Note tone="err">{err}</Note>
              </div>
            )}

            <form
              className="flex items-center gap-2 pt-3 border-t border-ui-border-decorative mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {srSupported && (
                <button
                  type="button"
                  className={`p-2.5 rounded-lg border transition-colors ${
                    listening
                      ? "bg-rose-600 text-white border-rose-600 animate-pulse"
                      : "bg-ui-surface-subtle text-ui-text hover:text-ui-blue border-ui-border-decorative"
                  }`}
                  onClick={toggleListen}
                  title="Speak your question"
                  disabled={busy}
                >
                  <Mic size={18} />
                </button>
              )}
              <input
                className="flex-1 bg-ui-surface border border-ui-control-border rounded-lg px-3.5 py-2 text-sm text-ui-text placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue"
                placeholder={listening ? "Listening…" : "Type your question…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy}
              />
              <button
                type="submit"
                className="px-4 py-2 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                disabled={busy || !input.trim()}
                title="Send"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
