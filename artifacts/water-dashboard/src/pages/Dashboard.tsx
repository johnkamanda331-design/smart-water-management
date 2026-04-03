import { useEffect, useRef, useState, useCallback } from "react";
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend,
} from "chart.js";
import SettingsModal from "@/components/SettingsModal";
import {
  loadHistory, appendHistory, exportCSV, sendNtfyAlert,
  loadSettings, WmsSettings, computeDailySummary, DailySummaryData, fmtDuration,
  HistoryPoint,
} from "@/lib/storage";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

/* ─── Types ─────────────────────────────────────────────────────── */
interface SensorData {
  level: number;
  distance: number;
  dry: number;
  overflow: number;
  flow: number; // L/min × 10 (int) — divide by 10 to display
}

const DEMO_MODE = true;

function getSimulatedData(): SensorData {
  const t = Date.now() / 5000;
  const level = Math.min(100, Math.max(0, Math.round(50 + 40 * Math.sin(t))));
  const pumpOn = level < 50;
  return {
    level,
    distance: Math.round(((100 - level) / 100) * 50),
    dry: level < 10 ? 1 : 0,
    overflow: level > 90 ? 1 : 0,
    flow: pumpOn ? Math.max(0, Math.round(18 + 8 * Math.cos(t))) : 0,
  };
}

/* ─── Theme tokens ──────────────────────────────────────────────── */
function getTheme(dark: boolean) {
  if (dark) return {
    page: "#030712",
    headerBg: "rgba(15,23,42,0.88)", headerBorder: "rgba(255,255,255,0.07)",
    cardBg: "rgba(15,23,42,0.88)", cardBorder: "rgba(255,255,255,0.08)",
    text: "#e2e8f0", textMuted: "#64748b", textSub: "#475569",
    tickBg: "rgba(255,255,255,0.18)", progressTrack: "rgba(255,255,255,0.07)",
    metricCardBg: "rgba(255,255,255,0.03)", metricCardBorder: "rgba(255,255,255,0.07)",
    pumpStatusBg: "rgba(255,255,255,0.03)", pumpStatusBorder: "rgba(255,255,255,0.07)",
    footerBg: "rgba(15,23,42,0.6)", footerBorder: "rgba(56,189,248,0.15)", footerText: "#64748b",
    tankOutline: "rgba(255,255,255,0.15)", tankInner: "rgba(255,255,255,0.03)",
    chartGrid: "rgba(255,255,255,0.04)", chartLegend: "#94a3b8",
    chartTooltipBg: "rgba(15,23,42,0.9)", chartTooltipTitle: "#e2e8f0", chartTooltipBody: "#94a3b8",
    accentBlue: "#38bdf8", accentPurple: "#a78bfa",
    noteCode: "rgba(56,189,248,0.1)", noteCodeText: "#7dd3fc",
    toggleBg: "rgba(255,255,255,0.07)", toggleBorder: "rgba(255,255,255,0.12)", toggleText: "#94a3b8",
    summaryCardBg: "rgba(255,255,255,0.04)", summaryCardBorder: "rgba(255,255,255,0.08)",
    inputBg: "rgba(255,255,255,0.05)", inputBorder: "rgba(255,255,255,0.12)",
  };
  return {
    page: "linear-gradient(145deg,#0ea5e9 0%,#38bdf8 18%,#bae6fd 38%,#ffffff 58%,#e0f7fa 78%,#06b6d4 100%)",
    headerBg: "rgba(255,255,255,0.78)", headerBorder: "rgba(6,182,212,0.35)",
    cardBg: "rgba(255,255,255,0.85)", cardBorder: "rgba(6,182,212,0.28)",
    text: "#0c4a6e", textMuted: "#0369a1", textSub: "#0891b2",
    tickBg: "rgba(6,182,212,0.45)", progressTrack: "rgba(6,182,212,0.18)",
    metricCardBg: "rgba(186,230,253,0.55)", metricCardBorder: "rgba(6,182,212,0.35)",
    pumpStatusBg: "rgba(186,230,253,0.55)", pumpStatusBorder: "rgba(6,182,212,0.35)",
    footerBg: "rgba(255,255,255,0.65)", footerBorder: "rgba(6,182,212,0.4)", footerText: "#0369a1",
    tankOutline: "rgba(6,182,212,0.55)", tankInner: "rgba(186,230,253,0.45)",
    chartGrid: "rgba(6,182,212,0.14)", chartLegend: "#0369a1",
    chartTooltipBg: "rgba(255,255,255,0.97)", chartTooltipTitle: "#0c4a6e", chartTooltipBody: "#0369a1",
    accentBlue: "#0369a1", accentPurple: "#6d28d9",
    noteCode: "rgba(6,182,212,0.15)", noteCodeText: "#075985",
    toggleBg: "rgba(6,182,212,0.14)", toggleBorder: "rgba(6,182,212,0.4)", toggleText: "#0369a1",
    summaryCardBg: "rgba(255,255,255,0.6)", summaryCardBorder: "rgba(6,182,212,0.25)",
    inputBg: "rgba(6,182,212,0.07)", inputBorder: "rgba(6,182,212,0.3)",
  };
}

