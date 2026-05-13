const q = (s) => document.querySelector(s);

const CFG = window.CIRCUITLAB_CONFIG || {};
const MCU_HTTP_BASE = CFG.MCU_API_BASE || '/mcu/api';
const MCU_WS_URL = CFG.MCU_WS_URL || (
  (location.protocol === 'https:' ? 'wss://' : 'ws://') +
  location.host +
  '/mcu/ws'
);

const LOG_MAX_LINES = Number(CFG.LOG_MAX_LINES || 200);

const st = {
  ws: null,
  wsOpen: false,
  pollBusy: false,
  logLines: [],
  proto: 'UART'
};

function setText(sel, text) {
  const el = q(sel);
  if (el) el.textContent = text;
}

function appendLog(line) {
  const msg = String(line || '').trim();
  if (!msg) return;

  st.logLines.push(msg);
  if (st.logLines.length > LOG_MAX_LINES) {
    st.logLines.splice(0, st.logLines.length - LOG_MAX_LINES);
  }

  const box = q('#termLog');
  if (box) {
    if ('value' in box) box.value = st.logLines.join('\n');
    else box.textContent = st.logLines.join('\n');
    box.scrollTop = box.scrollHeight;
  }
}

function clearLog() {
  st.logLines = [];
  const box = q('#termLog');
  if (box) {
    if ('value' in box) box.value = '';
    else box.textContent = '';
  }
}

