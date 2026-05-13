/*
  Area-51 WiFi Voltage Meter + WebScope and ProtocolLAB- (C)2026 By Mr. Matzo E-post: matsarlemark@gmail.com
  ---------------------------------------------------
  Updated for Protocol Lab DB commands:
      GETTODO <id>
      POSTTODO <title>
      DELETETODO <id>
      LISTTODO
      GETMEAS <limit>
      GETMEASID <id>
      LISTMEAS <limit>
      GETMEASSTAT
      GETLATEST
      CLEARMEAS
*/

#include <ESP8266WiFi.h>
#include <EEPROM.h>
#include <DNSServer.h>
#include <ArduinoOTA.h>
#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <SoftwareSerial.h>
#include <ESP8266HTTPClient.h>

const char* pythonMeasurementsUrl = "http://192.168.1.184:8000/measurements";
const char* todoApiBase = "http://192.168.1.184:8000";

static const char* AP_SSID = "area51-setup";
static const char* AP_PASS = "12345678";
static const uint16_t ADC_REF_MV = 2980;
static const int16_t  ADC_OFFSET_MV = 0;
static const uint8_t PWM_PIN = D0;
static const uint16_t PWM_RANGE = 1023;

enum ProtocolMode { PROTO_UART = 0 };
static const uint8_t UART_RX_PIN = D7;
static const uint8_t UART_TX_PIN = D6;

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
static bool g_protoCmdPending = false;
static String g_protoCmdLine = "";
static const char* MASTER_BUILD_TAG = "MASTER_BUILD=UART_PWM_LAB_DB_SAFE_V2";
static const uint32_t HEARTBEAT_INTERVAL_MS = 1500;
static const uint32_t HEARTBEAT_TIMEOUT_MS  = 2600;

static const uint16_t EEPROM_SIZE = 256;
static const uint16_t EE_MAGIC_ADDR = 0;
static const uint32_t EE_MAGIC = 0xA51C0DEu;
static const uint16_t EE_SSID_ADDR  = 8;
static const uint16_t EE_PASS_ADDR  = 72;
static const uint16_t EE_STR_MAX    = 63;

static AsyncWebServer server(80);
static AsyncWebSocket ws("/ws");
static DNSServer dns;
static bool g_staMode = false;

enum WsClientKind : uint8_t {
  WS_CLIENT_UNKNOWN = 0,
  WS_CLIENT_SCOPE = 1,
  WS_CLIENT_PROTOCOL = 2
};

struct WsClientSlot {
  AsyncWebSocketClient* client;
  WsClientKind kind;
};

static const uint8_t MAX_WS_CLIENT_SLOTS = 8;
static WsClientSlot g_wsSlots[MAX_WS_CLIENT_SLOTS];

static const uint8_t HELP_QUEUE_MAX = 12;
static String g_helpQueue[HELP_QUEUE_MAX];
static uint8_t g_helpQueueCount = 0;
static uint8_t g_helpQueueIndex = 0;
static uint32_t g_helpNextMs = 0;
static bool g_helpQueueActive = false;

static uint32_t g_lastDcMs = 0;
static uint16_t g_adcNow = 0;
static uint16_t g_mvNow  = 0;
static float g_mvFilt = 0.0f;

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

static bool     g_pwmOn = false;
static uint16_t g_pwmHz = 200;
static uint8_t  g_pwmDutyPct = 50;

static int g_lastSentMv = -99999;
static unsigned long g_lastSendMs = 0;
static unsigned long g_lastSendAttemptMs = 0;
static const int SEND_THRESHOLD_MV = 10;
static const unsigned long SEND_HEARTBEAT_MS = 2000UL;
static const unsigned long SEND_MIN_INTERVAL_MS = 250UL;

struct SignalSample {
  uint32_t t_ms;
  uint16_t mv;
};

static const uint16_t SIGNAL_HIST_LEN = 128;
static SignalSample g_signalHist[SIGNAL_HIST_LEN];
static uint16_t g_signalHistHead = 0;
static uint16_t g_signalHistCount = 0;

static String g_signalType = "Unknown";
static uint16_t g_signalAmplitudeMv = 0;
static uint16_t g_signalOffsetMv = 0;
static uint16_t g_signalDutyPct = 0;
static uint16_t g_signalFreqHz = 0;

static const bool SERIAL_DEBUG_MIRROR = false;
static const bool PROTO_DEBUG_V19 = true;

static void queueProtoCommand(const String& line);

