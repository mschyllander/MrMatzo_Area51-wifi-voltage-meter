export const ELECTRICAL_FUNCTIONS = {
  ohmVoltage: {
    title: 'Voltage from current and resistance',
    formula: 'U = I × R',
    explain: 'Ohms lag. Spänning U beräknas från ström I multiplicerat med resistans R.',
    inputs: [
      { key: 'current', label: 'Current I', unit: 'A', default: 0.02 },
      { key: 'resistance', label: 'Resistance R', unit: 'Ω', default: 220 }
    ],
    resultLabel: 'Voltage U',
    resultUnit: 'V',
    calculate: ({ current, resistance }) => current * resistance,
    visual: 'bar'
  },
  ohmCurrent: {
    title: 'Current from voltage and resistance',
    formula: 'I = U / R',
    explain: 'Strömmen I blir spänningen U dividerad med resistansen R.',
    inputs: [
      { key: 'voltage', label: 'Voltage U', unit: 'V', default: 5 },
      { key: 'resistance', label: 'Resistance R', unit: 'Ω', default: 1000 }
    ],
    resultLabel: 'Current I',
    resultUnit: 'A',
    calculate: ({ voltage, resistance }) => voltage / resistance,
    visual: 'bar'
  },
  ohmResistance: {
    title: 'Resistance from voltage and current',
    formula: 'R = U / I',
    explain: 'Resistansen R blir spänningen U dividerad med strömmen I.',
    inputs: [
      { key: 'voltage', label: 'Voltage U', unit: 'V', default: 5 },
      { key: 'current', label: 'Current I', unit: 'A', default: 0.02 }
    ],
    resultLabel: 'Resistance R',
    resultUnit: 'Ω',
    calculate: ({ voltage, current }) => voltage / current,
    visual: 'bar'
  },
  power: {
    title: 'Power from voltage and current',
    formula: 'P = U × I',
    explain: 'Effekten P blir spänningen U multiplicerad med strömmen I.',
    inputs: [
      { key: 'voltage', label: 'Voltage U', unit: 'V', default: 12 },
      { key: 'current', label: 'Current I', unit: 'A', default: 1.5 }
    ],
    resultLabel: 'Power P',
    resultUnit: 'W',
    calculate: ({ voltage, current }) => voltage * current,
    visual: 'bar'
  },
  voltageDivider: {
    title: 'Voltage divider',
    formula: 'Vout = Vin × R2 / (R1 + R2)',
    explain: 'Spänningsdelare. Utspänningen tas över R2.',
    inputs: [
      { key: 'vin', label: 'Input voltage Vin', unit: 'V', default: 5 },
      { key: 'r1', label: 'R1', unit: 'Ω', default: 10000 },
      { key: 'r2', label: 'R2', unit: 'Ω', default: 10000 }
    ],
    resultLabel: 'Output voltage Vout',
    resultUnit: 'V',
    calculate: ({ vin, r1, r2 }) => vin * (r2 / (r1 + r2)),
    visual: 'divider'
  }
};
