/*
  Area-51 WiFi Voltage Meter + WebScope - (C)2026 By Mr. Matzo E-post: matsarlemark@gmail.com
  ---------------------------------------------------
  - I2C is working isch, hard for the ESP8266 to handle high freq. But you might use it for test and lab.
  - STA med sparade credentials (EEPROM). Om det inte funkar -> startar AP "area51-setup".
  - LittleFS för index.html/app.js/style.css (du laddar via Tools -> ESP8266 LittleFS upload).
  - /api/state för UI (DC-meter) + status
  - /ws (WebSocket): live scope-stream (binärt) + kommandon:
      SCOPE 0|1
      FS <hz>        (50..4000, realiteten beror på CPU/WiFi)
      PWM 0|1
      PWF <hz>       (100..5000 typiskt för ESP8266)
      PWP <pct>      (0..100)
      PROTO UART
      PINGSLAVE
      STATUSSLAVE
      SEND <text>
      HELPSLAVE
*/

#include <ESP8266WiFi.h>
#include <EEPROM.h>
#include <DNSServer.h>
#include <ArduinoOTA.h>
#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <SoftwareSerial.h>

// -------------------- USER CONFIG --------------------
static const char* AP_SSID = "area51-setup";
static const char* AP_PASS = "12345678";

// ADC calibration (mV). Justera så multimetern matchar bättre.
static const uint16_t ADC_REF_MV = 2980;
static const int16_t  ADC_OFFSET_MV = 0;

// PWM output pin
static const uint8_t PWM_PIN = D0;
static const uint16_t PWM_RANGE = 1023;

// -------------------- PROTOCOL TEST / MASTER LINK --------------------
enum ProtocolMode {
  PROTO_UART = 0
};

// UART master pins on oscilloscope ESP
static const uint8_t UART_RX_PIN = D7; // GPIO13
static const uint8_t UART_TX_PIN = D6; // GPIO12

// I2C removed from Protocol Lab in this build.
// D1/D5 are free for future SPI or other test wiring.
static const uint8_t I2C_SDA_PIN = D1; // reserved
static const uint8_t I2C_SCL_PIN = D5; // reserved

static ProtocolMode g_proto = PROTO_UART;
static ProtocolMode g_protoLocked = PROTO_UART;

static SoftwareSerial link(UART_RX_PIN, UART_TX_PIN);
static String g_uartRxLine = "";
static uint32_t g_lastProtoRxMs = 0;
static uint32_t g_lastProtoTxMs = 0;
static uint32_t g_lastHeartbeatTxMs = 0;
static bool g_heartbeatOn = true;
static bool g_linkUp = false;
static bool g_manualPingPendingUart = false;
static String g_bootReason = "";
static uint32_t g_bootCount = 0;

// Queue protocol-lab commands so I2C/UART work runs in loop(), not directly in WS callback.
static bool g_protoCmdPending = false;
static String g_protoCmdLine = "";

static const char* MASTER_BUILD_TAG = "MASTER_BUILD=UART_PWM_LAB_V1";

static const uint32_t HEARTBEAT_INTERVAL_MS = 1500;
static const uint32_t HEARTBEAT_TIMEOUT_MS  = 2600;

// -------------------- EEPROM LAYOUT --------------------
static const uint16_t EEPROM_SIZE = 256;
static const uint16_t EE_MAGIC_ADDR = 0;
static const uint32_t EE_MAGIC = 0xA51C0DEu;

static const uint16_t EE_SSID_ADDR  = 8;
static const uint16_t EE_PASS_ADDR  = 72;
static const uint16_t EE_STR_MAX    = 63;

// -------------------- NETWORK / SERVER --------------------
static AsyncWebServer server(80);
static AsyncWebSocket ws("/ws");
static DNSServer dns;
static bool g_staMode = false;

// -------------------- DC METER --------------------
static uint32_t g_lastDcMs = 0;
static uint16_t g_adcNow = 0;
static uint16_t g_mvNow  = 0;
static float g_mvFilt = 0.0f;

// -------------------- SCOPE --------------------
struct ScopeSample {
  uint32_t t_us;
  uint16_t adc;
  uint16_t mv;
};

static const uint16_t SCOPE_BUF_LEN = 1024;
static ScopeSample g_scopeBuf[SCOPE_BUF_LEN];
static volatile uint16_t g_scopeHead = 0;
static volatile uint16_t g_scopeTail = 0;