static const char* protoToStr(ProtocolMode p);
static void handleApiState(AsyncWebServerRequest* req);
static void handleApiResetWifi(AsyncWebServerRequest* req);
static void handleApiTodoGet(AsyncWebServerRequest* req);
static void handleApiTodoPost(AsyncWebServerRequest* req);
static void onWsEvent(AsyncWebSocket* server_, AsyncWebSocketClient* client,
                      AwsEventType type, void* arg, uint8_t* data, size_t len);

static inline uint16_t adcToMv(uint16_t adc) {
  int32_t mv = (int32_t)adc * (int32_t)ADC_REF_MV;
  mv = mv / 1023;
  mv += (int32_t)ADC_OFFSET_MV;
  if (mv < 0) mv = 0;
  if (mv > 65535) mv = 65535;
  return (uint16_t)mv;
}

static inline bool wsHasClients() { return ws.count() > 0; }

static void signalHistPush(uint16_t mv) {
  g_signalHist[g_signalHistHead].t_ms = millis();
  g_signalHist[g_signalHistHead].mv = mv;
  g_signalHistHead = (uint16_t)((g_signalHistHead + 1) % SIGNAL_HIST_LEN);
  if (g_signalHistCount < SIGNAL_HIST_LEN) g_signalHistCount++;
}

static void analyzeSignalForPython() {
  if (g_signalHistCount < 12) {
    g_signalType = "Unknown";
    g_signalAmplitudeMv = 0;
    g_signalOffsetMv = g_mvNow;
    g_signalDutyPct = 0;
    g_signalFreqHz = 0;
    return;
  }

  uint16_t vals[SIGNAL_HIST_LEN];
  uint32_t ts[SIGNAL_HIST_LEN];
  uint16_t n = g_signalHistCount;
  uint16_t start = (g_signalHistHead + SIGNAL_HIST_LEN - n) % SIGNAL_HIST_LEN;
  uint32_t sum = 0;
  uint16_t minV = 65535;
  uint16_t maxV = 0;

  for (uint16_t i = 0; i < n; i++) {
    uint16_t idx = (uint16_t)((start + i) % SIGNAL_HIST_LEN);
    vals[i] = g_signalHist[idx].mv;
    ts[i] = g_signalHist[idx].t_ms;
    if (vals[i] < minV) minV = vals[i];
    if (vals[i] > maxV) maxV = vals[i];
    sum += vals[i];
  }

  uint16_t amp = (uint16_t)(maxV - minV);
  uint16_t mean = (uint16_t)(sum / n);
  g_signalAmplitudeMv = amp;
  g_signalOffsetMv = mean;

  if (amp < 35) {
    g_signalType = "DC";
    g_signalDutyPct = 0;
    g_signalFreqHz = 0;
    return;
  }

  uint16_t thr = (uint16_t)((minV + maxV) / 2);
  uint16_t highCount = 0;
  uint16_t transitions = 0;
  uint16_t nearExtreme = 0;
  uint16_t risingEdges = 0;
  uint32_t lastRiseMs = 0;
  uint32_t risePeriodSum = 0;
  uint16_t risePeriodCount = 0;
  uint16_t risingCount = 0;
  uint16_t fallingCount = 0;
  int32_t maxPosStep = 0;
  int32_t maxNegStep = 0;

  bool prevHigh = vals[0] >= thr;
  if (prevHigh) highCount++;

  for (uint16_t i = 1; i < n; i++) {
    bool hi = vals[i] >= thr;
    if (hi) highCount++;
    if (hi != prevHigh) {
      transitions++;
      if (!prevHigh && hi) {
        risingEdges++;
        if (lastRiseMs != 0 && ts[i] > lastRiseMs) {
          risePeriodSum += (uint32_t)(ts[i] - lastRiseMs);
          risePeriodCount++;
        }
        lastRiseMs = ts[i];
      }
      prevHigh = hi;
    }

    int32_t d = (int32_t)vals[i] - (int32_t)vals[i - 1];
    if (d > 0) risingCount++;
    if (d < 0) fallingCount++;
    if (d > maxPosStep) maxPosStep = d;
    if (d < maxNegStep) maxNegStep = d;
  }

  uint16_t band = max<uint16_t>(6, amp / 5);
  for (uint16_t i = 0; i < n; i++) {
    if (abs((int)vals[i] - (int)minV) <= (int)band || abs((int)vals[i] - (int)maxV) <= (int)band) {
      nearExtreme++;
    }
  }

  g_signalDutyPct = (uint16_t)((uint32_t)highCount * 100U / n);
  if (risePeriodCount > 0) {
    uint32_t avgPeriodMs = risePeriodSum / risePeriodCount;
    g_signalFreqHz = avgPeriodMs > 0 ? (uint16_t)(1000UL / avgPeriodMs) : 0;
  } else {
    g_signalFreqHz = 0;
  }

  float extremeRatio = (float)nearExtreme / (float)n;
  if (transitions >= 2 && extremeRatio > 0.68f) {
    if (g_signalDutyPct > 5 && g_signalDutyPct < 95 && abs((int)g_signalDutyPct - 50) > 8) g_signalType = "PWM";
    else g_signalType = "Square";
    return;
  }
  if (amp < 120) {
    g_signalType = "DC";
    g_signalDutyPct = 0;
    g_signalFreqHz = 0;
    return;
  }
  if (abs(maxPosStep) > (int32_t)(amp * 0.45f) || abs(maxNegStep) > (int32_t)(amp * 0.45f)) {
    g_signalType = "Sawtooth";
    return;
  }
  if (risingCount > (uint16_t)(n * 0.25f) && fallingCount > (uint16_t)(n * 0.25f)) {
    g_signalType = "Sine";
    return;
  }
  g_signalType = "Unknown";
}

