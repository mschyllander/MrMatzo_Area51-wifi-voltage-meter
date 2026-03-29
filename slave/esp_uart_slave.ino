#include <SoftwareSerial.h>

#define UART_RX_PIN 12   // D6
#define UART_TX_PIN 16   // D0
#define LED_RED_PIN   2  // D4
#define LED_GREEN_PIN 13 // D7

SoftwareSerial link(UART_RX_PIN, UART_TX_PIN);

String inputLine = "";
String reply = "READY";

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

static uint16_t pctToPwm(uint8_t pct) {
  if (pct > 100) pct = 100;
  return (uint16_t)((1023UL * pct) / 100UL);
}

void applyLedPct(uint8_t redPct, uint8_t greenPct) {
  analogWrite(LED_RED_PIN, pctToPwm(redPct));
  analogWrite(LED_GREEN_PIN, pctToPwm(greenPct));
}

void setLED(bool redOn, bool greenOn) {
  applyLedPct(redOn ? dimPct : 0, greenOn ? dimPct : 0);
}

void updateLED() {
  unsigned long now = millis();
  unsigned long interval = 0;
  bool useBlink = false;
  bool red = false;
  bool green = false;

  switch (ledMode) {
    case MODE_LED_OFF:
      applyLedPct(0, 0);
      return;

    case MODE_LED_GREEN_ON:
      applyLedPct(0, dimPct);
      return;

    case MODE_LED_RED_ON:
      applyLedPct(dimPct, 0);
      return;

    case MODE_LED_GREEN_BLINK_SLOW:
      interval = 650; useBlink = true; green = true; break;
    case MODE_LED_GREEN_BLINK_MIDDLE:
      interval = 350; useBlink = true; green = true; break;
    case MODE_LED_GREEN_BLINK_FAST:
      interval = 180; useBlink = true; green = true; break;
    case MODE_LED_GREEN_BLINK_CRAZY:
      interval = 60;  useBlink = true; green = true; break;

    case MODE_LED_RED_BLINK_SLOW:
      interval = 650; useBlink = true; red = true; break;
    case MODE_LED_RED_BLINK_MIDDLE:
      interval = 350; useBlink = true; red = true; break;
    case MODE_LED_RED_BLINK_FAST:
      interval = 180; useBlink = true; red = true; break;
    case MODE_LED_RED_BLINK_CRAZY:
      interval = 60;  useBlink = true; red = true; break;

    case MODE_LED_LINK:
      applyLedPct(0, dimPct);
      return;
  }

  if (useBlink && (now - lastBlink >= interval)) {
    lastBlink = now;
    blinkState = !blinkState;
  }

  if (blinkState) {
    applyLedPct(red ? dimPct : 0, green ? dimPct : 0);
  } else {
    applyLedPct(0, 0);
  }
}

bool parsePercent(const String& s, uint8_t& out) {
  if (!s.length()) return false;
  for (uint16_t i = 0; i < s.length(); ++i) {
    if (!isDigit(s[i])) return false;
  }
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
  if (upper.startsWith("TEXT ")) {
    return cmd.substring(5);
  }
  return cmd;
}

void processCommand(String cmd) {
  String raw = unwrapTextCommand(cmd);
  raw.trim();
  if (!raw.length()) {
    reply = "ERR EMPTY";
    return;
  }

  String upper = raw;
  upper.toUpperCase();

  if (upper == "PING") {
    reply = "ACK PING";
    return;
  }

  if (upper == "STATUS") {
    reply = String("STATUS OK MODE=") +
            (ledMode == MODE_LED_LINK ? "LINK" : "ACTIVE") +
            " DIM=" + String(dimPct);
    return;
  }

  if (upper == "HB") {
    reply = "ACK HB";
    return;
  }

  if (upper == "HELP" || upper == "HELPSLAVE") {
    reply = "CMDS PING | STATUS | LED ON/OFF | GREEN ON/OFF | RED ON/OFF | BLINK SLOW/MIDDLE/FAST/CRAZY | RED BLINK SLOW/MIDDLE/FAST/CRAZY | MODE LINK | DIM 10..100 | TEXT <msg>";
    return;
  }

  if (upper == "LED ON" || upper == "GREEN ON") {
    ledMode = MODE_LED_GREEN_ON;
    reply = "ACK GREEN ON";
    return;
  }

  if (upper == "LED OFF" || upper == "GREEN OFF") {
    ledMode = MODE_LED_OFF;
    reply = "ACK GREEN OFF";
    return;
  }

  if (upper == "RED ON") {
    ledMode = MODE_LED_RED_ON;
    reply = "ACK RED ON";
    return;
  }

  if (upper == "RED OFF") {
    ledMode = MODE_LED_OFF;
    reply = "ACK RED OFF";
    return;
  }

  if (upper == "BLINK SLOW") {
    ledMode = MODE_LED_GREEN_BLINK_SLOW;
    reply = "ACK BLINK SLOW";
    return;
  }
  if (upper == "BLINK MIDDLE" || upper == "BLINK MEDIUM") {
    ledMode = MODE_LED_GREEN_BLINK_MIDDLE;
    reply = "ACK BLINK MIDDLE";
    return;
  }
  if (upper == "BLINK FAST") {
    ledMode = MODE_LED_GREEN_BLINK_FAST;
    reply = "ACK BLINK FAST";
    return;
  }
  if (upper == "BLINK CRAZY") {
    ledMode = MODE_LED_GREEN_BLINK_CRAZY;
    reply = "ACK BLINK CRAZY";
    return;
  }

  if (upper == "RED BLINK SLOW") {
    ledMode = MODE_LED_RED_BLINK_SLOW;
    reply = "ACK RED BLINK SLOW";
    return;
  }
  if (upper == "RED BLINK MIDDLE" || upper == "RED BLINK MEDIUM") {
    ledMode = MODE_LED_RED_BLINK_MIDDLE;
    reply = "ACK RED BLINK MIDDLE";
    return;
  }
  if (upper == "RED BLINK FAST") {
    ledMode = MODE_LED_RED_BLINK_FAST;
    reply = "ACK RED BLINK FAST";
    return;
  }
  if (upper == "RED BLINK CRAZY") {
    ledMode = MODE_LED_RED_BLINK_CRAZY;
    reply = "ACK RED BLINK CRAZY";
    return;
  }

  if (upper == "MODE LINK" || upper == "LINK MODE" || upper == "BLINK STOP" || upper == "BLINK OFF") {
    ledMode = MODE_LED_LINK;
    reply = "ACK MODE LINK";
    return;
  }

  if (upper.startsWith("DIM ")) {
    uint8_t v = 0;
    if (!parsePercent(raw.substring(4), v)) {
      reply = "ERR DIM";
      return;
    }
    dimPct = v;
    reply = String("ACK DIM ") + String(dimPct);
    return;
  }

  reply = String("ACK TEXT ") + raw;
}

void setup() {
  Serial.begin(115200);
  link.begin(9600);

  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  analogWriteRange(1023);
  applyLedPct(0, 0);

  Serial.println("SLAVE_BUILD=UART_ONLY_V2");
  Serial.println("SLAVE READY");
}

void loop() {
  updateLED();

  while (link.available()) {
    char c = (char)link.read();
    if (c == '\n') {
      processCommand(inputLine);
      link.println(reply);
      inputLine = "";
    } else if (c != '\r') {
      inputLine += c;
      if (inputLine.length() > 120) inputLine = "";
    }
  }
}