static bool     g_scopeOn = false;
static uint16_t g_scopeFs = 200;
static uint32_t g_scopePeriodUs = 5000;
static uint32_t g_scopeNextUs = 0;

static uint32_t g_lastWsSendMs = 0;
static const uint16_t WS_CHUNK_BYTES = 512;
static const uint8_t  WS_BURST_CHUNKS = 2;
static const uint16_t WS_SEND_INTERVAL_MS = 40;

// -------------------- PERF STATS --------------------
static uint32_t g_statLastMs = 0;
static uint32_t g_statSamples = 0;
static uint64_t g_statDtSumUs = 0;
static uint32_t g_statDtMinUs = 0xFFFFFFFFu;
static uint32_t g_statDtMaxUs = 0;
static uint32_t g_statLastSampleUs = 0;
static uint32_t g_statLoopMinUs = 0xFFFFFFFFu;
static uint32_t g_statLoopMaxUs = 0;
static uint64_t g_statLoopSumUs = 0;
static uint32_t g_statLoops = 0;
static uint32_t g_statWsBytes = 0;
static uint32_t g_statWsBursts = 0;

// -------------------- PWM STATE --------------------
static bool     g_pwmOn = false;
static uint16_t g_pwmHz = 200;
static uint8_t  g_pwmDutyPct = 50;

// -------------------- UTIL --------------------
static inline uint16_t adcToMv(uint16_t adc) {
  int32_t mv = (int32_t)adc * (int32_t)ADC_REF_MV;
  mv = mv / 1023;
  mv += (int32_t)ADC_OFFSET_MV;
  if (mv < 0) mv = 0;
  if (mv > 65535) mv = 65535;
  return (uint16_t)mv;
}

static inline bool wsHasClients() {
  return ws.count() > 0;
}

static const bool SERIAL_DEBUG_MIRROR = false;
static const bool PROTO_DEBUG_V19 = true;

static void wsTextAll(const String& s) {
  ws.textAll(s);
  if (SERIAL_DEBUG_MIRROR) Serial.println(s);
}

static const char* protoToStr(ProtocolMode p) {
  (void)p;
  return "UART";
}

static void dbgProto(const String& tag) {
  if (!PROTO_DEBUG_V19) return;
  wsTextAll(String("DBG_PROTO=") + tag + ";LOCKED=" + protoToStr(g_protoLocked) + ";EFFECTIVE=" + protoToStr(g_proto));
}

static void wsSendProtoState() {
  wsTextAll(String("PROTO=") + protoToStr(g_proto));
  wsTextAll(String("PROTO_LOCKED=") + protoToStr(g_protoLocked));
  wsTextAll("LAB_MODE=UART_ONLY");
  wsTextAll(String("UART_PINS=RX:D7(GPIO13),TX:D6(GPIO12)"));
  wsTextAll(String("PWM_PIN=") + PWM_PIN);
}

static void setLinkState(bool up) {
  if (g_linkUp == up) return;
  g_linkUp = up;
  wsTextAll(String("LINK=") + (g_linkUp ? "UP" : "DOWN"));
}

static void flushUartLink(bool emitOverflow = false) {
  while (link.available()) {
    (void)link.read();
    yield();
  }
  g_uartRxLine = "";
  if (emitOverflow) wsTextAll("WARN=UART_FLUSH");
}

static void setProtocolMode(ProtocolMode p) {
  (void)p;
  wsTextAll("PROTO_REQ=UART");
  dbgProto("SET_REQ_UART");
  g_proto = PROTO_UART;
  g_protoLocked = PROTO_UART;
  g_lastHeartbeatTxMs = millis();
  g_lastProtoRxMs = 0;
  g_manualPingPendingUart = false;
  flushUartLink(false);
  link.listen();
  delay(2);
  setLinkState(false);
  wsSendProtoState();
  dbgProto("SET_DONE_UART");
}

static void initProtocolEngines() {
  link.begin(9600);
  link.listen();

  Serial.println("Protocol engines init:");
  Serial.print("UART RX="); Serial.println(UART_RX_PIN);
  Serial.print("UART TX="); Serial.println(UART_TX_PIN);
  Serial.print("PWM PIN="); Serial.println(PWM_PIN);
}


static void reinitI2CBus() {
  wsTextAll("ERR=I2C_DISABLED");
}

static void sendViaUART(const String& msg) {
  link.listen();
  link.println(msg);
  g_lastProtoTxMs = millis();
  wsTextAll(String("TX_UART=") + msg);
}

