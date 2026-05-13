export const POINTCLOUD_FUNCTIONS = {
  polar2d: {
    title: '2D polar to cartesian',
    formula: 'x = r × cos(θ),  y = r × sin(θ)',
    explain: 'Omvandlar avstånd och vinkel till x/y-koordinat.',
    inputs: [
      { key: 'r', label: 'Distance r', unit: 'm', default: 5 },
      { key: 'thetaDeg', label: 'Angle θ', unit: 'deg', default: 35 }
    ],
    resultLabel: 'Cartesian point',
    resultUnit: '',
    calculate: ({ r, thetaDeg }) => {
      const a = thetaDeg * Math.PI / 180;
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    },
    visual: 'point2d'
  },
  spherical3d: {
    title: '3D spherical to cartesian',
    formula: 'x = r cos(e) cos(a), y = r cos(e) sin(a), z = r sin(e)',
    explain: 'Omvandlar avstånd, azimut och elevation till x/y/z.',
    inputs: [
      { key: 'r', label: 'Distance r', unit: 'm', default: 8 },
      { key: 'azimuthDeg', label: 'Azimuth a', unit: 'deg', default: 35 },
      { key: 'elevationDeg', label: 'Elevation e', unit: 'deg', default: 12 }
    ],
    resultLabel: '3D point',
    resultUnit: '',
    calculate: ({ r, azimuthDeg, elevationDeg }) => {
      const a = azimuthDeg * Math.PI / 180;
      const e = elevationDeg * Math.PI / 180;
      return {
        x: r * Math.cos(e) * Math.cos(a),
        y: r * Math.cos(e) * Math.sin(a),
        z: r * Math.sin(e)
      };
    },
    visual: 'point3d'
  }
};