void sendMeasurementToPython() {
  if (!g_staMode) return;
  if (WiFi.status() != WL_CONNECTED) return;
  analyzeSignalForPython();

  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, pythonMeasurementsUrl)) return;
  http.addHeader("Content-Type", "application/json");

  String json = "{";
  json += "\"device_id\":\"esp8266\",";
  json += "\"ts_ms\":" + String(millis()) + ",";
  json += "\"adc\":" + String(g_adcNow) + ",";
  json += "\"mv\":" + String(g_mvNow) + ",";
  json += "\"signal_type\":\"" + g_signalType + "\",";
  json += "\"frequency_hz\":" + String(g_signalFreqHz) + ",";
  json += "\"duty_percent\":" + String(g_signalDutyPct) + ",";
  json += "\"amplitude_mv\":" + String(g_signalAmplitudeMv) + ",";
  json += "\"dc_offset_mv\":" + String(g_signalOffsetMv) + "}";
  int httpCode = http.POST(json);
  if (httpCode > 0) {
    g_lastSentMv = (int)g_mvNow;
    g_lastSendMs = millis();
  }
  http.end();
}

static void wsRegisterClient(AsyncWebSocketClient* client) {
  if (!client) return;
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) if (g_wsSlots[i].client == client) return;
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (!g_wsSlots[i].client) {
      g_wsSlots[i].client = client;
      g_wsSlots[i].kind = WS_CLIENT_UNKNOWN;
      return;
    }
  }
}

static void wsUnregisterClient(AsyncWebSocketClient* client) {
  if (!client) return;
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (g_wsSlots[i].client == client) {
      g_wsSlots[i].client = nullptr;
      g_wsSlots[i].kind = WS_CLIENT_UNKNOWN;
    }
  }
}

static void wsSetClientKind(AsyncWebSocketClient* client, WsClientKind kind) {
  if (!client) return;
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (g_wsSlots[i].client == client) {
      g_wsSlots[i].kind = kind;
      return;
    }
  }
  wsRegisterClient(client);
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (g_wsSlots[i].client == client) {
      g_wsSlots[i].kind = kind;
      return;
    }
  }
}

static void wsTextClient(AsyncWebSocketClient* client, const String& s) {
  if (!client || !client->canSend()) return;
  client->text(s);
}

static void wsTextAll(const String& s) {
  ws.textAll(s);
  if (SERIAL_DEBUG_MIRROR) Serial.println(s);
}

static void wsTextScope(const String& s) {
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (g_wsSlots[i].client && g_wsSlots[i].kind == WS_CLIENT_SCOPE) wsTextClient(g_wsSlots[i].client, s);
  }
}

static void wsTextProtocol(const String& s) {
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (g_wsSlots[i].client && g_wsSlots[i].kind == WS_CLIENT_PROTOCOL) wsTextClient(g_wsSlots[i].client, s);
  }
}

static void wsTextKnownClients(const String& s) {
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (!g_wsSlots[i].client) continue;
    if (g_wsSlots[i].kind == WS_CLIENT_SCOPE || g_wsSlots[i].kind == WS_CLIENT_PROTOCOL) wsTextClient(g_wsSlots[i].client, s);
  }
}

