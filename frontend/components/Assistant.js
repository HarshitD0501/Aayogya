"use client";

import { useEffect, useRef, useState } from "react";
import { askAssistant } from "@/lib/api";
import { useReveal } from "@/lib/gsap";
import { Card, Note } from "@/components/ui";
import LiveVoiceAgent from "@/components/LiveVoiceAgent";
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

// Aayogya Assistant: Combines real-time 2-way WebRTC Live Voice Agent
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
      setMessages(data.history);
      speakText(data.history[data.history.length - 1]?.text);
    } catch (e) {
      setErr(e.message); // keep the user bubble; surface the reason
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
            ? "Two-way live interactive voice call with sub-second latency and instant interruption."
            : "Ask about your medicines, safety checks, prices or next visit — type or talk."
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
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid var(--line-light)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                    Recent Text History ({messages.length} messages)
                  </span>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setMode("chat")}
                    style={{ fontSize: 12 }}
                  >
                    Open Full Chat
                  </button>
                </div>
                <div
                  style={{
                    maxHeight: 140,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {messages.slice(-3).map((m, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12.5,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: m.role === "user" ? "var(--brand-soft)" : "var(--surface-2)",
                        color: m.role === "user" ? "var(--brand-strong)" : "var(--ink)",
                      }}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--brand-soft)",
                borderRadius: 12,
                border: "1px solid rgba(37, 99, 235, 0.15)",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={16} color="#2563eb" />
                <span style={{ fontSize: 13, color: "var(--brand-strong)", fontWeight: 500 }}>
                  Want real-time two-way voice conversation?
                </span>
              </div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setMode("voice")}
                style={{ padding: "4px 10px", fontSize: 12, display: "inline-flex", gap: 5 }}
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

            {err && (
              <div style={{ marginTop: 10 }}>
                <Note tone="err">{err}</Note>
              </div>
            )}

            <form
              className="chat-input"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {srSupported && (
                <button
                  type="button"
                  className={`chat-mic ${listening ? "on" : ""}`.trim()}
                  onClick={toggleListen}
                  title="Speak your question"
                  disabled={busy}
                >
                  <Mic size={18} />
                </button>
              )}
              <input
                className="input"
                placeholder={listening ? "Listening…" : "Type your question…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy}
              />
              <button
                type="submit"
                className="btn btn-primary"
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
