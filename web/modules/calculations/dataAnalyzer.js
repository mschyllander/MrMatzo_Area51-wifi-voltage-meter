import { fmt } from './core.js';

export function parseDelimitedText(text) {
  const clean = String(text || '').trim();
  if (!clean) return { rows: [], columns: [] };
  const lines = clean.split(/\r?\n/).filter(Boolean);
  const delimiter = detectDelimiter(lines[0] || '');
  const first = splitLine(lines[0], delimiter);
  const hasHeader = first.some(v => /[a-zA-Z_]/.test(v));
  const columns = hasHeader ? first.map(s => s.trim()) : first.map((_, i) => `col${i + 1}`);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows = dataLines.map(line => {
    const values = splitLine(line, delimiter);
    const obj = {};
    columns.forEach((c, i) => obj[c] = values[i] ?? '');
    return obj;
  });
  return { rows, columns };
}

function detectDelimiter(line) {
  if (line.includes(';')) return ';';
  if (line.includes('\t')) return '\t';
  return ',';
}

function splitLine(line, delimiter) {
  // Simple CSV/TSV parser; enough for ESP logs and exported measurements.
  if (delimiter !== ',') return String(line).split(delimiter).map(s => s.trim());
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of String(line)) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function normalizeMeasurementRows(rows) {
  return rows.map((r, i) => {
    const lower = Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).toLowerCase(), v]));
    const mv = pickNumber(lower, ['mv', 'millivolt', 'millivolts']);
    const adc = pickNumber(lower, ['adc', 'raw', 'sample']);
    const ts = pickNumber(lower, ['ts_ms', 'time_ms', 't', 'time', 'timestamp']);
    return { index: i, ts_ms: ts, adc, mv, raw: r };
  }).filter(p => Number.isFinite(p.mv) || Number.isFinite(p.adc));
}

function pickNumber(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== '') {
      const n = Number(String(obj[k]).replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

export function analyzeMeasurements(points) {
  const mvVals = points.map(p => p.mv).filter(Number.isFinite);
  const adcVals = points.map(p => p.adc).filter(Number.isFinite);
  const tsVals = points.map(p => p.ts_ms).filter(Number.isFinite);
  const result = {
    count: points.length,
    mv: summarize(mvVals),
    adc: summarize(adcVals),
    duration_ms: tsVals.length > 1 ? Math.max(...tsVals) - Math.min(...tsVals) : 0,
    estimated_frequency_hz: estimateFrequency(points),
  };
  return result;
}

function summarize(vals) {
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, max, mean, amplitude: max - min };
}

function estimateFrequency(points) {
  const arr = points.filter(p => Number.isFinite(p.ts_ms) && Number.isFinite(p.mv));
  if (arr.length < 6) return 0;
  const mean = arr.reduce((s, p) => s + p.mv, 0) / arr.length;
  let crossings = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1].mv < mean && arr[i].mv >= mean) crossings++;
  }
  const duration = (arr[arr.length - 1].ts_ms - arr[0].ts_ms) / 1000;
  return duration > 0 ? crossings / duration : 0;
}

export function analysisToText(a) {
  if (!a || !a.count) return 'Ingen mätdata hittades.';
  const lines = [`Samples: ${a.count}`];
  if (a.mv) lines.push(`mV min/mean/max/amplitude: ${fmt(a.mv.min)} / ${fmt(a.mv.mean)} / ${fmt(a.mv.max)} / ${fmt(a.mv.amplitude)} mV`);
  if (a.adc) lines.push(`ADC min/mean/max/amplitude: ${fmt(a.adc.min)} / ${fmt(a.adc.mean)} / ${fmt(a.adc.max)} / ${fmt(a.adc.amplitude)}`);
  if (a.duration_ms) lines.push(`Duration: ${fmt(a.duration_ms, 'ms')}`);
  if (a.estimated_frequency_hz) lines.push(`Estimated frequency: ${fmt(a.estimated_frequency_hz, 'Hz')}`);
  return lines.join('\n');
}