static void wsBinaryScope(const uint8_t* data, size_t len) {
  for (uint8_t i = 0; i < MAX_WS_CLIENT_SLOTS; i++) {
    if (g_wsSlots[i].client && g_wsSlots[i].kind == WS_CLIENT_SCOPE && g_wsSlots[i].client->canSend()) {
      g_wsSlots[i].client->binary((char*)data, len);
    }
  }
}

static void wsSendInitialStateToClient(AsyncWebSocketClient* client) {
  if (!client) return;
  wsTextClient(client, String("FS=") + g_scopeFs);
  wsTextClient(client, String("PWM=") + (g_pwmOn ? 1 : 0));
  wsTextClient(client, String("PWF=") + g_pwmHz);
  wsTextClient(client, String("PWP=") + g_pwmDutyPct);
  wsTextClient(client, String("SCOPE=") + (g_scopeOn ? 1 : 0));
  wsTextClient(client, MASTER_BUILD_TAG);
  wsTextClient(client, String("LINK=") + (g_linkUp ? "UP" : "DOWN"));
  wsTextClient(client, String("PROTO=") + protoToStr(g_proto));
  wsTextClient(client, String("PROTO_LOCKED=") + protoToStr(g_protoLocked));
  wsTextClient(client, "LAB_MODE=UART_ONLY");
  wsTextClient(client, String("BOOT_REASON=") + g_bootReason);
  wsTextClient(client, String("BOOT_COUNT=") + g_bootCount);
  wsTextClient(client, String("UART_PINS=RX:D7(GPIO13),TX:D6(GPIO12)"));
  wsTextClient(client, String("PWM_PIN=") + PWM_PIN);
}

static void enqueueHelpLine(const String& s) {
  if (g_helpQueueCount >= HELP_QUEUE_MAX) return;
  g_helpQueue[g_helpQueueCount++] = s;
}

static void startHelpQueue() {
  g_helpQueueCount = 0;
  g_helpQueueIndex = 0;
  g_helpQueueActive = true;
  g_helpNextMs = millis();

  enqueueHelpLine("HELP CircuitLab master");
  enqueueHelpLine("SCOPE 0|1 | FS <50..4000>");
  enqueueHelpLine("PWM 0|1 | PWF <50..5000> | PWP <0..100>");
  enqueueHelpLine("SEND <text> | PINGSLAVE | STATUSSLAVE");
  enqueueHelpLine("GETTODO <id> | POSTTODO <title> | DELETETODO <id> | LISTTODO");
  enqueueHelpLine("GETMEAS <limit> | GETMEASID <id> | LISTMEAS <limit>");
  enqueueHelpLine("GETMEASSTAT | GETLATEST | CLEARMEAS");
  enqueueHelpLine("Slave text: green on/off, red on/off, red blink, red blink fast, DIM 10/20/30/50/100");
}

static void serviceHelpQueue() {
  if (!g_helpQueueActive) return;
  if ((int32_t)(millis() - g_helpNextMs) < 0) return;

  if (g_helpQueueIndex < g_helpQueueCount) {
    wsTextProtocol(g_helpQueue[g_helpQueueIndex]);
    g_helpQueueIndex++;
    g_helpNextMs = millis() + 45;
  } else {
    g_helpQueueActive = false;
  }
}

static String oneLine(const String& s) {
  String out = s;
  out.replace("\r", " ");
  out.replace("\n", " ");
  while (out.indexOf("  ") >= 0) out.replace("  ", " ");
  out.trim();
  return out;
}

static const char* protoToStr(ProtocolMode p) { (void)p; return "UART"; }

static void dbgProto(const String& tag) {
  if (!PROTO_DEBUG_V19) return;
  Serial.println(String("DBG_PROTO=") + tag + ";LOCKED=" + protoToStr(g_protoLocked) + ";EFFECTIVE=" + protoToStr(g_proto));
}

static void wsSendProtoState() {
  wsTextKnownClients(String("PROTO=") + protoToStr(g_proto));
  wsTextKnownClients(String("PROTO_LOCKED=") + protoToStr(g_protoLocked));
  wsTextKnownClients("LAB_MODE=UART_ONLY");
  wsTextKnownClients(String("UART_PINS=RX:D7(GPIO13),TX:D6(GPIO12)"));
  wsTextKnownClients(String("PWM_PIN=") + PWM_PIN);
}

