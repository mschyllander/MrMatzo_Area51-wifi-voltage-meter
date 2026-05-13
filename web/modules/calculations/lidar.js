const C = 299792458;

export const LIDAR_FUNCTIONS = {
  tofDistance: {
    title: 'LiDAR distance from time-of-flight',
    formula: 'd = c × Δt / 2',
    explain: 'Avstånd från tur-och-retur-tid. Ljuset går till objektet och tillbaka.',
    inputs: [
      { key: 'timeNs', label: 'Round-trip time Δt', unit: 'ns', default: 20 }
    ],
    resultLabel: 'Distance d',
    resultUnit: 'm',
    calculate: ({ timeNs }) => C * (timeNs * 1e-9) / 2,
    visual: 'range'
  },
  angularResolution: {
    title: 'Angular resolution',
    formula: 'θstep = FOV / N',
    explain: 'Vinkelsteg per punkt i ett svep.',
    inputs: [
      { key: 'fovDeg', label: 'Field of view FOV', unit: 'deg', default: 120 },
      { key: 'points', label: 'Points per scan N', unit: '', default: 600 }
    ],
    resultLabel: 'Angular step θstep',
    resultUnit: 'deg/point',
    calculate: ({ fovDeg, points }) => fovDeg / points,
    visual: 'fan'
  },
  pointSpacing: {
    title: 'Point spacing at distance',
    formula: 's = d × tan(θstep)',
    explain: 'Ungefärligt avstånd mellan två LiDAR-punkter vid ett visst avstånd.',
    inputs: [
      { key: 'distanceM', label: 'Distance d', unit: 'm', default: 10 },
      { key: 'angleStepDeg', label: 'Angular step θstep', unit: 'deg', default: 0.2 }
    ],
    resultLabel: 'Point spacing s',
    resultUnit: 'm',
    calculate: ({ distanceM, angleStepDeg }) => distanceM * Math.tan(angleStepDeg * Math.PI / 180),
    visual: 'fan'
  }
};
