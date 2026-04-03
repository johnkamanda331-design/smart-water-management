import { useEffect, useRef, useState, useCallback } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

interface SensorData {
  level: number;
  distance: number;
  dry: number;
  overflow: number;
}

const DEMO_MODE = true;

function getSimulatedData(): SensorData {
  const t = Date.now() / 5000;
  const level = Math.min(100, Math.max(0, Math.round(50 + 40 * Math.sin(t))));
  return {
    level,
    distance: Math.round(((100 - level) / 100) * 50),
    dry: level < 10 ? 1 : 0,
    overflow: level > 90 ? 1 : 0,
  };
}

/* ─── Theme tokens ─────────────────────────────────────────────── */
function getTheme(dark: boolean) {
  if (dark) {
    return {
      page: "#030712",
      headerBg: "rgba(15,23,42,0.85)",
      headerBorder: "rgba(255,255,255,0.07)",
      cardBg: "rgba(15,23,42,0.85)",
      cardBorder: "rgba(255,255,255,0.08)",
      text: "#e2e8f0",
      textMuted: "#64748b",
      textSub: "#475569",
      tickBg: "rgba(255,255,255,0.18)",
      progressTrack: "rgba(255,255,255,0.07)",
      metricCardBg: "rgba(255,255,255,0.03)",
      metricCardBorder: "rgba(255,255,255,0.07)",
      pumpStatusBg: "rgba(255,255,255,0.03)",
      pumpStatusBorder: "rgba(255,255,255,0.07)",
      footerBg: "rgba(15,23,42,0.6)",
      footerBorder: "rgba(56,189,248,0.15)",
      footerText: "#64748b",
      tankOutline: "rgba(255,255,255,0.15)",
      tankInner: "rgba(255,255,255,0.03)",
      chartGrid: "rgba(255,255,255,0.04)",
      chartLegend: "#94a3b8",
      chartTooltipBg: "rgba(15,23,42,0.9)",
      chartTooltipTitle: "#e2e8f0",
      chartTooltipBody: "#94a3b8",
      accentBlue: "#38bdf8",
      accentPurple: "#a78bfa",
      noteCode: "rgba(56,189,248,0.1)",
      noteCodeText: "#7dd3fc",
      toggleBg: "rgba(255,255,255,0.07)",
      toggleBorder: "rgba(255,255,255,0.12)",
      toggleText: "#94a3b8",
      overrideCardBg: "rgba(251,191,36,0.05)",
      overrideCardBorder: "rgba(251,191,36,0.2)",
    };
  }
  return {
    page: "linear-gradient(145deg, #0ea5e9 0%, #38bdf8 18%, #bae6fd 38%, #ffffff 58%, #e0f7fa 78%, #06b6d4 100%)",
    headerBg: "rgba(255,255,255,0.75)",
    headerBorder: "rgba(6,182,212,0.35)",
    cardBg: "rgba(255,255,255,0.82)",
    cardBorder: "rgba(6,182,212,0.28)",
    text: "#0c4a6e",
    textMuted: "#0369a1",
    textSub: "#0891b2",
    tickBg: "rgba(6,182,212,0.45)",
    progressTrack: "rgba(6,182,212,0.18)",
    metricCardBg: "rgba(186,230,253,0.55)",
    metricCardBorder: "rgba(6,182,212,0.35)",
    pumpStatusBg: "rgba(186,230,253,0.55)",
    pumpStatusBorder: "rgba(6,182,212,0.35)",
    footerBg: "rgba(255,255,255,0.65)",
    footerBorder: "rgba(6,182,212,0.4)",
    footerText: "#0369a1",
    tankOutline: "rgba(6,182,212,0.55)",
    tankInner: "rgba(186,230,253,0.45)",
    chartGrid: "rgba(6,182,212,0.14)",
    chartLegend: "#0369a1",
    chartTooltipBg: "rgba(255,255,255,0.96)",
    chartTooltipTitle: "#0c4a6e",
    chartTooltipBody: "#0369a1",
    accentBlue: "#0369a1",
    accentPurple: "#6d28d9",
    noteCode: "rgba(6,182,212,0.15)",
    noteCodeText: "#075985",
    toggleBg: "rgba(6,182,212,0.14)",
    toggleBorder: "rgba(6,182,212,0.4)",
    toggleText: "#0369a1",
    overrideCardBg: "rgba(251,191,36,0.1)",
    overrideCardBorder: "rgba(245,158,11,0.35)",
  };
}

