// Mr Matzos slave ESP8266 for CircuitLab 2026
// email: matsarlemark@gmail.com
// Slave UART + LED + disk/activity buzzer PWM version
// UART RX: D6/GPIO12, UART TX: D0/GPIO16
// Red LED: D4/GPIO2, Green LED: D7/GPIO13
// Passive buzzer: D5/GPIO14

#include <SoftwareSerial.h>

#define UART_RX_PIN 12   // D6
#define UART_TX_PIN 16   // D0
#define LED_RED_PIN   2  // D4
#define LED_GREEN_PIN 13 // D7

#define ENABLE_BUZZER 1
#define BUZZER_PIN 14        // D5 / GPIO14
#define BUZZER_FREQ 170      // Hz, diskette-style passive buzzer frequency
#define BUZZER_DUTY 850      // 0..1023, about 83%
#define BUZZ_EVERY_N_CHARS 2 // buzz every other transmitted character

SoftwareSerial link(UART_RX_PIN, UART_TX_PIN);
String inputLine = "";

enum LedMode {
  MODE_LED_OFF,
  MODE_LED_GREEN_ON,
  MODE_LED_RED_ON,
  MODE_LED_GREEN_BLINK_SLOW,
  MODE_LED_GREEN_BLINK_MIDDLE,
  MODE_LED_GREEN_BLINK_FAST,
  MODE_LED_GREEN_BLINK_CRAZY,
  MODE_LED_RED_BLINK_SLOW,
  MODE_LED_RED_BLINK_MIDDLE,
  MODE_LED_RED_BLINK_FAST,
  MODE_LED_RED_BLINK_CRAZY,
  MODE_LED_LINK
};

LedMode ledMode = MODE_LED_LINK;
unsigned long lastBlink = 0;
bool blinkState = false;
uint8_t dimPct = 100;

static const uint16_t INPUT_MAX_LEN = 120;
static const uint8_t TX_QUEUE_MAX = 8;
static const uint16_t TX_LINE_MAX_LEN = 320;
static const unsigned long TX_CHAR_INTERVAL_MS = 5;
static const unsigned long ACTIVITY_PULSE_MS = 14;
static const unsigned long BUZZ_CLICK_MS = 10;
static const unsigned long BUZZ_GAP_MS = 22;

String g_txQueue[TX_QUEUE_MAX];
uint8_t g_txHead = 0, g_txTail = 0, g_txCount = 0;
bool g_txActive = false;
String g_txCurrent = "";
uint16_t g_txPos = 0;
unsigned long g_txLastMs = 0;
bool g_activityActive = false;
unsigned long g_activityUntilMs = 0;

bool g_buzzerActive = false;
unsigned long g_buzzerUntilMs = 0;
unsigned long g_buzzerNextAllowedMs = 0;
uint16_t g_txCharCounter = 0;

uint16_t g_activityBurstRemaining = 0;
unsigned long g_activityBurstNextMs = 0;

static uint16_t pctToPwm(uint8_t pct) {
  if (pct > 100) pct = 100;
  return (uint16_t)((1023UL * pct) / 100UL);
}

void buzzerStartClick(bool force = false) {
#if ENABLE_BUZZER
  unsigned long now = millis();
  if (!force && now < g_buzzerNextAllowedMs) return;
  analogWriteFreq(BUZZER_FREQ);
  analogWrite(BUZZER_PIN, BUZZER_DUTY);
  g_buzzerActive = true;
  g_buzzerUntilMs = now + BUZZ_CLICK_MS;
  g_buzzerNextAllowedMs = now + BUZZ_GAP_MS;
#endif
}

void buzzerOff() {
#if ENABLE_BUZZER
  analogWrite(BUZZER_PIN, 0);
  g_buzzerActive = false;
#endif
}

void serviceBuzzer() {
#if ENABLE_BUZZER
  if (g_buzzerActive && millis() >= g_buzzerUntilMs) {
    buzzerOff();
  }
#endif
}

void applyLedPct(uint8_t redPct, uint8_t greenPct) {
  analogWrite(LED_RED_PIN, pctToPwm(redPct));
  analogWrite(LED_GREEN_PIN, pctToPwm(greenPct));
}

void triggerActivityPulse(bool forceBuzz = false) {
  unsigned long now = millis();
  g_activityActive = true;
  g_activityUntilMs = now + ACTIVITY_PULSE_MS;

  // Do NOT keep the buzzer continuously on. Give it short clicks.
  if (forceBuzz) {
    buzzerStartClick(true);
  } else {
    g_txCharCounter++;
    if ((g_txCharCounter % BUZZ_EVERY_N_CHARS) == 0) {
      buzzerStartClick(false);
    }
  }
}

void startActivityBurst(uint16_t clicks) {
  if (clicks < 1) clicks = 1;
  if (clicks > 80) clicks = 80;
  g_activityBurstRemaining = clicks;
  g_activityBurstNextMs = 0;
}

