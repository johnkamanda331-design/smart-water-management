import { useState } from "react";
import { WmsSettings, saveSettings, getStoredPin, setStoredPin, clearHistory } from "@/lib/storage";

interface Props {
  settings: WmsSettings;
  onSave: (s: WmsSettings) => void;
  onClose: () => void;
  isDark: boolean;
}

export default function SettingsModal({ settings, onSave, onClose, isDark }: Props) {
  const [local, setLocal] = useState<WmsSettings>({ ...settings });
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMsg, setPinMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<"thresholds" | "notifications" | "pin" | "calibration" | "data">("thresholds");

  const _bg    = isDark ? "#030712"           : "rgba(240,249,255,0.98)";
  const card   = isDark ? "rgba(15,23,42,0.98)" : "rgba(255,255,255,0.98)";
  const border = isDark ? "rgba(56,189,248,0.18)" : "rgba(6,182,212,0.3)";
  const text   = isDark ? "#e2e8f0"           : "#0c4a6e";
  const muted  = isDark ? "#64748b"           : "#0369a1";
  const inp    = isDark ? "rgba(255,255,255,0.05)" : "rgba(6,182,212,0.07)";
  const inpBdr = isDark ? "rgba(255,255,255,0.12)" : "rgba(6,182,212,0.3)";
  const tabActive = isDark ? "rgba(56,189,248,0.15)" : "rgba(6,182,212,0.15)";
  const accent = isDark ? "#38bdf8" : "#0369a1";

  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: inp, border: `1px solid ${inpBdr}`,
    borderRadius: 8, padding: "9px 12px", color: text, fontSize: 13, outline: "none", fontFamily: "inherit",
  };

  const handleSave = () => {
    saveSettings(local);
    onSave(local);
    onClose();
  };

  const handlePinChange = () => {
    if (oldPin !== getStoredPin()) { setPinMsg({ text: "Current PIN is incorrect.", ok: false }); return; }
    if (newPin.length < 4 || !/^\d+$/.test(newPin)) { setPinMsg({ text: "New PIN must be at least 4 digits.", ok: false }); return; }
    if (newPin !== confirmPin) { setPinMsg({ text: "PINs do not match.", ok: false }); return; }
    setStoredPin(newPin);
    setOldPin(""); setNewPin(""); setConfirmPin("");
    setPinMsg({ text: "PIN changed successfully.", ok: true });
  };

  const TABS: { id: typeof activeTab; label: string; icon: string }[] = [
    { id: "thresholds",    label: "Thresholds",     icon: "📊" },
    { id: "notifications", label: "Notifications",  icon: "🔔" },
    { id: "pin",           label: "Change PIN",      icon: "🔐" },
    { id: "calibration",  label: "Calibration",    icon: "📏" },
    { id: "data",          label: "Data",            icon: "💾" },
  ];

  const rowStyle: React.CSSProperties = { marginBottom: 16 };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: muted, display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: isDark ? "0 32px 64px rgba(0,0,0,0.7)" : "0 16px 48px rgba(6,182,212,0.2)" }}>

        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(6,182,212,0.05)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: text }}>⚙️ System Settings</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: muted }}>Configure thresholds, alerts, security & calibration</p>
          </div>
          <button onClick={onClose} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, width: 32, height: 32, color: "#ef4444", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "12px 16px 0", borderBottom: `1px solid ${border}`, background: isDark ? "rgba(255,255,255,0.01)" : "rgba(6,182,212,0.03)", overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding: "7px 13px", borderRadius: "8px 8px 0 0", border: `1px solid ${activeTab === t.id ? border : "transparent"}`, borderBottom: activeTab === t.id ? `1px solid ${card}` : undefined, background: activeTab === t.id ? tabActive : "transparent", color: activeTab === t.id ? accent : muted, fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", marginBottom: -1 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

          {/* ── Thresholds ── */}
          {activeTab === "thresholds" && (
            <div>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: muted }}>Set the water level percentages that trigger dry-run and overflow alerts.</p>
              <div style={rowStyle}>
                <label style={labelStyle}>🔴 Low-Level (Dry Run) Threshold — currently {local.lowThreshold}%</label>
                <input type="range" min={5} max={40} value={local.lowThreshold}
                  onChange={e => setLocal(s => ({ ...s, lowThreshold: Number(e.target.value) }))}
                  style={{ width: "100%" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: muted, marginTop: 3 }}><span>5%</span><span style={{ color: "#ef4444", fontWeight: 700 }}>{local.lowThreshold}%</span><span>40%</span></div>
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>🟢 High-Level (Overflow) Threshold — currently {local.highThreshold}%</label>
                <input type="range" min={60} max={99} value={local.highThreshold}
                  onChange={e => setLocal(s => ({ ...s, highThreshold: Number(e.target.value) }))}
                  style={{ width: "100%" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: muted, marginTop: 3 }}><span>60%</span><span style={{ color: "#22c55e", fontWeight: 700 }}>{local.highThreshold}%</span><span>99%</span></div>
              </div>
              <div style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 12, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(6,182,212,0.06)", border: `1px solid ${border}`, borderRadius: 10, padding: "12px 14px" }}>
                <input type="checkbox" id="autoPump" checked={local.autoPumpProtection}
                  onChange={e => setLocal(s => ({ ...s, autoPumpProtection: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#38bdf8", cursor: "pointer" }} />
                <label htmlFor="autoPump" style={{ fontSize: 13, color: text, cursor: "pointer" }}>
                  <strong>Auto Pump Protection</strong> — automatically turn pump OFF when dry-run is detected
                </label>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === "notifications" && (
            <div>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: muted }}>
                Push alerts via <strong style={{ color: accent }}>ntfy.sh</strong> — a free, open-source push notification service. Install the ntfy app on your phone and subscribe to your topic to receive alerts anywhere.
              </p>
              <div style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 12, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(6,182,212,0.06)", border: `1px solid ${border}`, borderRadius: 10, padding: "12px 14px" }}>
                <input type="checkbox" id="ntfyOn" checked={local.ntfyEnabled}
                  onChange={e => setLocal(s => ({ ...s, ntfyEnabled: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#38bdf8", cursor: "pointer" }} />
                <label htmlFor="ntfyOn" style={{ fontSize: 13, color: text, cursor: "pointer" }}>Enable push notifications</label>
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>ntfy.sh Topic (unique name — keep it private)</label>
                <input style={field} placeholder="e.g. my-water-system-abc123" value={local.ntfyTopic}
                  onChange={e => setLocal(s => ({ ...s, ntfyTopic: e.target.value.trim() }))} />
                <p style={{ margin: "6px 0 0", fontSize: 11, color: muted }}>
                  Subscribe at <code>ntfy.sh/{local.ntfyTopic || "your-topic"}</code> or in the ntfy mobile app.
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!local.ntfyTopic) return;
                  await fetch(`https://ntfy.sh/${local.ntfyTopic}`, { method: "POST", headers: { Title: "Test Alert", Tags: "droplet" }, body: "Water Management System test notification ✅" });
                  alert("Test notification sent!");
                }}
                disabled={!local.ntfyTopic}
                style={{ padding: "9px 16px", background: isDark ? "rgba(56,189,248,0.1)" : "rgba(6,182,212,0.1)", border: `1px solid ${accent}`, borderRadius: 8, color: accent, fontWeight: 600, fontSize: 13, cursor: local.ntfyTopic ? "pointer" : "not-allowed", opacity: local.ntfyTopic ? 1 : 0.5 }}>
                🔔 Send Test Notification
              </button>
            </div>
          )}

          {/* ── PIN ── */}
          {activeTab === "pin" && (
            <div>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: muted }}>Change your dashboard access PIN. Must be at least 4 digits.</p>
              {[
                { label: "Current PIN", val: oldPin, set: setOldPin, ph: "Enter current PIN" },
                { label: "New PIN", val: newPin, set: setNewPin, ph: "Enter new PIN (min 4 digits)" },
                { label: "Confirm New PIN", val: confirmPin, set: setConfirmPin, ph: "Re-enter new PIN" },
              ].map(f => (
                <div key={f.label} style={rowStyle}>
                  <label style={labelStyle}>{f.label}</label>
                  <input type="password" inputMode="numeric" maxLength={8} value={f.val}
                    onChange={e => { f.set(e.target.value.replace(/\D/g, "")); setPinMsg(null); }}
                    placeholder={f.ph} style={field} />
                </div>
              ))}
              {pinMsg && (
                <div style={{ marginBottom: 14, padding: "9px 14px", background: pinMsg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${pinMsg.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, fontSize: 13, color: pinMsg.ok ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {pinMsg.ok ? "✓" : "✕"} {pinMsg.text}
                </div>
              )}
              <button onClick={handlePinChange} style={{ padding: "10px 20px", background: "rgba(56,189,248,0.12)", border: `1px solid ${accent}`, borderRadius: 10, color: accent, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                🔐 Change PIN
              </button>
            </div>
          )}

          {/* ── Calibration ── */}
          {activeTab === "calibration" && (
            <div>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: muted }}>
                Enter your physical tank measurements so the dashboard can display accurate volume estimates. These values are stored locally and do not affect the ESP8266 firmware directly — update the constants in your <code>.ino</code> file to match.
              </p>
              <div style={rowStyle}>
                <label style={labelStyle}>Tank Height (cm) — full sensor range</label>
                <input type="number" min={10} max={500} value={local.tankHeightCm}
                  onChange={e => setLocal(s => ({ ...s, tankHeightCm: Number(e.target.value) }))}
                  style={field} />
              </div>
              <div style={{ background: isDark ? "rgba(56,189,248,0.05)" : "rgba(6,182,212,0.07)", border: `1px solid ${border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: muted }}>
                <strong style={{ color: accent }}>Recommended hardware upgrades:</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                  <li>Use <strong>JSN-SR04T</strong> (waterproof) instead of HC-SR04</li>
                  <li>Add a <strong>YF-S201 flow meter</strong> inline with your pump output</li>
                  <li>Wire flow meter signal → Arduino digital pin D2 (interrupt)</li>
                  <li>Update serial protocol: <code>LEVEL:75;DIST:25;DRY:0;OVERFLOW:1;FLOW:18;</code></li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Data ── */}
          {activeTab === "data" && (
            <div>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: muted }}>Manage locally stored sensor history. Up to 500 data points are kept.</p>
              <div style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(6,182,212,0.06)", border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: text }}>History is stored in your browser's localStorage. It persists across page refreshes but not across different browsers or devices.</p>
              </div>
              <button
                onClick={() => { clearHistory(); alert("History cleared."); }}
                style={{ padding: "9px 16px", background: "rgba(239,68,68,0.09)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                🗑️ Clear All History
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${border}`, display: "flex", justifyContent: "flex-end", gap: 10, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(6,182,212,0.04)" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", background: "transparent", border: `1px solid ${inpBdr}`, borderRadius: 9, color: muted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          {activeTab !== "pin" && activeTab !== "data" && (
            <button onClick={handleSave} style={{ padding: "9px 20px", background: isDark ? "rgba(56,189,248,0.15)" : "rgba(6,182,212,0.15)", border: `1px solid ${accent}`, borderRadius: 9, color: accent, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Save Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
