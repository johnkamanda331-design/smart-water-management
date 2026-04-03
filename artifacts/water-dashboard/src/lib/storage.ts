/* ─── History ───────────────────────────────────────────────────── */
export interface HistoryPoint {
  ts: number;
  level: number;
  distance: number;
  dry: number;
  overflow: number;
  flow: number;
  pumpOn: boolean;
}

const HISTORY_KEY = "wms_history";
const MAX_HISTORY = 500;

export function loadHistory(): HistoryPoint[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

export function appendHistory(point: HistoryPoint): HistoryPoint[] {
  const h = loadHistory();
  h.push(point);
  const trimmed = h.slice(-MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

/* ─── Settings ──────────────────────────────────────────────────── */
export interface WmsSettings {
  lowThreshold: number;
  highThreshold: number;
  ntfyTopic: string;
  ntfyEnabled: boolean;
  tankHeightCm: number;
  autoPumpProtection: boolean;
}

export const DEFAULT_SETTINGS: WmsSettings = {
  lowThreshold: 20,
  highThreshold: 90,
  ntfyTopic: "",
  ntfyEnabled: false,
  tankHeightCm: 50,
  autoPumpProtection: true,
};

const SETTINGS_KEY = "wms_settings";

export function loadSettings(): WmsSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(s: WmsSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* ─── PIN ───────────────────────────────────────────────────────── */
const PIN_KEY = "wms_pin";

export function getStoredPin(): string {
  return localStorage.getItem(PIN_KEY) || "1234";
}

export function setStoredPin(pin: string): void {
  localStorage.setItem(PIN_KEY, pin);
}

/* ─── Daily Summary ─────────────────────────────────────────────── */
export interface DailySummaryData {
  readings: number;
  avgLevel: number;
  peakLevel: number;
  troughLevel: number;
  pumpRuntimeMs: number;
  dryRunEvents: number;
  overflowEvents: number;
}

export function computeDailySummary(history: HistoryPoint[]): DailySummaryData | null {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const pts = history.filter(p => p.ts >= todayStart.getTime());
  if (pts.length === 0) return null;

  const levels = pts.map(p => p.level);
  const avgLevel = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);

  let pumpRuntimeMs = 0;
  let lastOnTs: number | null = null;
  let prevPump = false;
  let dryRunEvents = 0;
  let overflowEvents = 0;
  let prevDry = 0, prevOverflow = 0;

  for (const pt of pts) {
    if (pt.pumpOn && !prevPump) lastOnTs = pt.ts;
    if (!pt.pumpOn && prevPump && lastOnTs !== null) {
      pumpRuntimeMs += pt.ts - lastOnTs;
      lastOnTs = null;
    }
    prevPump = pt.pumpOn;
    if (pt.dry && !prevDry) dryRunEvents++;
    if (pt.overflow && !prevOverflow) overflowEvents++;
    prevDry = pt.dry;
    prevOverflow = pt.overflow;
  }
  if (prevPump && lastOnTs !== null) pumpRuntimeMs += Date.now() - lastOnTs;

  return {
    readings: pts.length,
    avgLevel,
    peakLevel: Math.max(...levels),
    troughLevel: Math.min(...levels),
    pumpRuntimeMs,
    dryRunEvents,
    overflowEvents,
  };
}

/* ─── CSV export ────────────────────────────────────────────────── */
export function exportCSV(history: HistoryPoint[]): void {
  const headers = "Timestamp,Level(%),Distance(cm),Dry Run,Overflow,Flow(L/min),Pump\n";
  const rows = history.map(p =>
    `${new Date(p.ts).toISOString()},${p.level},${p.distance},${p.dry},${p.overflow},${(p.flow / 10).toFixed(1)},${p.pumpOn ? "ON" : "OFF"}`
  ).join("\n");
  const blob = new Blob([headers + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `water_system_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── ntfy.sh push notification ────────────────────────────────── */
export async function sendNtfyAlert(topic: string, title: string, message: string): Promise<void> {
  if (!topic) return;
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: { Title: title, Priority: "high", Tags: "droplet,warning" },
      body: message,
    });
  } catch { /* best-effort — never block the UI */ }
}

/* ─── Format helpers ────────────────────────────────────────────── */
export function fmtDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}