void serviceActivityBurst() {
  if (g_activityBurstRemaining == 0) return;
  unsigned long now = millis();
  if (g_activityBurstNextMs != 0 && now < g_activityBurstNextMs) return;

  triggerActivityPulse(true);
  g_activityBurstRemaining--;

  // Slightly uneven timing = more Amiga/floppy-drive feeling.
  uint8_t wobble = (uint8_t)((g_activityBurstRemaining % 4) * 6);
  g_activityBurstNextMs = now + 24 + wobble;
}

bool enqueueReply(const String& s) {
  if (g_txCount >= TX_QUEUE_MAX) return false;
  String line = s;
  if (line.length() > TX_LINE_MAX_LEN) line = line.substring(0, TX_LINE_MAX_LEN);
  g_txQueue[g_txTail] = line;
  g_txTail = (uint8_t)((g_txTail + 1) % TX_QUEUE_MAX);
  g_txCount++;
  return true;
}

bool dequeueReply(String& out) {
  if (g_txCount == 0) return false;
  out = g_txQueue[g_txHead];
  g_txQueue[g_txHead] = "";
  g_txHead = (uint8_t)((g_txHead + 1) % TX_QUEUE_MAX);
  g_txCount--;
  return true;
}

void queueReply(const String& s) {
  if (!enqueueReply(s)) (void)enqueueReply("ERR TX QUEUE FULL");
}

void startNextTxIfNeeded() {
  if (g_txActive) return;
  String nextLine;
  if (!dequeueReply(nextLine)) return;
  g_txCurrent = nextLine + "\n";
  g_txPos = 0;
  g_txActive = true;
}

void processTx() {
  startNextTxIfNeeded();
  if (!g_txActive) return;
  unsigned long now = millis();
  if (now - g_txLastMs < TX_CHAR_INTERVAL_MS) return;
  g_txLastMs = now;
  if (g_txPos < g_txCurrent.length()) {
    link.write((uint8_t)g_txCurrent[g_txPos++]);
    triggerActivityPulse();
  }
  if (g_txPos >= g_txCurrent.length()) {
    g_txCurrent = "";
    g_txPos = 0;
    g_txActive = false;
  }
}

void updateLED() {
  unsigned long now = millis();
  unsigned long interval = 0;
  bool useBlink = false, red = false, green = false;

  if (g_activityActive && now >= g_activityUntilMs) {
    g_activityActive = false;
  }

  serviceBuzzer();

  switch (ledMode) {
    case MODE_LED_OFF: red = false; green = false; break;
    case MODE_LED_GREEN_ON: red = false; green = true; break;
    case MODE_LED_RED_ON: red = true; green = false; break;
    case MODE_LED_GREEN_BLINK_SLOW: interval = 650; useBlink = true; green = true; break;
    case MODE_LED_GREEN_BLINK_MIDDLE: interval = 350; useBlink = true; green = true; break;
    case MODE_LED_GREEN_BLINK_FAST: interval = 180; useBlink = true; green = true; break;
    case MODE_LED_GREEN_BLINK_CRAZY: interval = 60; useBlink = true; green = true; break;
    case MODE_LED_RED_BLINK_SLOW: interval = 650; useBlink = true; red = true; break;
    case MODE_LED_RED_BLINK_MIDDLE: interval = 350; useBlink = true; red = true; break;
    case MODE_LED_RED_BLINK_FAST: interval = 180; useBlink = true; red = true; break;
    case MODE_LED_RED_BLINK_CRAZY: interval = 60; useBlink = true; red = true; break;
    case MODE_LED_LINK: red = false; green = true; break;
  }

  if (useBlink && (now - lastBlink >= interval)) {
    lastBlink = now;
    blinkState = !blinkState;
  }

  uint8_t redPct = 0, greenPct = 0;
  if (useBlink) {
    if (blinkState) { redPct = red ? dimPct : 0; greenPct = green ? dimPct : 0; }
  } else {
    redPct = red ? dimPct : 0;
    greenPct = green ? dimPct : 0;
  }

  if (g_activityActive) {
    redPct = dimPct;
    greenPct = dimPct;
  }

  applyLedPct(redPct, greenPct);
}

bool parsePercent(const String& s, uint8_t& out) {
  if (!s.length()) return false;
  for (uint16_t i = 0; i < s.length(); ++i) if (!isDigit(s[i])) return false;
  int v = s.toInt();
  if (v < 0) v = 0;
  if (v > 100) v = 100;
  out = (uint8_t)v;
  return true;
}

String unwrapTextCommand(String cmd) {
  cmd.trim();
  if (!cmd.length()) return "";
  String upper = cmd;
  upper.toUpperCase();
  if (upper.startsWith("TEXT ")) return cmd.substring(5);
  return cmd;
}