static void setLinkState(bool up) {
  if (g_linkUp == up) return;
  g_linkUp = up;
  wsTextKnownClients(String("LINK=") + (g_linkUp ? "UP" : "DOWN"));
}

static void flushUartLink(bool emitOverflow = false) {
  while (link.available()) { (void)link.read(); yield(); }
  g_uartRxLine = "";
  if (emitOverflow) wsTextProtocol("ERR=UART_FLUSH");
}

static void setProtocolMode(ProtocolMode p) {
  (void)p;
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
}

static void initProtocolEngines() {
  link.begin(9600);
  link.listen();
}

static void sendViaUART(const String& msg) {
  link.listen();
  link.println(msg);
  g_lastProtoTxMs = millis();
  wsTextProtocol(String("TX_UART=") + msg);
}

static void sendAsciiMessage(const String& msg) {
  if (!msg.length()) return;
  dbgProto(String("SEND_ENTER_") + msg);
  g_proto = PROTO_UART;
  g_protoLocked = PROTO_UART;
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
        wsTextProtocol(String("RX_UART=") + g_uartRxLine);
      }
      g_uartRxLine = "";
    } else {
      g_uartRxLine += c;
      if (g_uartRxLine.length() > 240) {
        g_uartRxLine = "";
        wsTextProtocol("ERR=UART_RX_OVERFLOW");
      }
    }
  }
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

static String apiHttpGet(const String& url, int& httpCodeOut) {
  httpCodeOut = -999;
  if (!g_staMode || WiFi.status() != WL_CONNECTED) return "ERR:NO_WIFI";
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, url)) return "ERR:http.begin";
  http.setTimeout(2500);
  httpCodeOut = http.GET();
  String body = (httpCodeOut > 0) ? http.getString() : http.errorToString(httpCodeOut);
  http.end();
  return body;
}

static String apiHttpPostJson(const String& url, const String& json, int& httpCodeOut) {
  httpCodeOut = -999;
  if (!g_staMode || WiFi.status() != WL_CONNECTED) return "ERR:NO_WIFI";
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, url)) return "ERR:http.begin";
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  httpCodeOut = http.POST(json);
  String body = (httpCodeOut > 0) ? http.getString() : http.errorToString(httpCodeOut);
  http.end();
  return body;
}

static String apiHttpDelete(const String& url, int& httpCodeOut) {
  httpCodeOut = -999;
  if (!g_staMode || WiFi.status() != WL_CONNECTED) return "ERR:NO_WIFI";
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, url)) return "ERR:http.begin";
  http.setTimeout(3000);
  httpCodeOut = http.sendRequest("DELETE");
  String body = (httpCodeOut > 0) ? http.getString() : http.errorToString(httpCodeOut);
  http.end();
  return body;
}

static void eeWriteString(uint16_t addr, const String& s) {
  uint16_t n = (uint16_t)min((int)EE_STR_MAX, (int)s.length());
  for (uint16_t i = 0; i < EE_STR_MAX; i++) EEPROM.write(addr + i, (i < n) ? (uint8_t)s[i] : 0);
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
  g_scopeBuf[h].adc = adc;
  g_scopeBuf[h].mv = mv;
  uint16_t h2 = (uint16_t)((h + 1) % SCOPE_BUF_LEN);
  g_scopeHead = h2;
  if (h2 == g_scopeTail) g_scopeTail = (uint16_t)((g_scopeTail + 1) % SCOPE_BUF_LEN);
}

static inline uint16_t _median3_u16(uint16_t a, uint16_t b, uint16_t c) {
  if (a > b) { uint16_t t = a; a = b; b = t; }
  if (b > c) { uint16_t t = b; b = c; c = t; }
  if (a > b) { uint16_t t = a; a = b; b = t; }
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
    g_adcNow = adc;
    g_mvNow = mv;
    signalHistPush(mv);
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
      wsBinaryScope(out, bytes);
      g_statWsBytes += bytes;
      g_statWsBursts++;
      yield();
    } else {
      break;
    }
  }
}

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

