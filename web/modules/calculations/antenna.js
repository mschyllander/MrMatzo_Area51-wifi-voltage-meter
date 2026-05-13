const C = 299792458;

export const ANTENNA_FUNCTIONS = {
  wavelength: {
    title: 'Wavelength',
    formula: 'λ = c / f',
    explain: 'Våglängden λ beräknas från ljushastigheten c dividerat med frekvensen f.',
    inputs: [
      { key: 'frequencyMHz', label: 'Frequency f', unit: 'MHz', default: 868 }
    ],
    resultLabel: 'Wavelength λ',
    resultUnit: 'm',
    calculate: ({ frequencyMHz }) => C / (frequencyMHz * 1e6),
    visual: 'wave'
  },
  quarterWave: {
    title: 'Quarter-wave antenna',
    formula: 'L = (c / f) / 4 × VF',
    explain: 'Kvartsvågsantenn. VF är velocity factor, alltså praktisk korrigering för ledare/material.',
    inputs: [
      { key: 'frequencyMHz', label: 'Frequency f', unit: 'MHz', default: 868 },
      { key: 'velocityFactor', label: 'Velocity factor VF', unit: '', default: 0.95 }
    ],
    resultLabel: 'Length L',
    resultUnit: 'm',
    calculate: ({ frequencyMHz, velocityFactor }) => (C / (frequencyMHz * 1e6)) / 4 * velocityFactor,
    visual: 'wave'
  },
  halfWaveDipole: {
    title: 'Half-wave dipole total length',
    formula: 'L = (c / f) / 2 × VF',
    explain: 'Halvvågsdipolens totala längd. Varje ben är ungefär L/2.',
    inputs: [
      { key: 'frequencyMHz', label: 'Frequency f', unit: 'MHz', default: 433 },
      { key: 'velocityFactor', label: 'Velocity factor VF', unit: '', default: 0.95 }
    ],
    resultLabel: 'Total dipole length L',
    resultUnit: 'm',
    calculate: ({ frequencyMHz, velocityFactor }) => (C / (frequencyMHz * 1e6)) / 2 * velocityFactor,
    visual: 'dipole'
  }
};
