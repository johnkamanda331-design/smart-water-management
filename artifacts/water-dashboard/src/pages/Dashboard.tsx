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

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
);

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

export default function Dashboard() {
  const [data, setData] = useState<SensorData>({
    level: 0,
    distance: 0,
    dry: 0,
    overflow: 0,
  });
  const [pumpStatus, setPumpStatus] = useState<"ON" | "OFF" | "unknown">("unknown");
  const [pumpLoading, setPumpLoading] = useState(false);
  const [connectionOk, setConnectionOk] = useState(DEMO_MODE);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
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
    if (historyLabels.current.length > 20) {
      historyLabels.current.shift();
      historyData.current.shift();
    }
    if (chartInstance.current) {
      chartInstance.current.data.labels = [...historyLabels.current];
      chartInstance.current.data.datasets[0].data = [...historyData.current];
      chartInstance.current.update("none");
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (DEMO_MODE) {
      const simulated = getSimulatedData();
      setData(simulated);
      setConnectionOk(true);
      setLastUpdated(new Date());
      updateChart(simulated.level);
      if (simulated.dry && !prevAlerts.current.dry) {
        setAlertMsg("Dry Run Detected!");
      } else if (simulated.overflow && !prevAlerts.current.overflow) {
        setAlertMsg("Overflow Detected!");
      }
      prevAlerts.current = { dry: simulated.dry, overflow: simulated.overflow };
      return;
    }
    try {
      const res = await fetch("/data");
      if (!res.ok) throw new Error("Bad response");
      const json: SensorData = await res.json();
      setData(json);
      setConnectionOk(true);
      setLastUpdated(new Date());
      updateChart(json.level);
      if (json.dry && !prevAlerts.current.dry) setAlertMsg("Dry Run Detected!");
      else if (json.overflow && !prevAlerts.current.overflow) setAlertMsg("Overflow Detected!");
      else if (!json.dry && !json.overflow) setAlertMsg(null);
      prevAlerts.current = { dry: json.dry, overflow: json.overflow };
    } catch {
      setConnectionOk(false);
    }
  }, [updateChart]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Water Level (%)",
            data: [],
            borderColor: "rgba(56, 189, 248, 1)",
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: "rgba(56, 189, 248, 1)",
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { color: "#94a3b8", font: { size: 12 } } },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            titleColor: "#e2e8f0",
            bodyColor: "#94a3b8",
            borderColor: "rgba(56, 189, 248, 0.3)",
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            ticks: { color: "#64748b", font: { size: 10 }, maxTicksLimit: 6 },
            grid: { color: "rgba(255,255,255,0.04)" },
          },
          y: {
            min: 0,
            max: 100,
            ticks: {
              color: "#64748b",
              font: { size: 10 },
              callback: (v) => `${v}%`,
            },
            grid: { color: "rgba(255,255,255,0.04)" },
          },
        },
      },
    });
    return () => {
      chartInstance.current?.destroy();
    };
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const sendCommand = async (cmd: "on" | "off") => {
    if (DEMO_MODE) {
      setPumpStatus(cmd === "on" ? "ON" : "OFF");
      return;
    }
    setPumpLoading(true);
    try {
      await fetch(`/${cmd}`);
      setPumpStatus(cmd === "on" ? "ON" : "OFF");
    } catch {
    } finally {
      setPumpLoading(false);
    }
  };

  const levelColor =
    data.level < 20
      ? "#ef4444"
      : data.level < 50
      ? "#f59e0b"
      : "#22c55e";

  const waterBgColor =
    data.level < 20
      ? "rgba(239,68,68,0.5)"
      : data.level < 50
      ? "rgba(245,158,11,0.5)"
      : "rgba(56, 189, 248, 0.6)";

  return (
    <div style={{ background: "#030712", minHeight: "100vh", color: "#e2e8f0", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Alert Banner */}
      {alertMsg && (
        <div
          style={{
            background: "linear-gradient(90deg,#7f1d1d,#991b1b)",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "1px solid rgba(239,68,68,0.3)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <span style={{ fontSize: 18 }}>⚠️</span> {alertMsg}
          </span>
          <button
            onClick={() => setAlertMsg(null)}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "20px 24px", background: "rgba(15,23,42,0.7)", backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(16px, 3vw, 22px)", fontWeight: 700, letterSpacing: "-0.01em", color: "#f1f5f9" }}>
              💧 Smart Water Management System
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Real-Time Monitoring & Control</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: connectionOk ? "#22c55e" : "#ef4444",
                display: "inline-block",
                boxShadow: connectionOk ? "0 0 0 3px rgba(34,197,94,0.25)" : "0 0 0 3px rgba(239,68,68,0.25)",
              }}
            />
            <span style={{ color: connectionOk ? "#86efac" : "#fca5a5" }}>
              {DEMO_MODE ? "Demo Mode" : connectionOk ? "Connected" : "Disconnected"}
            </span>
            {lastUpdated && (
              <span style={{ color: "#475569", marginLeft: 6 }}>
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        {/* Top row: Tank + Level + Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
          {/* Tank Visual */}
          <div
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Water Tank
            </h2>
            <div
              style={{
                position: "relative",
                width: 110,
                height: 200,
                borderRadius: "8px 8px 16px 16px",
                border: "2px solid rgba(255,255,255,0.15)",
                overflow: "hidden",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {/* Water fill */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${data.level}%`,
                  background: waterBgColor,
                  transition: "height 0.8s cubic-bezier(0.4,0,0.2,1), background 0.5s",
                  borderTop: `2px solid ${levelColor}`,
                }}
              >
                {/* Wave animation */}
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: 0,
                    right: 0,
                    height: 12,
                    background: `${levelColor}`,
                    opacity: 0.3,
                    borderRadius: "50%",
                    animation: "wave 2s infinite ease-in-out",
                  }}
                />
              </div>
              {/* Level label */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#fff",
                  textShadow: "0 1px 6px rgba(0,0,0,0.8)",
                  zIndex: 1,
                }}
              >
                {data.level}%
              </div>
              {/* Tick marks */}
              {[25, 50, 75].map((pct) => (
                <div
                  key={pct}
                  style={{
                    position: "absolute",
                    left: 4,
                    bottom: `${pct}%`,
                    width: 14,
                    height: 1,
                    background: "rgba(255,255,255,0.2)",
                    zIndex: 2,
                  }}
                />
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
              Distance: <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{data.distance} cm</span>
            </p>
          </div>

          {/* Level Bar + Status Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Progress Card */}
            <div
              style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Water Level
                </span>
                <span style={{ fontSize: 28, fontWeight: 700, color: levelColor }}>{data.level}%</span>
              </div>
              <div style={{ height: 18, background: "rgba(255,255,255,0.06)", borderRadius: 100, overflow: "hidden", position: "relative" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${data.level}%`,
                    background: `linear-gradient(90deg, ${levelColor}aa, ${levelColor})`,
                    borderRadius: 100,
                    transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 6,
                  }}
                >
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {data.level > 12 ? `${data.level}%` : ""}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#374151" }}>
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>

            {/* Status Indicators */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <StatusCard label="Dry Run" active={!!data.dry} activeLabel="DETECTED" safeLabel="SAFE" icon="🔥" />
              <StatusCard label="Overflow" active={!!data.overflow} activeLabel="DETECTED" safeLabel="SAFE" icon="🌊" />
            </div>

            {/* Live stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <MetricCard label="Water Level" value={`${data.level}%`} color="#38bdf8" />
              <MetricCard label="Distance" value={`${data.distance} cm`} color="#a78bfa" />
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div
          style={{
            background: "rgba(15,23,42,0.8)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Pump Control
          </h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => sendCommand("on")}
              disabled={pumpLoading || pumpStatus === "ON"}
              style={{
                flex: "1 1 140px",
                padding: "16px 24px",
                background: pumpStatus === "ON" ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.1)",
                border: `2px solid ${pumpStatus === "ON" ? "#22c55e" : "rgba(34,197,94,0.3)"}`,
                borderRadius: 12,
                color: "#22c55e",
                fontWeight: 700,
                fontSize: 15,
                cursor: pumpLoading || pumpStatus === "ON" ? "not-allowed" : "pointer",
                opacity: pumpLoading || pumpStatus === "ON" ? 0.7 : 1,
                transition: "all 0.2s",
                letterSpacing: "0.02em",
              }}
            >
              ⚡ Turn Pump ON
            </button>
            <button
              onClick={() => sendCommand("off")}
              disabled={pumpLoading || pumpStatus === "OFF"}
              style={{
                flex: "1 1 140px",
                padding: "16px 24px",
                background: pumpStatus === "OFF" ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.1)",
                border: `2px solid ${pumpStatus === "OFF" ? "#ef4444" : "rgba(239,68,68,0.3)"}`,
                borderRadius: 12,
                color: "#ef4444",
                fontWeight: 700,
                fontSize: 15,
                cursor: pumpLoading || pumpStatus === "OFF" ? "not-allowed" : "pointer",
                opacity: pumpLoading || pumpStatus === "OFF" ? 0.7 : 1,
                transition: "all 0.2s",
                letterSpacing: "0.02em",
              }}
            >
              ⛔ Turn Pump OFF
            </button>
            <div style={{ flex: "1 1 140px", textAlign: "center", padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Pump Status</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: pumpStatus === "ON" ? "#22c55e" : pumpStatus === "OFF" ? "#ef4444" : "#64748b",
                }}
              >
                {pumpStatus === "unknown" ? "—" : pumpStatus}
              </div>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#334155" }}>
            {DEMO_MODE
              ? "Demo mode — pump commands simulated locally. In production, these call /on and /off on the ESP8266."
              : "Commands sent via HTTP to ESP8266 → relayed to Arduino via Serial (APP_ON / APP_OFF)."}
          </p>
        </div>

        {/* Live Chart */}
        <div
          style={{
            background: "rgba(15,23,42,0.8)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Water Level History (Last 20 readings)
          </h2>
          <div style={{ height: 220, position: "relative" }}>
            <canvas ref={chartRef} />
          </div>
        </div>

        {/* ESP8266 Firmware Download notice */}
        <div
          style={{
            marginTop: 20,
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(56,189,248,0.15)",
            borderRadius: 12,
            padding: "14px 20px",
            fontSize: 13,
            color: "#64748b",
          }}
        >
          <strong style={{ color: "#38bdf8" }}>ESP8266 Firmware:</strong> The complete
          <code style={{ background: "rgba(56,189,248,0.1)", padding: "1px 6px", borderRadius: 4, color: "#7dd3fc", margin: "0 4px" }}>
            SmartWaterSystem.ino
          </code>
          file is provided in the project. Deploy it to your NodeMCU with WiFi credentials, point the dashboard to your ESP8266 IP, and set{" "}
          <code style={{ background: "rgba(56,189,248,0.1)", padding: "1px 6px", borderRadius: 4, color: "#7dd3fc" }}>DEMO_MODE = false</code>.
        </div>
      </main>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleX(1.2) translateX(-5px); }
          50% { transform: scaleX(0.9) translateX(5px); }
        }
      `}</style>
    </div>
  );
}

function StatusCard({
  label,
  active,
  activeLabel,
  safeLabel,
  icon,
}: {
  label: string;
  active: boolean;
  activeLabel: string;
  safeLabel: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: active ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.06)",
        border: `1px solid ${active ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.2)"}`,
        borderRadius: 12,
        padding: "14px 16px",
        textAlign: "center",
        transition: "all 0.4s",
      }}
    >
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: active ? "#ef4444" : "#22c55e",
        }}
      >
        {active ? activeLabel : safeLabel}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "14px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