static void handleApiState(AsyncWebServerRequest* req) {
  char buf[768];
  snprintf(
    buf, sizeof(buf),
    "scope=%d;fs=%u;dtUs=%lu;pwm=%d;pwf=%u;pwp=%u;adc=%u;mv=%u;mode=%s;ip=%s;rssi=%d;proto=%s;proto_locked=%s;uart_rx_pin=%u;uart_tx_pin=%u;pwm_pin=%u;last_tx_ms=%lu;last_rx_ms=%lu;signal=%s;freq=%u;duty=%u;amp=%u;offset=%u;err=;",
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
    (unsigned long)g_lastProtoRxMs,
    g_signalType.c_str(),
    g_signalFreqHz,
    g_signalDutyPct,
    g_signalAmplitudeMv,
    g_signalOffsetMv
  );
  req->send(200, "text/plain", buf);
}

static void handleApiResetWifi(AsyncWebServerRequest* req) {
  clearCredentials();
  req->send(200, "text/plain", "OK");
  delay(150);
  ESP.restart();
}

static void handleApiTodoGet(AsyncWebServerRequest* req) {
  if (!req->hasParam("id")) { req->send(400, "text/plain", "Missing id"); return; }
  String id = req->getParam("id")->value();
  id.trim();
  if (!id.length()) { req->send(400, "text/plain", "Missing id"); return; }
  int code = 0;
  String body = apiHttpGet(String(todoApiBase) + "/todos/" + id, code);
  req->send((code > 0 ? code : 500), "application/json", body);
}

static void handleApiTodoPost(AsyncWebServerRequest* req) {
  if (!req->hasParam("title", true)) { req->send(400, "text/plain", "Missing title"); return; }
  String title = req->getParam("title", true)->value();
  title.trim();
  if (!title.length()) { req->send(400, "text/plain", "Missing title"); return; }

  String json = "{\"title\":\"";
  for (size_t i = 0; i < title.length(); i++) {
    char c = title[i];
    if (c == '\"' || c == '\\') json += '\\';
    json += c;
  }
  json += "\"}";

  int code = 0;
  String body = apiHttpPostJson(String(todoApiBase) + "/todos", json, code);
  req->send((code > 0 ? code : 500), "application/json", body);
}

static void triggerSlaveDiskActivityForApi(const String& body) {
  // DB/TODO/API replies are printed by the master directly to Protocol Lab,
  // so the slave will not see that text. Send one tiny side-band command
  // to make the slave do floppy/disk activity LED+buzzer locally.
  uint16_t clicks = (uint16_t)(body.length() / 18);
  if (clicks < 4) clicks = 4;
  if (clicks > 60) clicks = 60;
  sendViaUART(String("ACTBURST ") + String(clicks));
}

static void protocolApiReply(const String& body, int code) {
  triggerSlaveDiskActivityForApi(body);
  wsTextProtocol(String("HTTP=") + code);
  wsTextProtocol(String("API_BODY=") + oneLine(body));
}

