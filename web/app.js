// MR MATZOS - CIRCUIT LAB
// Dashboard frontend for Synology + Nginx + FastAPI
// Reads live state from /api/state as JSON.

const q = (s) => document.querySelector(s);
const qa = (s) => Array.from(document.querySelectorAll(s));

const batteryProfiles = {
  aa:      { good: 1.35, low: 1.10, empty: 0.90, label: 'AA/AAA alkaline preset active.' },
  aaa:     { good: 1.35, low: 1.10, empty: 0.90, label: 'AA/AAA alkaline preset active.' },
  nimh1v2: { good: 1.25, low: 1.10, empty: 0.95, label: 'NiMH 1.2V preset active.' },
  coin3v:  { good: 2.95, low: 2.75, empty: 2.50, label: '3V coin cell preset active.' },
  liion1s: { good: 2.80, low: 2.55, empty: 2.20, label: 'Li-Ion 3V window preset active.' }
};

const st = {
  pollBusy: false
};

function setText(sel, text) {
  const el = q(sel);
  if (el) el.textContent = text;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(n, unit = '') {
  return `${Number(n).toLocaleString('sv-SE', { maximumFractionDigits: 6 })}${unit ? ` ${unit}` : ''}`;
}

function pulse(btn) {
  if (!btn) return;
  btn.classList.add('flash');
  setTimeout(() => btn.classList.remove('flash'), 120);
}

function batteryZone(v) {
  const sel = q('#batterySel');
  const profile = batteryProfiles[(sel && sel.value) || 'aa'] || batteryProfiles.aa;
  setText('#batteryHint', profile.label);

  if (!Number.isFinite(v)) return '-';
  if (v >= profile.good) return 'GOOD';
  if (v >= profile.low) return 'MID';
  if (v >= profile.empty) return 'LOW';
  return 'DEAD';
}

function updateUiFromState(d) {
  if (!d || typeof d !== 'object') return;

  if (d.mv !== undefined) {
    const mv = Number(d.mv);
    if (Number.isFinite(mv)) {
      const v = mv / 1000;
      setText('#mvLbl', String(mv));
      setText('#voltageLbl', v.toFixed(3));
      setText('#zoneLbl', batteryZone(v));
    }
  }

  if (d.adc !== undefined) {
    setText('#adcLbl', `${d.adc} / 1023`);
  }

  if (d.rssi !== undefined) {
    setText('#rssiLbl', String(d.rssi));
  } else {
    setText('#rssiLbl', '-');
  }

  if (d.ip !== undefined && d.ip) {
    setText('#ipLbl', d.ip);
  } else if (d.device_id !== undefined) {
    setText('#ipLbl', d.device_id || '-');
  }

  if (d.mode !== undefined && d.mode) {
    setText('#modeLbl', d.mode);
  } else if (d.connected !== undefined) {
    setText('#modeLbl', d.connected ? 'CONNECTED' : 'IDLE');
  }

  const statusParts = ['HTTP OK'];

  if (d.connected !== undefined) {
    statusParts.push(d.connected ? 'LIVE' : 'NO DEVICE');
  }

  if (d.signal_type) {
    statusParts.push(d.signal_type);
  }

  if (d.frequency_hz !== undefined) {
    statusParts.push(`${Number(d.frequency_hz || 0)} Hz`);
  }

  setText('#statusLbl', statusParts.join(' | '));
  console.log('UI updated from /api/state:', d);
}

async function pollState() {
  if (st.pollBusy) return;
  st.pollBusy = true;

  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }

    const d = await r.json();
    updateUiFromState(d);
  } catch (e) {
    console.error('pollState failed:', e);
    setText('#statusLbl', 'STATE ERR');
  } finally {
    st.pollBusy = false;
  }
}

