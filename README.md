# Area-51 WiFi Voltage Meter + WebScope + UART Protocol Lab by matsarlemark@gmail.com / aka / Mats Schyllander 2026

## Overview
An embedded ESP8266 project combining real-time voltage measurement, a browser-based oscilloscope, and a UART-based protocol lab for command testing and hardware control.
Oscilloscope does not really work well with fast PWM-signals, because of the ESP8266's lower performance. PS: You need TWO MCU's for protocol lab. UI is made thanks to modern AI and a alot of trial and error. #¤%#&"#¤%"#%¤# ! 

## Features
- Real-time voltage measurement (ADC A0)
- WebSocket-based oscilloscope (WebScope)
- UART master/slave communication
- PWM output control
- LED control (on/off, blink modes, dimming)
- OTA firmware updates
- WiFi STA + fallback AP mode
- Web UI served via LittleFS

---

## System Architecture

- **Master (ESP8266)**
  - WiFi + Web server
  - WebSocket communication
  - Command parser & router
  - UI hosting (LittleFS)

- **Slave (ESP8266)**
  - Executes commands
  - Controls LEDs and PWM
  - Handles dimming and blink modes

- **Communication**
  - UART (text-based commands)

---

## Screenshots

![Dashboard](images/dashboard.png)
![Scope](images/scope.png)
![Protocol Lab](images/protocol.png)

---

## Command List

### Core
PING  
STATUS  
HELP  

### LED Control
LED ON / OFF  
GREEN ON / OFF  
RED ON / OFF  

### Blink Modes
BLINK SLOW / MIDDLE / FAST / CRAZY  
RED BLINK SLOW / MIDDLE / FAST / CRAZY  

### Modes
MODE LINK  

### Dimming
DIM 10  
DIM 20  
DIM 30  
DIM 50  
DIM 100  

### PWM
PWM 1  
PWM 0  
PWF <hz>  
PWP <percent>  

### Misc
TEXT <message>  
PROTO UART  

---

## File Structure

```
master/   -> ESP8266 main firmware
slave/    -> ESP8266 slave firmware
data/     -> Web UI (LittleFS)
images/   -> Screenshots
```

---

## Setup Instructions

1. Flash master firmware
2. Flash slave firmware
3. Upload /data folder using LittleFS uploader
4. Connect to device WiFi /  psw: 12345678 / SSID: AREA51 Setup
5. Open web interface

---

## Design Decisions

- **WebSocket over HTTP polling**
  - Lower latency
  - Real-time updates for scope

- **UART communication**
  - Simple and transparent debugging
  - Easy extensibility

- **Separation of master/slave**
  - Clear responsibility split
  - Scalable architecture

---

## Known Limitations

- Oscilloscope is CPU intensive on ESP8266
- High sampling rates may affect system performance
- UART speed limited by SoftwareSerial constraints

---

## Author
Mats Schyllander 2026