/* ─── Manual Override types ─────────────────────────────────────── */
type OverrideMode = "none" | "force_on" | "force_off" | "bypass_dry" | "bypass_overflow" | "emergency_stop";

const OVERRIDE_OPTIONS: { id: OverrideMode; label: string; desc: string; color: string; icon: string }[] = [
  { id: "force_on",        label: "Force Pump ON",       desc: "Keep pump running regardless of sensor state", color: "#22c55e", icon: "⚡" },
  { id: "force_off",       label: "Force Pump OFF",      desc: "Stop pump and lock it off regardless of auto logic", color: "#ef4444", icon: "⛔" },
  { id: "bypass_dry",      label: "Bypass Dry Run",      desc: "Ignore dry run sensor (use if sensor is faulty)", color: "#f59e0b", icon: "🔧" },
  { id: "bypass_overflow", label: "Bypass Overflow",     desc: "Ignore overflow sensor (use if sensor is faulty)", color: "#f59e0b", icon: "🔧" },
  { id: "emergency_stop",  label: "Emergency Stop",      desc: "Halt all operations immediately and lock system", color: "#dc2626", icon: "🚨" },
];

export default function Dashboard() {
  const [isDark, setIsDark] = useState(true);
  const T = getTheme(isDark);

  const [data, setData] = useState<SensorData>({ level: 0, distance: 0, dry: 0, overflow: 0 });
  const [pumpStatus, setPumpStatus] = useState<"ON" | "OFF" | "unknown">("unknown");
  const [pumpLoading, setPumpLoading] = useState(false);
  const [connectionOk, setConnectionOk] = useState(DEMO_MODE);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  /* override state */
  const [overrideMode, setOverrideMode] = useState<OverrideMode>("none");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideLog, setOverrideLog] = useState<{ time: string; mode: string; reason: string }[]>([]);
  const [showOverride, setShowOverride] = useState(false);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const historyLabels = useRef<string[]>([]);
  const historyData = useRef<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevAlerts = useRef({ dry: 0, overflow: 0 });

  const updateChart = useCallback((level: number) => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    historyLabels.current.push(now);
    historyData.current.push(level);
    if (historyLabels.current.length > 20) { historyLabels.current.shift(); historyData.current.shift(); }
    if (chartInstance.current) {
      chartInstance.current.data.labels = [...historyLabels.current];
      chartInstance.current.data.datasets[0].data = [...historyData.current];
      chartInstance.current.update("none");
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (overrideMode === "emergency_stop") return;
    if (DEMO_MODE) {
      const s = getSimulatedData();
      const effective: SensorData = {
        ...s,
        dry: overrideMode === "bypass_dry" ? 0 : s.dry,
        overflow: overrideMode === "bypass_overflow" ? 0 : s.overflow,
      };
      setData(effective);
      setConnectionOk(true);
      setLastUpdated(new Date());
      updateChart(effective.level);
      if (effective.dry && !prevAlerts.current.dry) setAlertMsg("Dry Run Detected!");
      else if (effective.overflow && !prevAlerts.current.overflow) setAlertMsg("Overflow Detected!");
      prevAlerts.current = { dry: effective.dry, overflow: effective.overflow };
      return;
    }
    try {
      const res = await fetch("/data");
      if (!res.ok) throw new Error("Bad response");
      const json: SensorData = await res.json();
      const effective: SensorData = {
        ...json,
        dry: overrideMode === "bypass_dry" ? 0 : json.dry,
        overflow: overrideMode === "bypass_overflow" ? 0 : json.overflow,
      };
      setData(effective);
      setConnectionOk(true);
      setLastUpdated(new Date());
      updateChart(effective.level);
      if (effective.dry && !prevAlerts.current.dry) setAlertMsg("Dry Run Detected!");
      else if (effective.overflow && !prevAlerts.current.overflow) setAlertMsg("Overflow Detected!");
      else if (!effective.dry && !effective.overflow) setAlertMsg(null);
      prevAlerts.current = { dry: effective.dry, overflow: effective.overflow };
    } catch {
      setConnectionOk(false);
    }
  }, [updateChart, overrideMode]);

  /* Rebuild chart when theme changes */
  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels: [...historyLabels.current],
        datasets: [{
          label: "Water Level (%)",
          data: [...historyData.current],
          borderColor: isDark ? "rgba(56,189,248,1)" : "rgba(6,182,212,1)",
          backgroundColor: isDark ? "rgba(56,189,248,0.12)" : "rgba(6,182,212,0.1)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: isDark ? "rgba(56,189,248,1)" : "rgba(6,182,212,1)",
          fill: true,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { color: T.chartLegend, font: { size: 12 } } },
          tooltip: {
            backgroundColor: T.chartTooltipBg,
            titleColor: T.chartTooltipTitle,
            bodyColor: T.chartTooltipBody,
            borderColor: isDark ? "rgba(56,189,248,0.3)" : "rgba(6,182,212,0.3)",
            borderWidth: 1,
          },
        },
        scales: {
          x: { ticks: { color: T.textSub, font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: T.chartGrid } },
          y: {
            min: 0, max: 100,
            ticks: { color: T.textSub, font: { size: 10 }, callback: (v) => `${v}%` },
            grid: { color: T.chartGrid },
          },
        },
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const sendCommand = async (cmd: "on" | "off") => {
    if (overrideMode === "emergency_stop") return;
    if (overrideMode === "force_on" && cmd === "off") return;
    if (overrideMode === "force_off" && cmd === "on") return;
    if (DEMO_MODE) { setPumpStatus(cmd === "on" ? "ON" : "OFF"); return; }
    setPumpLoading(true);
    try {
      await fetch(`/${cmd}`);
      setPumpStatus(cmd === "on" ? "ON" : "OFF");
    } catch { } finally { setPumpLoading(false); }
  };

  const activateOverride = (mode: OverrideMode) => {
    setOverrideMode(mode);
    setOverrideLog(prev => [
      { time: new Date().toLocaleTimeString(), mode: OVERRIDE_OPTIONS.find(o => o.id === mode)?.label ?? mode, reason: overrideReason || "No reason given" },
      ...prev.slice(0, 9),
    ]);
    if (mode === "force_on") { setPumpStatus("ON"); }
    if (mode === "force_off" || mode === "emergency_stop") { setPumpStatus("OFF"); }
    setOverrideReason("");
  };

  const clearOverride = () => {
    setOverrideLog(prev => [
      { time: new Date().toLocaleTimeString(), mode: "Override Cleared", reason: overrideReason || "Manual clear" },
      ...prev.slice(0, 9),
    ]);
    setOverrideMode("none");
    setOverrideReason("");
  };

  const levelColor = data.level < 20 ? "#ef4444" : data.level < 50 ? "#f59e0b" : "#22c55e";
  const waterBgColor = data.level < 20 ? "rgba(239,68,68,0.5)" : data.level < 50 ? "rgba(245,158,11,0.45)" : "rgba(56,189,248,0.55)";

  const activeOverrideInfo = OVERRIDE_OPTIONS.find(o => o.id === overrideMode);
  const isLocked = overrideMode === "emergency_stop";

  const card: React.CSSProperties = {
    background: T.cardBg,
    border: `1px solid ${T.cardBorder}`,
    borderRadius: 16,
    padding: 20,
    backdropFilter: "blur(8px)",
  };

  const sectionTitle: React.CSSProperties = {
    margin: "0 0 14px",
    fontSize: 12,
    fontWeight: 700,
    color: T.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.09em",
  };

  return (
    <div style={{ background: T.page, minHeight: "100vh", color: T.text, fontFamily: "Inter, system-ui, sans-serif", transition: "background 0.4s, color 0.3s" }}>

      {/* Emergency Stop banner */}
      {isLocked && (
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#b91c1c)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "2px solid #ef4444" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>🚨 EMERGENCY STOP ACTIVE — System locked. All pump operations halted.</span>
          <button onClick={clearOverride} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            Release Lock
          </button>
        </div>
      )}

      {/* Sensor alert banner */}
      {alertMsg && !isLocked && (
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid rgba(239,68,68,0.3)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#fff" }}>
            <span style={{ fontSize: 17 }}>⚠️</span> {alertMsg}
          </span>
          <button onClick={() => setAlertMsg(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Override active banner */}
      {overrideMode !== "none" && overrideMode !== "emergency_stop" && (
        <div style={{ background: isDark ? "rgba(120,53,15,0.7)" : "rgba(254,243,199,0.95)", borderBottom: `1px solid rgba(245,158,11,0.4)`, padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: isDark ? "#fbbf24" : "#92400e" }}>
            🔧 Manual Override Active: <strong>{activeOverrideInfo?.label}</strong>
          </span>
          <button onClick={clearOverride} style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: isDark ? "#fbbf24" : "#b45309", borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            Clear Override
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${T.headerBorder}`, padding: "18px 24px", background: T.headerBg, backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(15px, 3vw, 21px)", fontWeight: 700, letterSpacing: "-0.01em", color: T.text }}>
              💧 Smart Water Management System
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textMuted }}>Real-Time Monitoring & Control</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Connection */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: connectionOk ? "#22c55e" : "#ef4444", display: "inline-block", boxShadow: connectionOk ? "0 0 0 3px rgba(34,197,94,0.25)" : "0 0 0 3px rgba(239,68,68,0.25)" }} />
              <span style={{ color: connectionOk ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                {DEMO_MODE ? "Demo" : connectionOk ? "Connected" : "Disconnected"}
              </span>
              {lastUpdated && <span style={{ color: T.textSub }}>{lastUpdated.toLocaleTimeString()}</span>}
            </div>

            {/* Manual Override toggle */}
            <button
              onClick={() => setShowOverride(v => !v)}
              style={{
                background: overrideMode !== "none" ? "rgba(245,158,11,0.15)" : T.toggleBg,
                border: `1px solid ${overrideMode !== "none" ? "rgba(245,158,11,0.4)" : T.toggleBorder}`,
                borderRadius: 8,
                padding: "6px 12px",
                color: overrideMode !== "none" ? "#f59e0b" : T.toggleText,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                transition: "all 0.2s",
              }}
            >
              🔧 {overrideMode !== "none" ? "Override ON" : "Override"}
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setIsDark(v => !v)}
              style={{
                background: T.toggleBg,
                border: `1px solid ${T.toggleBorder}`,
                borderRadius: 8,
                padding: "6px 13px",
                color: T.toggleText,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.3s",
                whiteSpace: "nowrap",
              }}
            >
              {isDark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 16px" }}>

        {/* Manual Override Panel */}
        {showOverride && (
          <div style={{ ...card, marginBottom: 20, borderColor: overrideMode !== "none" ? "rgba(245,158,11,0.35)" : T.cardBorder }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ ...sectionTitle, margin: 0 }}>Manual Override Control</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textSub }}>
                  Use overrides when sensors malfunction or emergency intervention is needed. Log entries are kept for audit.
                </p>
              </div>
              {overrideMode !== "none" && (
                <button
                  onClick={clearOverride}
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
                >
                  ✕ Clear Override
                </button>
              )}
            </div>

            {/* Reason input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 6 }}>
                Reason / Note (optional — logged with each action)
              </label>
              <input
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="e.g. Dry run sensor disconnected, bypass until replacement"
                style={{
                  width: "100%",
                  background: isDark ? "rgba(255,255,255,0.05)" : "rgba(6,182,212,0.06)",
                  border: `1px solid ${T.cardBorder}`,
                  borderRadius: 8,
                  padding: "9px 12px",
                  color: T.text,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Override buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
              {OVERRIDE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => activateOverride(opt.id)}
                  style={{
                    background: overrideMode === opt.id ? `${opt.color}22` : isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)",
                    border: `2px solid ${overrideMode === opt.id ? opt.color : isDark ? "rgba(255,255,255,0.1)" : "rgba(6,182,212,0.2)"}`,
                    borderRadius: 12,
                    padding: "13px 14px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{opt.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: overrideMode === opt.id ? opt.color : T.text, marginBottom: 3 }}>
                    {opt.label}
                    {overrideMode === opt.id && <span style={{ fontSize: 10, marginLeft: 6, background: opt.color, color: "#fff", borderRadius: 4, padding: "1px 5px", verticalAlign: "middle" }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.4 }}>{opt.desc}</div>
                </button>
              ))}
            </div>

            {/* Override log */}
            {overrideLog.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 8 }}>Override Log</div>
                <div style={{ background: isDark ? "rgba(0,0,0,0.3)" : "rgba(6,182,212,0.05)", border: `1px solid ${T.cardBorder}`, borderRadius: 10, overflow: "hidden" }}>
                  {overrideLog.map((entry, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "8px 14px", borderBottom: i < overrideLog.length - 1 ? `1px solid ${T.cardBorder}` : "none", fontSize: 12 }}>
                      <span style={{ color: T.textSub, whiteSpace: "nowrap" }}>{entry.time}</span>
                      <span style={{ fontWeight: 600, color: T.accentBlue, whiteSpace: "nowrap" }}>{entry.mode}</span>
                      <span style={{ color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top row: Tank + Level + Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>

          {/* Tank Visual */}
          <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <h2 style={sectionTitle}>Water Tank</h2>
            <div style={{ position: "relative", width: 110, height: 200, borderRadius: "8px 8px 16px 16px", border: `2px solid ${T.tankOutline}`, overflow: "hidden", background: T.tankInner }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${data.level}%`, background: waterBgColor, transition: "height 0.8s cubic-bezier(0.4,0,0.2,1), background 0.5s", borderTop: `2px solid ${levelColor}` }}>
                <div style={{ position: "absolute", top: -6, left: 0, right: 0, height: 12, background: levelColor, opacity: 0.3, borderRadius: "50%", animation: "wave 2s infinite ease-in-out" }} />
              </div>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: isDark ? "#fff" : "#0c4a6e", textShadow: isDark ? "0 1px 6px rgba(0,0,0,0.8)" : "0 1px 4px rgba(255,255,255,0.9)", zIndex: 1 }}>
                {data.level}%
              </div>
              {[25, 50, 75].map(pct => (
                <div key={pct} style={{ position: "absolute", left: 4, bottom: `${pct}%`, width: 14, height: 1, background: T.tickBg, zIndex: 2 }} />
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: T.textMuted }}>
              Distance: <span style={{ color: T.text, fontWeight: 600 }}>{data.distance} cm</span>
            </p>
          </div>

          {/* Level + Status column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Progress */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.09em" }}>Water Level</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: levelColor }}>{data.level}%</span>
              </div>
              <div style={{ height: 18, background: T.progressTrack, borderRadius: 100, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${data.level}%`, background: `linear-gradient(90deg,${levelColor}99,${levelColor})`, borderRadius: 100, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{data.level > 12 ? `${data.level}%` : ""}</span>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: T.textSub }}>
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>

            {/* Status Indicators */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <StatusCard label="Dry Run" active={!!data.dry} override={overrideMode === "bypass_dry"} icon="🔥" isDark={isDark} T={T} />
              <StatusCard label="Overflow" active={!!data.overflow} override={overrideMode === "bypass_overflow"} icon="🌊" isDark={isDark} T={T} />
            </div>

            {/* Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: T.metricCardBg, border: `1px solid ${T.metricCardBorder}`, borderRadius: 12, padding: "13px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: T.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Water Level</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.accentBlue }}>{data.level}%</div>
              </div>
              <div style={{ background: T.metricCardBg, border: `1px solid ${T.metricCardBorder}`, borderRadius: 12, padding: "13px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: T.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Distance</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.accentPurple }}>{data.distance} cm</div>
              </div>
            </div>
          </div>
        </div>

        {/* Pump Control */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h2 style={sectionTitle}>Pump Control</h2>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => sendCommand("on")}
              disabled={pumpLoading || pumpStatus === "ON" || isLocked || overrideMode === "force_off"}
              style={{
                flex: "1 1 140px",
                padding: "15px 20px",
                background: pumpStatus === "ON" ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.09)",
                border: `2px solid ${pumpStatus === "ON" ? "#22c55e" : "rgba(34,197,94,0.3)"}`,
                borderRadius: 12, color: "#22c55e", fontWeight: 700, fontSize: 15,
                cursor: pumpLoading || pumpStatus === "ON" || isLocked || overrideMode === "force_off" ? "not-allowed" : "pointer",
                opacity: isLocked || overrideMode === "force_off" ? 0.4 : pumpStatus === "ON" ? 0.75 : 1,
                transition: "all 0.2s",
              }}
            >
              ⚡ Turn Pump ON
            </button>
            <button
              onClick={() => sendCommand("off")}
              disabled={pumpLoading || pumpStatus === "OFF" || isLocked || overrideMode === "force_on"}
              style={{
                flex: "1 1 140px",
                padding: "15px 20px",
                background: pumpStatus === "OFF" ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.09)",
                border: `2px solid ${pumpStatus === "OFF" ? "#ef4444" : "rgba(239,68,68,0.3)"}`,
                borderRadius: 12, color: "#ef4444", fontWeight: 700, fontSize: 15,
                cursor: pumpLoading || pumpStatus === "OFF" || isLocked || overrideMode === "force_on" ? "not-allowed" : "pointer",
                opacity: isLocked || overrideMode === "force_on" ? 0.4 : pumpStatus === "OFF" ? 0.75 : 1,
                transition: "all 0.2s",
              }}
            >
              ⛔ Turn Pump OFF
            </button>
            <div style={{ flex: "1 1 130px", textAlign: "center", padding: "12px 16px", background: T.pumpStatusBg, border: `1px solid ${T.pumpStatusBorder}`, borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Pump Status</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: pumpStatus === "ON" ? "#22c55e" : pumpStatus === "OFF" ? "#ef4444" : T.textSub }}>
                {pumpStatus === "unknown" ? "—" : pumpStatus}
              </div>
            </div>
          </div>
          {(isLocked || overrideMode === "force_on" || overrideMode === "force_off") && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>
              ⚠️ Manual override is restricting pump control. Clear the override to restore normal operation.
            </p>
          )}
        </div>

        {/* Live Chart */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h2 style={sectionTitle}>Water Level History (Last 20 readings)</h2>
          <div style={{ height: 220, position: "relative" }}>
            <canvas ref={chartRef} />
          </div>
        </div>

        {/* Footer note */}
        <div style={{ background: T.footerBg, border: `1px solid ${T.footerBorder}`, borderRadius: 12, padding: "13px 18px", fontSize: 13, color: T.footerText, backdropFilter: "blur(6px)" }}>
          <strong style={{ color: T.accentBlue }}>ESP8266 Firmware:</strong> The complete{" "}
          <code style={{ background: T.noteCode, padding: "1px 6px", borderRadius: 4, color: T.noteCodeText, margin: "0 3px" }}>SmartWaterSystem.ino</code>
          file is in the project root. Set{" "}
          <code style={{ background: T.noteCode, padding: "1px 6px", borderRadius: 4, color: T.noteCodeText }}>DEMO_MODE = false</code>
          {" "}in this dashboard and enter your ESP8266 IP to connect to real hardware.
        </div>
      </main>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleX(1.2) translateX(-5px); }
          50% { transform: scaleX(0.9) translateX(5px); }
        }
        input::placeholder { color: #6b7280; }
      `}</style>
    </div>
  );
}

function StatusCard({
  label, active, override, icon, isDark, T,
}: {
  label: string; active: boolean; override: boolean; icon: string; isDark: boolean;
  T: ReturnType<typeof getTheme>;
}) {
  const bg = override
    ? (isDark ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.1)")
    : active
    ? (isDark ? "rgba(239,68,68,0.09)" : "rgba(239,68,68,0.07)")
    : (isDark ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.07)");
  const border = override ? "rgba(251,191,36,0.3)" : active ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.22)";
  const valueColor = override ? "#f59e0b" : active ? "#ef4444" : "#22c55e";
  const valueLabel = override ? "BYPASSED" : active ? "DETECTED" : "SAFE";

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "13px 14px", textAlign: "center", transition: "all 0.4s" }}>
      <div style={{ fontSize: 17, marginBottom: 3 }}>{icon}</div>
      <div style={{ fontSize: 10, color: T.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: valueColor }}>{valueLabel}</div>
    </div>
  );
}
