// MR MATZOS CALCULATOR - shared helpers
export const C = 299792458;

export function toNumber(value, name = 'value') {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`${name} måste vara ett giltigt tal.`);
  return n;
}

export function positive(value, name = 'value') {
  const n = toNumber(value, name);
  if (n <= 0) throw new Error(`${name} måste vara större än 0.`);
  return n;
}

export function fmt(n, unit = '', digits = 6) {
  if (!Number.isFinite(n)) return '-';
  const text = Number(n).toLocaleString('sv-SE', { maximumFractionDigits: digits });
  return unit ? `${text} ${unit}` : text;
}

export function degToRad(deg) {
  return Number(deg) * Math.PI / 180;
}

export function radToDeg(rad) {
  return Number(rad) * 180 / Math.PI;
}