static String requestI2CReply(uint8_t maxLen = 64) {
  (void)maxLen;
  return "";
}

static void sendViaI2C(const String& msg) {
  (void)msg;
  wsTextAll("ERR=I2C_DISABLED");
}

static void sendAsciiMessage(const String& msg) {
  if (!msg.length()) return;

  dbgProto(String("SEND_ENTER_") + msg);
  g_proto = PROTO_UART;
  g_protoLocked = PROTO_UART;
  wsTextAll("DISPATCH_PROTO=UART");
  dbgProto(String("DISPATCH_") + msg);
  sendViaUART(msg);
}

static void pollUartLink() {
  if (g_protoLocked != PROTO_UART) {
    flushUartLink(false);
    return;
  }

  link.listen();

  while (link.available()) {
    char c = (char)link.read();

    if (c == '\r') continue;

    if (c == '\n') {
      g_uartRxLine.trim();
      if (g_uartRxLine.length()) {
        g_lastProtoRxMs = millis();
        setLinkState(true);

        if (g_uartRxLine == "ACK HB" || g_uartRxLine == "CONFIRMED - HB") {
          g_uartRxLine = "";
          continue;
        }

        if (g_uartRxLine == "ACK PING") g_manualPingPendingUart = false;
        wsTextAll(String("RX_UART=") + g_uartRxLine);
      }
      g_uartRxLine = "";
    } else {
      g_uartRxLine += c;
      if (g_uartRxLine.length() > 120) {
        g_uartRxLine = "";
        wsTextAll("ERR=UART_RX_OVERFLOW");
      }
    }
  }
}

static void scanI2C() {
  dbgProto("SCAN_ENTER");
  wsTextAll("ERR=I2C_DISABLED");
}

static bool protoLinkAlive() {
  return (millis() - g_lastProtoRxMs) < HEARTBEAT_TIMEOUT_MS;
}

static void serviceHeartbeat() {
  if (!g_heartbeatOn) return;

  unsigned long now = millis();

  if ((now - g_lastHeartbeatTxMs) >= HEARTBEAT_INTERVAL_MS) {
    link.listen();
    link.println("HB");
    yield();
    g_lastHeartbeatTxMs = now;
  }

  setLinkState(protoLinkAlive());
}


// -------------------- EEPROM HELPERS --------------------
static void eeWriteString(uint16_t addr, const String& s) {
  uint16_t n = (uint16_t)min((int)EE_STR_MAX, (int)s.length());
  for (uint16_t i = 0; i < EE_STR_MAX; i++) {
    EEPROM.write(addr + i, (i < n) ? (uint8_t)s[i] : 0);
  }
}

static String eeReadString(uint16_t addr) {
  char buf[EE_STR_MAX + 1];
  for (uint16_t i = 0; i < EE_STR_MAX; i++) {
    buf[i] = (char)EEPROM.read(addr + i);
    if (buf[i] == 0) break;
  }
  buf[EE_STR_MAX] = 0;
  return String(buf);
}

static bool loadCredentials(String& ssid, String& pass) {
  uint32_t magic = 0;
  EEPROM.get(EE_MAGIC_ADDR, magic);
  if (magic != EE_MAGIC) return false;

  ssid = eeReadString(EE_SSID_ADDR);
  pass = eeReadString(EE_PASS_ADDR);
  return ssid.length() > 0;
}

static void saveCredentials(const String& ssid, const String& pass) {
  EEPROM.put(EE_MAGIC_ADDR, EE_MAGIC);
  eeWriteString(EE_SSID_ADDR, ssid);
  eeWriteString(EE_PASS_ADDR, pass);
  EEPROM.commit();
}

static void clearCredentials() {
  EEPROM.put(EE_MAGIC_ADDR, (uint32_t)0);
  for (uint16_t i = 0; i < EE_STR_MAX; i++) {
    EEPROM.write(EE_SSID_ADDR + i, 0);
    EEPROM.write(EE_PASS_ADDR + i, 0);
  }
  EEPROM.commit();
}

// -------------------- WIFI FLOW --------------------
static void startSetupAP();

static bool tryConnectSTA(const String& ssid, const String& pass) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  uint32_t t0 = millis();
  while (millis() - t0 < 12000) {
    if (WiFi.status() == WL_CONNECTED) return true;
    delay(50);
    yield();
  }
  return false;
}