static void queueProtoCommand(const String& line) {
  if (g_protoCmdPending) {
    wsTextProtocol("ERR=PROTO_CMD_BUSY");
    return;
  }

  g_protoCmdLine = line;
  g_protoCmdPending = true;

  if (PROTO_DEBUG_V19) {
    Serial.println(String("PROTOQ=") + line);
  }
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
      wsTextProtocol("RX_UART=ACK PROTO UART");
      setProtocolMode(PROTO_UART);
      return;
    }
    wsTextProtocol("ERR=ONLY_UART_SUPPORTED");
    return;
  }

  if (cmd == "PINGSLAVE") { g_manualPingPendingUart = true; sendAsciiMessage("PING"); return; }
  if (cmd == "STATUSSLAVE") { sendAsciiMessage("STATUS"); return; }
  if (cmd == "HELPSLAVE") { startHelpQueue(); return; }

  if (cmd == "GETTODO") {
    long id = 0;
    if (!parseLongStrict(arg, id) || id < 0) { wsTextProtocol("ERR=GETTODO <id>"); return; }
    int code = 0; String body = apiHttpGet(String(todoApiBase) + "/todos/" + String(id), code); protocolApiReply(body, code); return;
  }

  if (cmd == "POSTTODO") {
    if (!arg.length()) { wsTextProtocol("ERR=POSTTODO <title>"); return; }
    String esc = "";
    esc.reserve(arg.length() + 8);
    for (size_t i = 0; i < arg.length(); i++) {
      char c = arg[i];
      if (c == '\"' || c == '\\') esc += '\\';
      esc += c;
    }
    String json = String("{\"title\":\"") + esc + "\"}";
    int code = 0; String body = apiHttpPostJson(String(todoApiBase) + "/todos", json, code); protocolApiReply(body, code); return;
  }

  if (cmd == "DELETETODO") {
    long id = 0;
    if (!parseLongStrict(arg, id) || id < 0) { wsTextProtocol("ERR=DELETETODO <id>"); return; }
    int code = 0; String body = apiHttpDelete(String(todoApiBase) + "/todos/" + String(id), code); protocolApiReply(body, code); return;
  }

  if (cmd == "LISTTODO") {
    int code = 0;
    String body = apiHttpGet(String(todoApiBase) + "/todos/list", code);
    // Fallback for older FastAPI builds where the route was GET /todos.
    if (code == 404) body = apiHttpGet(String(todoApiBase) + "/todos", code);
    protocolApiReply(body, code);
    return;
  }

  if (cmd == "GETMEAS") {
    long limit = 0;
    if (!parseLongStrict(arg, limit) || limit <= 0) { wsTextProtocol("ERR=GETMEAS <limit>"); return; }
    int code = 0; String body = apiHttpGet(String(todoApiBase) + "/measurements?limit=" + String(limit), code); protocolApiReply(body, code); return;
  }

  if (cmd == "GETMEASID") {
    long id = 0;
    if (!parseLongStrict(arg, id) || id < 0) { wsTextProtocol("ERR=GETMEASID <id>"); return; }
    int code = 0; String body = apiHttpGet(String(todoApiBase) + "/measurements/" + String(id), code); protocolApiReply(body, code); return;
  }

  if (cmd == "LISTMEAS") {
    long limit = 20;
    if (arg.length() && (!parseLongStrict(arg, limit) || limit <= 0)) { wsTextProtocol("ERR=LISTMEAS <limit>"); return; }
    int code = 0; String body = apiHttpGet(String(todoApiBase) + "/measurements/list?limit=" + String(limit), code); protocolApiReply(body, code); return;
  }

  if (cmd == "GETMEASSTAT") {
    int code = 0; String body = apiHttpGet(String(todoApiBase) + "/measurements/stats", code); protocolApiReply(body, code); return;
  }

  if (cmd == "GETLATEST") {
    int code = 0; String body = apiHttpGet(String(todoApiBase) + "/measurements/latest", code); protocolApiReply(body, code); return;
  }

  if (cmd == "CLEARMEAS") {
    int code = 0; String body = apiHttpDelete(String(todoApiBase) + "/measurements", code); protocolApiReply(body, code); return;
  }
}

static void handleWsText(AsyncWebSocketClient* client, const String& msg) {
  String s = msg;
  s.trim();
  if (!s.length()) return;

  int sp = s.indexOf(' ');
  String cmd = (sp >= 0) ? s.substring(0, sp) : s;
  String arg = (sp >= 0) ? s.substring(sp + 1) : "";
  cmd.toUpperCase();
  arg.trim();

  long n = 0;
  bool haveNum = parseLongStrict(arg, n);

  if (cmd == "SCOPE") { wsSetClientKind(client, WS_CLIENT_SCOPE); int on = haveNum ? (n != 0) : 0; if (on) scopeStart(g_scopeFs); else scopeStop(); return; }
  if (cmd == "FS") { wsSetClientKind(client, WS_CLIENT_SCOPE); if (!haveNum) return; scopeSetFs(clampU16(n, 50, 4000)); return; }
  if (cmd == "PWM") { wsSetClientKind(client, WS_CLIENT_SCOPE); int on = haveNum ? (n != 0) : 0; pwmSetOn(on != 0); return; }
  if (cmd == "PWF") { wsSetClientKind(client, WS_CLIENT_SCOPE); if (!haveNum) return; pwmSetHz(clampU16(n, 50, 5000)); return; }
  if (cmd == "PWP") { wsSetClientKind(client, WS_CLIENT_SCOPE); if (!haveNum) return; pwmSetDuty(clampU8(n, 0, 100)); return; }

  wsSetClientKind(client, WS_CLIENT_PROTOCOL);

  if (cmd == "SEND") { if (!arg.length()) return; queueProtoCommand(String("SEND ") + arg); return; }
  if (cmd == "PROTO") { queueProtoCommand(String("PROTO ") + arg); return; }
  if (cmd == "PINGSLAVE") { queueProtoCommand("PINGSLAVE"); return; }
  if (cmd == "STATUSSLAVE") { queueProtoCommand("STATUSSLAVE"); return; }
  if (cmd == "HELPSLAVE" || cmd == "HELP") { queueProtoCommand("HELPSLAVE"); return; }
  if (cmd == "GETTODO") { queueProtoCommand(String("GETTODO ") + arg); return; }
  if (cmd == "POSTTODO") { queueProtoCommand(String("POSTTODO ") + arg); return; }
  if (cmd == "DELETETODO") { queueProtoCommand(String("DELETETODO ") + arg); return; }
  if (cmd == "LISTTODO") { queueProtoCommand("LISTTODO"); return; }
  if (cmd == "GETMEAS") { queueProtoCommand(String("GETMEAS ") + arg); return; }
  if (cmd == "GETMEASID") { queueProtoCommand(String("GETMEASID ") + arg); return; }
  if (cmd == "LISTMEAS") { queueProtoCommand(String("LISTMEAS ") + arg); return; }
  if (cmd == "GETMEASSTAT") { queueProtoCommand("GETMEASSTAT"); return; }
  if (cmd == "GETLATEST") { queueProtoCommand("GETLATEST"); return; }
  if (cmd == "CLEARMEAS") { queueProtoCommand("CLEARMEAS"); return; }
}