function parseStateText(text) {
  const out = {};
  String(text || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

async function pollState() {
  if (st.pollBusy) return;
  st.pollBusy = true;

  try {
    const r = await fetch(`${MCU_HTTP_BASE}/state`, { cache: 'no-store' });
    const txt = await r.text();
    const d = parseStateText(txt);
    updateUiFromState(d);
  } catch (e) {
    console.error('protocol pollState failed:', e);
    setText('#wsLbl', 'DOWN');
  } finally {
    st.pollBusy = false;
  }
}

function updateUiFromState(d) {
  if (d.proto) st.proto = d.proto;
  setText('#modeLbl', st.proto || 'UART');
  setText('#wsLbl', st.wsOpen ? 'UP' : 'DOWN');
}

function normalizeUserCommand(raw) {
  const cmd = String(raw || '').trim();
  if (!cmd) return '';

  const upper = cmd.toUpperCase();

  if (upper === 'HELP') return 'HELPSLAVE';
  if (upper === 'STATUS') return 'STATUSSLAVE';
  if (upper === 'PING') return 'PINGSLAVE';
  if (upper === 'LISTTODO') return 'LISTTODO';
  if (upper === 'GETMEASSTAT') return 'GETMEASSTAT';
  if (upper === 'GETLATEST') return 'GETLATEST';
  if (upper === 'CLEARMEAS') return 'CLEARMEAS';

  if (
    upper.startsWith('SEND ') ||
    upper === 'HELPSLAVE' ||
    upper === 'STATUSSLAVE' ||
    upper === 'PINGSLAVE' ||
    upper.startsWith('GETTODO ') ||
    upper.startsWith('POSTTODO ') ||
    upper.startsWith('DELETETODO ') ||
    upper.startsWith('GETMEAS ') ||
    upper.startsWith('GETMEASID ') ||
    upper.startsWith('LISTMEAS ')
  ) {
    return cmd;
  }

  return `SEND ${cmd}`;
}

function sendWs(msg, echo = true) {
  const line = String(msg || '').trim();
  if (!line) return false;

  try {
    if (st.ws && st.ws.readyState === WebSocket.OPEN) {
      st.ws.send(line);
      if (echo) appendLog(`[TX] ${line}`);
      return true;
    }
  } catch (_) {}

  setText('#wsLbl', 'DOWN');
  appendLog('[ERR] WebSocket is down.');
  return false;
}

function shouldIgnoreLine(text) {
  const s = String(text || '').trim();
  return (
    !s ||
    s === '[BINARY FRAME]' ||
    s.startsWith('STAT ') ||
    s.startsWith('FS=') ||
    s.startsWith('PWM=') ||
    s.startsWith('PWF=') ||
    s.startsWith('PWP=') ||
    s.startsWith('SCOPE=') ||
    s.startsWith('MASTER_BUILD=') ||
    s.startsWith('LINK=') ||
    s.startsWith('PROTO=') ||
    s.startsWith('PROTO_LOCKED=') ||
    s.startsWith('LAB_MODE=') ||
    s.startsWith('BOOT_REASON=') ||
    s.startsWith('BOOT_COUNT=') ||
    s.startsWith('UART_PINS=') ||
    s.startsWith('PWM_PIN=')
  );
}

function renderIncomingLine(text) {
  const s = String(text || '').trim();
  if (shouldIgnoreLine(s)) return;

  if (s.startsWith('TX_UART=')) {
    appendLog(`[TX] ${s.slice(8)}`);
    return;
  }
  if (s.startsWith('RX_UART=')) {
    appendLog(`[RX] ${s.slice(8)}`);
    return;
  }
  if (s.startsWith('ERR=')) {
    appendLog(`[ERR] ${s.slice(4)}`);
    return;
  }
  if (s.startsWith('HTTP=')) {
    appendLog(`[HTTP] ${s.slice(5)}`);
    return;
  }
  if (s.startsWith('API_BODY=')) {
    appendLog(`[API] ${s.slice(9)}`);
    return;
  }

  appendLog(`[RX] ${s}`);
}

function connectWs() {
  try {
    const ws = new WebSocket(MCU_WS_URL);
    st.ws = ws;

    ws.onopen = () => {
      st.wsOpen = true;
      setText('#wsLbl', 'UP');
      appendLog(`[READY] UART terminal connected via ${MCU_WS_URL}`);
    };

    ws.onclose = () => {
      st.wsOpen = false;
      setText('#wsLbl', 'DOWN');
      appendLog('[WARN] WebSocket disconnected. Reconnecting...');
      setTimeout(connectWs, 1200);
    };

    ws.onerror = () => {
      st.wsOpen = false;
      setText('#wsLbl', 'DOWN');
      appendLog('[ERR] WebSocket error.');
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      renderIncomingLine(ev.data);
    };
  } catch (e) {
    console.error('connectWs failed:', e);
    appendLog('[ERR] WebSocket init failed.');
  }
}

function bindQuickButtons() {
  const quick = [
    ['#btnDim10', 'SEND DIM 10'],
    ['#btnDim20', 'SEND DIM 20'],
    ['#btnDim30', 'SEND DIM 30'],
    ['#btnDim50', 'SEND DIM 50'],
    ['#btnDim100', 'SEND DIM 100']
  ];

  quick.forEach(([sel, cmd]) => {
    const btn = q(sel);
    if (btn) btn.onclick = () => sendWs(cmd);
  });
}

function bindMainControls() {
  const input = q('#textInput');
  const sendBtn = q('#btnSend');
  const helpBtn = q('#btnHelp');
  const clearBtn = q('#btnClear');

  if (sendBtn) {
    sendBtn.onclick = () => {
      const normalized = normalizeUserCommand(input?.value || '');
      if (!normalized) return;
      sendWs(normalized);
      if (input) input.value = '';
    };
  }

  if (helpBtn) {
    helpBtn.onclick = () => sendWs('HELPSLAVE');
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      clearLog();
      appendLog('[READY] UART terminal cleared.');
    };
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendBtn?.click();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  appendLog('[READY] UART terminal started. Press HELP or type a command.');
  setText('#modeLbl', 'UART');
  setText('#wsLbl', 'DOWN');
  bindMainControls();
  bindQuickButtons();
  connectWs();
  pollState();
  setInterval(pollState, 1500);
});