// -------------------- SCOPE CORE --------------------
static void scopeSetFs(uint16_t fs) {
  if (fs < 50) fs = 50;
  uint16_t maxFs = 1000;
  if (ws.count() > 0) maxFs = 300;
  if (g_pwmOn) maxFs = min<uint16_t>(maxFs, 200);
  if (fs > maxFs) fs = maxFs;

  g_scopeFs = fs;
  g_scopePeriodUs = (uint32_t)(1000000UL / (uint32_t)fs);
  if (g_scopePeriodUs == 0) g_scopePeriodUs = 1;

  wsTextAll(String("FS=") + g_scopeFs);
}

static void scopeStart(uint16_t fs) {
  scopeSetFs(fs);
  g_scopeHead = g_scopeTail = 0;
  g_scopeNextUs = micros();
  g_scopeOn = true;
  wsTextAll("SCOPE=1");
}

static void scopeStop() {
  g_scopeOn = false;
  wsTextAll("SCOPE=0");
}

static inline void scopePush(uint16_t adc, uint16_t mv) {
  uint16_t h = g_scopeHead;
  g_scopeBuf[h].t_us = micros();
  g_scopeBuf[h].adc  = adc;
  g_scopeBuf[h].mv   = mv;
  uint16_t h2 = (uint16_t)((h + 1) % SCOPE_BUF_LEN);
  g_scopeHead = h2;

  if (h2 == g_scopeTail) {
    g_scopeTail = (uint16_t)((g_scopeTail + 1) % SCOPE_BUF_LEN);
  }
}

static inline uint16_t _median3_u16(uint16_t a, uint16_t b, uint16_t c) {
  if (a > b) { uint16_t t=a; a=b; b=t; }
  if (b > c) { uint16_t t=b; b=c; c=t; }
  if (a > b) { uint16_t t=a; a=b; b=t; }
  return b;
}

static void scopeSamplePump() {
  if (!g_scopeOn) return;

  uint8_t catchUp = 0;
  uint32_t now = micros();

  while ((int32_t)(now - g_scopeNextUs) >= 0) {
    uint16_t a0 = (uint16_t)analogRead(A0);
    uint16_t adc = a0;

    if (g_scopeFs <= 400) {
      uint16_t a1 = (uint16_t)analogRead(A0);
      uint16_t a2 = (uint16_t)analogRead(A0);
      adc = _median3_u16(a0, a1, a2);
    }

    uint16_t mv = adcToMv(adc);
    scopePush(adc, mv);
    g_scopeBuf[(uint16_t)((g_scopeHead + SCOPE_BUF_LEN - 1) % SCOPE_BUF_LEN)].t_us = g_scopeNextUs;

    uint32_t curUs = g_scopeNextUs;
    if (g_statLastSampleUs != 0) {
      uint32_t dtUs = (uint32_t)(curUs - g_statLastSampleUs);
      if (dtUs < g_statDtMinUs) g_statDtMinUs = dtUs;
      if (dtUs > g_statDtMaxUs) g_statDtMaxUs = dtUs;
      g_statDtSumUs += (uint64_t)dtUs;
    }
    g_statLastSampleUs = curUs;
    g_statSamples++;

    g_scopeNextUs += g_scopePeriodUs;

    if (++catchUp >= 2) { yield(); break; }
    now = micros();
  }
  yield();
}

static void scopeServiceFast() {
  if (!g_scopeOn) return;
}

static void sendScopeChunksIfDue() {
  if (!g_scopeOn) return;
  if (!wsHasClients()) return;

  uint32_t nowMs = millis();
  if ((uint32_t)(nowMs - g_lastWsSendMs) < WS_SEND_INTERVAL_MS) return;
  g_lastWsSendMs = nowMs;

  static uint8_t out[WS_CHUNK_BYTES];

  for (uint8_t c = 0; c < WS_BURST_CHUNKS; c++) {
    yield();
    uint16_t tail = g_scopeTail;
    uint16_t head = g_scopeHead;
    if (tail == head) break;

    uint16_t bytes = 0;
    while (bytes + 8 <= WS_CHUNK_BYTES) {
      if (tail == head) break;
      const ScopeSample& s = g_scopeBuf[tail];

      uint32_t t_us = s.t_us;
      out[bytes + 0] = (uint8_t)(t_us & 0xFF);
      out[bytes + 1] = (uint8_t)((t_us >> 8) & 0xFF);
      out[bytes + 2] = (uint8_t)((t_us >> 16) & 0xFF);
      out[bytes + 3] = (uint8_t)((t_us >> 24) & 0xFF);
      out[bytes + 4] = (uint8_t)(s.adc & 0xFF);
      out[bytes + 5] = (uint8_t)((s.adc >> 8) & 0xFF);
      out[bytes + 6] = (uint8_t)(s.mv & 0xFF);
      out[bytes + 7] = (uint8_t)((s.mv >> 8) & 0xFF);

      bytes += 8;
      tail = (uint16_t)((tail + 1) % SCOPE_BUF_LEN);
    }

    g_scopeTail = tail;
    if (bytes > 0) {
      ws.binaryAll(out, bytes);
      g_statWsBytes += bytes;
      g_statWsBursts++;
      yield();
    } else {
      break;
    }
  }
}