function syncLawMode() {
  const lawMode = q('#lawMode');
  if (!lawMode) return;

  const cfg = {
    voltage_from_ir: { hint: 'Spänning = Ström × Resistans', a: 'Current (A)',  b: 'Resistance (Ohm)' },
    current_from_ur: { hint: 'Ström = Spänning / Resistans', a: 'Voltage (V)',  b: 'Resistance (Ohm)' },
    res_from_ui:     { hint: 'Resistans = Spänning / Ström', a: 'Voltage (V)',  b: 'Current (A)' },
    power_from_ui:   { hint: 'Effekt = Spänning × Ström',    a: 'Voltage (V)',  b: 'Current (A)' },
    current_from_pu: { hint: 'Ström = Effekt / Spänning',    a: 'Power (W)',    b: 'Voltage (V)' },
    voltage_from_pi: { hint: 'Spänning = Effekt / Ström',    a: 'Power (W)',    b: 'Current (A)' }
  }[lawMode.value];

  if (!cfg) return;

  setText('#lawHint', cfg.hint);
  setText('#lawALbl', cfg.a);
  setText('#lawBLbl', cfg.b);

  const lawA = q('#lawA');
  const lawB = q('#lawB');
  if (lawA) lawA.placeholder = cfg.a;
  if (lawB) lawB.placeholder = cfg.b;
}

function bindCalc() {
  const lawMode = q('#lawMode');
  const resistorList = q('#resistorList');

  if (!lawMode || !resistorList) return;

  syncLawMode();
  lawMode.onchange = syncLawMode;

  const btnCalcLaw = q('#btnCalcLaw');
  if (btnCalcLaw) {
    btnCalcLaw.onclick = () => {
      const A = num(q('#lawA')?.value);
      const B = num(q('#lawB')?.value);

      if (A === null || B === null) {
        setText('#lawOut', 'Enter valid values in both fields.');
        pulse(btnCalcLaw);
        return;
      }

      let out = '-';

      switch (lawMode.value) {
        case 'voltage_from_ir':
          out = `Voltage = ${fmt(A * B, 'V')}`;
          break;
        case 'current_from_ur':
          out = B !== 0 ? `Current = ${fmt(A / B, 'A')}` : 'Division by zero.';
          break;
        case 'res_from_ui':
          out = B !== 0 ? `Resistance = ${fmt(A / B, 'Ohm')}` : 'Division by zero.';
          break;
        case 'power_from_ui':
          out = `Power = ${fmt(A * B, 'W')}`;
          break;
        case 'current_from_pu':
          out = B !== 0 ? `Current = ${fmt(A / B, 'A')}` : 'Division by zero.';
          break;
        case 'voltage_from_pi':
          out = B !== 0 ? `Voltage = ${fmt(A / B, 'V')}` : 'Division by zero.';
          break;
      }

      setText('#lawOut', out);
      pulse(btnCalcLaw);
    };
  }

  const btnCalcLawClear = q('#btnCalcLawClear');
  if (btnCalcLawClear) {
    btnCalcLawClear.onclick = () => {
      const lawA = q('#lawA');
      const lawB = q('#lawB');
      if (lawA) lawA.value = '';
      if (lawB) lawB.value = '';
      setText('#lawOut', 'Cleared.');
      pulse(btnCalcLawClear);
    };
  }

  function renumber() {
    qa('#resistorList .resInput').forEach((inp, i) => {
      inp.placeholder = `R${i + 1} Ohm`;
    });
  }

  function bindRemovers() {
    qa('.resRemove').forEach(btn => {
      btn.onclick = () => {
        const rows = qa('#resistorList .resRow');
        if (rows.length <= 2) {
          const inp = btn.parentElement?.querySelector('.resInput');
          if (inp) inp.value = '';
          return;
        }
        btn.parentElement?.remove();
        renumber();
      };
    });
  }

  const btnAddResistor = q('#btnAddResistor');
  if (btnAddResistor) {
    btnAddResistor.onclick = () => {
      const row = document.createElement('div');
      row.className = 'resRow';
      row.innerHTML =
        '<input class="field resInput" type="number" step="any" placeholder="R Ohm">' +
        '<button class="btn ghost resRemove" type="button">x</button>';
      resistorList.appendChild(row);
      bindRemovers();
      renumber();
      pulse(btnAddResistor);
    };
  }

  const btnCalcResistors = q('#btnCalcResistors');
  if (btnCalcResistors) {
    btnCalcResistors.onclick = () => {
      const vals = qa('#resistorList .resInput')
        .map(el => num(el.value))
        .filter(v => v !== null && v > 0);

      if (vals.length < 2) {
        setText('#resOut', 'Enter at least two positive resistor values.');
        pulse(btnCalcResistors);
        return;
      }

      const resMode = q('#resMode');
      if (resMode && resMode.value === 'series') {
        setText('#resOut', `Series total = ${fmt(vals.reduce((a, b) => a + b, 0), 'Ohm')}`);
      } else {
        const inv = vals.reduce((a, b) => a + 1 / b, 0);
        setText('#resOut', `Parallel total = ${fmt(1 / inv, 'Ohm')}`);
      }

      pulse(btnCalcResistors);
    };
  }

  const btnCalcResistorsClear = q('#btnCalcResistorsClear');
  if (btnCalcResistorsClear) {
    btnCalcResistorsClear.onclick = () => {
      resistorList.innerHTML =
        '<div class="resRow"><input class="field resInput" type="number" step="any" placeholder="R1 Ohm"><button class="btn ghost resRemove" type="button">x</button></div>' +
        '<div class="resRow"><input class="field resInput" type="number" step="any" placeholder="R2 Ohm"><button class="btn ghost resRemove" type="button">x</button></div>';
      bindRemovers();
      renumber();
      setText('#resOut', 'Cleared.');
      pulse(btnCalcResistorsClear);
    };
  }

  bindRemovers();
  renumber();
}

