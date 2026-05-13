const C = 299792458;

export const RADAR_FUNCTIONS = {
  tofRange: {
    title: 'Radar range from time-of-flight',
    formula: 'R = c × Δt / 2',
    explain: 'Radar mäter tur-och-retur-tid. Därför delas sträckan med 2.',
    inputs: [
      { key: 'timeNs', label: 'Round-trip time Δt', unit: 'ns', default: 100 }
    ],
    resultLabel: 'Range R',
    resultUnit: 'm',
    calculate: ({ timeNs }) => C * (timeNs * 1e-9) / 2,
    visual: 'range'
  },
  rangeResolution: {
    title: 'Radar range resolution',
    formula: 'ΔR = c / (2 × B)',
    explain: 'Högre bandbredd B ger bättre avståndsupplösning.',
    inputs: [
      { key: 'bandwidthMHz', label: 'Bandwidth B', unit: 'MHz', default: 250 }
    ],
    resultLabel: 'Range resolution ΔR',
    resultUnit: 'm',
    calculate: ({ bandwidthMHz }) => C / (2 * bandwidthMHz * 1e6),
    visual: 'resolution'
  },
  dopplerVelocity: {
    title: 'Doppler velocity',
    formula: 'v = fd × λ / 2',
    explain: 'Radiell hastighet från dopplerfrekvens fd och våglängd λ.',
    inputs: [
      { key: 'dopplerHz', label: 'Doppler shift fd', unit: 'Hz', default: 1000 },
      { key: 'wavelengthM', label: 'Wavelength λ', unit: 'm', default: 0.0125 }
    ],
    resultLabel: 'Velocity v',
    resultUnit: 'm/s',
    calculate: ({ dopplerHz, wavelengthM }) => dopplerHz * wavelengthM / 2,
    visual: 'bar'
  }
};
