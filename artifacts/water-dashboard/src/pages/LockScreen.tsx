import { useState, useEffect, useRef, useCallback } from "react";
import { getStoredPin } from "@/lib/storage";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;
const SESSION_KEY = "wms_auth_ts";
const SESSION_TTL_MS = 30 * 60 * 1000;

interface Props {
  onUnlock: () => void;
  isDark: boolean;
}

export function saveSession() {
  sessionStorage.setItem(SESSION_KEY, String(Date.now()));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isSessionValid(): boolean {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  return Date.now() - Number(raw) < SESSION_TTL_MS;
}

export default function LockScreen({ onUnlock, isDark }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockoutLeft, setLockoutLeft] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bg     = isDark ? "linear-gradient(145deg,#030712 0%,#0c1a2e 60%,#030712 100%)" : "linear-gradient(145deg,#0ea5e9 0%,#38bdf8 18%,#bae6fd 40%,#ffffff 60%,#e0f7fa 80%,#06b6d4 100%)";
  const card   = isDark ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.85)";
  const border = isDark ? "rgba(56,189,248,0.18)" : "rgba(6,182,212,0.35)";
  const text   = isDark ? "#e2e8f0" : "#0c4a6e";
  const muted  = isDark ? "#64748b" : "#0369a1";
  const accent = isDark ? "#38bdf8" : "#0369a1";
  const dotActive = accent;
  const dotEmpty  = isDark ? "rgba(255,255,255,0.12)" : "rgba(6,182,212,0.2)";

  const startLockout = useCallback(() => {
    setLockoutLeft(LOCKOUT_SECONDS);
    timerRef.current = setInterval(() => {
      setLockoutLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); setAttempts(0); setError(""); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  useEffect(() => { inputRef.current?.focus(); }, [lockoutLeft]);

  const submitPin = useCallback((value: string) => {
    if (lockoutLeft > 0 || value.length < 4) return;
    if (value === getStoredPin()) {
      saveSession();
      setError("");
      onUnlock();
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 600);
      if (next >= MAX_ATTEMPTS) {
        setError(`Too many failed attempts. Locked for ${LOCKOUT_SECONDS}s.`);
        startLockout();
      } else {
        setError(`Incorrect PIN. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? "" : "s"} remaining.`);
      }
    }
  }, [attempts, lockoutLeft, onUnlock, startLockout]);

  const handleKey = (digit: string) => {
    if (lockoutLeft > 0) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4) submitPin(next);
  };

  const handleBackspace = () => { setPin(p => p.slice(0, -1)); setError(""); };
  const isLockedOut = lockoutLeft > 0;

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter,system-ui,sans-serif", padding: 16, transition: "background 0.4s" }}>

      {/* Logo */}
      <div style={{ marginBottom: 26, textAlign: "center" }}>
        <div style={{ width: 70, height: 70, margin: "0 auto 12px", filter: "drop-shadow(0 4px 16px rgba(56,189,248,0.45))" }}>
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="lsDrop" x1="16" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38bdf8"/><stop offset="55%" stopColor="#0891b2"/><stop offset="100%" stopColor="#0e7490"/>
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill={isDark ? "#082f49" : "#0c4a6e"}/>
            <path d="M32 6C32 6 10 30 10 42C10 53.05 20.06 62 32 62C43.94 62 54 53.05 54 42C54 30 32 6 32 6Z" fill="url(#lsDrop)" opacity="0.95"/>
            <path d="M10 47Q18 43 26 47Q34 51 42 47Q50 43 54 47L54 62L10 62Z" fill="#0ea5e9" opacity="0.45"/>
            <g stroke="#bae6fd" strokeWidth="1.2" strokeLinecap="round" opacity="0.7">
              <line x1="20" y1="36" x2="44" y2="36"/><line x1="20" y1="36" x2="20" y2="28"/>
              <line x1="44" y1="36" x2="44" y2="28"/><line x1="32" y1="36" x2="32" y2="43"/>
            </g>
            <circle cx="20" cy="28" r="2.2" fill="#7dd3fc"/>
            <circle cx="44" cy="28" r="2.2" fill="#7dd3fc"/>
            <circle cx="32" cy="43" r="2.5" fill="#7dd3fc"/>
            <path d="M26 22Q32 17 38 22" stroke="#e0f7fa" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8"/>
            <circle cx="32" cy="32" r="30" stroke="#38bdf8" strokeWidth="1.5" fill="none" opacity="0.3"/>
          </svg>
        </div>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: text, letterSpacing: "-0.01em" }}>Smart Water Management</h1>
        <p style={{ margin: "5px 0 0", fontSize: 12, color: muted }}>Secure Access Required</p>
      </div>

      {/* PIN card */}
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: "28px 26px", width: "100%", maxWidth: 330, backdropFilter: "blur(16px)", boxShadow: isDark ? "0 24px 48px rgba(0,0,0,0.6)" : "0 12px 40px rgba(6,182,212,0.2)", animation: shake ? "shake 0.55s ease" : "none" }}>

        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 14 }}>🔒 Enter PIN to access dashboard</div>
          <div style={{ display: "flex", gap: 13, justifyContent: "center", marginBottom: 18 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 13, height: 13, borderRadius: "50%", background: pin.length > i ? dotActive : dotEmpty, border: `2px solid ${pin.length > i ? dotActive : isDark ? "rgba(255,255,255,0.2)" : "rgba(6,182,212,0.3)"}`, transition: "background 0.15s, transform 0.1s", transform: pin.length === i + 1 ? "scale(1.25)" : "scale(1)", boxShadow: pin.length > i ? `0 0 8px ${dotActive}66` : "none" }} />
            ))}
          </div>
          <input ref={inputRef} type="password" inputMode="numeric" maxLength={4} value={pin}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(v); setError("");
              if (v.length === 4) submitPin(v);
            }}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
            readOnly={isLockedOut} />
        </div>

        {(error || isLockedOut) && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 9, padding: "8px 13px", marginBottom: 14, textAlign: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#ef4444" }}>
              {isLockedOut ? `🔒 Locked — retry in ${lockoutLeft}s` : `⚠️ ${error}`}
            </span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => {
            if (k === "") return <div key={i} />;
            const isBack = k === "⌫";
            return (
              <button key={k + i} onClick={() => isBack ? handleBackspace() : handleKey(k)} disabled={isLockedOut}
                style={{ padding: "15px 0", background: isBack ? (isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.08)") : (isDark ? "rgba(255,255,255,0.05)" : "rgba(6,182,212,0.09)"), border: `1px solid ${isBack ? "rgba(239,68,68,0.2)" : border}`, borderRadius: 11, color: isBack ? "#ef4444" : text, fontSize: isBack ? 17 : 19, fontWeight: 700, cursor: isLockedOut ? "not-allowed" : "pointer", opacity: isLockedOut ? 0.45 : 1, transition: "all 0.15s", fontFamily: "inherit" }}
                onMouseDown={e => { e.currentTarget.style.transform = "scale(0.93)"; e.currentTarget.style.opacity = "0.7"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.opacity = isLockedOut ? "0.45" : "1"; }}>
                {k}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 18, padding: "9px 13px", background: isDark ? "rgba(56,189,248,0.06)" : "rgba(6,182,212,0.08)", border: `1px solid ${isDark ? "rgba(56,189,248,0.15)" : "rgba(6,182,212,0.2)"}`, borderRadius: 9, textAlign: "center" }}>
          <span style={{ fontSize: 11, color: muted }}>
            Default PIN: <strong style={{ color: accent, letterSpacing: "0.15em" }}>1234</strong> &nbsp;·&nbsp; Change in Settings → Change PIN
          </span>
        </div>
      </div>

      {/* Security badges */}
      <div style={{ marginTop: 16, maxWidth: 330, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {[{ icon: "🔐", label: "PIN Protected" }, { icon: "⏱️", label: "30-min Session" }, { icon: "🚫", label: `${MAX_ATTEMPTS}-try Lockout` }, { icon: "📋", label: "Audit Logging" }].map(f => (
          <div key={f.label} style={{ background: isDark ? "rgba(15,23,42,0.6)" : "rgba(255,255,255,0.55)", border: `1px solid ${border}`, borderRadius: 11, padding: "9px 13px", display: "flex", alignItems: "center", gap: 7, backdropFilter: "blur(8px)" }}>
            <span style={{ fontSize: 14 }}>{f.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: muted }}>{f.label}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-8px)} 30%{transform:translateX(8px)} 45%{transform:translateX(-6px)} 60%{transform:translateX(6px)} 75%{transform:translateX(-3px)} 90%{transform:translateX(3px)} }
      `}</style>
    </div>
  );
}