// -------------------- PWM CORE --------------------
static void pwmApply() {
  if (!g_pwmOn) {
    analogWrite(PWM_PIN, 0);
    return;
  }
  analogWriteFreq(g_pwmHz);
  analogWriteRange(PWM_RANGE);
  uint16_t duty = (uint16_t)((uint32_t)g_pwmDutyPct * PWM_RANGE / 100U);
  if (duty > PWM_RANGE) duty = PWM_RANGE;
  analogWrite(PWM_PIN, duty);
}

static void pwmSetOn(bool on) {
  g_pwmOn = on;
  pwmApply();
  if (g_pwmOn && g_scopeFs > 200) scopeSetFs(200);
  wsTextAll(String("PWM=") + (g_pwmOn ? 1 : 0));
}

static void pwmSetHz(uint16_t hz) {
  if (hz < 50) hz = 50;
  if (hz > 5000) hz = 5000;
  g_pwmHz = hz;
  pwmApply();
  wsTextAll(String("PWF=") + g_pwmHz);
}

static void pwmSetDuty(uint8_t pct) {
  if (pct > 100) pct = 100;
  g_pwmDutyPct = pct;
  pwmApply();
  wsTextAll(String("PWP=") + g_pwmDutyPct);
}

// -------------------- API / ROUTES --------------------
static void handleApiState(AsyncWebServerRequest* req) {
  char buf[768];

  snprintf(
    buf, sizeof(buf),
    "scope=%d;"
    "fs=%u;"
    "dtUs=%lu;"
    "pwm=%d;"
    "pwf=%u;"
    "pwp=%u;"
    "adc=%u;"
    "mv=%u;"
    "mode=%s;"
    "ip=%s;"
    "rssi=%d;"
    "proto=%s;"
    "proto_locked=%s;"
    "uart_rx_pin=%u;"
    "uart_tx_pin=%u;"
    "pwm_pin=%u;"
    "last_tx_ms=%lu;"
    "last_rx_ms=%lu;"
    "err=;",
    g_scopeOn ? 1 : 0,
    g_scopeFs,
    (unsigned long)g_scopePeriodUs,
    g_pwmOn ? 1 : 0,
    g_pwmHz,
    g_pwmDutyPct,
    g_adcNow,
    g_mvNow,
    g_staMode ? "STA" : "AP",
    g_staMode ? WiFi.localIP().toString().c_str() : WiFi.softAPIP().toString().c_str(),
    g_staMode ? WiFi.RSSI() : 0,
    protoToStr(g_protoLocked),
    protoToStr(g_protoLocked),
    UART_RX_PIN,
    UART_TX_PIN,
    PWM_PIN,
    (unsigned long)g_lastProtoTxMs,
    (unsigned long)g_lastProtoRxMs
  );

  req->send(200, "text/plain", buf);
}

static void handleApiResetWifi(AsyncWebServerRequest* req) {
  clearCredentials();
  req->send(200, "text/plain", "OK");
  delay(150);
  ESP.restart();
}

// -------------------- WS HANDLER --------------------
static bool parseLongStrict(const String& s, long& out) {
  String t = s;
  t.trim();
  if (!t.length()) return false;

  int i = 0;
  if (t[0] == '+' || t[0] == '-') {
    i = 1;
    if (t.length() == 1) return false;
  }
  for (; i < (int)t.length(); i++) {
    char c = t[i];
    if (c < '0' || c > '9') return false;
  }
  out = t.toInt();
  return true;
}

static uint16_t clampU16(long v, uint16_t lo, uint16_t hi) {
  if (v < (long)lo) return lo;
  if (v > (long)hi) return hi;
  return (uint16_t)v;
}

static uint8_t clampU8(long v, uint8_t lo, uint8_t hi) {
  if (v < (long)lo) return lo;
  if (v > (long)hi) return hi;
  return (uint8_t)v;
}