function startVectorMonitor() {
  const canvas = q('#vectorCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const modeLbl = q('#vectorModeLbl');
  const modes = ['TRIANGLE RIG', 'SINUS', 'SQUARE', 'SAW', 'XYZ'];
  let modeIndex = 0;
  let t = 0;

  const phosphor = document.createElement('canvas');
  phosphor.width = canvas.width;
  phosphor.height = canvas.height;
  const pctx = phosphor.getContext('2d');

  const verts = [
    [-0.8, -0.6, -0.6],
    [ 0.8, -0.6, -0.6],
    [ 0.0,  0.9, -0.6],
    [ 0.0,  0.0,  0.9]
  ];
  const edges = [[0,1],[1,2],[2,0],[0,3],[1,3],[2,3]];

  function rotate(v, ax, ay) {
    let [x, y, z] = v;
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);

    let y1 = y * cx - z * sx;
    let z1 = y * sx + z * cx;
    y = y1;
    z = z1;

    let x1 = x * cy + z * sy;
    let z2 = -x * sy + z * cy;
    x = x1;
    z = z2;

    return [x, y, z];
  }

  function project(v) {
    const [x, y, z] = v;
    const d = 2.8;
    const s = Math.min(canvas.width, canvas.height) * 0.52 / (z + d);
    return [x * s + canvas.width / 2, y * s + canvas.height / 2];
  }

  function drawGrid(target) {
    target.strokeStyle = 'rgba(110,255,190,0.05)';
    target.lineWidth = 0.45;

    for (let x = 0; x <= canvas.width; x += 40) {
      target.beginPath();
      target.moveTo(x, 0);
      target.lineTo(x, canvas.height);
      target.stroke();
    }

    for (let y = 0; y <= canvas.height; y += 24) {
      target.beginPath();
      target.moveTo(0, y);
      target.lineTo(canvas.width, y);
      target.stroke();
    }

    target.strokeStyle = 'rgba(255,190,100,0.18)';
    target.setLineDash([6, 6]);
    target.beginPath();
    target.moveTo(canvas.width / 2, 16);
    target.lineTo(canvas.width / 2, canvas.height - 16);
    target.moveTo(16, canvas.height / 2);
    target.lineTo(canvas.width - 16, canvas.height / 2);
    target.stroke();
    target.setLineDash([]);
  }

  function setupGlow(target) {
    target.shadowBlur = 1.4;
    target.shadowColor = '#8fffd0';
    target.strokeStyle = '#8fffd0';
    target.lineWidth = 1.6;
  }

  function drawTriangle(target) {
    const pts = verts.map(v => project(rotate(v, t * 0.7, t)));
    setupGlow(target);

    for (const [a, b] of edges) {
      target.beginPath();
      target.moveTo(pts[a][0], pts[a][1]);
      target.lineTo(pts[b][0], pts[b][1]);
      target.stroke();
    }
  }

  function drawWave(target, kind) {
    setupGlow(target);
    const mid = canvas.height / 2;
    const amp = 55;

    target.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const p = (x / canvas.width) * 8 * Math.PI + t * 2.2;
      let y = mid;

      if (kind === 'SINUS') y = mid + Math.sin(p) * amp;
      else if (kind === 'SQUARE') y = mid + (Math.sin(p) >= 0 ? -amp : amp);
      else if (kind === 'SAW') {
        const frac = ((p / (2 * Math.PI)) % 1 + 1) % 1;
        y = mid + ((frac * 2) - 1) * amp;
      }

      if (x === 0) target.moveTo(x, y);
      else target.lineTo(x, y);
    }
    target.stroke();
  }

  function drawXYZ(target) {
    setupGlow(target);
    target.beginPath();

    for (let i = 0; i < 900; i++) {
      const a = i / 900 * Math.PI * 2 * 3 + t;
      const x = canvas.width / 2 + Math.sin(a * 3.0) * 130 + Math.cos(a * 1.5) * 20;
      const y = canvas.height / 2 + Math.sin(a * 4.0 + 1.2) * 55 + Math.cos(a * 2.0) * 22;
      if (i === 0) target.moveTo(x, y);
      else target.lineTo(x, y);
    }

    target.stroke();
  }

  function drawCurrentFrame(target) {
    const mode = modes[modeIndex];
    if (modeLbl) modeLbl.textContent = mode;

    if (mode === 'TRIANGLE RIG') drawTriangle(target);
    else if (mode === 'XYZ') drawXYZ(target);
    else drawWave(target, mode);
  }

  function draw() {
    t += 0.038;

    pctx.fillStyle = 'rgba(2,5,3,0.14)';
    pctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(pctx);
    drawCurrentFrame(pctx);
    pctx.shadowBlur = 0;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const flicker = 0.92 + Math.random() * 0.12;
    ctx.globalAlpha = flicker;
    ctx.drawImage(phosphor, 0, 0);

    ctx.globalAlpha = 1;
    drawCurrentFrame(ctx);
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgba(140,255,210,${0.008 + Math.random() * 0.01})`;
    for (let i = 0; i < 4; i++) {
      const y = Math.random() * canvas.height;
      ctx.fillRect(0, y, canvas.width, 1);
    }

    requestAnimationFrame(draw);
  }

  const prev = q('#vecPrev');
  const next = q('#vecNext');
  if (prev) prev.onclick = () => { modeIndex = (modeIndex + modes.length - 1) % modes.length; };
  if (next) next.onclick = () => { modeIndex = (modeIndex + 1) % modes.length; };

  draw();
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('APP START');

  setText('#voltageLbl', '0.000');
  setText('#mvLbl', '0');
  setText('#adcLbl', '0 / 1023');
  setText('#zoneLbl', '-');

  const batterySel = q('#batterySel');
  if (batterySel) {
    batterySel.addEventListener('change', () => {
      const vv = Number((q('#voltageLbl') || {}).textContent);
      setText('#zoneLbl', batteryZone(vv));
    });
  }

  try {
    bindCalc();
  } catch (e) {
    console.error('bindCalc failed:', e);
  }

  try {
    startVectorMonitor();
  } catch (e) {
    console.error('startVectorMonitor failed:', e);
  }

  pollState();
  setInterval(pollState, 1000);
});