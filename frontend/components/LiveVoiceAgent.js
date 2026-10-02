"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { getVoiceToken } from "@/lib/api";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  Sparkles,
  Activity,
  AlertCircle,
  RefreshCw,
  MessageSquare
} from "lucide-react";

export default function LiveVoiceAgent({ patient, onSwitchToChat }) {
  // Call status: 'idle' | 'connecting' | 'connected' | 'error'
  const [callState, setCallState] = useState("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [roomInfo, setRoomInfo] = useState(null);

  const roomRef = useRef(null);
  const audioContainerRef = useRef(null);
  const timerRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Canvas visualizer loop
  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const analyser = analyserRef.current;
    if (!analyser || !ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      setUserSpeaking(avg > 18);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 36;
      const barWidth = 4;
      const gap = 5;
      const totalWidth = barCount * (barWidth + gap);
      const startX = (canvas.width - totalWidth) / 2;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * (bufferLength * 0.6));
        const val = dataArray[dataIndex] || 0;
        const normalized = val / 255;
        const minHeight = 6;
        const barHeight = Math.max(minHeight, normalized * 65);

        const x = startX + i * (barWidth + gap);
        const y = (canvas.height - barHeight) / 2;

        // Gradient color based on agent vs user speaking
        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (agentSpeaking) {
          grad.addColorStop(0, "#10b981");
          grad.addColorStop(1, "#059669");
        } else if (normalized > 0.15) {
          grad.addColorStop(0, "#3b82f6");
          grad.addColorStop(1, "#1d4ed8");
        } else {
          grad.addColorStop(0, "#94a3b8");
          grad.addColorStop(1, "#cbd5e1");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    };

    render();
  }, [agentSpeaking]);

  // Cleanup WebRTC room and audio resources
  const cleanupCall = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    }
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch {
        /* ignore */
      }
      roomRef.current = null;
    }
    if (audioContainerRef.current) {
      audioContainerRef.current.innerHTML = "";
    }
    setAgentSpeaking(false);
    setUserSpeaking(false);
  }, []);

  // Connect to LiveKit Room
  const startCall = async () => {
    try {
      cleanupCall();
      setErrorMsg("");
      setCallState("connecting");

      // 1. Get LiveKit room token
      const creds = await getVoiceToken();
      if (!creds?.url || !creds?.token) {
        throw new Error("Invalid voice token received from server.");
      }

      if (creds.url.includes("your-project.livekit.cloud")) {
        throw new Error(
          "LiveKit Cloud URL is not yet configured. Please set a valid LIVEKIT_URL in backend/.env & agent/.env (e.g., wss://your-actual-project.livekit.cloud)."
        );
      }

      setRoomInfo(creds);

      // 2. Initialize Room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // 3. Audio visualizer setup
      let audioCtx = null;
      let analyser = null;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.8;
          audioCtxRef.current = audioCtx;
          analyserRef.current = analyser;
        }
      } catch (e) {
        console.warn("AudioContext init error:", e);
      }

      // Handle subscribed tracks (agent's voice)
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio || track.kind === "audio") {
          const el = track.attach();
          el.autoplay = true;
          if (audioContainerRef.current) {
            audioContainerRef.current.appendChild(el);
          }

          // If AudioContext exists, route incoming agent audio into analyser
          if (audioCtx && analyser && track.mediaStreamTrack) {
            try {
              if (audioCtx.state === "suspended") {
                audioCtx.resume();
              }
              const stream = new MediaStream([track.mediaStreamTrack]);
              const source = audioCtx.createMediaStreamSource(stream);
              source.connect(analyser);
            } catch (err) {
              console.warn("Failed to connect agent audio to analyser:", err);
            }
          }
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

      // Active speaker detection
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const isAgentTalking = speakers.some((s) => !s.isLocal);
        setAgentSpeaking(isAgentTalking);
      });

      room.on(RoomEvent.Disconnected, () => {
        cleanupCall();
        setCallState("idle");
      });

      // 4. Connect to WebRTC room
      await room.connect(creds.url, creds.token);

      // 5. Enable Local Microphone & publish track
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);

      // Connect local mic to analyser as well
      const localTrackPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (localTrackPub?.track?.mediaStreamTrack && audioCtx && analyser) {
        try {
          if (audioCtx.state === "suspended") {
            audioCtx.resume();
          }
          const localStream = new MediaStream([localTrackPub.track.mediaStreamTrack]);
          const localSource = audioCtx.createMediaStreamSource(localStream);
          localSource.connect(analyser);
        } catch (e) {
          console.warn("Local mic analyser connect error:", e);
        }
      }

      setCallState("connected");
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      // Start drawing frequency bars
      drawVisualizer();
    } catch (err) {
      console.error("LiveKit connection error:", err);
      cleanupCall();
      setCallState("error");
      setErrorMsg(
        err.message ||
          "Could not establish live audio connection. Please verify LiveKit service is reachable."
      );
    }
  };

  // Toggle Mute
  const toggleMute = async () => {
    if (!roomRef.current || callState !== "connected") return;
    try {
      const nextMute = !isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!nextMute);
      setIsMuted(nextMute);
    } catch (err) {
      console.error("Failed to toggle mute:", err);
    }
  };

  // End Call
  const endCall = () => {
    cleanupCall();
    setCallState("idle");
  };

  // Clean on unmount
  useEffect(() => {
    return () => cleanupCall();
  }, [cleanupCall]);

  return (
    <div className="voice-agent-container">
      {/* Hidden audio element container for remote agent voice stream */}
      <div ref={audioContainerRef} style={{ display: "none" }} />

      {/* Main Voice Agent Card */}
      <div className="voice-card">
        {/* Top Header Bar */}
        <div className="voice-card-top">
          <div className="voice-status-pill">
            <span
              className={`voice-indicator ${
                callState === "connected"
                  ? agentSpeaking
                    ? "speaking"
                    : "listening"
                  : callState === "connecting"
                  ? "connecting"
                  : "idle"
              }`}
            />
            <span className="voice-status-label">
              {callState === "connected"
                ? agentSpeaking
                  ? "Sahayak Speaking…"
                  : userSpeaking
                  ? "Listening to you…"
                  : "Live 2-Way Connected"
                : callState === "connecting"
                ? "Connecting WebRTC Audio…"
                : callState === "error"
                ? "Connection Error"
                : "Live Voice Assistant"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {callState === "connected" && (
              <span className="voice-timer">{formatTime(callDuration)}</span>
            )}
            {onSwitchToChat && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={onSwitchToChat}
                title="Switch to Text Chat"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <MessageSquare size={14} />
                <span>Text Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Center Display: Interactive Orb & Waveform */}
        <div className="voice-center">
          <div
            className={`voice-orb ${
              callState === "connected"
                ? agentSpeaking
                  ? "orb-agent"
                  : userSpeaking
                  ? "orb-user"
                  : "orb-active"
                : callState === "connecting"
                ? "orb-connecting"
                : "orb-idle"
            }`}
          >
            <div className="voice-orb-glow" />
            <div className="voice-orb-inner">
              {callState === "connected" ? (
                agentSpeaking ? (
                  <Radio size={36} className="orb-icon pulse" />
                ) : (
                  <Mic size={36} className="orb-icon" />
                )
              ) : callState === "connecting" ? (
                <RefreshCw size={36} className="orb-icon spin" />
              ) : (
                <Sparkles size={36} className="orb-icon" />
              )}
            </div>
          </div>

          {/* Dynamic Audio Visualizer Canvas */}
          <div className="voice-visualizer-wrap">
            <canvas
              ref={canvasRef}
              width={340}
              height={70}
              className={`voice-canvas ${callState === "connected" ? "visible" : ""}`}
            />
            {callState === "idle" && (
              <div className="voice-idle-text">
                <h3>Talk with Sahayak Live</h3>
                <p>
                  Speak naturally in Hindi, Hinglish, or English. Instant voice answers for your
                  medicines, dosage timing, and safety interactions.
                </p>
              </div>
            )}
            {callState === "connecting" && (
              <div className="voice-idle-text">
                <h3>Establishing Live Call…</h3>
                <p>Joining room & warming up Deepgram STT + Gemini + Murf Falcon TTS pipeline.</p>
              </div>
            )}
            {callState === "connected" && (
              <div className="voice-call-hint">
                {agentSpeaking ? (
                  <span style={{ color: "#059669", fontWeight: 600 }}>
                    Speaking • Speak anytime to interrupt (Instant Barge-in)
                  </span>
                ) : isMuted ? (
                  <span style={{ color: "#dc2626", fontWeight: 600 }}>
                    Microphone is muted — click unmute to speak
                  </span>
                ) : (
                  <span style={{ color: "#2563eb", fontWeight: 600 }}>
                    Listening • Ask: &quot;Meri dawaiyan kab leni hain?&quot; or &quot;Any drug interactions?&quot;
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error message presentation */}
        {callState === "error" && (
          <div className="voice-error-box">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, color: "#991b1b", fontSize: 14 }}>
                  Voice Call Unavailable
                </div>
                <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 4 }}>
                  {errorMsg}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                  💡 <strong>Tip:</strong> Ensure LiveKit Cloud URL & API keys are set in <code>.env</code> and the voice worker is running (<code>python voice.py dev</code>). You can also use the text chat anytime.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="voice-controls">
          {callState === "idle" || callState === "error" ? (
            <button
              className="btn btn-primary btn-call-start"
              onClick={startCall}
              title="Start Live 2-Way Voice Call"
            >
              <PhoneCall size={18} />
              <span>Start Live Voice Call</span>
            </button>
          ) : callState === "connecting" ? (
            <button className="btn btn-outline" onClick={endCall} title="Cancel Call">
              <PhoneOff size={16} />
              <span>Cancel</span>
            </button>
          ) : (
            <div className="voice-active-actions">
              <button
                className={`voice-action-btn ${isMuted ? "muted" : ""}`}
                onClick={toggleMute}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                <span>{isMuted ? "Unmute" : "Mute"}</span>
              </button>

              <button
                className="voice-action-btn hangup"
                onClick={endCall}
                title="Hang up call"
              >
                <PhoneOff size={20} />
                <span>End Call</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Feature Highlights */}
        <div className="voice-features-footer">
          <div className="voice-feat">
            <span className="feat-dot green" />
            <span>Sub-second Latency (~300ms)</span>
          </div>
          <div className="voice-feat">
            <span className="feat-dot blue" />
            <span>Deepgram Nova-3 Hindi/English</span>
          </div>
          <div className="voice-feat">
            <span className="feat-dot purple" />
            <span>Murf Falcon Realtime TTS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