static void traceLab(const String& s) {
  Serial.println(String("TRACE=") + s);
}

static void queueProtoCommand(const String& line) {
  if (g_protoCmdPending) {
    wsTextAll("ERR=PROTO_CMD_BUSY");
    return;
  }
  g_protoCmdLine = line;
  g_protoCmdPending = true;
  wsTextAll(String("PROTOQ=") + line);
  Serial.println(String("PROTOQ=") + line);
}

static void processQueuedProtoCommand() {
  if (!g_protoCmdPending) return;

  String s = g_protoCmdLine;
  g_protoCmdLine = "";
  g_protoCmdPending = false;

  s.trim();
  if (!s.length()) return;

  int sp = s.indexOf(' ');
  String cmd = (sp >= 0) ? s.substring(0, sp) : s;
  String arg = (sp >= 0) ? s.substring(sp + 1) : "";
  cmd.toUpperCase();
  arg.trim();

  if (cmd == "SEND") {
    if (!arg.length()) return;
    sendAsciiMessage(arg);
    return;
  }

  if (cmd == "PROTO") {
    String p = arg;
    p.toUpperCase();

    if (p == "UART" || p.length() == 0) {
      wsTextAll("ACK=PROTO_UART");
      setProtocolMode(PROTO_UART);
      return;
    }

    wsTextAll("ERR=ONLY_UART_SUPPORTED");
    return;
  }

  if (cmd == "I2CA" || cmd == "I2CSCAN") {
    wsTextAll("ERR=I2C_DISABLED");
    return;
  }

  if (cmd == "PINGSLAVE") {
    g_manualPingPendingUart = true;
    sendAsciiMessage("PING");
    return;
  }

  if (cmd == "STATUSSLAVE") {
    sendAsciiMessage("STATUS");
    return;
  }

  if (cmd == "HELPSLAVE") {
    sendAsciiMessage("TEXT HELP");
    return;
  }
}

static void handleWsText(const String& msg) {
  String s = msg;
  s.trim();
  if (!s.length()) return;
  traceLab(String("PROCESS_QCMD=") + s);

  int sp = s.indexOf(' ');
  String cmd = (sp >= 0) ? s.substring(0, sp) : s;
  String arg = (sp >= 0) ? s.substring(sp + 1) : "";
  cmd.toUpperCase();
  arg.trim();

  long n = 0;
  bool haveNum = parseLongStrict(arg, n);

  if (cmd == "SCOPE") {
    int on = haveNum ? (n != 0) : 0;
    if (on) scopeStart(g_scopeFs); else scopeStop();
    return;
  }

  if (cmd == "FS") {
    if (!haveNum) return;
    scopeSetFs(clampU16(n, 50, 4000));
    return;
  }

  if (cmd == "PWM") {
    int on = haveNum ? (n != 0) : 0;
    pwmSetOn(on != 0);
    return;
  }

  if (cmd == "PWF") {
    if (!haveNum) return;
    pwmSetHz(clampU16(n, 50, 5000));
    return;
  }

  if (cmd == "PWP") {
    if (!haveNum) return;
    pwmSetDuty(clampU8(n, 0, 100));
    return;
  }

  if (cmd == "SEND") {
    if (!arg.length()) return;
    queueProtoCommand(String("SEND ") + arg);
    return;
  }

  if (cmd == "PROTO") {
    queueProtoCommand(String("PROTO ") + arg);
    return;
  }

  if (cmd == "I2CA" || cmd == "I2CSCAN") {
    wsTextAll("ERR=I2C_DISABLED");
    return;
  }

  if (cmd == "PINGSLAVE") {
    queueProtoCommand("PINGSLAVE");
    return;
  }

  if (cmd == "STATUSSLAVE") {
    queueProtoCommand("STATUSSLAVE");
    return;
  }

  if (cmd == "HELPSLAVE") {
    queueProtoCommand("HELPSLAVE");
    return;
  }

  if (cmd == "HELP") {
    wsTextAll("HELP=SCOPE 0|1,FS n,PWM 0|1,PWF n,PWP n,PROTO UART,PINGSLAVE,STATUSSLAVE,HELPSLAVE,SEND TEXT <msg>. Slave text commands: LED ON/OFF, RED ON/OFF, BLINK SLOW/FAST/CRAZY, RED BLINK SLOW/FAST/CRAZY, MODE LINK, DIM 10/20/30/50/100. Protocol Lab is UART-only in this build. Master pins: PWM=D0, UART RX=D7 TX=D6. Slave pins: UART RX=D6 TX=D0, LED_GREEN=D7, LED_RED=D4.");
    return;
  }
}