void processCommand(String cmd) {
  String raw = unwrapTextCommand(cmd);
  raw.trim();
  if (!raw.length()) { queueReply("ERR EMPTY"); return; }

  String upper = raw;
  upper.toUpperCase();

  if (upper == "PING") { queueReply("ACK PING"); return; }
  if (upper == "HB") { link.println("ACK HB"); return; }

  if (upper == "STATUS") {
    String s = String("STATUS OK MODE=") + (ledMode == MODE_LED_LINK ? "LINK" : "ACTIVE") + " DIM=" + String(dimPct);
#if ENABLE_BUZZER
    s += " BUZZER=ON PIN=D5 FREQ=" + String(BUZZER_FREQ);
#else
    s += " BUZZER=OFF";
#endif
    queueReply(s);
    return;
  }

  if (upper == "ACT" || upper == "ACTIVITY" || upper == "DBACT") {
    triggerActivityPulse();
    return;
  }

  if (upper == "HELP" || upper == "HELPSLAVE") {
    queueReply("CMDS 1/5: PING | STATUS | HELP");
    queueReply("CMDS 2/5: LED ON/OFF | GREEN ON/OFF | RED ON/OFF");
    queueReply("CMDS 3/5: BLINK SLOW/MIDDLE/FAST/CRAZY");
    queueReply("CMDS 4/5: RED BLINK SLOW/MIDDLE/FAST/CRAZY");
    queueReply("CMDS 5/5: MODE LINK | DIM 10..100 | TEXT <msg> | ACT");
    return;
  }

  if (upper == "LED ON" || upper == "GREEN ON") { ledMode = MODE_LED_GREEN_ON; queueReply("ACK GREEN ON"); return; }
  if (upper == "LED OFF" || upper == "GREEN OFF") { ledMode = MODE_LED_OFF; queueReply("ACK GREEN OFF"); return; }
  if (upper == "RED ON") { ledMode = MODE_LED_RED_ON; queueReply("ACK RED ON"); return; }
  if (upper == "RED OFF") { ledMode = MODE_LED_OFF; queueReply("ACK RED OFF"); return; }

  if (upper == "BLINK SLOW") { ledMode = MODE_LED_GREEN_BLINK_SLOW; queueReply("ACK BLINK SLOW"); return; }
  if (upper == "BLINK MIDDLE" || upper == "BLINK MEDIUM") { ledMode = MODE_LED_GREEN_BLINK_MIDDLE; queueReply("ACK BLINK MIDDLE"); return; }
  if (upper == "BLINK FAST") { ledMode = MODE_LED_GREEN_BLINK_FAST; queueReply("ACK BLINK FAST"); return; }
  if (upper == "BLINK CRAZY") { ledMode = MODE_LED_GREEN_BLINK_CRAZY; queueReply("ACK BLINK CRAZY"); return; }

  if (upper == "RED BLINK SLOW") { ledMode = MODE_LED_RED_BLINK_SLOW; queueReply("ACK RED BLINK SLOW"); return; }
  if (upper == "RED BLINK MIDDLE" || upper == "RED BLINK MEDIUM") { ledMode = MODE_LED_RED_BLINK_MIDDLE; queueReply("ACK RED BLINK MIDDLE"); return; }
  if (upper == "RED BLINK FAST") { ledMode = MODE_LED_RED_BLINK_FAST; queueReply("ACK RED BLINK FAST"); return; }
  if (upper == "RED BLINK CRAZY") { ledMode = MODE_LED_RED_BLINK_CRAZY; queueReply("ACK RED BLINK CRAZY"); return; }

  if (upper == "MODE LINK" || upper == "LINK MODE" || upper == "BLINK STOP" || upper == "BLINK OFF") {
    ledMode = MODE_LED_LINK;
    queueReply("ACK MODE LINK");
    return;
  }

  if (upper.startsWith("DIM ")) {
    uint8_t v = 0;
    if (!parsePercent(raw.substring(4), v)) { queueReply("ERR DIM"); return; }
    dimPct = v;
    queueReply(String("ACK DIM ") + String(dimPct));
    return;
  }

  queueReply(String("ACK TEXT ") + raw);
}

void setup() {
  Serial.begin(115200);
  link.begin(9600);

  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
#if ENABLE_BUZZER
  pinMode(BUZZER_PIN, OUTPUT);
#endif

  analogWriteRange(1023);
#if ENABLE_BUZZER
  analogWriteFreq(BUZZER_FREQ);
  buzzerOff();
  analogWrite(BUZZER_PIN, BUZZER_DUTY);
  delay(80);
  analogWrite(BUZZER_PIN, 0);
#endif
  applyLedPct(0, 0);

  Serial.println("SLAVE_BUILD=UART_ONLY_V4_DISK_TX_PWM_BUZZER_D5");
  Serial.println("SLAVE READY");
}

void loop() {
  updateLED();
  serviceActivityBurst();
  processTx();

  while (link.available()) {
    char c = (char)link.read();
    if (c == '\n') {
      processCommand(inputLine);
      inputLine = "";
    } else if (c != '\r') {
      inputLine += c;
      if (inputLine.length() > INPUT_MAX_LEN) inputLine = "";
    }
  }
}
