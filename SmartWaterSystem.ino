/*
 * ============================================================
 *  Smart Water Management System — ESP8266 Firmware
 *  Target: NodeMCU / ESP8266
 *  Dependencies:
 *    - ESP8266WiFi (built-in)
 *    - ESP8266WebServer (built-in)
 *  Upload via Arduino IDE with board set to "NodeMCU 1.0 (ESP-12E Module)"
 * ============================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

// ============================================================
//  WiFi Setup — change these to your network credentials
// ============================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ============================================================
//  Web Server — listens on port 80
// ============================================================
ESP8266WebServer server(80);

// ============================================================
//  Sensor Data — updated every time Serial data arrives
// ============================================================
struct SensorData {
  int  level;     // 0-100 (%)
  int  distance;  // cm
  int  dry;       // 0 or 1
  int  overflow;  // 0 or 1
} sensorData = {0, 0, 0, 0};

String serialBuffer = "";   // accumulates incoming Serial bytes

// ============================================================
//  HTML Dashboard (stored in PROGMEM to save heap RAM)
// ============================================================
const char DASHBOARD_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Smart Water Management</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#030712;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;min-height:100vh}
  header{border-bottom:1px solid rgba(255,255,255,.07);padding:18px 24px;background:rgba(15,23,42,.8)}
  h1{font-size:clamp(15px,3vw,20px);font-weight:700;color:#f1f5f9}
  .subtitle{font-size:12px;color:#64748b;margin-top:4px}
  .conn{display:flex;align-items:center;gap:8px;font-size:12px}
  .dot{width:8px;height:8px;border-radius:50%;display:inline-block}
  .dot.ok{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.25)}
  .dot.err{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.25)}
  main{max-width:1050px;margin:0 auto;padding:20px 14px}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-bottom:18px}
  .card{background:rgba(15,23,42,.8);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:20px}
  .card-title{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px}
  .tank-wrap{display:flex;flex-direction:column;align-items:center;gap:14px}
  .tank{position:relative;width:100px;height:190px;border-radius:8px 8px 14px 14px;border:2px solid rgba(255,255,255,.14);overflow:hidden;background:rgba(255,255,255,.03)}
  .water{position:absolute;bottom:0;left:0;right:0;transition:height .8s cubic-bezier(.4,0,.2,1),background .5s;border-top-style:solid;border-top-width:2px}
  .water-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8);z-index:1}
  .tick{position:absolute;left:4px;width:12px;height:1px;background:rgba(255,255,255,.18);z-index:2}
  .progress-bar-track{height:16px;background:rgba(255,255,255,.06);border-radius:100px;overflow:hidden;margin-bottom:6px}
  .progress-bar-fill{height:100%;border-radius:100px;transition:width .8s cubic-bezier(.4,0,.2,1)}
  .big-pct{font-size:26px;font-weight:700}
  .status2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
  .status-card{border-radius:10px;padding:12px 14px;text-align:center;transition:all .4s}
  .status-card .sc-icon{font-size:16px;margin-bottom:3px}
  .status-card .sc-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#475569;margin-bottom:4px}
  .status-card .sc-val{font-size:12px;font-weight:700}
  .metrics2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .metric-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px;text-align:center}
  .metric-label{font-size:10px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
  .metric-value{font-size:20px;font-weight:700}
  .btn-row{display:flex;gap:14px;flex-wrap:wrap}
  .btn{flex:1 1 130px;padding:15px 20px;border-radius:10px;border:2px solid;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.02em}
  .btn-on{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.3);color:#22c55e}
  .btn-on:hover:not(:disabled){background:rgba(34,197,94,.18);border-color:#22c55e}
  .btn-off{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3);color:#ef4444}
  .btn-off:hover:not(:disabled){background:rgba(239,68,68,.18);border-color:#ef4444}
  .btn:disabled{opacity:.6;cursor:not-allowed}
  .pump-stat{flex:1 1 130px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px 16px;text-align:center}
  .pump-stat-label{font-size:11px;color:#64748b;margin-bottom:4px}
  .pump-stat-val{font-size:18px;font-weight:700}
  .chart-wrap{height:200px;position:relative}
  .footer-note{margin-top:16px;background:rgba(15,23,42,.6);border:1px solid rgba(56,189,248,.14);border-radius:10px;padding:12px 16px;font-size:12px;color:#64748b}
  .alert-bar{background:linear-gradient(90deg,#7f1d1d,#991b1b);padding:10px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(239,68,68,.3)}
  .alert-bar span{font-weight:600;font-size:13px}
  .dismiss{background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px}
  @keyframes wave{0%,100%{transform:scaleX(1.2) translateX(-5px)}50%{transform:scaleX(.9) translateX(5px)}}
  .wave{position:absolute;top:-6px;left:0;right:0;height:12px;opacity:.3;border-radius:50%;animation:wave 2s infinite ease-in-out}
</style>
</head>
<body>
<div id="alert-banner" style="display:none" class="alert-bar">
  <span id="alert-msg"></span>
  <button class="dismiss" onclick="document.getElementById('alert-banner').style.display='none'">Dismiss</button>
</div>
<header>
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <div>
      <h1>&#128167; Smart Water Management System</h1>
      <div class="subtitle">Real-Time Monitoring &amp; Control</div>
    </div>
    <div class="conn">
      <span id="conn-dot" class="dot ok"></span>
      <span id="conn-text" style="color:#86efac">Connected</span>
    </div>
  </div>
</header>
<main>
  <div class="grid2">
    <!-- Water Tank -->
    <div class="card">
      <div class="card-title">Water Tank</div>
      <div class="tank-wrap">
        <div class="tank">
          <div id="water-fill" class="water" style="height:0%"></div>
          <div class="water-pct" id="tank-pct">0%</div>
          <div class="tick" style="bottom:75%"></div>
          <div class="tick" style="bottom:50%"></div>
          <div class="tick" style="bottom:25%"></div>
        </div>
        <p style="font-size:13px;color:#64748b">Distance: <span id="dist-val" style="color:#e2e8f0;font-weight:600">-- cm</span></p>
      </div>
    </div>
    <!-- Right column -->
    <div style="display:flex;flex-direction:column;gap:14px">
      <!-- Progress -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <span class="card-title" style="margin:0">Water Level</span>
          <span class="big-pct" id="level-big" style="color:#22c55e">0%</span>
        </div>
        <div class="progress-bar-track"><div id="prog-fill" class="progress-bar-fill" style="width:0%;background:#22c55e"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#374151;margin-top:4px"><span>0%</span><span>50%</span><span>100%</span></div>
      </div>
      <!-- Status -->
      <div class="status2">
        <div id="dry-card" class="status-card" style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2)">
          <div class="sc-icon">&#128293;</div><div class="sc-label">Dry Run</div>
          <div class="sc-val" id="dry-val" style="color:#22c55e">SAFE</div>
        </div>
        <div id="ovf-card" class="status-card" style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2)">
          <div class="sc-icon">&#127754;</div><div class="sc-label">Overflow</div>
          <div class="sc-val" id="ovf-val" style="color:#22c55e">SAFE</div>
        </div>
      </div>
      <!-- Metrics -->
      <div class="metrics2">
        <div class="metric-card"><div class="metric-label">Water Level</div><div class="metric-value" id="m-level" style="color:#38bdf8">0%</div></div>
        <div class="metric-card"><div class="metric-label">Distance</div><div class="metric-value" id="m-dist" style="color:#a78bfa">-- cm</div></div>
      </div>
    </div>
  </div>

  <!-- Control Panel -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">Pump Control</div>
    <div class="btn-row">
      <button class="btn btn-on" onclick="sendCmd('on')" id="btn-on">&#9889; Turn Pump ON</button>
      <button class="btn btn-off" onclick="sendCmd('off')" id="btn-off">&#9940; Turn Pump OFF</button>
      <div class="pump-stat">
        <div class="pump-stat-label">Pump Status</div>
        <div class="pump-stat-val" id="pump-status" style="color:#64748b">&#8212;</div>
      </div>
    </div>
  </div>

  <!-- Chart -->
  <div class="card">
    <div class="card-title">Water Level History (Last 20 readings)</div>
    <div class="chart-wrap"><canvas id="myChart"></canvas></div>
  </div>

  <div class="footer-note">
    <strong style="color:#38bdf8">ESP8266 endpoint:</strong> This dashboard auto-refreshes from <code style="background:rgba(56,189,248,.1);padding:1px 5px;border-radius:4px;color:#7dd3fc">/data</code> every 2 seconds. Pump buttons call <code style="background:rgba(56,189,248,.1);padding:1px 5px;border-radius:4px;color:#7dd3fc">/on</code> and <code style="background:rgba(56,189,248,.1);padding:1px 5px;border-radius:4px;color:#7dd3fc">/off</code> which relay APP_ON / APP_OFF to Arduino via Serial.
  </div>
</main>
<script>
const labels = [], dataPoints = [];
let prevDry = 0, prevOverflow = 0, pumpStatus = 'unknown';

const ctx = document.getElementById('myChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels,
    datasets: [{
      label: 'Water Level (%)',
      data: dataPoints,
      borderColor: 'rgba(56,189,248,1)',
      backgroundColor: 'rgba(56,189,248,0.12)',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: 'rgba(56,189,248,1)',
      fill: true,
      tension: 0.4
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
      tooltip: { backgroundColor: 'rgba(15,23,42,.9)', titleColor: '#e2e8f0', bodyColor: '#94a3b8', borderColor: 'rgba(56,189,248,.3)', borderWidth: 1 }
    },
    scales: {
      x: { ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: 'rgba(255,255,255,.04)' } },
      y: { min: 0, max: 100, ticks: { color: '#64748b', font: { size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.04)' } }
    }
  }
});

function levelColor(l) {
  return l < 20 ? '#ef4444' : l < 50 ? '#f59e0b' : '#22c55e';
}
function waterBg(l) {
  return l < 20 ? 'rgba(239,68,68,0.5)' : l < 50 ? 'rgba(245,158,11,0.5)' : 'rgba(56,189,248,0.6)';
}

function updateUI(d) {
  const col = levelColor(d.level);
  document.getElementById('tank-pct').textContent = d.level + '%';
  const fill = document.getElementById('water-fill');
  fill.style.height = d.level + '%';
  fill.style.background = waterBg(d.level);
  fill.style.borderTopColor = col;
  if (!fill.querySelector('.wave')) {
    const w = document.createElement('div'); w.className = 'wave';
    w.style.background = col; fill.appendChild(w);
  } else { fill.querySelector('.wave').style.background = col; }

  document.getElementById('level-big').textContent = d.level + '%';
  document.getElementById('level-big').style.color = col;
  document.getElementById('prog-fill').style.width = d.level + '%';
  document.getElementById('prog-fill').style.background = col;

  document.getElementById('dist-val').textContent = d.distance + ' cm';
  document.getElementById('m-level').textContent = d.level + '%';
  document.getElementById('m-dist').textContent = d.distance + ' cm';

  // dry run
  const dryCard = document.getElementById('dry-card');
  const dryVal  = document.getElementById('dry-val');
  if (d.dry) {
    dryCard.style.background = 'rgba(239,68,68,.08)';
    dryCard.style.border = '1px solid rgba(239,68,68,.25)';
    dryVal.textContent = 'DETECTED'; dryVal.style.color = '#ef4444';
  } else {
    dryCard.style.background = 'rgba(34,197,94,.06)';
    dryCard.style.border = '1px solid rgba(34,197,94,.2)';
    dryVal.textContent = 'SAFE'; dryVal.style.color = '#22c55e';
  }
  // overflow
  const ovfCard = document.getElementById('ovf-card');
  const ovfVal  = document.getElementById('ovf-val');
  if (d.overflow) {
    ovfCard.style.background = 'rgba(239,68,68,.08)';
    ovfCard.style.border = '1px solid rgba(239,68,68,.25)';
    ovfVal.textContent = 'DETECTED'; ovfVal.style.color = '#ef4444';
  } else {
    ovfCard.style.background = 'rgba(34,197,94,.06)';
    ovfCard.style.border = '1px solid rgba(34,197,94,.2)';
    ovfVal.textContent = 'SAFE'; ovfVal.style.color = '#22c55e';
  }

  // alerts
  const banner = document.getElementById('alert-banner');
  const msg    = document.getElementById('alert-msg');
  if (d.dry && !prevDry)      { msg.textContent = '⚠️ Dry Run Detected!'; banner.style.display='flex'; }
  if (d.overflow && !prevOverflow) { msg.textContent = '⚠️ Overflow Detected!'; banner.style.display='flex'; }
  if (!d.dry && !d.overflow)  banner.style.display = 'none';
  prevDry = d.dry; prevOverflow = d.overflow;

  // chart
  const now = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  labels.push(now); dataPoints.push(d.level);
  if (labels.length > 20) { labels.shift(); dataPoints.shift(); }
  chart.update('none');

  document.getElementById('conn-dot').className = 'dot ok';
  document.getElementById('conn-text').textContent = 'Connected';
  document.getElementById('conn-text').style.color = '#86efac';
}

function fetchData() {
  fetch('/data')
    .then(r => r.json())
    .then(updateUI)
    .catch(() => {
      document.getElementById('conn-dot').className = 'dot err';
      document.getElementById('conn-text').textContent = 'Disconnected';
      document.getElementById('conn-text').style.color = '#fca5a5';
    });
}

function sendCmd(cmd) {
  fetch('/' + cmd)
    .then(() => {
      pumpStatus = cmd === 'on' ? 'ON' : 'OFF';
      const el = document.getElementById('pump-status');
      el.textContent = pumpStatus;
      el.style.color = cmd === 'on' ? '#22c55e' : '#ef4444';
    })
    .catch(() => {});
}

fetchData();
setInterval(fetchData, 2000);
</script>
</body>
</html>
)rawhtml";

// ============================================================
//  Route: "/" — Serve dashboard HTML
// ============================================================
void handleRoot() {
  server.send_P(200, "text/html", DASHBOARD_HTML);
}

// ============================================================
//  Route: "/data" — Return JSON sensor data
// ============================================================
void handleData() {
  // Build JSON manually to avoid ArduinoJson dependency
  String json = "{";
  json += "\"level\":"    + String(sensorData.level)    + ",";
  json += "\"distance\":" + String(sensorData.distance) + ",";
  json += "\"dry\":"      + String(sensorData.dry)      + ",";
  json += "\"overflow\":" + String(sensorData.overflow);
  json += "}";

  server.sendHeader("Cache-Control", "no-cache");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// ============================================================
//  Route: "/on" — Turn pump ON (send APP_ON to Arduino)
// ============================================================
void handleOn() {
  Serial.println("APP_ON");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", "Pump ON command sent");
}

// ============================================================
//  Route: "/off" — Turn pump OFF (send APP_OFF to Arduino)
// ============================================================
void handleOff() {
  Serial.println("APP_OFF");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", "Pump OFF command sent");
}

// ============================================================
//  Route: 404 Not Found
// ============================================================
void handleNotFound() {
  server.send(404, "text/plain", "Not Found");
}

// ============================================================
//  Serial Parser — reads "LEVEL:75;DIST:25;DRY:0;OVERFLOW:1;"
//  Safely parses each token without String fragmentation issues
// ============================================================
int parseToken(const String& s, const char* key) {
  int idx = s.indexOf(key);
  if (idx < 0) return 0;
  idx += strlen(key);         // skip past the key
  if (idx >= (int)s.length()) return 0;
  return s.substring(idx).toInt();
}

void processSerialLine(const String& line) {
  if (line.length() < 5) return;                // sanity check
  sensorData.level    = constrain(parseToken(line, "LEVEL:"),    0, 100);
  sensorData.distance = constrain(parseToken(line, "DIST:"),     0, 9999);
  sensorData.dry      = constrain(parseToken(line, "DRY:"),      0, 1);
  sensorData.overflow = constrain(parseToken(line, "OVERFLOW:"), 0, 1);
}

// ============================================================
//  Setup
// ============================================================
void setup() {
  // Begin serial communication with Arduino at 9600 baud
  Serial.begin(9600);

  // Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());

  // Register HTTP routes
  server.on("/",     HTTP_GET, handleRoot);
  server.on("/data", HTTP_GET, handleData);
  server.on("/on",   HTTP_GET, handleOn);
  server.on("/off",  HTTP_GET, handleOff);
  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("HTTP server started");
}

// ============================================================
//  Loop
// ============================================================
void loop() {
  // Handle incoming HTTP clients
  server.handleClient();

  // Read Serial data from Arduino
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      // Full line received — parse it
      serialBuffer.trim();
      if (serialBuffer.length() > 0) {
        processSerialLine(serialBuffer);
      }
      serialBuffer = "";         // reset buffer
    } else {
      // Guard against unbounded growth (corrupt data protection)
      if (serialBuffer.length() < 128) {
        serialBuffer += c;
      } else {
        serialBuffer = "";       // discard and start fresh
      }
    }
  }

  // Small yield to prevent watchdog resets under heavy HTTP load
  yield();
}