static void onWsEvent(AsyncWebSocket* server_, AsyncWebSocketClient* client,
                      AwsEventType type, void* arg, uint8_t* data, size_t len) {
  (void)server_;
  if (type == WS_EVT_CONNECT) {
    client->text(String("FS=") + g_scopeFs);
    client->text(String("PWM=") + (g_pwmOn ? 1 : 0));
    client->text(String("PWF=") + g_pwmHz);
    client->text(String("PWP=") + g_pwmDutyPct);
    client->text(String("SCOPE=") + (g_scopeOn ? 1 : 0));
    client->text(MASTER_BUILD_TAG);
    client->text(String("LINK=") + (g_linkUp ? "UP" : "DOWN"));
    client->text(String("PROTO=") + protoToStr(g_proto));
    client->text(String("PROTO_LOCKED=") + protoToStr(g_protoLocked));
    client->text("LAB_MODE=UART_ONLY");
    client->text(String("BOOT_REASON=") + g_bootReason);
    client->text(String("BOOT_COUNT=") + g_bootCount);
    client->text(String("UART_PINS=RX:D7(GPIO13),TX:D6(GPIO12)"));
    client->text(String("PWM_PIN=") + PWM_PIN);
    return;
  }

  if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (!info->final || info->index != 0) return;
    if (info->opcode != WS_TEXT) return;

    String msg;
    msg.reserve(len + 1);
    for (size_t i = 0; i < len; i++) msg += (char)data[i];
    handleWsText(msg);
  }
}

// -------------------- SETUP AP --------------------
static void startSetupAP() {
  g_staMode = false;

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  dns.start(53, "*", WiFi.softAPIP());

  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
  server.on("/api/state", HTTP_GET, handleApiState);
  server.on("/api/resetwifi", HTTP_POST, handleApiResetWifi);
  server.on("/api/savewifi", HTTP_POST, [](AsyncWebServerRequest* req){
    if (!req->hasParam("ssid", true) || !req->hasParam("pass", true)) {
      req->send(400, "text/plain", "Missing ssid/pass");
      return;
    }
    String ssid = req->getParam("ssid", true)->value();
    String pass = req->getParam("pass", true)->value();
    saveCredentials(ssid, pass);
    req->send(200, "text/plain", "OK");
    delay(150);
    ESP.restart();
  });

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.begin();
}

// -------------------- SETUP + LOOP --------------------
static void setupOTA() {
  ArduinoOTA.setHostname("area51-meter");
  ArduinoOTA.begin();
}

void setup() {
  Serial.begin(115200);
  delay(150);

  EEPROM.begin(EEPROM_SIZE);
  LittleFS.begin();
  initProtocolEngines();

  pinMode(PWM_PIN, OUTPUT);
  analogWriteRange(PWM_RANGE);
  pwmSetHz(g_pwmHz);
  pwmSetDuty(g_pwmDutyPct);
  pwmSetOn(false);

  String ssid, pass;
  bool haveCreds = loadCredentials(ssid, pass);

  if (haveCreds && tryConnectSTA(ssid, pass)) {
    g_staMode = true;

    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
    server.on("/api/state", HTTP_GET, handleApiState);
    server.on("/api/resetwifi", HTTP_POST, handleApiResetWifi);
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);
    server.begin();
    setupOTA();

    Serial.print("STA connected: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("No STA creds or connect failed -> AP setup");
    startSetupAP();
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());
  }
}

static void sampleDcMeter() {
  if (g_scopeOn) return;

  uint32_t now = millis();
  if (now - g_lastDcMs < 200) return;
  g_lastDcMs = now;

  uint32_t acc = 0;
  for (uint8_t i = 0; i < 8; i++) {
    acc += analogRead(A0);
    delayMicroseconds(200);
    yield();
  }
  uint16_t adc = (uint16_t)(acc / 8);
  uint16_t mv  = adcToMv(adc);

  if (g_mvFilt <= 0.0f) g_mvFilt = (float)mv;
  g_mvFilt = g_mvFilt * 0.90f + (float)mv * 0.10f;

  g_adcNow = adc;
  g_mvNow  = (uint16_t)g_mvFilt;
}