static void onWsEvent(AsyncWebSocket* server_, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
  (void)server_;
  if (type == WS_EVT_CONNECT) { wsRegisterClient(client); wsSendInitialStateToClient(client); return; }
  if (type == WS_EVT_DISCONNECT) { wsUnregisterClient(client); return; }

  if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (!info->final || info->index != 0) return;
    if (info->opcode != WS_TEXT) return;
    String msg;
    msg.reserve(len + 1);
    for (size_t i = 0; i < len; i++) msg += (char)data[i];
    handleWsText(client, msg);
  }
}

static void startSetupAP() {
  g_staMode = false;
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  dns.start(53, "*", WiFi.softAPIP());

  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
  server.on("/api/state", HTTP_GET, handleApiState);
  server.on("/api/resetwifi", HTTP_POST, handleApiResetWifi);
  server.on("/api/todo/get", HTTP_GET, handleApiTodoGet);
  server.on("/api/todo/post", HTTP_POST, handleApiTodoPost);

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

static void setupOTA() {
  ArduinoOTA.setHostname("area51-meter");
  ArduinoOTA.begin();
}

void setup() {
  Serial.setRxBufferSize(1024);
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

  g_bootReason = ESP.getResetReason();
  g_bootCount++;

  String ssid, pass;
  bool haveCreds = loadCredentials(ssid, pass);

  if (haveCreds && tryConnectSTA(ssid, pass)) {
    g_staMode = true;
    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
    server.on("/api/state", HTTP_GET, handleApiState);
    server.on("/api/resetwifi", HTTP_POST, handleApiResetWifi);
    server.on("/api/todo/get", HTTP_GET, handleApiTodoGet);
    server.on("/api/todo/post", HTTP_POST, handleApiTodoPost);
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);
    server.begin();
    setupOTA();
  } else {
    startSetupAP();
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
  g_mvNow = (uint16_t)g_mvFilt;
  signalHistPush(g_mvNow);
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

  wsTextScope(msg);
  g_statLastMs = nowMs;
}

void loop() {
  scopeSamplePump();

  uint32_t loopStartUs = micros();
  processQueuedProtoCommand();
  serviceHelpQueue();
  sampleDcMeter();
  pollUartLink();
  serviceHeartbeat();

  if (g_staMode) ArduinoOTA.handle();
  else dns.processNextRequest();

  sendScopeChunksIfDue();
  sendPerfStatIfDue();
  ws.cleanupClients();

  uint32_t loopEndUs = micros();
  uint32_t loopUs = (uint32_t)(loopEndUs - loopStartUs);
  if (loopUs < g_statLoopMinUs) g_statLoopMinUs = loopUs;
  if (loopUs > g_statLoopMaxUs) g_statLoopMaxUs = loopUs;
  g_statLoopSumUs += (uint64_t)loopUs;
  g_statLoops++;

  bool changedEnough = abs((int)g_mvNow - g_lastSentMv) >= SEND_THRESHOLD_MV;
  bool heartbeatDue = (millis() - g_lastSendMs) >= SEND_HEARTBEAT_MS;
  bool attemptDue = (millis() - g_lastSendAttemptMs) >= SEND_MIN_INTERVAL_MS;

  if (attemptDue && (changedEnough || heartbeatDue)) {
    g_lastSendAttemptMs = millis();
    sendMeasurementToPython();
  }
}