/* ─── Override config ───────────────────────────────────────────── */
type OverrideMode = "none" | "force_on" | "force_off" | "bypass_dry" | "bypass_overflow" | "emergency_stop";
const OVERRIDE_OPTIONS: { id: OverrideMode; label: string; desc: string; color: string; icon: string }[] = [
  { id: "force_on",        label: "Force Pump ON",      desc: "Keep pump running regardless of sensor state",          color: "#22c55e", icon: "⚡" },
  { id: "force_off",       label: "Force Pump OFF",     desc: "Stop pump and lock it off regardless of auto logic",    color: "#ef4444", icon: "⛔" },
  { id: "bypass_dry",      label: "Bypass Dry Run",     desc: "Ignore dry run sensor if it is faulty",                 color: "#f59e0b", icon: "🔧" },
  { id: "bypass_overflow", label: "Bypass Overflow",    desc: "Ignore overflow sensor if it is faulty",                color: "#f59e0b", icon: "🔧" },
  { id: "emergency_stop",  label: "Emergency Stop",     desc: "Halt all operations immediately and lock system",       color: "#dc2626", icon: "🚨" },
];

/* ─── Props ─────────────────────────────────────────────────────── */
interface DashboardProps {
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  onLock: () => void;
}

export default function Dashboard({ isDark, setIsDark, onLock }: DashboardProps) {
  const T = getTheme(isDark);

  /* sensor + connection */
  const [data, setData] = useState<SensorData>({ level: 0, distance: 0, dry: 0, overflow: 0, flow: 0 });
  const [pumpStatus, setPumpStatus] = useState<"ON" | "OFF" | "unknown">("unknown");
  const [pumpLoading, setPumpLoading] = useState(false);
  const [connectionOk, setConnectionOk] = useState(DEMO_MODE);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  /* override */
  const [overrideMode, setOverrideMode] = useState<OverrideMode>("none");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideLog, setOverrideLog] = useState<{ time: string; mode: string; reason: string }[]>([]);
  const [showOverride, setShowOverride] = useState(false);

  /* settings + history + summary */
  const [settings, setSettings] = useState<WmsSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>(loadHistory);
  const [dailySummary, setDailySummary] = useState<DailySummaryData | null>(null);

  /* chart */
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevAlerts = useRef({ dry: 0, overflow: 0 });
  const prevAutoProt = useRef(false);

  /* ── Update daily summary whenever history changes ── */
  useEffect(() => {
    setDailySummary(computeDailySummary(history));
  }, [history]);

  /* ── Rebuild chart on theme change ── */
  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    const pts = history.slice(-20);
    chartInstance.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels: pts.map(p => new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })),
        datasets: [{
          label: "Water Level (%)",
          data: pts.map(p => p.level),
          borderColor: isDark ? "rgba(56,189,248,1)" : "rgba(6,182,212,1)",
          backgroundColor: isDark ? "rgba(56,189,248,0.12)" : "rgba(6,182,212,0.1)",
          borderWidth: 2, pointRadius: 3,
          pointBackgroundColor: isDark ? "rgba(56,189,248,1)" : "rgba(6,182,212,1)",
          fill: true, tension: 0.4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { labels: { color: T.chartLegend, font: { size: 12 } } },
          tooltip: { backgroundColor: T.chartTooltipBg, titleColor: T.chartTooltipTitle, bodyColor: T.chartTooltipBody, borderColor: isDark ? "rgba(56,189,248,0.3)" : "rgba(6,182,212,0.3)", borderWidth: 1 },
        },
        scales: {
          x: { ticks: { color: T.textSub, font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: T.chartGrid } },
          y: { min: 0, max: 100, ticks: { color: T.textSub, font: { size: 10 }, callback: v => `${v}%` }, grid: { color: T.chartGrid } },
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  const pushToChart = useCallback((pt: HistoryPoint) => {
    if (!chartInstance.current) return;
    const ds = chartInstance.current.data;
    const labels = ds.labels as string[];
    const vals = ds.datasets[0].data as number[];
    labels.push(new Date(pt.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    vals.push(pt.level);
    if (labels.length > 20) { labels.shift(); vals.shift(); }
    chartInstance.current.update("none");
  }, []);

  /* ── Data fetch / simulate ── */
  const fetchData = useCallback(async () => {
    if (overrideMode === "emergency_stop") return;

    let raw: SensorData;
    if (DEMO_MODE) {
      raw = getSimulatedData();
      setConnectionOk(true);
    } else {
      try {
        const res = await fetch("/data");
        if (!res.ok) throw new Error();
        raw = await res.json();
        setConnectionOk(true);
      } catch {
        setConnectionOk(false);
        return;
      }
    }

    const effective: SensorData = {
      ...raw,
      dry: overrideMode === "bypass_dry" ? 0 : raw.dry,
      overflow: overrideMode === "bypass_overflow" ? 0 : raw.overflow,
    };

    /* threshold overrides */
    const dryTrigger = effective.level < settings.lowThreshold;
    const ovfTrigger = effective.level > settings.highThreshold;
    const resolvedDry = dryTrigger ? 1 : effective.dry;
    const resolvedOvf = ovfTrigger ? 1 : effective.overflow;
    const final: SensorData = { ...effective, dry: resolvedDry, overflow: resolvedOvf };

    setData(final);
    setLastUpdated(new Date());

    /* auto pump protection */
    if (settings.autoPumpProtection && final.dry && !prevAutoProt.current) {
      prevAutoProt.current = true;
      if (!DEMO_MODE) fetch("/off").catch(() => {});
      setPumpStatus("OFF");
    }
    if (!final.dry) prevAutoProt.current = false;

    /* alerts + ntfy */
    if (final.dry && !prevAlerts.current.dry) {
      setAlertMsg("Dry Run Detected! Pump protection activated.");
      if (settings.ntfyEnabled && settings.ntfyTopic) sendNtfyAlert(settings.ntfyTopic, "Dry Run Alert", "Dry run detected in water management system. Pump has been stopped automatically.");
    } else if (final.overflow && !prevAlerts.current.overflow) {
      setAlertMsg("Overflow Detected!");
      if (settings.ntfyEnabled && settings.ntfyTopic) sendNtfyAlert(settings.ntfyTopic, "Overflow Alert", "Water overflow detected in tank.");
    } else if (!final.dry && !final.overflow) {
      setAlertMsg(null);
    }
    prevAlerts.current = { dry: final.dry, overflow: final.overflow };

    /* persist history */
    const pt: HistoryPoint = { ts: Date.now(), level: final.level, distance: final.distance, dry: final.dry, overflow: final.overflow, flow: final.flow, pumpOn: pumpStatus === "ON" };
    const newHistory = appendHistory(pt);
    setHistory(newHistory);
    pushToChart(pt);
  }, [overrideMode, settings, pumpStatus, pushToChart]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  /* ── Pump command ── */
  const sendCommand = async (cmd: "on" | "off") => {
    if (overrideMode === "emergency_stop") return;
    if (overrideMode === "force_on" && cmd === "off") return;
    if (overrideMode === "force_off" && cmd === "on") return;
    if (DEMO_MODE) { setPumpStatus(cmd === "on" ? "ON" : "OFF"); return; }
    setPumpLoading(true);
    try { await fetch(`/${cmd}`); setPumpStatus(cmd === "on" ? "ON" : "OFF"); }
    catch { } finally { setPumpLoading(false); }
  };

  /* ── Override ── */
  const activateOverride = (mode: OverrideMode) => {
    setOverrideMode(mode);
    setOverrideLog(prev => [{ time: new Date().toLocaleTimeString(), mode: OVERRIDE_OPTIONS.find(o => o.id === mode)?.label ?? mode, reason: overrideReason || "No reason given" }, ...prev.slice(0, 9)]);
    if (mode === "force_on") setPumpStatus("ON");
    if (mode === "force_off" || mode === "emergency_stop") setPumpStatus("OFF");
    setOverrideReason("");
  };
  const clearOverride = () => {
    setOverrideLog(prev => [{ time: new Date().toLocaleTimeString(), mode: "Override Cleared", reason: overrideReason || "Manual clear" }, ...prev.slice(0, 9)]);
    setOverrideMode("none"); setOverrideReason("");
  };

  /* ── Derived colors ── */
  const levelColor = data.level < settings.lowThreshold ? "#ef4444" : data.level > settings.highThreshold ? "#f59e0b" : "#22c55e";
  const waterBgColor = data.level < settings.lowThreshold ? "rgba(239,68,68,0.5)" : data.level > settings.highThreshold ? "rgba(245,158,11,0.45)" : "rgba(56,189,248,0.55)";
  const isLocked = overrideMode === "emergency_stop";
  const activeOverrideInfo = OVERRIDE_OPTIONS.find(o => o.id === overrideMode);

  const card: React.CSSProperties = { background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 20, backdropFilter: "blur(8px)" };
  const secTitle: React.CSSProperties = { margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.09em" };
  const hdrBtn = (extra?: React.CSSProperties): React.CSSProperties => ({ background: T.toggleBg, border: `1px solid ${T.toggleBorder}`, borderRadius: 8, padding: "6px 12px", color: T.toggleText, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s", whiteSpace: "nowrap", ...extra });

  return (
    <div style={{ background: T.page, minHeight: "100vh", color: T.text, fontFamily: "Inter,system-ui,sans-serif", transition: "background 0.4s, color 0.3s" }}>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal settings={settings} isDark={isDark}
          onSave={s => { setSettings(s); }}
          onClose={() => setShowSettings(false)} />
      )}

      {/* Emergency stop banner */}
      {isLocked && (
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#b91c1c)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "2px solid #ef4444" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>🚨 EMERGENCY STOP ACTIVE — All operations halted.</span>
          <button onClick={clearOverride} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Release Lock</button>
        </div>
      )}

      {/* Sensor alert banner */}
      {alertMsg && !isLocked && (
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid rgba(239,68,68,0.3)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#fff" }}>⚠️ {alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>Dismiss</button>
        </div>
      )}

      {/* Override active banner */}
      {overrideMode !== "none" && overrideMode !== "emergency_stop" && (
        <div style={{ background: isDark ? "rgba(120,53,15,0.7)" : "rgba(254,243,199,0.95)", borderBottom: "1px solid rgba(245,158,11,0.4)", padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: isDark ? "#fbbf24" : "#92400e" }}>🔧 Override Active: <strong>{activeOverrideInfo?.label}</strong></span>
          <button onClick={clearOverride} style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: isDark ? "#fbbf24" : "#b45309", borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Clear Override</button>
        </div>
      )}

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${T.headerBorder}`, padding: "16px 22px", background: T.headerBg, backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(14px,3vw,20px)", fontWeight: 700, letterSpacing: "-0.01em", color: T.text }}>💧 Smart Water Management System</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textMuted }}>Real-Time Monitoring & Control</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Connection */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: connectionOk ? "#22c55e" : "#ef4444", display: "inline-block", boxShadow: connectionOk ? "0 0 0 3px rgba(34,197,94,0.25)" : "0 0 0 3px rgba(239,68,68,0.25)" }} />
              <span style={{ color: connectionOk ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{DEMO_MODE ? "Demo" : connectionOk ? "Live" : "Offline"}</span>
              {lastUpdated && <span style={{ color: T.textSub }}>{lastUpdated.toLocaleTimeString()}</span>}
            </div>
            <button onClick={() => setShowOverride(v => !v)} style={hdrBtn(overrideMode !== "none" ? { background: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.4)", color: "#f59e0b" } : {})}>
              🔧 {overrideMode !== "none" ? "Override ON" : "Override"}
            </button>
            <button onClick={() => setShowSettings(true)} style={hdrBtn()}>⚙️ Settings</button>
            <button onClick={() => setIsDark(!isDark)} style={hdrBtn()}>{isDark ? "☀️ Light" : "🌙 Dark"}</button>
            <button onClick={onLock} style={hdrBtn({ background: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.07)", borderColor: "rgba(239,68,68,0.25)", color: "#ef4444" })}>🔒 Lock</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1160, margin: "0 auto", padding: "20px 14px" }}>

        {/* Daily Summary */}
        {dailySummary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
            {[
              { label: "Readings Today", value: String(dailySummary.readings), icon: "📊", color: T.accentBlue },
              { label: "Avg Level", value: `${dailySummary.avgLevel}%`, icon: "💧", color: "#22c55e" },
              { label: "Peak / Trough", value: `${dailySummary.peakLevel}% / ${dailySummary.troughLevel}%`, icon: "📈", color: "#f59e0b" },
              { label: "Pump Runtime", value: fmtDuration(dailySummary.pumpRuntimeMs), icon: "⚙️", color: T.accentPurple },
              { label: "Dry Run Events", value: String(dailySummary.dryRunEvents), icon: "🔥", color: dailySummary.dryRunEvents > 0 ? "#ef4444" : "#22c55e" },
              { label: "Overflow Events", value: String(dailySummary.overflowEvents), icon: "🌊", color: dailySummary.overflowEvents > 0 ? "#ef4444" : "#22c55e" },
            ].map(s => (
              <div key={s.label} style={{ background: T.summaryCardBg, border: `1px solid ${T.summaryCardBorder}`, borderRadius: 12, padding: "12px 14px", backdropFilter: "blur(6px)" }}>
                <div style={{ fontSize: 11, color: T.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.icon} {s.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tank + Level row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginBottom: 18 }}>

          {/* Tank visual */}
          <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <h2 style={secTitle}>Water Tank</h2>
            <div style={{ position: "relative", width: 110, height: 200, borderRadius: "8px 8px 16px 16px", border: `2px solid ${T.tankOutline}`, overflow: "hidden", background: T.tankInner }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${data.level}%`, background: waterBgColor, transition: "height 0.8s cubic-bezier(0.4,0,0.2,1),background 0.5s", borderTop: `2px solid ${levelColor}` }}>
                <div style={{ position: "absolute", top: -6, left: 0, right: 0, height: 12, background: levelColor, opacity: 0.3, borderRadius: "50%", animation: "wave 2s infinite ease-in-out" }} />
              </div>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: isDark ? "#fff" : "#0c4a6e", textShadow: isDark ? "0 1px 6px rgba(0,0,0,0.8)" : "0 1px 4px rgba(255,255,255,0.9)", zIndex: 1 }}>
                {data.level}%
              </div>
              {[25, 50, 75].map(pct => (
                <div key={pct} style={{ position: "absolute", left: 4, bottom: `${pct}%`, width: 14, height: 1, background: T.tickBg, zIndex: 2 }} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
              <div style={{ textAlign: "center", fontSize: 12, color: T.textMuted }}>Distance<br /><strong style={{ color: T.text, fontSize: 15 }}>{data.distance} cm</strong></div>
              <div style={{ textAlign: "center", fontSize: 12, color: T.textMuted }}>Flow Rate<br /><strong style={{ color: data.flow > 0 ? "#22c55e" : T.textSub, fontSize: 15 }}>{(data.flow / 10).toFixed(1)} L/m</strong></div>
            </div>
          </div>

          {/* Level + status column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.09em" }}>Water Level</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: levelColor }}>{data.level}%</span>
              </div>
              <div style={{ height: 18, background: T.progressTrack, borderRadius: 100, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${data.level}%`, background: `linear-gradient(90deg,${levelColor}99,${levelColor})`, borderRadius: 100, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{data.level > 12 ? `${data.level}%` : ""}</span>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: T.textSub }}>
                <span>0%</span>
                <span style={{ color: "#ef4444", fontSize: 10 }}>▲{settings.lowThreshold}%</span>
                <span style={{ color: "#f59e0b", fontSize: 10 }}>▲{settings.highThreshold}%</span>
                <span>100%</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatusCard label="Dry Run" active={!!data.dry} override={overrideMode === "bypass_dry"} icon="🔥" isDark={isDark} T={T} />
              <StatusCard label="Overflow" active={!!data.overflow} override={overrideMode === "bypass_overflow"} icon="🌊" isDark={isDark} T={T} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <MetricCard label="Water Level" value={`${data.level}%`} color={T.accentBlue} T={T} />
              <MetricCard label="Flow Rate" value={`${(data.flow / 10).toFixed(1)} L/min`} color={data.flow > 0 ? "#22c55e" : T.textSub} T={T} />
            </div>
          </div>
        </div>

        {/* Manual Override Panel */}
        {showOverride && (
          <div style={{ ...card, marginBottom: 18, borderColor: overrideMode !== "none" ? "rgba(245,158,11,0.35)" : T.cardBorder }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={secTitle}>Manual Override Control</h2>
                <p style={{ margin: 0, fontSize: 12, color: T.textSub }}>Use when sensors malfunction or emergency intervention is needed. All actions are logged.</p>
              </div>
              {overrideMode !== "none" && (
                <button onClick={clearOverride} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>✕ Clear Override</button>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 5 }}>Reason / Note (logged with action)</label>
              <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="e.g. Dry run sensor disconnected — bypassing until replacement" style={{ width: "100%", boxSizing: "border-box", background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10, marginBottom: 14 }}>
              {OVERRIDE_OPTIONS.map(opt => (
                <button key={opt.id} onClick={() => activateOverride(opt.id)}
                  style={{ background: overrideMode === opt.id ? `${opt.color}22` : isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)", border: `2px solid ${overrideMode === opt.id ? opt.color : isDark ? "rgba(255,255,255,0.1)" : "rgba(6,182,212,0.2)"}`, borderRadius: 12, padding: "12px 13px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 15, marginBottom: 3 }}>{opt.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: overrideMode === opt.id ? opt.color : T.text, marginBottom: 2 }}>
                    {opt.label}
                    {overrideMode === opt.id && <span style={{ fontSize: 9, marginLeft: 5, background: opt.color, color: "#fff", borderRadius: 3, padding: "1px 4px", verticalAlign: "middle" }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 10, color: T.textSub, lineHeight: 1.4 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            {overrideLog.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>Override Audit Log</div>
                <div style={{ background: isDark ? "rgba(0,0,0,0.3)" : "rgba(6,182,212,0.05)", border: `1px solid ${T.cardBorder}`, borderRadius: 10, overflow: "hidden" }}>
                  {overrideLog.map((entry, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "7px 13px", borderBottom: i < overrideLog.length - 1 ? `1px solid ${T.cardBorder}` : "none", fontSize: 11 }}>
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

        {/* Pump Control */}
        <div style={{ ...card, marginBottom: 18 }}>
          <h2 style={secTitle}>Pump Control</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => sendCommand("on")} disabled={pumpLoading || pumpStatus === "ON" || isLocked || overrideMode === "force_off"}
              style={{ flex: "1 1 140px", padding: "14px 18px", background: pumpStatus === "ON" ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.09)", border: `2px solid ${pumpStatus === "ON" ? "#22c55e" : "rgba(34,197,94,0.3)"}`, borderRadius: 12, color: "#22c55e", fontWeight: 700, fontSize: 14, cursor: isLocked || overrideMode === "force_off" ? "not-allowed" : "pointer", opacity: isLocked || overrideMode === "force_off" ? 0.4 : pumpStatus === "ON" ? 0.75 : 1, transition: "all 0.2s" }}>
              ⚡ Turn Pump ON
            </button>
            <button onClick={() => sendCommand("off")} disabled={pumpLoading || pumpStatus === "OFF" || isLocked || overrideMode === "force_on"}
              style={{ flex: "1 1 140px", padding: "14px 18px", background: pumpStatus === "OFF" ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.09)", border: `2px solid ${pumpStatus === "OFF" ? "#ef4444" : "rgba(239,68,68,0.3)"}`, borderRadius: 12, color: "#ef4444", fontWeight: 700, fontSize: 14, cursor: isLocked || overrideMode === "force_on" ? "not-allowed" : "pointer", opacity: isLocked || overrideMode === "force_on" ? 0.4 : pumpStatus === "OFF" ? 0.75 : 1, transition: "all 0.2s" }}>
              ⛔ Turn Pump OFF
            </button>
            <div style={{ flex: "1 1 120px", textAlign: "center", padding: "11px 14px", background: T.pumpStatusBg, border: `1px solid ${T.pumpStatusBorder}`, borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 3 }}>Pump Status</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: pumpStatus === "ON" ? "#22c55e" : pumpStatus === "OFF" ? "#ef4444" : T.textSub }}>
                {pumpStatus === "unknown" ? "—" : pumpStatus}
              </div>
            </div>
          </div>
          {settings.autoPumpProtection && (
            <p style={{ margin: "10px 0 0", fontSize: 11, color: T.textMuted }}>
              🛡️ Auto pump protection is <strong style={{ color: "#22c55e" }}>ON</strong> — pump will turn off automatically if dry run is detected. Disable in Settings → Thresholds.
            </p>
          )}
        </div>

        {/* Chart + Export */}
        <div style={{ ...card, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ ...secTitle, margin: 0 }}>Water Level History</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => exportCSV(history)} disabled={history.length === 0}
                style={{ padding: "6px 13px", background: isDark ? "rgba(56,189,248,0.1)" : "rgba(6,182,212,0.1)", border: `1px solid ${T.accentBlue}`, borderRadius: 8, color: T.accentBlue, fontWeight: 600, fontSize: 12, cursor: history.length > 0 ? "pointer" : "not-allowed", opacity: history.length > 0 ? 1 : 0.5 }}>
                ⬇ Export CSV ({history.length} pts)
              </button>
            </div>
          </div>
          <div style={{ height: 210, position: "relative" }}>
            <canvas ref={chartRef} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: T.footerBg, border: `1px solid ${T.footerBorder}`, borderRadius: 12, padding: "12px 16px", fontSize: 12, color: T.footerText, backdropFilter: "blur(6px)" }}>
          <strong style={{ color: T.accentBlue }}>ESP8266:</strong> Set{" "}
          <code style={{ background: T.noteCode, padding: "1px 5px", borderRadius: 4, color: T.noteCodeText }}>DEMO_MODE = false</code>
          {" "}and point the fetch calls at your NodeMCU IP. The firmware file <code style={{ background: T.noteCode, padding: "1px 5px", borderRadius: 4, color: T.noteCodeText }}>SmartWaterSystem.ino</code> includes mDNS, EEPROM calibration, watchdog, WiFi reconnect, flow meter, and auto pump protection.
        </div>
      </main>

      <style>{`
        @keyframes wave { 0%,100%{transform:scaleX(1.2) translateX(-5px)} 50%{transform:scaleX(0.9) translateX(5px)} }
        input::placeholder { color: #6b7280; }
        input[type=range] { accent-color: #38bdf8; }
      `}</style>
    </div>
  );
}

function StatusCard({ label, active, override, icon, isDark, T }: { label: string; active: boolean; override: boolean; icon: string; isDark: boolean; T: ReturnType<typeof getTheme> }) {
  const bg = override ? (isDark ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.1)") : active ? (isDark ? "rgba(239,68,68,0.09)" : "rgba(239,68,68,0.07)") : (isDark ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.07)");
  const border = override ? "rgba(251,191,36,0.3)" : active ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.22)";
  const valueColor = override ? "#f59e0b" : active ? "#ef4444" : "#22c55e";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 13px", textAlign: "center", transition: "all 0.4s" }}>
      <div style={{ fontSize: 16, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 10, color: T.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: valueColor }}>{override ? "BYPASSED" : active ? "DETECTED" : "SAFE"}</div>
    </div>
  );
}

function MetricCard({ label, value, color, T }: { label: string; value: string; color: string; T: ReturnType<typeof getTheme> }) {
  return (
    <div style={{ background: T.metricCardBg, border: `1px solid ${T.metricCardBorder}`, borderRadius: 12, padding: "12px 13px", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: T.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
