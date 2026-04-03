/*
 * ============================================================
 *  Smart Water Management System — ESP8266 NodeMCU Firmware
 *  Version 3.0  |  All improvements included
 * ============================================================
 *
 *  Hardware:
 *    - NodeMCU ESP8266 (or Wemos D1 Mini)
 *    - JSN-SR04T waterproof ultrasonic sensor  ← use this, not HC-SR04
 *        TRIG → D5 (GPIO14)   ECHO → D6 (GPIO12)
 *    - Relay module       → D1 (GPIO5)  [active-low]
 *    - YF-S201 flow meter → D2 (GPIO4)  [interrupt-capable pin]
 *
 *  Optional Arduino co-processor over SoftwareSerial:
 *    Incoming: "LEVEL:75;DIST:25;DRY:0;OVERFLOW:1;FLOW:18;"
 *    Outgoing: "APP_ON" / "APP_OFF"
 *
 *  Dashboard HTTP endpoints (served by this firmware):
 *    GET /data      → JSON {level,distance,dry,overflow,flow,pump}
 *    GET /on        → turns pump ON  (locked if dry-run protection active)
 *    GET /off       → turns pump OFF
 *    GET /status    → JSON {pump,locked,ip,rssi,tankHeight,sensorOffset}
 *    GET /calibrate?height=100&offset=5  → saves to EEPROM
 *
 *  Improvements in v3:
 *    1. mDNS          → reachable at http://water-system.local
 *    2. EEPROM        → persist tank calibration across power cycles
 *    3. Hardware WDT  → auto-reboot if firmware hangs
 *    4. WiFi reconnect → exponential back-off (2s → 4s → ... → 64s max)
 *    5. Flow meter    → YF-S201 interrupt-driven pulse counting
 *    6. Auto protect  → pump forced OFF + locked on dry-run detect
 *    7. Hysteresis    → pump lock releases only after level recovers 5% above threshold
 *
 *  Quick start:
 *    1. Set WIFI_SSID / WIFI_PASSWORD below.
 *    2. Board: "NodeMCU 1.0 (ESP-12E Module)", 115200 baud.
 *    3. Flash, open Serial Monitor, navigate to http://water-system.local
 *    4. In Dashboard.tsx set DEMO_MODE = false and point fetch to /data.
 * ============================================================
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <EEPROM.h>

/* ─── WiFi credentials ─────────────────────────────────────────── */
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MDNS_NAME     = "water-system"; // http://water-system.local

/* ─── Pins ─────────────────────────────────────────────────────── */
#define TRIG_PIN   14  // D5
#define ECHO_PIN   12  // D6
#define RELAY_PIN   5  // D1  (LOW = pump ON — active-low relay)
#define FLOW_PIN    4  // D2  (YF-S201 pulse output)

/* ─── EEPROM layout ────────────────────────────────────────────── */
#define EEPROM_SIZE     4
#define ADDR_TANK_H     0   // uint16 (bytes 0-1): tank height in cm
#define ADDR_OFFSET     2   // uint8  (byte  2)  : sensor offset cm

/* ─── Calibration defaults (overwritten from EEPROM if saved) ──── */
uint16_t TANK_HEIGHT_CM = 100;
uint8_t  SENSOR_OFFSET  = 5;

/* ─── Alert thresholds ─────────────────────────────────────────── */
#define DRY_RUN_LEVEL    10   // % — auto-protect below this
#define OVERFLOW_LEVEL   90   // % — overflow flag above this

/* ─── Runtime state ────────────────────────────────────────────── */
struct SensorData {
  int level;    // 0–100 %
  int distance; // cm from sensor face
  int dry;      // 1 if dry-run
  int overflow; // 1 if overflow
  int flow;     // L/min × 10  (int)
} sd = {0, 0, 0, 0, 0};

bool pumpOn     = false;
bool pumpLocked = false;   // locked off by auto-protection

/* ─── Flow meter ───────────────────────────────────────────────── */
volatile unsigned long flowPulses = 0;
void IRAM_ATTR onFlowPulse() { flowPulses++; }
unsigned long lastFlowCalcMs = 0;

/* ─── WiFi reconnect ───────────────────────────────────────────── */
unsigned long lastWifiAttemptMs = 0;
unsigned long wifiRetryDelayMs  = 2000;

/* ─── Timing ───────────────────────────────────────────────────── */
unsigned long lastSensorMs = 0;
const unsigned long SENSOR_INTERVAL_MS = 1000;

ESP8266WebServer server(80);

/* ═══════════════════════════════════════════════════════════════ */