static inline uint16_t scopeBufFill() {
  uint16_t head = g_scopeHead;
  uint16_t tail = g_scopeTail;
  if (head >= tail) return (uint16_t)(head - tail);
  return (uint16_t)(SCOPE_BUF_LEN - (tail - head));
}

static void sendPerfStatIfDue() {
  if (!wsHasClients()) return;

  uint32_t nowMs = millis();
  if (g_statLastMs == 0) g_statLastMs = nowMs;
  if ((uint32_t)(nowMs - g_statLastMs) < 1000) return;
  uint32_t elapsedMs = (uint32_t)(nowMs - g_statLastMs);
  if (elapsedMs == 0) elapsedMs = 1;

  uint32_t samples = g_statSamples; g_statSamples = 0;
  uint64_t dtSumUs = g_statDtSumUs; g_statDtSumUs = 0;
  uint32_t dtMinUs = g_statDtMinUs; g_statDtMinUs = 0xFFFFFFFFu;
  uint32_t dtMaxUs = g_statDtMaxUs; g_statDtMaxUs = 0;
  uint32_t loops = g_statLoops; g_statLoops = 0;
  uint64_t loopSumUs = g_statLoopSumUs; g_statLoopSumUs = 0;
  uint32_t loopMinUs = g_statLoopMinUs; g_statLoopMinUs = 0xFFFFFFFFu;
  uint32_t loopMaxUs = g_statLoopMaxUs; g_statLoopMaxUs = 0;
  uint32_t wsBytes = g_statWsBytes; g_statWsBytes = 0;
  uint32_t wsBursts = g_statWsBursts; g_statWsBursts = 0;

  float sec = (float)elapsedMs / 1000.0f;
  float effFs = (sec > 0.0f) ? ((float)samples / sec) : 0.0f;
  uint32_t dtAvgUs = (samples > 1) ? (uint32_t)(dtSumUs / (uint64_t)(samples - 1)) : 0;
  uint32_t loopAvgUs = (loops > 0) ? (uint32_t)(loopSumUs / (uint64_t)loops) : 0;

  int rssi = g_staMode ? WiFi.RSSI() : 0;
  uint16_t fill = scopeBufFill();
  uint32_t heap = ESP.getFreeHeap();

  String msg = "STAT ";
  msg += "ms=" + String(nowMs);
  msg += " mode=" + String(g_staMode ? "STA" : "AP");
  msg += " rssi=" + String(rssi);
  msg += " heap=" + String(heap);
  msg += " scope=" + String(g_scopeOn ? 1 : 0);
  msg += " fs_set=" + String(g_scopeFs);
  msg += " fs_eff=" + String((int)(effFs + 0.5f));
  msg += " dt_us_avg=" + String(dtAvgUs);
  msg += " dt_us_min=" + String(dtMinUs == 0xFFFFFFFFu ? 0 : dtMinUs);
  msg += " dt_us_max=" + String(dtMaxUs);
  msg += " loop_us_avg=" + String(loopAvgUs);
  msg += " loop_us_min=" + String(loopMinUs == 0xFFFFFFFFu ? 0 : loopMinUs);
  msg += " loop_us_max=" + String(loopMaxUs);
  msg += " ws_bytes=" + String(wsBytes);
  msg += " ws_bursts=" + String(wsBursts);
  msg += " buf_fill=" + String(fill);
  msg += " ws_clients=" + String(ws.count());

  wsTextAll(msg);
  g_statLastMs = nowMs;
}

void loop() {
  scopeSamplePump();

  uint32_t loopStartUs = micros();

  processQueuedProtoCommand();
  sampleDcMeter();
  pollUartLink();
  serviceHeartbeat();

  if (g_staMode) ArduinoOTA.handle();
  else dns.processNextRequest();

  scopeServiceFast();
  sendScopeChunksIfDue();
  sendPerfStatIfDue();

  ws.cleanupClients();

  static uint32_t lastHeapPrint = 0;
  if (millis() - lastHeapPrint > 2000) {
    lastHeapPrint = millis();
    Serial.print("Heap: ");
    Serial.println(ESP.getFreeHeap());
  }

  uint32_t loopEndUs = micros();
  uint32_t loopUs = (uint32_t)(loopEndUs - loopStartUs);
  if (loopUs < g_statLoopMinUs) g_statLoopMinUs = loopUs;
  if (loopUs > g_statLoopMaxUs) g_statLoopMaxUs = loopUs;
  g_statLoopSumUs += (uint64_t)loopUs;
  g_statLoops++;
}