void loadCalibration() {
  EEPROM.begin(EEPROM_SIZE);
  uint16_t h; EEPROM.get(ADDR_TANK_H, h);
  uint8_t  o = EEPROM.read(ADDR_OFFSET);
  EEPROM.end();
  if (h > 10 && h < 1000) TANK_HEIGHT_CM = h;
  if (o < 50)              SENSOR_OFFSET  = o;
  Serial.printf("[EEPROM] tankH=%dcm offset=%dcm\n", TANK_HEIGHT_CM, SENSOR_OFFSET);
}

void saveCalibration(uint16_t h, uint8_t o) {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.put(ADDR_TANK_H, h);
  EEPROM.write(ADDR_OFFSET, o);
  EEPROM.commit();
  EEPROM.end();
  TANK_HEIGHT_CM = h;
  SENSOR_OFFSET  = o;
  Serial.printf("[EEPROM] Saved tankH=%dcm offset=%dcm\n", h, o);
}

/* ── WiFi with exponential back-off reconnect ── */
void connectWifi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 12000) {
    ESP.wdtFeed(); delay(250); Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryDelayMs = 2000;
    Serial.printf("\n[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Initial connection failed — will retry in loop.");
  }
}

void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED) { wifiRetryDelayMs = 2000; return; }
  unsigned long now = millis();
  if (now - lastWifiAttemptMs < wifiRetryDelayMs) return;
  lastWifiAttemptMs = now;
  Serial.printf("[WiFi] Retry (delay=%lums)...\n", wifiRetryDelayMs);
  WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  wifiRetryDelayMs = min((unsigned long)64000, wifiRetryDelayMs * 2);
}

/* ── Ultrasonic: median of 5 samples ── */
float readDistanceCm() {
  float s[5];
  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    s[i] = (dur == 0) ? 999.0f : dur * 0.0343f / 2.0f;
    ESP.wdtFeed(); delay(8);
  }
  for (int i = 0; i < 4; i++)
    for (int j = i+1; j < 5; j++)
      if (s[i] > s[j]) { float t = s[i]; s[i] = s[j]; s[j] = t; }
  return s[2];
}

void readSensors() {
  /* ── Ultrasonic ── */
  float dist = max((float)SENSOR_OFFSET, readDistanceCm());
  float waterH = (float)TANK_HEIGHT_CM - dist + SENSOR_OFFSET;
  sd.distance = (int)dist;
  sd.level    = constrain((int)(waterH * 100.0f / TANK_HEIGHT_CM), 0, 100);
  sd.dry      = (sd.level < DRY_RUN_LEVEL)  ? 1 : 0;
  sd.overflow = (sd.level > OVERFLOW_LEVEL) ? 1 : 0;

  /* ── Flow meter (update every 2 s) ── */
  unsigned long now = millis();
  if (now - lastFlowCalcMs >= 2000) {
    unsigned long p = flowPulses; flowPulses = 0;
    float interval  = (now - lastFlowCalcMs) / 1000.0f;
    // YF-S201: ~7.5 pulses/s per L/min
    sd.flow        = (int)((float)p / (7.5f * interval) * 10.0f);
    lastFlowCalcMs = now;
  }

  /* ── Auto pump protection ── */
  if (sd.dry && pumpOn) {
    pumpOn     = false;
    pumpLocked = true;
    digitalWrite(RELAY_PIN, HIGH);
    Serial.println("APP_OFF");
    Serial.println("[PROTECT] Dry run → pump locked OFF.");
  }
  if (pumpLocked && sd.level > (DRY_RUN_LEVEL + 5)) {
    pumpLocked = false;
    Serial.println("[PROTECT] Level recovered → pump lock released.");
  }

  Serial.printf("[DATA] Lvl:%d%% Dist:%dcm Dry:%d Ovf:%d Flow:%d.%dL/m Pump:%s\n",
    sd.level, sd.distance, sd.dry, sd.overflow,
    sd.flow/10, sd.flow%10, pumpOn?"ON":"OFF");
}

/* ── CORS helper ── */
void cors() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Cache-Control", "no-cache,no-store,must-revalidate");
}

/* ── Routes ── */
void onData() {
  cors();
  String j = "{\"level\":";    j += sd.level;
  j += ",\"distance\":";       j += sd.distance;
  j += ",\"dry\":";            j += sd.dry;
  j += ",\"overflow\":";       j += sd.overflow;
  j += ",\"flow\":";           j += sd.flow;
  j += ",\"pump\":\"";         j += pumpOn ? "ON" : "OFF";
  j += "\"}";
  server.send(200, "application/json", j);
}

void onOn() {
  cors();
  if (pumpLocked) { server.send(423, "application/json", "{\"status\":\"locked\",\"reason\":\"dry_run_protection\"}"); return; }
  pumpOn = true;
  digitalWrite(RELAY_PIN, LOW);
  Serial.println("APP_ON");
  server.send(200, "application/json", "{\"status\":\"ok\",\"pump\":\"ON\"}");
}

void onOff() {
  cors();
  pumpOn = false;
  digitalWrite(RELAY_PIN, HIGH);
  Serial.println("APP_OFF");
  server.send(200, "application/json", "{\"status\":\"ok\",\"pump\":\"OFF\"}");
}

void onStatus() {
  cors();
  String j = "{\"pump\":\"";      j += pumpOn ? "ON" : "OFF";
  j += "\",\"locked\":";          j += pumpLocked ? "true" : "false";
  j += ",\"ip\":\"";              j += WiFi.localIP().toString();
  j += "\",\"rssi\":";            j += WiFi.RSSI();
  j += ",\"tankHeight\":";        j += TANK_HEIGHT_CM;
  j += ",\"sensorOffset\":";      j += SENSOR_OFFSET;
  j += "}";
  server.send(200, "application/json", j);
}

void onCalibrate() {
  cors();
  if (server.hasArg("height") && server.hasArg("offset")) {
    uint16_t h = server.arg("height").toInt();
    uint8_t  o = server.arg("offset").toInt();
    if (h > 10 && h < 1000 && o < 50) {
      saveCalibration(h, o);
      server.send(200, "application/json", "{\"status\":\"ok\"}");
      return;
    }
  }
  server.send(400, "application/json", "{\"status\":\"error\",\"msg\":\"invalid params\"}");
}

void onRoot() {
  cors();
  String html = "<!DOCTYPE html><html><head><title>Smart Water System</title>"
    "<style>body{font-family:system-ui;background:#030712;color:#e2e8f0;"
    "display:flex;align-items:center;justify-content:center;height:100vh;margin:0}"
    "a{color:#38bdf8} code{background:#0c1a2e;padding:2px 7px;border-radius:4px}</style>"
    "</head><body><div style='text-align:center'>"
    "<h2>&#128167; Smart Water Management System</h2>"
    "<p>Firmware v3.0 running at <code>" + WiFi.localIP().toString() + "</code></p>"
    "<p>mDNS: <code>http://" + String(MDNS_NAME) + ".local</code></p>"
    "<p><a href='/data'>GET /data</a>&nbsp;&nbsp;<a href='/status'>GET /status</a></p>"
    "</div></body></html>";
  server.send(200, "text/html", html);
}

void onOptions() { cors(); server.send(204); }

/* ═══════════════════════════════════════════════════════════════ */
void setup() {
  Serial.begin(115200);
  Serial.println("\n[BOOT] Smart Water Management v3.0");

  ESP.wdtEnable(8000); // 8-second hardware watchdog

  pinMode(TRIG_PIN,  OUTPUT);
  pinMode(ECHO_PIN,  INPUT);
  pinMode(RELAY_PIN, OUTPUT); digitalWrite(RELAY_PIN, HIGH); // pump OFF
  pinMode(FLOW_PIN,  INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onFlowPulse, FALLING);

  loadCalibration();
  connectWifi();

  if (MDNS.begin(MDNS_NAME)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("[mDNS] http://%s.local\n", MDNS_NAME);
  }

  server.on("/",          HTTP_GET,     onRoot);
  server.on("/data",      HTTP_GET,     onData);
  server.on("/on",        HTTP_GET,     onOn);
  server.on("/off",       HTTP_GET,     onOff);
  server.on("/status",    HTTP_GET,     onStatus);
  server.on("/calibrate", HTTP_GET,     onCalibrate);
  server.on("/data",      HTTP_OPTIONS, onOptions);
  server.on("/on",        HTTP_OPTIONS, onOptions);
  server.on("/off",       HTTP_OPTIONS, onOptions);
  server.onNotFound([]() { server.send(404, "application/json", "{\"error\":\"not found\"}"); });

  server.begin();
  Serial.println("[HTTP] Server started on port 80");

  readSensors();
  lastSensorMs = millis();
}

void loop() {
  ESP.wdtFeed();          // feed hardware watchdog every iteration
  maintainWifi();         // reconnect with back-off if disconnected
  if (WiFi.status() == WL_CONNECTED) MDNS.update();
  server.handleClient();
  if (millis() - lastSensorMs >= SENSOR_INTERVAL_MS) {
    lastSensorMs = millis();
    readSensors();
  }
}
