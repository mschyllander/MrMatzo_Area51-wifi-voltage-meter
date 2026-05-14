
(function radar3dInjectedStyle(){
  const s = document.createElement('style');
  s.textContent = `
    .radar3dPlot{
      width:100%;
      height:420px;
      min-height:420px;
      border:1px solid rgba(124,255,206,.24);
      border-radius:16px;
      background:#020503;
      overflow:hidden;
    }
    #calcCanvas[hidden], #radar3dPlot[hidden]{display:none!important}
  `;
  document.head.appendChild(s);
})();
console.log('MR MATZOS calculator.js loaded: practical toolbox restore v11');
(function rfToolboxInjectedStyle(){
  const s = document.createElement('style');
  s.textContent = `.rfToolboxGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rfToolboxNote{margin-top:8px;color:#bdf8d4;font-size:12px;line-height:1.45}@media(max-width:900px){.rfToolboxGrid{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
})();
(function dopplerBatchInjectedStyle(){
  const s = document.createElement('style');
  s.textContent = `
    .dopplerBatchGrid{display:grid;gap:8px;margin-top:8px;max-height:270px;overflow:auto;padding-right:4px}
    .dopplerBatchHeader,.dopplerBatchRow{display:grid;grid-template-columns:1.1fr 1fr 1fr 42px;gap:8px;align-items:center}
    .dopplerBatchHeader{color:#bdf8d4;font-size:11px;letter-spacing:.5px}
    .dopplerBatchResult{margin-top:8px;color:#fff3d6;font-size:12px;line-height:1.45;white-space:pre-wrap}
    @media(max-width:900px){.dopplerBatchHeader,.dopplerBatchRow{grid-template-columns:1fr}.dopplerBatchHeader{display:none}}
  `;
  document.head.appendChild(s);
})();
(function pcControlPadInjectedStyle(){
  const s = document.createElement('style');
  s.textContent = `.pcControlPad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pcControlPad .btn{min-height:32px;padding:6px 8px}`;
  document.head.appendChild(s);
})();
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    r = Math.min(r || 8, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}


(function calculatorCompactLayoutStyle(){
  const s = document.createElement('style');
  s.textContent = `
    /* v7 compact layout: data import moved to left and visualization made brighter */
    #calcCanvas{width:100%;height:330px;display:block;background:rgba(5,22,15,.82)!important}
    .calculatorDataMoved{margin-top:10px!important;margin-bottom:10px!important}
    .calculatorDataMoved input[type="file"]{width:100%;max-width:100%}
    .calculatorDataMoved .row{gap:8px;flex-wrap:wrap}
    .calculatorDataMoved button,.calculatorDataMoved .btn{min-height:30px;padding:6px 10px}
    .compactCalcLayout textarea,.compactCalcLayout pre{max-height:170px;overflow:auto}
    @media(max-height:850px){#calcCanvas{height:285px}.formulaBox,#formulaBox{max-height:145px;overflow:auto}}
  `;
  document.head.appendChild(s);
})();

const q = s => document.querySelector(s);
const qa = s => Array.from(document.querySelectorAll(s));

const C = 299792458;
const SOUND = 343;

let currentTab = 'electrical';

const FUNCTIONS = {
  electrical: [
    {
      id:'ohm_u',
      name:'Ohms law: U = I × R',
      formula:'U = I · R\n\nU = voltage [V]\nI = current [A]\nR = resistance [Ω]',
      fields:[['i','Current I','A', ''], ['r','Resistance R','Ω', '']],
      calc:v => ({ text:`U = ${(v.i*v.r).toFixed(6)} V`, y:v.i*v.r, type:'bar', label:'Voltage' })
    },
    {
      id:'ohm_i',
      name:'Ohms law: I = U / R',
      formula:'I = U / R\n\nCurrent equals voltage divided by resistance.',
      fields:[['u','Voltage U','V', ''], ['r','Resistance R','Ω', '']],
      calc:v => ({ text:`I = ${(v.u/v.r).toFixed(6)} A`, y:v.u/v.r, type:'bar', label:'Current' })
    },
    {
      id:'multi_divider',
      name:'Multi-resistor voltage divider',
      formula:'Series divider chain:\nRtot = R1 + R2 + ... + Rn\n\nNode voltage after resistor k from the top:\nVout = Vin · (R(k+1)+...+Rn) / Rtot\n\nAdd any number of resistors and choose the tap/node.',
      custom:'multiDivider',
      calc:calcMultiDivider
    },
    {
      id:'resistors',
      name:'Series / parallel resistor network',
      formula:'Series:\nRtot = R1 + R2 + ... + Rn\n\nParallel:\n1/Rtot = 1/R1 + 1/R2 + ... + 1/Rn',
      custom:'resistors',
      calc:calcResistors
    },
    {
      id:'power',
      name:'Power: P = U × I',
      formula:'P = U · I\n\nElectrical power in watts.',
      fields:[['u','Voltage U','V', ''], ['i','Current I','A', '']],
      calc:v => ({ text:`P = ${(v.u*v.i).toFixed(6)} W`, y:v.u*v.i, type:'bar', label:'Power' })
    }
  ],
  rf: [
    {
      id:'wave',
      name:'Wavelength',
      formula:'λ = c / f\n\nc = 299 792 458 m/s\nf = frequency [Hz]\n\nUseful base calculation for RF, antenna and radar work.',
      fields:[['f','Frequency','Hz','77000000000']],
      calc:v => ({ text:`f = ${(v.f/1e9).toFixed(6)} GHz\nλ = ${(C/v.f).toFixed(9)} m\n= ${((C/v.f)*1000).toFixed(6)} mm`, y:C/v.f, type:'wave', values:v })
    },
    {
      id:'antenna_length',
      name:'Antenna length: λ / 4 and λ / 2',
      formula:'λ = c / f\n\nQuarter-wave monopole:\nLquarter = λ / 4 · VF\n\nHalf-wave dipole total length:\nLdipole = λ / 2 · VF\n\nEach dipole side:\nLside = Ldipole / 2\n\nVF = velocity factor. Typical simple wire estimate: 0.95.',
      fields:[['f','Frequency','Hz','433000000'], ['vf','Velocity factor','','0.95']],
      calc:v => {
        if(v.f <= 0) throw new Error('Frequency must be greater than 0.');
        if(v.vf <= 0) throw new Error('Velocity factor must be greater than 0.');
        const lambda = C / v.f;
        const quarter = lambda / 4 * v.vf;
        const dipoleTotal = lambda / 2 * v.vf;
        const dipoleSide = dipoleTotal / 2;
        return {
          text:
            `f = ${(v.f/1e6).toFixed(6)} MHz\n` +
            `λ = ${lambda.toFixed(6)} m\n` +
            `Quarter-wave = ${quarter.toFixed(6)} m\n` +
            `Half-wave dipole total = ${dipoleTotal.toFixed(6)} m\n` +
            `Each dipole side = ${dipoleSide.toFixed(6)} m`,
          y:dipoleTotal,
          type:'antennaLength',
          values:{f:v.f, vf:v.vf, lambda, quarter, dipoleTotal, dipoleSide}
        };
      }
    },
    {
      id:'rf_dbm_watt',
      name:'RF power: dBm ↔ watt',
      formula:'dBm to watt:\nP(W) = 10^((dBm - 30) / 10)\n\nWatt to dBm:\ndBm = 10 · log10(P(W)) + 30',
      custom:'rfPower',
      calc:calcRfPower
    },
    {
      id:'rf_fspl',
      name:'Free-space path loss (FSPL)',
      formula:'FSPL(dB) = 20log10(d_km) + 20log10(f_MHz) + 32.44\n\nIdeal free-space loss. Walls, cables and mismatch are not included.',
      fields:[['d','Distance','m','100'], ['f','Frequency','Hz','2400000000']],
      calc:v => {
        const dkm = v.d / 1000;
        const fmhz = v.f / 1000000;
        const fspl = 20*Math.log10(dkm) + 20*Math.log10(fmhz) + 32.44;
        return { text:`FSPL = ${fspl.toFixed(2)} dB`, y:fspl, type:'rfFspl', values:{distance:v.d, frequency:v.f, fspl} };
      }
    },
    {
      id:'rf_link_budget',
      name:'RF link budget',
      formula:'Pr(dBm) = Pt(dBm) + Gt(dBi) + Gr(dBi) - FSPL(dB) - losses(dB)',
      fields:[['pt','TX power','dBm','20'], ['gt','TX antenna gain','dBi','2'], ['gr','RX antenna gain','dBi','2'], ['d','Distance','m','100'], ['f','Frequency','Hz','2400000000'], ['loss','Extra losses','dB','3']],
      calc:v => {
        const dkm = v.d / 1000;
        const fmhz = v.f / 1000000;
        const fspl = 20*Math.log10(dkm) + 20*Math.log10(fmhz) + 32.44;
        const pr = v.pt + v.gt + v.gr - fspl - v.loss;
        return { text:`FSPL = ${fspl.toFixed(2)} dB\nPr = ${pr.toFixed(2)} dBm`, y:pr, type:'rfLinkBudget', values:{pt:v.pt,gt:v.gt,gr:v.gr,d:v.d,f:v.f,loss:v.loss,fspl,pr} };
      }
    },
    {
      id:'rf_eirp',
      name:'EIRP / usable beam cone',
      formula:'EIRP(dBm) = TX power(dBm) + antenna gain(dBi) - cable loss(dB)\n\nBeam cone is a simplified 2D view of the main lobe / usable direction.\nIt is NOT a guaranteed real range calculation. Real range also needs frequency, receiver sensitivity, RX antenna gain, noise, bandwidth and losses.\n\nBeam width is entered in degrees. Smaller beam width = narrower cone. Antenna gain now affects the bright main-lobe core and gain/directivity meter.',
      fields:[
        ['pt','TX power','dBm','20'],
        ['gain','Antenna gain','dBi','8'],
        ['loss','Cable/loss','dB','1'],
        ['beam','Usable beam width','degrees','35'],
        ['range','Sketch range','m','100']
      ],
      calc:v => {
        const eirp = v.pt + v.gain - v.loss;
        const watt = Math.pow(10, (eirp - 30)/10);
        const beam = Math.max(1, Math.min(180, v.beam || 35));
        const range = Math.max(1, v.range || 100);
        return {
          text:`EIRP = ${eirp.toFixed(2)} dBm\n= ${watt.toFixed(6)} W\nUsable beam cone ≈ ${beam.toFixed(1)}°\nSketch range = ${range.toFixed(1)} m\n\nNote: cone shows direction/coverage only. Gain changes the bright core/directivity, not guaranteed detection range.`,
          y:eirp,
          type:'rfEirp',
          values:{pt:v.pt,gain:v.gain,loss:v.loss,eirp,watt,beam,range}
        };
      }
    },
    {
      id:'rf_far_field',
      name:'Near-field / far-field distance',
      formula:'Fraunhofer far-field distance:\nR = 2D² / λ\n\nλ = c / f',
      fields:[['d','Largest antenna dimension D','m','0.1'], ['f','Frequency','Hz','2400000000']],
      calc:v => {
        const lambda = C / v.f;
        const r = 2*v.d*v.d / lambda;
        return { text:`λ = ${lambda.toFixed(6)} m\nFar-field R ≈ ${r.toFixed(6)} m`, y:r, type:'rfFarField', values:{d:v.d,f:v.f,lambda,r} };
      }
    },
    {
      id:'rf_lc_resonance',
      name:'LC resonance',
      formula:'f = 1 / (2π√(LC))\n\nL = inductance [H]\nC = capacitance [F]',
      fields:[['l','Inductance L','H','0.000001'], ['cap','Capacitance C','F','0.000000001']],
      calc:v => {
        const f = 1 / (2*Math.PI*Math.sqrt(v.l*v.cap));
        return { text:`f = ${f.toFixed(3)} Hz\n= ${(f/1000000).toFixed(6)} MHz`, y:f, type:'rfLc', values:{l:v.l,cap:v.cap,frequency:f} };
      }
    }
  ],
  modulation: [
    {
      id:'am_mod_index',
      name:'AM: modulation index from envelope',
      formula:'AM modulation index from oscilloscope envelope:\n\nm = (Vmax - Vmin) / (Vmax + Vmin)\n\nm = 0..1 is normal AM. m > 1 means overmodulation / distortion.',
      fields:[['vmax','Envelope Vmax','V','5'], ['vmin','Envelope Vmin','V','1']],
      calc:v => {
        if(v.vmax <= 0 || v.vmin < 0) throw new Error('Use positive envelope voltages.');
        if(v.vmax <= v.vmin) throw new Error('Vmax must be greater than Vmin.');
        const m = (v.vmax - v.vmin) / (v.vmax + v.vmin);
        return { text:`m = ${m.toFixed(4)}\nModulation depth = ${(m*100).toFixed(2)} %${m>1?'\nWARNING: overmodulation.':''}`, y:m, type:'rfAmEnvelope', values:{...v,m} };
      }
    },
    {
      id:'am_bandwidth',
      name:'AM: bandwidth / sidebands',
      formula:'Standard double-sideband AM bandwidth:\n\nBW = 2 · fm\n\nSidebands appear at fc - fm and fc + fm.',
      fields:[['fc','Carrier frequency fc','Hz','1000000'], ['fm','Audio/modulating frequency fm','Hz','1000']],
      calc:v => {
        if(v.fc <= 0 || v.fm <= 0) throw new Error('Frequencies must be greater than 0.');
        const bw = 2 * v.fm;
        return { text:`Lower sideband = ${(v.fc-v.fm).toFixed(3)} Hz\nCarrier = ${v.fc.toFixed(3)} Hz\nUpper sideband = ${(v.fc+v.fm).toFixed(3)} Hz\nAM bandwidth = ${bw.toFixed(3)} Hz`, y:bw, type:'rfAmSpectrum', values:{...v,bw} };
      }
    },
    {
      id:'am_power',
      name:'AM: carrier / sideband power',
      formula:'Total AM power:\n\nPtotal = Pc · (1 + m²/2)\n\nTotal sideband power = Pc · m²/2\nEach sideband = Pc · m²/4',
      fields:[['pc','Carrier power Pc','W','10'], ['m','Modulation index m','0..1','0.7']],
      calc:v => {
        if(v.pc <= 0) throw new Error('Carrier power must be greater than 0.');
        if(v.m < 0) throw new Error('Modulation index cannot be negative.');
        const sideTotal = v.pc * v.m*v.m / 2;
        const each = sideTotal / 2;
        const total = v.pc + sideTotal;
        return { text:`Carrier power = ${v.pc.toFixed(6)} W\nTotal sideband power = ${sideTotal.toFixed(6)} W\nEach sideband = ${each.toFixed(6)} W\nTotal AM power = ${total.toFixed(6)} W`, y:total, type:'rfAmPower', values:{...v,sideTotal,each,total} };
      }
    },
    {
      id:'fm_deviation',
      name:'FM: frequency deviation',
      formula:'FM deviation from sensitivity and modulation amplitude:\n\nΔf = kf · Am\n\nkf = frequency sensitivity [Hz/V]\nAm = modulation amplitude [V]',
      fields:[['kf','Frequency sensitivity kf','Hz/V','5000'], ['am','Modulation amplitude Am','V','1.5'], ['fm','Modulating frequency fm','Hz','1000']],
      calc:v => {
        if(v.kf <= 0 || v.am < 0 || v.fm <= 0) throw new Error('Use positive kf/fm and non-negative amplitude.');
        const df = v.kf * v.am;
        const beta = df / v.fm;
        const bw = 2 * (df + v.fm);
        return { text:`Δf = ${df.toFixed(3)} Hz\nβ = ${beta.toFixed(4)}\nCarson BW ≈ ${bw.toFixed(3)} Hz`, y:df, type:'rfFmDeviation', values:{...v,df,beta,bw} };
      }
    },
    {
      id:'fm_carson',
      name:'FM: Carson bandwidth rule',
      formula:'FM modulation index and approximate bandwidth:\n\nβ = Δf / fm\nBW ≈ 2(Δf + fm)\n\nThis is the practical occupied bandwidth estimate.',
      fields:[['df','Frequency deviation Δf','Hz','75000'], ['fm','Highest modulating frequency fm','Hz','15000']],
      calc:v => {
        if(v.df <= 0 || v.fm <= 0) throw new Error('Frequencies must be greater than 0.');
        const beta = v.df / v.fm;
        const bw = 2 * (v.df + v.fm);
        return { text:`β = ${beta.toFixed(4)}\nCarson bandwidth ≈ ${bw.toFixed(3)} Hz\n= ${(bw/1000).toFixed(3)} kHz`, y:bw, type:'rfFmSpectrum', values:{...v,beta,bw} };
      }
    },
    {
      id:'rf_mixer',
      name:'RF helper: mixer / IF frequency',
      formula:'Mixer products:\n\nIF = |RF - LO|\nImage examples exist around LO ± IF depending on architecture.',
      fields:[['rf','RF input frequency','Hz','100000000'], ['lo','Local oscillator LO','Hz','110700000']],
      calc:v => {
        if(v.rf <= 0 || v.lo <= 0) throw new Error('Frequencies must be greater than 0.');
        const iff = Math.abs(v.rf - v.lo);
        const sum = v.rf + v.lo;
        return { text:`Difference IF = ${iff.toFixed(3)} Hz\n= ${(iff/1000).toFixed(3)} kHz\nSum product = ${sum.toFixed(3)} Hz`, y:iff, type:'rfMixer', values:{...v,iff,sum} };
      }
    }
  ],
  sensors: [
    {
      id:'ultra',
      name:'Ultrasonic distance',
      formula:'d = v_sound · t / 2\n\nTypical sound speed ≈ 343 m/s at room temperature.',
      fields:[['t','Echo round-trip time','s','0.01'], ['vs','Sound speed','m/s','343']],
      calc:v => ({ text:`d = ${((v.vs||SOUND)*v.t/2).toFixed(6)} m`, y:(v.vs||SOUND)*v.t/2, type:'tof', values:{speed:v.vs||SOUND,time:v.t} })
    },
    {
      id:'lidar',
      name:'LiDAR ToF distance',
      formula:'d = c · t / 2\n\nLight-based time-of-flight distance.',
      fields:[['t','Round-trip time','s','0.00000001']],
      calc:v => ({ text:`d = ${(C*v.t/2).toFixed(6)} m`, y:C*v.t/2, type:'tof', values:{speed:C,time:v.t} })
    },
    {
      id:'sampling_analyzer',
      name:'Signal / ADC sampling analyzer',
      formula:'Practical sampling check for signals, sensors, ADC logs and measurement systems:\n\nT = 1 / fs\nNyquist limit = fs / 2\nRecommended practical max ≈ fs / 5\nBuffer time = samples / fs\nMemory estimate = samples · channels · bytes/sample\n\nUse this to decide whether the logger, oscilloscope, data-acquisition system or microcontroller can capture the signal clearly without aliasing or too short buffers.',
      fields:[
        ['fs','Sample rate fs','Hz','1000'],
        ['samples','Buffer samples','samples','512'],
        ['bits','Sample resolution','bits','12'],
        ['channels','Channels','count','1']
      ],
      calc:v => {
        if(v.fs <= 0) throw new Error('Sample rate must be greater than 0.');
        if(v.samples <= 0) throw new Error('Buffer samples must be greater than 0.');
        const period = 1 / v.fs;
        const nyquist = v.fs / 2;
        const recommendedMax = v.fs / 5;
        const bufferTime = v.samples / v.fs;
        const bytesPerSample = Math.max(1, Math.ceil(v.bits / 8));
        const memoryBytes = v.samples * Math.max(1, v.channels) * bytesPerSample;
        return {
          text:`Sample period T = ${period.toFixed(9)} s\nNyquist limit = ${nyquist.toFixed(3)} Hz\nRecommended clean signal max ≈ ${recommendedMax.toFixed(3)} Hz\nBuffer time = ${bufferTime.toFixed(6)} s\nMemory ≈ ${memoryBytes.toFixed(0)} bytes`,
          y:recommendedMax,
          type:'samplingAnalyzer',
          values:{fs:v.fs,samples:v.samples,bits:v.bits,channels:v.channels,period,nyquist,recommendedMax,bufferTime,memoryBytes}
        };
      }
    }
  ],
  pointcloud: [
    {
      id:'radar_surface_3d',
      name:'3D radar/RF surface visualizer',
      formula:'3D radar/RF surface visualization:\n\nZ(x,y) represents signal strength/intensity over a scanned area.\n\nModes:\n• Interference field: wave overlap / standing-wave style pattern\n• Antenna lobe: simplified directional main lobe\n• Doppler field: spatial phase / movement field\n\nUse the controls to change resolution, wave density, interference strength, decay and lobe sharpness.',
      custom:'radarSurface3D',
      calc:calcRadarSurface3D
    },
    {
      id:'radar_core',
      name:'Radar core: geometry, Doppler and range resolution',
      formula:'Radar core calculations:\n\n1) Geometry / pointing\nslant range = √(x² + y² + z²)\nground range = √(x² + y²)\nazimuth = atan2(y, x)\nelevation = atan2(z, ground range)\n\n2) Doppler velocity\nv = fd · c / (2 · f₀) for monostatic radar\n\n3) Range resolution\nΔR = c / (2 · B)',
      custom:'radarCore',
      calc:calcRadarCore
    },

    {
      id:'coord_overview',
      name:'Coordinate systems overview: Cartesian / Polar / Spherical',
      formula:'Cartesian 2D/3D:\n(x, y) or (x, y, z)\n\nPolar 2D:\n(r, θ) → x = r cos(θ), y = r sin(θ)\n\nSpherical 3D:\n(r, az, el) → x = r cos(el) cos(az), y = r cos(el) sin(az), z = r sin(el)\n\nRadar/LiDAR often measures range + angles first, then converts to Cartesian pointcloud coordinates.',
      fields:[['r','Range r','m','5'], ['az','Azimuth az','degrees','30'], ['el','Elevation el','degrees','10']],
      calc:v => {
        const az=v.az*Math.PI/180, el=v.el*Math.PI/180;
        const x=v.r*Math.cos(el)*Math.cos(az);
        const y=v.r*Math.cos(el)*Math.sin(az);
        const z=v.r*Math.sin(el);
        return { text:`Spherical input:\nr=${v.r.toFixed(3)} m, az=${v.az.toFixed(3)}°, el=${v.el.toFixed(3)}°\n\nCartesian output:\nx=${x.toFixed(6)} m\ny=${y.toFixed(6)} m\nz=${z.toFixed(6)} m`, type:'point', point:[x,y], values:{x,y,z,r:v.r,az:v.az,el:v.el} };
      }
    },
    {
      id:'polar',
      name:'Polar → Cartesian 2D: range + angle to x,y',
      formula:'x = r · cos(θ)\ny = r · sin(θ)',
      fields:[['r','Range r','m','2'], ['theta','Angle θ','degrees','45']],
      calc:v => {
        const a = v.theta*Math.PI/180;
        return { text:`x = ${(v.r*Math.cos(a)).toFixed(6)} m, y = ${(v.r*Math.sin(a)).toFixed(6)} m`, type:'point', point:[v.r*Math.cos(a),v.r*Math.sin(a)] };
      }
    },
    {
      id:'spherical',
      name:'Spherical → Cartesian 3D: range + azimuth + elevation to x,y,z',
      formula:'Spherical coordinates are common for radar/LiDAR:\n\nr = range / distance\naz = azimuth angle left-right\nel = elevation angle up-down\n\nx = r cos(el) cos(az)\ny = r cos(el) sin(az)\nz = r sin(el)',
      fields:[['r','Range r','m','2'], ['az','Azimuth','degrees','45'], ['el','Elevation','degrees','15']],
      calc:v => {
        const az=v.az*Math.PI/180, el=v.el*Math.PI/180;
        return { text:`x=${(v.r*Math.cos(el)*Math.cos(az)).toFixed(6)}, y=${(v.r*Math.cos(el)*Math.sin(az)).toFixed(6)}, z=${(v.r*Math.sin(el)).toFixed(6)}`, type:'point', point:[v.r*Math.cos(el)*Math.cos(az),v.r*Math.cos(el)*Math.sin(az)] };
      }
    },
    {
      id:'scan_to_3d_cloud',
      name:'Spherical radar/LiDAR scan → 3D point cloud',
      formula:'For every measured beam:\nx = r · cos(el) · cos(az)\ny = r · cos(el) · sin(az)\nz = r · sin(el)\n\nThis simulates radar/LiDAR points from range + azimuth + elevation.',
      custom:'scan3d',
      calc:calcScan3D
    }
  ]
};

function activeFn(){
  const id = q('#calcFunction').value;
  return FUNCTIONS[currentTab].find(f => f.id === id) || FUNCTIONS[currentTab][0];
}

function setOptions(){
  q('#calcFunction').innerHTML = FUNCTIONS[currentTab].map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  renderInputs();
}

function addResRow(listSel, cls, value=''){
  const list = q(listSel);
  const row = document.createElement('div');
  row.className = 'resCalcRow';
  row.innerHTML = `<input class="field ${cls}" type="number" step="any" placeholder="R Ω" value="${value}"><button class="btn ghost resRemoveBtn" type="button">x</button>`;
  list.appendChild(row);
  row.querySelector('.resRemoveBtn').onclick = () => {
    const rows = Array.from(list.querySelectorAll('.resCalcRow'));
    if (rows.length <= 2) row.querySelector('input').value = '';
    else row.remove();
    updateTapSelect();
    renumberRes(listSel);
  };
  renumberRes(listSel);
  updateTapSelect();
}

function renumberRes(listSel){
  const list = q(listSel);
  if (!list) return;
  Array.from(list.querySelectorAll('input')).forEach((inp,i)=>inp.placeholder = `R${i+1} Ω`);
}

function updateTapSelect(){
  const tap = q('#dividerTap');
  const list = q('#dividerResList');
  if(!tap || !list) return;
  const count = list.querySelectorAll('.dividerResInput').length;
  const old = Number(tap.value || 1);
  tap.innerHTML = '';
  for(let k=1;k<=Math.max(1,count-1);k++){
    const opt = document.createElement('option');
    opt.value = String(k);
    opt.textContent = `After R${k}`;
    tap.appendChild(opt);
  }
  tap.value = String(Math.min(old, Math.max(1,count-1)));
}

function renderInputs(){
  const fn = activeFn();
  q('#formulaBox').textContent = fn.formula;
  q('#calcResult').textContent = 'Enter values and press CALCULATE.';

  
  
  
  if(fn.custom === 'rfPower'){
    q('#inputPanel').innerHTML = `
      <div class="rfToolboxGrid">
        <div>
          <label class="label">CONVERSION</label>
          <select id="rfPowerMode" class="field">
            <option value="dbm_to_w">dBm → W</option>
            <option value="w_to_dbm">W → dBm</option>
          </select>
        </div>
        <div>
          <label class="label">VALUE</label>
          <input id="rfPowerValue" class="field" type="number" step="any" value="20">
        </div>
      </div>
      <div class="rfToolboxNote">Reference: 0 dBm = 1 mW, 30 dBm = 1 W.</div>
    `;
    drawEmpty();
    return;
  }

  if(fn.custom === 'dopplerBatch'){
    q('#inputPanel').innerHTML = `
      <div class="row">
        <button id="btnAddDopplerRow" class="btn" type="button">ADD ROW</button>
        <button id="btnDemoDopplerRows" class="btn ghost" type="button">LOAD DEMO</button>
      </div>
      <div class="dopplerBatchGrid">
        <div class="dopplerBatchHeader">
          <div>NAME</div>
          <div>RADAR f (Hz)</div>
          <div>DOPPLER fd (Hz)</div>
          <div></div>
        </div>
        <div id="dopplerBatchRows"></div>
      </div>
      <div id="dopplerBatchResult" class="dopplerBatchResult">Add rows and press CALCULATE.</div>
    `;
    q('#btnAddDopplerRow').onclick = () => addDopplerBatchRow('', '', '');
    q('#btnDemoDopplerRows').onclick = () => loadDopplerBatchDemo();
    addDopplerBatchRow('Radar 1', '24000000000', '1600');
    addDopplerBatchRow('Radar 2', '3000000000', '2000');
    addDopplerBatchRow('Radar 3', '10000000000', '80000');
    drawEmpty();
    return;
  }


  if(fn.custom === 'radarSurface3D'){
    q('#inputPanel').innerHTML = `
      <div class="inputGrid">
        <div>
          <label class="label">MODE</label>
          <select id="radar3dMode" class="field">
            <option value="interference">Interference field</option>
            <option value="lobe">Antenna lobe</option>
            <option value="doppler">Doppler field</option>
          </select>
        </div>
        <div>
          <label class="label">RESOLUTION</label>
          <input id="radar3dResolution" class="field" type="number" step="1" min="32" max="120" value="78">
        </div>
        <div>
          <label class="label">WAVE DENSITY</label>
          <input id="radar3dWave" class="field" type="number" step="0.1" value="2.8">
        </div>
        <div>
          <label class="label">INTERFERENCE</label>
          <input id="radar3dInterference" class="field" type="number" step="0.05" value="0.35">
        </div>
        <div>
          <label class="label">DECAY / RANGE FALLOFF</label>
          <input id="radar3dDecay" class="field" type="number" step="0.01" value="0.12">
        </div>
        <div>
          <label class="label">LOBE SHARPNESS</label>
          <input id="radar3dLobePower" class="field" type="number" step="1" value="8">
        </div>
      </div>
      <div class="helper top8">Use this when you want a true 3D RF/radar surface instead of a normal 2D sketch.</div>
    `;
    drawEmpty();
    return;
  }

  if(fn.custom === 'radarCore'){
    q('#inputPanel').innerHTML = `
      <div class="radarCoreTabsLocal">
        <button class="btn radarCoreMiniTab active" type="button" data-radar-mode="geo">GEOMETRY</button>
        <button class="btn ghost radarCoreMiniTab" type="button" data-radar-mode="doppler">DOPPLER</button>
        <button class="btn ghost radarCoreMiniTab" type="button" data-radar-mode="resolution">RESOLUTION</button>
      </div>
      <input id="radarCoreMode" type="hidden" value="geo">
      <div class="radarCoreModePanel active" data-radar-panel="geo">
        <div class="triple">
          <div><label class="label">X</label><input id="radarCoreX" class="field" type="number" step="any" value="4"></div>
          <div><label class="label">Y</label><input id="radarCoreY" class="field" type="number" step="any" value="3"></div>
          <div><label class="label">Z</label><input id="radarCoreZ" class="field" type="number" step="any" value="2"></div>
        </div>
        <div class="helper top8">Riktning och avstånd till mål i 3D.</div>
      </div>
      <div class="radarCoreModePanel" data-radar-panel="doppler">
        <div class="inputGrid">
          <div><label class="label">Carrier f₀ (Hz)</label><input id="radarCoreF" class="field" type="number" step="any" value="77000000000"></div>
          <div><label class="label">Doppler fd (Hz)</label><input id="radarCoreFd" class="field" type="number" step="any" value="1000"></div>
        </div>
        <div class="helper top8">Monostatisk radar: signalen går ut och tillbaka, därför faktor 2.</div>
      </div>
      <div class="radarCoreModePanel" data-radar-panel="resolution">
        <div class="inputGrid">
          <div><label class="label">Bandwidth B (Hz)</label><input id="radarCoreB" class="field" type="number" step="any" value="4000000000"></div>
          <div><label class="label">Carrier f₀ optional (Hz)</label><input id="radarCoreRF" class="field" type="number" step="any" value="77000000000"></div>
        </div>
        <div class="helper top8">Bandbredden styr hur nära två mål kan ligga innan de flyter ihop.</div>
      </div>`;
    qa('.radarCoreMiniTab').forEach(btn => btn.onclick = () => {
      qa('.radarCoreMiniTab').forEach(b => { b.classList.remove('active'); b.classList.add('ghost'); });
      btn.classList.add('active'); btn.classList.remove('ghost');
      const mode = btn.dataset.radarMode;
      q('#radarCoreMode').value = mode;
      qa('.radarCoreModePanel').forEach(p => p.classList.toggle('active', p.dataset.radarPanel === mode));
      q('#calcResult').textContent = 'Enter values and press CALCULATE.';
      drawRadarCorePreview(mode);
    });
    drawRadarCorePreview('geo');
    return;
  }

  if(fn.custom === 'pointcloud3dDemo'){
    q('#inputPanel').innerHTML = `
      <div class="inputGrid">
        <div><label class="label">POINT COUNT</label><input id="pcCount" class="field" type="number" step="1" value="350"></div>
        <div><label class="label">SHAPE</label><select id="pcShape" class="field"><option value="sphere">Sphere</option><option value="wave">Wave surface</option><option value="spiral">Spiral</option><option value="box">Box/random</option></select></div>
        <div><label class="label">ROTATE X</label><input id="pcRotX" class="field" type="number" step="1" value="25"></div>
        <div><label class="label">ROTATE Y</label><input id="pcRotY" class="field" type="number" step="1" value="35"></div>
        <div><label class="label">ROTATE Z</label><input id="pcRotZ" class="field" type="number" step="1" value="0"></div>
        <div><label class="label">ZOOM</label><input id="pcZoom" class="field" type="number" step="0.1" value="1.0"></div>
      </div>
      <div class="pcControlPad top8">
        <button class="btn ghost" type="button" id="pcXMinus">X-</button>
        <button class="btn ghost" type="button" id="pcXPlus">X+</button>
        <button class="btn ghost" type="button" id="pcYMinus">Y-</button>
        <button class="btn ghost" type="button" id="pcYPlus">Y+</button>
        <button class="btn ghost" type="button" id="pcZMinus">Z-</button>
        <button class="btn ghost" type="button" id="pcZPlus">Z+</button>
        <button class="btn ghost" type="button" id="pcZoomMinus">ZOOM-</button>
        <button class="btn ghost" type="button" id="pcZoomPlus">ZOOM+</button>
      </div>
      <div class="helper top8">Auto-fit keeps large range values inside the canvas.</div>
    `;
    bindPointCloudButtons();
    drawPointCloud3D(generatePointCloudDemo(350,'sphere'), {rx:25, ry:35, rz:0, zoom:1, title:'3D point cloud demo'});
    return;
  }

  if(fn.custom === 'scan3d'){
    q('#inputPanel').innerHTML = `
      <div class="inputGrid">
        <div><label class="label">AZ START</label><input id="scanAzStart" class="field" type="number" step="any" value="-45"></div>
        <div><label class="label">AZ END</label><input id="scanAzEnd" class="field" type="number" step="any" value="45"></div>
        <div><label class="label">EL START</label><input id="scanElStart" class="field" type="number" step="any" value="-15"></div>
        <div><label class="label">EL END</label><input id="scanElEnd" class="field" type="number" step="any" value="15"></div>
        <div><label class="label">RANGE MIN (m)</label><input id="scanRMin" class="field" type="number" step="any" value="1.5"></div>
        <div><label class="label">RANGE MAX (m)</label><input id="scanRMax" class="field" type="number" step="any" value="5"></div>
        <div><label class="label">AZ STEPS</label><input id="scanAzSteps" class="field" type="number" step="1" value="32"></div>
        <div><label class="label">EL STEPS</label><input id="scanElSteps" class="field" type="number" step="1" value="14"></div>
        <div><label class="label">ROTATE X</label><input id="pcRotX" class="field" type="number" step="1" value="22"></div>
        <div><label class="label">ROTATE Y</label><input id="pcRotY" class="field" type="number" step="1" value="38"></div>
        <div><label class="label">ROTATE Z</label><input id="pcRotZ" class="field" type="number" step="1" value="0"></div>
        <div><label class="label">ZOOM</label><input id="pcZoom" class="field" type="number" step="0.1" value="1.0"></div>
      </div>
      <div class="pcControlPad top8">
        <button class="btn ghost" type="button" id="pcXMinus">X-</button>
        <button class="btn ghost" type="button" id="pcXPlus">X+</button>
        <button class="btn ghost" type="button" id="pcYMinus">Y-</button>
        <button class="btn ghost" type="button" id="pcYPlus">Y+</button>
        <button class="btn ghost" type="button" id="pcZMinus">Z-</button>
        <button class="btn ghost" type="button" id="pcZPlus">Z+</button>
        <button class="btn ghost" type="button" id="pcZoomMinus">ZOOM-</button>
        <button class="btn ghost" type="button" id="pcZoomPlus">ZOOM+</button>
      </div>
      <div class="helper top8">Spherical scan is auto-fitted to the canvas.</div>
    `;
    bindPointCloudButtons();
    drawEmpty();
    return;
  }


  if(fn.custom === 'resistors'){
    q('#inputPanel').innerHTML = `
      <label class="label">MODE</label>
      <div class="row">
        <select id="resCalcMode" class="field grow">
          <option value="parallel">Parallel</option>
          <option value="series">Series</option>
        </select>
        <button id="btnAddResCalc" class="btn" type="button">ADD RESISTOR</button>
      </div>
      <div id="resistorListCalc" class="resistorListCalc"></div>
    `;
    addResRow('#resistorListCalc', 'resCalcInput', '');
    addResRow('#resistorListCalc', 'resCalcInput', '');
    q('#btnAddResCalc').onclick = () => addResRow('#resistorListCalc', 'resCalcInput', '');
    drawEmpty();
    return;
  }

  if(fn.custom === 'multiDivider'){
    q('#inputPanel').innerHTML = `
      <label class="label">INPUT VOLTAGE</label>
      <input id="dividerVin" class="field" type="number" step="any" value="5">
      <div class="row top8">
        <div class="grow">
          <label class="label">OUTPUT NODE</label>
          <select id="dividerTap" class="field"></select>
        </div>
        <button id="btnAddDividerRes" class="btn" type="button">ADD RESISTOR</button>
      </div>
      <div id="dividerResList" class="resistorListCalc"></div>
    `;
    addResRow('#dividerResList', 'dividerResInput', '10000');
    addResRow('#dividerResList', 'dividerResInput', '10000');
    q('#btnAddDividerRes').onclick = () => addResRow('#dividerResList', 'dividerResInput', '');
    updateTapSelect();
    drawEmpty();
    return;
  }

  q('#inputPanel').innerHTML = '<div class="inputGrid">' + fn.fields.map(([id,label,unit,def]) =>
    `<div><label class="label">${label}${unit ? ' ('+unit+')' : ''}</label><input class="field calcInput" id="in_${id}" type="number" step="any" value="${def || ''}"></div>`
  ).join('') + '</div>';
  drawEmpty();
}

function calcResistors(){
  const vals = qa('.resCalcInput').map(x => Number(x.value)).filter(n => Number.isFinite(n) && n > 0);
  if (vals.length < 2) throw new Error('Enter at least two positive resistor values.');
  const mode = q('#resCalcMode').value;
  const total = mode === 'series'
    ? vals.reduce((a,b)=>a+b,0)
    : 1 / vals.reduce((a,b)=>a + 1/b, 0);
  return { text:`${mode === 'series' ? 'Series' : 'Parallel'} total = ${total.toFixed(6)} Ω`, y:total, type:'resistors', values:vals, mode };
}

function calcMultiDivider(){
  const vin = Number(q('#dividerVin').value);
  const vals = qa('.dividerResInput').map(x => Number(x.value)).filter(n => Number.isFinite(n) && n > 0);
  const tap = Number(q('#dividerTap').value);
  if(!Number.isFinite(vin)) throw new Error('Enter valid Vin.');
  if(vals.length < 2) throw new Error('Enter at least two positive resistor values.');
  if(tap < 1 || tap >= vals.length) throw new Error('Choose a valid tap node.');
  const total = vals.reduce((a,b)=>a+b,0);
  const lower = vals.slice(tap).reduce((a,b)=>a+b,0);
  const vout = vin * lower / total;
  return { text:`Vout after R${tap} = ${vout.toFixed(6)} V   (Rtotal = ${total.toFixed(6)} Ω)`, y:vout, type:'multiDivider', values:vals, vin, tap, total, lower };
}


function calcRadarSurface3D(){
  const mode = q('#radar3dMode')?.value || 'interference';
  const resolution = Math.max(32, Math.min(120, Number(q('#radar3dResolution')?.value || 78)));
  const wave = Math.max(0.1, Number(q('#radar3dWave')?.value || 2.8));
  const interference = Math.max(0, Number(q('#radar3dInterference')?.value || 0.35));
  const decay = Math.max(0, Number(q('#radar3dDecay')?.value || 0.12));
  const lobePower = Math.max(1, Number(q('#radar3dLobePower')?.value || 8));

  return {
    text:
      `3D radar/RF surface\n` +
      `Mode = ${mode}\n` +
      `Resolution = ${resolution} × ${resolution}\n` +
      `Wave density = ${wave}\n` +
      `Interference = ${interference}\n` +
      `Decay = ${decay}\n` +
      `Lobe sharpness = ${lobePower}\n\n` +
      `Drag to rotate. Scroll to zoom.`,
    type:'radarSurface3D',
    mode,
    values:{resolution,wave,interference,decay,lobePower}
  };
}


function readValues(fn){
  const out = {};
  for(const [id] of fn.fields || []){
    const n = Number(q('#in_'+id).value);
    if(!Number.isFinite(n)) throw new Error('Enter valid numeric values.');
    out[id] = n;
  }
  return out;
}

function drawGrid(ctx,w,h){
  ctx.clearRect(0,0,w,h);

  // Brighter base panel so the actual visualization area is readable on normal monitors.
  const bg = ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'rgba(10,42,30,.78)');
  bg.addColorStop(1,'rgba(2,14,10,.92)');
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,w,h);

  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0,'rgba(124,255,206,.24)');
  g.addColorStop(1,'rgba(80,170,255,.15)');
  ctx.strokeStyle=g;
  ctx.lineWidth=1;
  for(let x=0;x<=w;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<=h;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.strokeStyle='rgba(255,243,214,.30)';
  ctx.setLineDash([7,7]);
  ctx.beginPath();ctx.moveTo(w/2,18);ctx.lineTo(w/2,h-18);ctx.moveTo(18,h/2);ctx.lineTo(w-18,h/2);ctx.stroke();
  ctx.setLineDash([]);
}



function useCanvasVisualization(){
  const canvas = document.getElementById('calcCanvas');
  const plot = document.getElementById('radar3dPlot');
  if(canvas) canvas.hidden = false;
  if(plot) {
    plot.hidden = true;
    if(window.Plotly) {
      try { Plotly.purge(plot); } catch(e) {}
    }
  }
}

function useRadar3DVisualization(){
  const canvas = document.getElementById('calcCanvas');
  const plot = document.getElementById('radar3dPlot');
  if(canvas) canvas.hidden = true;
  if(plot) plot.hidden = false;
}

function drawRadarSurface3D(config='interference') {
  if(!window.Plotly) {
    const hint = document.getElementById('visualHint');
    if(hint) hint.textContent = 'Plotly could not be loaded. 3D radar visualization unavailable.';
    useCanvasVisualization();
    drawEmpty();
    return;
  }

  const mode = typeof config === 'string' ? config : (config.mode || 'interference');
  const v = typeof config === 'object' && config.values ? config.values : {};
  const sizeX = Math.max(32, Math.min(120, Number(v.resolution || 78)));
  const sizeY = sizeX;
  const waveDensity = Math.max(0.1, Number(v.wave || 2.8));
  const interferenceStrength = Math.max(0, Number(v.interference || 0.35));
  const decay = Math.max(0, Number(v.decay || 0.12));
  const lobePower = Math.max(1, Number(v.lobePower || 8));

  useRadar3DVisualization();

  const div = document.getElementById('radar3dPlot');
  if(!div) return;

  const z = [];

  for(let y=0;y<sizeY;y++){
    const row = [];
    for(let x=0;x<sizeX;x++){
      const xx = (x - sizeX/2) / 8;
      const yy = (y - sizeY/2) / 8;
      const r = Math.sqrt(xx*xx + yy*yy);

      let value = 0;

      if(mode === 'lobe'){
        const theta = Math.atan2(yy, xx);
        const main = Math.pow(Math.max(0, Math.cos(theta)), lobePower);
        const rangeFalloff = Math.exp(-r * Math.max(0.01, decay + 0.06));
        value = main * rangeFalloff * 1.7 - 0.25;
      } else if(mode === 'doppler'){
        value =
          Math.sin(xx * waveDensity + r * 1.2) * Math.exp(-r * decay) +
          Math.cos(yy * 1.1) * interferenceStrength;
      } else {
        const wave = Math.sin(r * waveDensity) * Math.exp(-r * decay);
        const interference = Math.sin(xx * 1.8) * Math.cos(yy * 1.3);
        value = wave + interference * interferenceStrength;
      }

      row.push(value);
    }
    z.push(row);
  }

  Plotly.newPlot(div,[{
    z,
    type:'surface',
    colorscale:[
      [0,'#1b2cff'],
      [0.35,'#333b7a'],
      [0.52,'#d9d1bd'],
      [0.72,'#e9783e'],
      [1,'#d71927']
    ],
    showscale:true,
    contours:{
      z:{
        show:true,
        usecolormap:true,
        highlightcolor:'#7fffc3',
        project:{z:true}
      }
    }
  }],{
    paper_bgcolor:'#020503',
    plot_bgcolor:'#020503',
    scene:{
      bgcolor:'#020503',
      xaxis:{color:'#7fffc3',gridcolor:'rgba(127,255,195,0.16)',zerolinecolor:'rgba(255,243,214,0.24)'},
      yaxis:{color:'#7fffc3',gridcolor:'rgba(127,255,195,0.16)',zerolinecolor:'rgba(255,243,214,0.24)'},
      zaxis:{color:'#7fffc3',gridcolor:'rgba(127,255,195,0.16)',zerolinecolor:'rgba(255,243,214,0.24)'},
      camera:{eye:{x:1.45,y:1.35,z:0.85}}
    },
    margin:{l:0,r:0,t:0,b:0}
  },{
    responsive:true,
    displaylogo:false
  });

  const hint = document.getElementById('visualHint');
  if(hint) hint.textContent = `3D ${mode} surface: drag to rotate, scroll to zoom.`;
}

function drawEmpty(){
  useCanvasVisualization();
  const c=q('#calcCanvas'), ctx=c.getContext('2d');
  drawGrid(ctx,c.width,c.height);
  ctx.fillStyle='rgba(214,255,231,.75)';
  ctx.font='14px Consolas, monospace';
  ctx.fillText('ready',18,28);
}

function glowStroke(ctx, color, width, fn){
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  fn();
  ctx.restore();
}

function drawSine(ctx,w,h,amp=60,cycles=3){
  glowStroke(ctx, '#8fffd0', 2, () => {
    ctx.beginPath();
    for(let x=0;x<w;x++){
      const y=h/2+Math.sin((x/w)*Math.PI*2*cycles)*amp;
      if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });
}

function drawAntennaScene(ctx,w,h,r){
  const lambda = r.values.lambda || (C / r.values.f);
  const L = r.y;
  const ratio = Math.max(0.05, Math.min(0.9, L / lambda));
  drawSine(ctx,w,h,55,3);

  ctx.fillStyle='#d6ffe7';
  ctx.font='13px Consolas, monospace';
  ctx.fillText(`f = ${(r.values.f/1e6).toFixed(3)} MHz`, 28, 30);
  ctx.fillText(`λ = ${lambda.toFixed(4)} m`, 28, 50);
  ctx.fillText(`L = ${L.toFixed(4)} m`, 28, 70);

  const y = h - 75;
  const x0 = 110;
  const px = Math.max(80, Math.min(w-220, ratio * (w-160) * 2.0));

  ctx.strokeStyle='rgba(214,255,231,.20)';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(60,y); ctx.lineTo(w-60,y);
  ctx.stroke();

  if(r.type === 'dipole' || r.type === 'antennaLength'){
    const cx = w/2;
    const half = px/2;
    glowStroke(ctx, '#fff3d6', 6, () => {
      ctx.beginPath();
      ctx.moveTo(cx-half,y); ctx.lineTo(cx-12,y);
      ctx.moveTo(cx+12,y); ctx.lineTo(cx+half,y);
      ctx.stroke();
    });
    ctx.fillStyle='#fff3d6';
    ctx.beginPath(); ctx.arc(cx,y,8,0,Math.PI*2); ctx.fill();
    ctx.fillText('feed', cx+12, y-15);
    ctx.fillText(r.type === 'antennaLength' ? `λ/4=${r.values.quarter.toFixed(4)}m, dipole side=${r.values.dipoleSide.toFixed(4)}m` : 'half-wave dipole', cx-half, y+30);
  } else {
    glowStroke(ctx, '#fff3d6', 6, () => {
      ctx.beginPath();
      ctx.moveTo(x0,y); ctx.lineTo(x0+px,y);
      ctx.stroke();
    });
    ctx.fillStyle='#fff3d6';
    ctx.beginPath(); ctx.arc(x0,y,7,0,Math.PI*2); ctx.fill();
    ctx.fillText('radiator', x0+8, y-16);
    ctx.fillText('quarter-wave antenna', x0, y+30);
  }

  ctx.strokeStyle='rgba(143,255,208,.22)';
  ctx.lineWidth=2;
  for(let i=1;i<=4;i++){
    ctx.beginPath();
    ctx.ellipse(w/2,h/2,70*i,28*i,0,0,Math.PI*2);
    ctx.stroke();
  }
}



function drawRadarResolutionScene(ctx,w,h,r){
  const v = r.values;
  const rangeRes = v.rangeRes;
  const lambda = v.lambda;
  const thetaRad = v.thetaRad;
  const thetaDeg = v.thetaDeg;
  const aperture = v.aperture;

  ctx.fillStyle = '#d6ffe7';
  ctx.font = '13px Consolas, monospace';
  ctx.fillText('Radar resolution', 28, 32);
  ctx.fillText(`f = ${(v.frequency/1e9).toFixed(6)} GHz`, 28, 52);
  ctx.fillText(`B = ${(v.bandwidth/1e6).toFixed(6)} MHz`, 28, 72);
  ctx.fillText(`λ = ${lambda.toFixed(6)} m`, 28, 92);
  ctx.fillText(`ΔR = ${rangeRes.toFixed(6)} m`, 28, 112);
  if(Number.isFinite(thetaRad)) ctx.fillText(`θ ≈ ${thetaRad.toFixed(6)} rad = ${thetaDeg.toFixed(3)}°`, 28, 132);

  // Range-resolution ruler
  const rulerX = 70;
  const rulerY = h - 82;
  const maxScaleMeters = Math.max(1, rangeRes * 4);
  const pxPerMeter = Math.min(260, Math.max(35, (w - 180) / maxScaleMeters));
  const rrPx = Math.max(16, Math.min(w - 180, rangeRes * pxPerMeter));

  ctx.strokeStyle = 'rgba(214,255,231,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rulerX, rulerY);
  ctx.lineTo(w - 70, rulerY);
  ctx.stroke();

  const grad = ctx.createLinearGradient(rulerX, rulerY - 18, rulerX + rrPx, rulerY - 18);
  grad.addColorStop(0, 'rgba(143,255,208,.35)');
  grad.addColorStop(1, 'rgba(143,255,208,.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(rulerX, rulerY - 18, rrPx, 28);
  ctx.strokeStyle = '#fff3d6';
  ctx.strokeRect(rulerX, rulerY - 18, rrPx, 28);
  ctx.fillStyle = '#fff3d6';
  ctx.fillText(`range cell ΔR ≈ ${rangeRes.toFixed(3)} m`, rulerX, rulerY - 28);

  // Carrier wavelength wave
  glowStroke(ctx, '#8fffd0', 2, () => {
    ctx.beginPath();
    const y0 = h / 2 + 20;
    const cycles = Math.max(1, Math.min(8, 0.65 / Math.max(lambda, 1e-9)));
    for(let x=0; x<w; x++){
      const y = y0 + Math.sin((x/w) * Math.PI * 2 * cycles) * 38;
      if(x === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });

  // Antenna aperture + angular cone
  const ax = w - 190;
  const ay = 100;
  ctx.strokeStyle = '#fff3d6';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(ax, ay - 38);
  ctx.lineTo(ax, ay + 38);
  ctx.stroke();
  ctx.fillStyle = '#fff3d6';
  ctx.fillText(`D = ${Number.isFinite(aperture) ? aperture.toFixed(3) : 'N/A'} m`, ax - 34, ay + 62);

  if(Number.isFinite(thetaRad)){
    const cone = Math.max(0.06, Math.min(0.8, thetaRad));
    const len = 150;
    ctx.strokeStyle = 'rgba(143,255,208,.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - len, ay - Math.tan(cone/2) * len);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - len, ay + Math.tan(cone/2) * len);
    ctx.stroke();
    ctx.fillStyle = 'rgba(214,255,231,.85)';
    ctx.fillText('angular beam', ax - 150, ay - 48);
  }
}

function drawDopplerScene(ctx,w,h,r){
  const centerY = h / 2;
  const radarX = 105;
  const targetX = w - 150;
  const lambda = r.values.lambda;
  const velocity = r.values.velocity;
  const fd = r.values.fd;

  ctx.fillStyle = '#d6ffe7';
  ctx.font = '13px Consolas, monospace';
  ctx.fillText(`f = ${(r.values.frequency/1e9).toFixed(3)} GHz`, 28, 30);
  ctx.fillText(`λ = ${lambda.toFixed(6)} m`, 28, 50);

  if(r.type === 'dopplerShift'){
    ctx.fillText(`v = ${velocity.toFixed(4)} m/s`, 28, 70);
    ctx.fillText(`fd = ${fd.toFixed(4)} Hz`, 28, 90);
  } else {
    ctx.fillText(`fd = ${fd.toFixed(4)} Hz`, 28, 70);
    ctx.fillText(`v = ${velocity.toFixed(4)} m/s = ${(velocity*3.6).toFixed(2)} km/h`, 28, 90);
  }

  // Radar unit
  ctx.fillStyle = 'rgba(143,255,208,.18)';
  ctx.strokeStyle = '#8fffd0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(radarX, centerY, 32, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d6ffe7';
  ctx.fillText('RADAR', radarX-24, centerY+55);

  // Target
  ctx.fillStyle = 'rgba(255,243,214,.18)';
  ctx.strokeStyle = '#fff3d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(targetX-38, centerY-28, 76, 56, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3d6';
  ctx.fillText('TARGET', targetX-24, centerY+52);

  // Propagation waves
  const dir = velocity >= 0 ? -1 : 1;
  const compression = Math.max(0.55, Math.min(1.45, 1 - Math.abs(velocity)/90));
  ctx.strokeStyle = 'rgba(143,255,208,.34)';
  ctx.lineWidth = 2;

  for(let i=0;i<9;i++){
    const x = radarX + 65 + i * 62 * compression;
    if(x > targetX-50) break;
    ctx.beginPath();
    ctx.ellipse(x, centerY, 18 + i*2, 85 - i*4, 0, -Math.PI/2, Math.PI/2);
    ctx.stroke();
  }

  // Doppler return trace
  glowStroke(ctx, '#8fffd0', 2, () => {
    ctx.beginPath();
    for(let x=radarX+50; x<targetX-50; x++){
      const t = (x-(radarX+50))/(targetX-radarX-100);
      const y = centerY + Math.sin(t*Math.PI*12) * (22 + Math.min(35, Math.abs(fd)/90));
      if(x === radarX+50) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });

  // Velocity arrow
  const arrowY = centerY - 96;
  const arrowStart = targetX;
  const arrowEnd = targetX + (velocity >= 0 ? -95 : 95);
  ctx.strokeStyle = '#fff3d6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(arrowStart, arrowY);
  ctx.lineTo(arrowEnd, arrowY);
  ctx.stroke();

  ctx.fillStyle = '#fff3d6';
  ctx.beginPath();
  if(velocity >= 0){
    ctx.moveTo(arrowEnd, arrowY);
    ctx.lineTo(arrowEnd+14, arrowY-8);
    ctx.lineTo(arrowEnd+14, arrowY+8);
  } else {
    ctx.moveTo(arrowEnd, arrowY);
    ctx.lineTo(arrowEnd-14, arrowY-8);
    ctx.lineTo(arrowEnd-14, arrowY+8);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillText(velocity >= 0 ? 'toward radar' : 'away from radar', Math.min(arrowStart, arrowEnd)-5, arrowY-14);

  // Formula label
  ctx.fillStyle = 'rgba(255,243,214,.92)';
  ctx.fillText(r.type === 'dopplerShift' ? 'fd = 2 · v / λ' : 'v = fd · λ / 2', w-230, 34);
}


function drawSamplingAnalyzerScene(ctx,w,h,r){
  const v = r.values;
  ctx.fillStyle = '#d6ffe7';
  ctx.font = '13px Consolas, monospace';
  ctx.fillText('Signal / ADC sampling analyzer', 28, 32);
  ctx.fillText(`fs = ${v.fs.toFixed(3)} Hz, samples = ${v.samples}`, 28, 52);
  ctx.fillText(`T = ${v.period.toFixed(9)} s`, 28, 72);
  ctx.fillText(`Nyquist = ${v.nyquist.toFixed(2)} Hz, clean max ≈ ${v.recommendedMax.toFixed(2)} Hz`, 28, 92);
  ctx.fillText(`buffer = ${v.bufferTime.toFixed(4)} s, memory ≈ ${v.memoryBytes.toFixed(0)} bytes`, 28, 112);

  const left = 70, right = w - 80, baseY = h - 82;
  const plotW = right - left;
  ctx.strokeStyle = 'rgba(214,255,231,.32)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, baseY); ctx.lineTo(right, baseY); ctx.stroke();

  const drawTick = (x, label, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, baseY - 42); ctx.lineTo(x, baseY + 12); ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, x - 32, baseY + 32);
  };
  drawTick(left, '0 Hz', '#fff3d6');
  drawTick(left + plotW * 0.40, `clean ~${v.recommendedMax.toFixed(0)} Hz`, '#8fffd0');
  drawTick(left + plotW, `Nyquist ${v.nyquist.toFixed(0)} Hz`, '#ffb878');

  // Example signal vs sampled points. More visible when fs/buffer changes.
  const y0 = h/2 + 45;
  const amp = 36;
  const cycles = Math.max(1.2, Math.min(8, v.recommendedMax / Math.max(1, v.fs) * 24));
  glowStroke(ctx, '#8fffd0', 2, () => {
    ctx.beginPath();
    for(let x=left; x<=right; x++){
      const t = (x-left)/plotW;
      const y = y0 + Math.sin(t*Math.PI*2*cycles)*amp;
      if(x === left) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });

  ctx.fillStyle = '#fff3d6';
  const visibleSamples = Math.min(48, Math.max(8, Math.round(v.samples / 16)));
  for(let i=0;i<visibleSamples;i++){
    const t = i / Math.max(1, visibleSamples-1);
    const x = left + t*plotW;
    const y = y0 + Math.sin(t*Math.PI*2*cycles)*amp;
    ctx.beginPath(); ctx.arc(x,y,2.7,0,Math.PI*2); ctx.fill();
  }
  ctx.fillText('sampled points', left, y0 + amp + 32);
}


function drawResult(r){
  if(r && r.type === 'radarSurface3D') { drawRadarSurface3D(r); return; }
  useCanvasVisualization();
  if(drawRfToolboxScene(r)) { q('#visualHint').textContent = 'RF toolbox visualization generated.'; return; }

  const c=q('#calcCanvas'), ctx=c.getContext('2d'), w=c.width, h=c.height;
  drawGrid(ctx,w,h);
  ctx.font='13px Consolas, monospace';

  if(r.type === 'radarCore'){
    drawRadarCoreScene(ctx,w,h,r);
  } else if(r.type === 'wave' || r.type === 'antennaQuarter' || r.type === 'dipole' || r.type === 'antennaLength'){
    drawAntennaScene(ctx,w,h,r);
  } else if(r.type === 'radarResolution'){
    drawRadarResolutionScene(ctx,w,h,r);
  } else if(r.type === 'dopplerShift' || r.type === 'dopplerVelocity'){
    drawDopplerScene(ctx,w,h,r);
  } else if(r.type === 'radar' || r.type === 'tof'){
    const range = r.y;
    const x0 = 90, x1 = Math.min(w-90, 90 + Math.max(40, Math.log10(range+1)*150));
    glowStroke(ctx, '#8fffd0', 4, () => { ctx.beginPath(); ctx.moveTo(x0,h/2); ctx.lineTo(x1,h/2); ctx.stroke(); });
    ctx.fillStyle='#fff3d6';
    ctx.beginPath();ctx.arc(x0,h/2,9,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(x1,h/2,9,0,Math.PI*2);ctx.fill();
    ctx.fillText('sensor', x0-24,h/2+32);
    ctx.fillText('target', x1-22,h/2+32);
    ctx.fillText(`distance ≈ ${range.toFixed(4)} m`, 28, 32);
  } else if(r.type === 'point'){
    const [px,py]=r.point;
    const scale=65;
    const x=w/2+px*scale, y=h/2-py*scale;
    glowStroke(ctx, '#fff3d6', 3, () => { ctx.beginPath();ctx.moveTo(w/2,h/2);ctx.lineTo(x,y);ctx.stroke(); });
    ctx.fillStyle='#fff3d6';
    ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();
    ctx.fillText(`x=${px.toFixed(3)}, y=${py.toFixed(3)}`, 28,32);
  } else if(r.type === 'resistors'){
    const vals = r.values;
    const max = Math.max(...vals);
    vals.forEach((v,i)=>{
      const x=50+i*(w-100)/Math.max(1,vals.length-1);
      const bar=Math.max(12,(v/max)*(h-130));
      const grad=ctx.createLinearGradient(0,h-55-bar,0,h-55);
      grad.addColorStop(0,'rgba(143,255,208,.85)');
      grad.addColorStop(1,'rgba(80,170,255,.35)');
      ctx.fillStyle=grad;
      ctx.fillRect(x-12,h-55-bar,24,bar);
      ctx.fillStyle='#fff3d6';
      ctx.fillText(`R${i+1}`,x-12,h-28);
    });
    ctx.fillText(`${r.mode} resistor network`,28,32);
  } else if(r.type === 'samplingAnalyzer'){
    drawSamplingAnalyzerScene(ctx,w,h,r);
  } else if(r.type === 'multiDivider'){
    const vals = r.values;
    const total = r.total;
    const x = w/2;
    const top = 55;
    const bottom = h-55;
    const chainH = bottom - top;
    ctx.fillStyle='#d6ffe7';
    ctx.fillText(`Vin = ${r.vin.toFixed(3)} V`, 32, 32);
    ctx.fillText(`Vout after R${r.tap} = ${r.y.toFixed(4)} V`, 32, 52);

    let y = top;
    vals.forEach((rv,i)=>{
      const seg = Math.max(26, (rv/total)*chainH);
      ctx.strokeStyle='rgba(143,255,208,.55)';
      ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+12); ctx.stroke();
      const rh = Math.max(18, seg-20);
      ctx.strokeStyle = i+1 === r.tap ? '#fff3d6' : '#8fffd0';
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
      ctx.strokeRect(x-35,y+12,70,rh);
      ctx.shadowBlur = 0;
      ctx.fillStyle='#d6ffe7';
      ctx.fillText(`R${i+1} ${rv}Ω`, x+48, y+12+rh/2);
      y += seg;
      if(i+1 === r.tap){
        glowStroke(ctx, '#fff3d6', 2, () => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+180,y); ctx.stroke(); });
        ctx.fillStyle='#fff3d6';
        ctx.fillText('Vout', x+190, y+4);
      }
    });
    ctx.strokeStyle='rgba(143,255,208,.55)';
    ctx.beginPath(); ctx.moveTo(x,bottom); ctx.lineTo(x,bottom+20); ctx.stroke();
    ctx.fillStyle='#d6ffe7'; ctx.fillText('GND', x-14, bottom+38);
  } else {
    drawSine(ctx,w,h,45,2);
    const val = Number(r.y);
    const bar = Number.isFinite(val) ? Math.max(8,Math.min(w-90,Math.abs(val)*35)) : 20;
    const grad=ctx.createLinearGradient(40,h-65,40+bar,h-65);
    grad.addColorStop(0,'rgba(143,255,208,.30)');
    grad.addColorStop(1,'rgba(143,255,208,.95)');
    ctx.fillStyle=grad;
    ctx.fillRect(40,h-65,bar,28);
    ctx.fillStyle='#fff3d6';
    ctx.fillText(r.label || 'value', 40, h-80);
  }

  q('#visualHint').textContent = 'Visualization generated from selected formula.';
}


function radarCoreDeg(rad){ return rad * 180 / Math.PI; }

function calcRadarCore(){
  const mode = q('#radarCoreMode') ? q('#radarCoreMode').value : 'geo';
  if(mode === 'geo'){
    const x=Number(q('#radarCoreX').value||0), y=Number(q('#radarCoreY').value||0), z=Number(q('#radarCoreZ').value||0);
    const ground=Math.sqrt(x*x+y*y), range=Math.sqrt(x*x+y*y+z*z);
    const az=Math.atan2(y,x), el=Math.atan2(z,ground);
    return {text:`Slant range = ${range.toFixed(6)} m\nGround range = ${ground.toFixed(6)} m\nAzimuth = ${radarCoreDeg(az).toFixed(3)}° (${az.toFixed(6)} rad)\nElevation = ${radarCoreDeg(el).toFixed(3)}° (${el.toFixed(6)} rad)`, type:'radarCore', values:{mode,x,y,z,ground,range,az,el}};
  }
  if(mode === 'doppler'){
    const f=Number(q('#radarCoreF').value||0), fd=Number(q('#radarCoreFd').value||0);
    if(f<=0) throw new Error('Carrier frequency must be greater than 0.');
    const lambda=C/f, velocity=fd*C/(2*f);
    return {text:`λ = ${lambda.toFixed(9)} m\nRadial velocity = ${velocity.toFixed(6)} m/s\n= ${(velocity*3.6).toFixed(3)} km/h\n= ${(velocity*1000).toFixed(0)} mm/s`, type:'radarCore', values:{mode,f,fd,lambda,velocity}};
  }
  const b=Number(q('#radarCoreB').value||0), f=Number(q('#radarCoreRF').value||0);
  if(b<=0) throw new Error('Bandwidth must be greater than 0.');
  const rangeRes=C/(2*b), lambda=f>0?C/f:NaN;
  return {text:`Range resolution ΔR = ${rangeRes.toFixed(6)} m\n≈ ${(rangeRes*100).toFixed(2)} cm\n${Number.isFinite(lambda)?`λ = ${lambda.toFixed(9)} m\n`:''}Two targets closer than ΔR may merge in range.`, type:'radarCore', values:{mode,b,f,rangeRes,lambda}};
}

function drawRadarCorePreview(mode){
  drawResult({type:'radarCore', values:{mode,x:4,y:3,z:2,ground:5,range:Math.sqrt(29),az:Math.atan2(3,4),el:Math.atan2(2,5),f:77000000000,fd:1000,velocity:1000*C/(2*77000000000),b:4000000000,rangeRes:C/(2*4000000000)}});
}

function radarCoreText(ctx,t,x,y,c='#d6ffe7'){ctx.fillStyle=c;ctx.font='13px Consolas, monospace';ctx.fillText(t,x,y);}
function radarCoreLine(ctx,x1,y1,x2,y2,c,w=2,d=[]){ctx.save();ctx.strokeStyle=c;ctx.lineWidth=w;ctx.setLineDash(d);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();}
function radarCoreDot(ctx,x,y,c,r=5){ctx.fillStyle=c;ctx.shadowColor=c;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}

function drawRadarCoreScene(ctx,w,h,r){
  const v=r.values||{};
  if(v.mode==='doppler') return drawRadarCoreDoppler(ctx,w,h,v);
  if(v.mode==='resolution') return drawRadarCoreResolution(ctx,w,h,v);
  return drawRadarCoreGeometry(ctx,w,h,v);
}

function drawRadarCoreGeometry(ctx,w,h,v){
  drawGrid(ctx,w,h);
  const x=v.x??4,y=v.y??3,z=v.z??2, ground=Math.sqrt(x*x+y*y), range=Math.sqrt(x*x+y*y+z*z);
  const az=Math.atan2(y,x), el=Math.atan2(z,ground);
  const ox=w*.26, oy=h*.72, s=Math.min(w,h)*.50/Math.max(1,range);
  const px=ox+x*s*.95, pgy=oy-y*s*.32, py=pgy-z*s*.85;
  radarCoreLine(ctx,ox,oy,w-70,oy,'rgba(127,255,195,.42)',1);
  radarCoreLine(ctx,ox,oy,ox,45,'rgba(255,243,214,.42)',1);
  radarCoreLine(ctx,ox,oy,px,pgy,'#d49b46',2,[7,5]);
  radarCoreLine(ctx,px,pgy,px,py,'#7fffc3',2,[5,4]);
  radarCoreLine(ctx,ox,oy,px,py,'#55aaff',3);
  radarCoreDot(ctx,ox,oy,'#7fffc3',5); radarCoreDot(ctx,px,py,'#55aaff',6);
  ctx.strokeStyle='#d49b46'; ctx.lineWidth=2; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(ox,oy,54,0,-Math.max(-1.5,Math.min(1.5,az)),az<0); ctx.stroke(); ctx.setLineDash([]);
  radarCoreText(ctx,'XY ground plane',w-180,oy-10,'#bdf8d4');
  radarCoreText(ctx,'Z',ox+8,48,'#fff3d6');
  radarCoreText(ctx,'azimuth',ox+62,oy-20,'#d49b46');
  radarCoreText(ctx,`Target (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,px+8,py-8,'#f6fff5');
  radarCoreText(ctx,`Slant ${range.toFixed(3)} m | Ground ${ground.toFixed(3)} m`,28,34,'#f6fff5');
  radarCoreText(ctx,`Az ${radarCoreDeg(az).toFixed(2)}° | El ${radarCoreDeg(el).toFixed(2)}°`,28,56,'#fff3d6');
  q('#visualHint').textContent='Radar geometry: blue = slant range / LOS, orange = ground projection, green = height/elevation.';
}

function drawRadarCoreDoppler(ctx,w,h,v){
  drawGrid(ctx,w,h);
  const f=v.f||77000000000, fd=v.fd||0, velocity=Number.isFinite(v.velocity)?v.velocity:fd*C/(2*f);
  const cy=h*.55, rx=105, tx=w-150;
  ctx.fillStyle='rgba(143,255,208,.18)';ctx.strokeStyle='#8fffd0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(rx,cy,32,0,Math.PI*2);ctx.fill();ctx.stroke();
  radarCoreText(ctx,'RADAR',rx-24,cy+55);
  ctx.fillStyle='rgba(255,243,214,.18)';ctx.strokeStyle='#fff3d6';ctx.beginPath();ctx.roundRect(tx-38,cy-28,76,56,10);ctx.fill();ctx.stroke();
  radarCoreText(ctx,'TARGET',tx-24,cy+52,'#fff3d6');
  glowStroke(ctx,'#8fffd0',2,()=>{ctx.beginPath();for(let x=rx+50;x<tx-50;x++){const t=(x-(rx+50))/(tx-rx-100);const yy=cy+Math.sin(t*Math.PI*12)*(22+Math.min(35,Math.abs(fd)/90)); if(x===rx+50)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();});
  radarCoreLine(ctx,tx,cy-96,tx+(velocity>=0?-95:95),cy-96,'#fff3d6',4);
  radarCoreText(ctx,`f = ${(f/1e9).toFixed(3)} GHz`,28,34);
  radarCoreText(ctx,`fd = ${fd.toFixed(3)} Hz`,28,56);
  radarCoreText(ctx,`v = ${velocity.toFixed(4)} m/s = ${(velocity*3.6).toFixed(2)} km/h`,28,78,'#fff3d6');
  q('#visualHint').textContent='Doppler: frequency shift becomes radial velocity toward/away from radar.';
}

function drawRadarCoreResolution(ctx,w,h,v){
  drawGrid(ctx,w,h);
  const b=v.b||4000000000, rr=v.rangeRes||C/(2*b), start=80, y=h*.58, cells=7, cw=(w-160)/cells;
  for(let i=0;i<cells;i++){ctx.fillStyle=i===3?'rgba(255,235,140,.16)':'rgba(127,255,195,.08)';ctx.strokeStyle=i===3?'rgba(255,235,140,.45)':'rgba(127,255,195,.22)';ctx.lineWidth=1.5;ctx.fillRect(start+i*cw,y-45,cw-6,90);ctx.strokeRect(start+i*cw,y-45,cw-6,90);radarCoreText(ctx,`cell ${i+1}`,start+i*cw+12,y+68,'#bdf8d4');}
  radarCoreDot(ctx,start+3*cw+cw*.30,y,'#55aaff',7); radarCoreDot(ctx,start+3*cw+cw*.58,y+12,'#ff6b6b',7);
  radarCoreText(ctx,'Two targets inside same range cell can merge',start+3*cw-55,y-65,'#fff3d6');
  radarCoreText(ctx,`B = ${(b/1e6).toFixed(3)} MHz`,28,34);
  radarCoreText(ctx,`ΔR = ${rr.toFixed(6)} m ≈ ${(rr*100).toFixed(2)} cm`,28,56,'#fff3d6');
  q('#visualHint').textContent='Range resolution: bandwidth controls how close two targets can be in distance before merging.';
}

function calculate(){
  const fn=activeFn();
  try{
    const result = fn.custom ? fn.calc({}) : fn.calc(readValues(fn));
    q('#calcResult').textContent = result.text;
    if(result.type !== 'pointcloud3d' && result.type !== 'dopplerBatchResult') drawResult(result);
  }catch(e){
    q('#calcResult').textContent = e.message || 'Calculation error.';
  }
}

function parseRows(text){
  return String(text).trim().split(/\r?\n/).map(line =>
    line.split(/[,\t; ]+/).map(Number).filter(Number.isFinite)
  ).filter(r=>r.length);
}

function drawImported(rows){
  if(!rows.length) return;

  const maxCols = Math.max(...rows.map(r=>r.length));
  if(maxCols >= 3){
    const pts3 = rows
      .filter(r => r.length >= 3)
      .map(r => ({x:r[0], y:r[1], z:r[2], r:Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2])}));
    drawPointCloud3D(pts3, {rx:25, ry:35, title:'Imported 3D point cloud'});
    q('#dataSummary').textContent = `Loaded ${pts3.length} 3D points from file.`;
    return;
  }

  const c=q('#calcCanvas'), ctx=c.getContext('2d'), w=c.width, h=c.height;
  drawGrid(ctx,w,h);
  const pts=rows.map((r,i)=>r.length>=2?[r[0],r[1]]:[i,r[0]]);
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const mx=x=>20+(x-minX)/(maxX-minX||1)*(w-40);
  const my=y=>h-20-(y-minY)/(maxY-minY||1)*(h-40);
  glowStroke(ctx, '#8fffd0', 2, () => {
    ctx.beginPath();
    pts.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(mx(x),my(y));else ctx.lineTo(mx(x),my(y));});
    ctx.stroke();
  });
  ctx.fillStyle='#fff3d6';
  pts.slice(0,2500).forEach(([x,y])=>ctx.fillRect(mx(x)-1,my(y)-1,2,2));
  q('#dataSummary').textContent = `Loaded ${rows.length} rows as 2D data.`;
}

async function loadData(){
  const file=q('#dataFile').files[0];
  if(!file){q('#dataSummary').textContent='Choose a file first.';return;}
  const text=await file.text();
  let rows=[];
  try{
    if(file.name.toLowerCase().endsWith('.json')){
      const j=JSON.parse(text);
      rows=Array.isArray(j) ? j.map(o=>Array.isArray(o)?o:[o.x,o.y,o.z,o.mv,o.adc].map(Number).filter(Number.isFinite)) : [];
    } else rows=parseRows(text);
  }catch(e){ rows=parseRows(text); }
  drawImported(rows);
}


function calcPointCloudDemo(){
  const count = Math.max(10, Math.min(5000, Number(q('#pcCount').value || 350)));
  const shape = q('#pcShape').value || 'sphere';
  const rx = Number(q('#pcRotX').value || 0);
  const ry = Number(q('#pcRotY').value || 0);
  const points = generatePointCloudDemo(count, shape);
  drawPointCloud3D(points, {rx, ry, rz:Number(q('#pcRotZ')?.value || 0), zoom:Number(q('#pcZoom')?.value || 1), title:`3D point cloud: ${shape}`});
  return { text:`Generated ${points.length} 3D points (${shape}).`, type:'pointcloud3d', points };
}

function calcScan3D(){
  const azStart = Number(q('#scanAzStart').value);
  const azEnd = Number(q('#scanAzEnd').value);
  const elStart = Number(q('#scanElStart').value);
  const elEnd = Number(q('#scanElEnd').value);
  const rMin = Number(q('#scanRMin').value);
  const rMax = Number(q('#scanRMax').value);
  const azSteps = Math.max(2, Math.min(200, Number(q('#scanAzSteps').value || 32)));
  const elSteps = Math.max(2, Math.min(200, Number(q('#scanElSteps').value || 14)));

  if (![azStart,azEnd,elStart,elEnd,rMin,rMax].every(Number.isFinite)) {
    throw new Error('Enter valid scan values.');
  }

  const points = [];
  for(let ei=0; ei<elSteps; ei++){
    const el = (elStart + (elEnd-elStart) * ei / Math.max(1, elSteps-1)) * Math.PI/180;
    for(let ai=0; ai<azSteps; ai++){
      const az = (azStart + (azEnd-azStart) * ai / Math.max(1, azSteps-1)) * Math.PI/180;
      const surface = 0.5 + 0.5*Math.sin(ai*0.45)*Math.cos(ei*0.6);
      const r = rMin + (rMax-rMin) * surface;
      points.push({
        x: r*Math.cos(el)*Math.cos(az),
        y: r*Math.cos(el)*Math.sin(az),
        z: r*Math.sin(el),
        r
      });
    }
  }
  drawPointCloud3D(points, {rx:Number(q('#pcRotX')?.value || 22), ry:Number(q('#pcRotY')?.value || 38), rz:Number(q('#pcRotZ')?.value || 0), zoom:Number(q('#pcZoom')?.value || 1), title:'Simulated spherical scan'});
  return { text:`Generated ${points.length} scan points from spherical coordinates.`, type:'pointcloud3d', points };
}

function generatePointCloudDemo(count, shape){
  const pts = [];
  for(let i=0; i<count; i++){
    let x=0,y=0,z=0;
    if(shape === 'sphere'){
      const u = Math.random();
      const v = Math.random();
      const theta = 2*Math.PI*u;
      const phi = Math.acos(2*v-1);
      const r = 1.1 + Math.random()*0.35;
      x = r*Math.sin(phi)*Math.cos(theta);
      y = r*Math.sin(phi)*Math.sin(theta);
      z = r*Math.cos(phi);
    } else if(shape === 'wave'){
      const gx = (Math.random()*2-1)*2.2;
      const gy = (Math.random()*2-1)*2.2;
      x = gx;
      y = gy;
      z = Math.sin(gx*2.2)*0.35 + Math.cos(gy*2.0)*0.35;
    } else if(shape === 'spiral'){
      const t = i/count * Math.PI * 8;
      const r = 0.25 + i/count*2.0;
      x = Math.cos(t)*r;
      y = Math.sin(t)*r;
      z = (i/count-0.5)*2.2;
    } else {
      x = (Math.random()*2-1)*2;
      y = (Math.random()*2-1)*2;
      z = (Math.random()*2-1)*2;
    }
    pts.push({x,y,z,r:Math.sqrt(x*x+y*y+z*z)});
  }
  return pts;
}

function project3D(p, rxDeg, ryDeg, scale, cx, cy){
  const rx = rxDeg*Math.PI/180;
  const ry = ryDeg*Math.PI/180;

  let x = p.x, y = p.y, z = p.z;

  // Rotate around Y
  const cyy = Math.cos(ry), syy = Math.sin(ry);
  const x1 = x*cyy - z*syy;
  const z1 = x*syy + z*cyy;

  // Rotate around X
  const cxx = Math.cos(rx), sxx = Math.sin(rx);
  const y1 = y*cxx - z1*sxx;
  const z2 = y*sxx + z1*cxx;

  const camera = 5.0;
  const perspective = scale / Math.max(0.5, camera - z2);

  return {
    sx: cx + x1*perspective,
    sy: cy - y1*perspective,
    depth: z2,
    dist: p.r ?? Math.sqrt(p.x*p.x+p.y*p.y+p.z*p.z)
  };
}

function drawPointCloud3D(points, opts={}){
  const c = q('#calcCanvas');
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  drawGrid(ctx,w,h);

  const rx = Number(opts.rx ?? 25);
  const ry = Number(opts.ry ?? 35);
  const maxAbs = points.reduce((m,p)=>Math.max(m,Math.abs(p.x),Math.abs(p.y),Math.abs(p.z)),1);
  const scale = Math.min(w,h) * 1.55 / Math.max(1, maxAbs);
  const cx = w/2, cy = h/2 + 10;

  // Axis lines
  drawAxis3D(ctx, rx, ry, scale, cx, cy);

  const projected = points.map(p => project3D(p, rx, ry, scale, cx, cy))
    .sort((a,b)=>a.depth-b.depth);

  const maxDist = projected.reduce((m,p)=>Math.max(m,p.dist),1);

  for(const p of projected){
    const t = Math.max(0, Math.min(1, p.dist/maxDist));
    const size = Math.max(1.5, 4.2 - p.depth*0.35);
    const alpha = Math.max(0.35, Math.min(1, 0.55 + p.depth*0.08));
    const r = Math.round(120 + 80*t);
    const g = Math.round(255 - 40*t);
    const b = Math.round(195 + 55*(1-t));
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, size, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.fillStyle = '#d6ffe7';
  ctx.font = '13px Consolas, monospace';
  ctx.fillText(opts.title || '3D point cloud', 24, 30);
  ctx.fillText(`points: ${points.length}`, 24, 50);
  ctx.fillText(`rotation: X ${rx.toFixed(0)}°, Y ${ry.toFixed(0)}°`, 24, 70);
  q('#visualHint').textContent = '3D point cloud projected to 2D canvas. Use rotation fields and calculate again.';
}

function drawAxis3D(ctx, rx, ry, scale, cx, cy){
  const axes = [
    {name:'X', p:{x:1.5,y:0,z:0,r:1}, color:'#fff3d6'},
    {name:'Y', p:{x:0,y:1.5,z:0,r:1}, color:'#8fffd0'},
    {name:'Z', p:{x:0,y:0,z:1.5,r:1}, color:'#55aaff'}
  ];
  const origin = project3D({x:0,y:0,z:0,r:0}, rx, ry, scale, cx, cy);
  for(const a of axes){
    const end = project3D(a.p, rx, ry, scale, cx, cy);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin.sx, origin.sy);
    ctx.lineTo(end.sx, end.sy);
    ctx.stroke();
    ctx.fillStyle = a.color;
    ctx.fillText(a.name, end.sx+5, end.sy+4);
  }
}



function addDopplerBatchRow(name='', freq='', fd=''){
  const rows = q('#dopplerBatchRows');
  if(!rows) return;
  const row = document.createElement('div');
  row.className = 'dopplerBatchRow';
  row.innerHTML = `
    <input class="field dopplerName" type="text" placeholder="Object / radar" value="${name}">
    <input class="field dopplerFreq" type="number" step="any" placeholder="f Hz" value="${freq}">
    <input class="field dopplerShift" type="number" step="any" placeholder="fd Hz" value="${fd}">
    <button class="btn ghost dopplerRemove" type="button">x</button>
  `;
  rows.appendChild(row);
  row.querySelector('.dopplerRemove').onclick = () => {
    const all = qa('.dopplerBatchRow');
    if(all.length <= 1){
      row.querySelector('.dopplerName').value = '';
      row.querySelector('.dopplerFreq').value = '';
      row.querySelector('.dopplerShift').value = '';
    } else {
      row.remove();
    }
  };
}

function loadDopplerBatchDemo(){
  const rows = q('#dopplerBatchRows');
  if(!rows) return;
  rows.innerHTML = '';
  addDopplerBatchRow('Radar 1', '24000000000', '1600');
  addDopplerBatchRow('Radar 2', '3000000000', '2000');
  addDopplerBatchRow('Radar 3', '10000000000', '80000');
  q('#dopplerBatchResult').textContent = 'Demo rows loaded. Press CALCULATE.';
}

function readDopplerBatchRows(){
  const rows = qa('.dopplerBatchRow');
  const out = [];
  rows.forEach((row, idx) => {
    const name = row.querySelector('.dopplerName')?.value.trim() || `Object ${idx+1}`;
    const f = Number(row.querySelector('.dopplerFreq')?.value);
    const fd = Number(row.querySelector('.dopplerShift')?.value);
    if(Number.isFinite(f) && f > 0 && Number.isFinite(fd)){
      const lambda = C / f;
      const vms = fd * lambda / 2;
      out.push({
        name, f, fd, lambda,
        vms,
        kmh: vms * 3.6,
        mms: vms * 1000
      });
    }
  });
  return out;
}

function calcDopplerBatch(){
  const rows = readDopplerBatchRows();
  if(rows.length < 1) throw new Error('Enter at least one valid row: name, frequency and Doppler shift.');

  const lines = rows.map(r =>
    `${r.name}: ${r.vms.toFixed(3)} m/s = ${r.kmh.toFixed(2)} km/h = ${r.mms.toFixed(0)} mm/s`
  );

  const box = q('#dopplerBatchResult');
  if(box) box.textContent = lines.join('\n');

  drawDopplerBatchChart(rows);

  return {
    text: lines.join('\n'),
    type:'dopplerBatchResult',
    rows
  };
}

function drawDopplerBatchChart(rows){
  const c = q('#calcCanvas');
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  drawGrid(ctx,w,h);

  const marginL = 70;
  const marginR = 30;
  const marginT = 45;
  const marginB = 70;
  const plotW = w - marginL - marginR;
  const plotH = h - marginT - marginB;

  const vals = rows.map(r => Math.abs(r.kmh));
  const maxVal = Math.max(1, ...vals) * 1.12;
  const barW = Math.max(18, Math.min(80, plotW / rows.length * 0.55));

  ctx.fillStyle = '#d6ffe7';
  ctx.font = '13px Consolas, monospace';
  ctx.fillText('Doppler velocity comparison', marginL, 28);
  ctx.fillText('unit: km/h', w - 130, 28);

  // y-axis
  ctx.strokeStyle = 'rgba(214,255,231,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(marginL, marginT);
  ctx.lineTo(marginL, marginT + plotH);
  ctx.lineTo(w - marginR, marginT + plotH);
  ctx.stroke();

  // grid labels
  ctx.fillStyle = 'rgba(214,255,231,.75)';
  for(let i=0; i<=4; i++){
    const y = marginT + plotH - (i/4)*plotH;
    const val = (i/4)*maxVal;
    ctx.strokeStyle = 'rgba(124,255,206,.10)';
    ctx.beginPath();
    ctx.moveTo(marginL, y);
    ctx.lineTo(w - marginR, y);
    ctx.stroke();
    ctx.fillText(val.toFixed(0), 12, y+4);
  }

  rows.forEach((r, i) => {
    const xCenter = marginL + (i + 0.5) * (plotW / rows.length);
    const barH = Math.max(2, Math.abs(r.kmh) / maxVal * plotH);
    const x = xCenter - barW/2;
    const y = marginT + plotH - barH;

    const grad = ctx.createLinearGradient(0, y, 0, marginT+plotH);
    grad.addColorStop(0, r.kmh > 1000 ? 'rgba(255,180,120,.95)' : 'rgba(143,255,208,.95)');
    grad.addColorStop(1, 'rgba(80,170,255,.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, barH);

    ctx.strokeStyle = 'rgba(255,243,214,.65)';
    ctx.strokeRect(x, y, barW, barH);

    ctx.fillStyle = '#fff3d6';
    ctx.save();
    ctx.translate(xCenter - 4, marginT + plotH + 14);
    ctx.rotate(-Math.PI/5);
    ctx.fillText(r.name, 0, 0);
    ctx.restore();

    ctx.fillStyle = '#d6ffe7';
    ctx.fillText(`${r.kmh.toFixed(1)}`, x - 4, Math.max(marginT+12, y - 8));
  });

  q('#visualHint').textContent = 'Bar chart shows calculated Doppler velocity for each row in km/h.';
}



function calcRfPower(){
  const mode = q('#rfPowerMode')?.value || 'dbm_to_w';
  const value = Number(q('#rfPowerValue')?.value);
  if(!Number.isFinite(value)) throw new Error('Enter a valid RF power value.');

  if(mode === 'dbm_to_w'){
    const watt = Math.pow(10, (value - 30) / 10);
    const mw = watt * 1000;
    return { text:`${value.toFixed(3)} dBm\\n= ${watt.toFixed(9)} W\\n= ${mw.toFixed(6)} mW`, y:watt, type:'rfPower', values:{mode, dbm:value, watt, mw} };
  }

  if(value <= 0) throw new Error('Watt value must be greater than 0.');
  const dbm = 10 * Math.log10(value) + 30;
  const mw = value * 1000;
  return { text:`${value.toFixed(9)} W\\n= ${mw.toFixed(6)} mW\\n= ${dbm.toFixed(3)} dBm`, y:dbm, type:'rfPower', values:{mode, dbm, watt:value, mw} };
}

function drawRfToolboxScene(r){
  if(!r || !String(r.type || '').startsWith('rf')) return false;
  const c = q('#calcCanvas');
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  drawGrid(ctx,w,h);
  ctx.fillStyle = '#d6ffe7';
  ctx.font = '13px Consolas, monospace';


  if(r.type === 'rfAmEnvelope'){
    ctx.fillText('AM envelope / modulation depth', 28, 32);
    ctx.fillText(`Vmax=${r.values.vmax} V, Vmin=${r.values.vmin} V`, 28, 52);
    ctx.fillText(`m=${r.values.m.toFixed(4)} = ${(r.values.m*100).toFixed(2)} %`, 28, 72);
    drawAmEnvelope(ctx,w,h,r.values);
    return true;
  }
  if(r.type === 'rfAmSpectrum'){
    ctx.fillText('AM carrier and sidebands', 28, 32);
    ctx.fillText(`fc=${(r.values.fc/1000).toFixed(3)} kHz, fm=${r.values.fm.toFixed(3)} Hz`, 28, 52);
    ctx.fillText(`BW=${r.values.bw.toFixed(3)} Hz`, 28, 72);
    drawAmSpectrum(ctx,w,h,r.values);
    return true;
  }
  if(r.type === 'rfAmPower'){
    ctx.fillText('AM power distribution', 28, 32);
    ctx.fillText(`Pc=${r.values.pc.toFixed(3)} W, m=${r.values.m.toFixed(3)}`, 28, 52);
    ctx.fillText(`Ptotal=${r.values.total.toFixed(3)} W`, 28, 72);
    drawAmPowerBars(ctx,w,h,r.values);
    return true;
  }
  if(r.type === 'rfFmDeviation'){
    ctx.fillText('FM deviation over time', 28, 32);
    ctx.fillText(`Δf=${r.values.df.toFixed(3)} Hz, fm=${r.values.fm.toFixed(3)} Hz`, 28, 52);
    ctx.fillText(`β=${r.values.beta.toFixed(4)}, Carson BW≈${r.values.bw.toFixed(3)} Hz`, 28, 72);
    drawFmDeviation(ctx,w,h,r.values);
    return true;
  }
  if(r.type === 'rfFmSpectrum'){
    ctx.fillText('FM occupied bandwidth - Carson rule', 28, 32);
    ctx.fillText(`Δf=${r.values.df.toFixed(3)} Hz, fm=${r.values.fm.toFixed(3)} Hz`, 28, 52);
    ctx.fillText(`β=${r.values.beta.toFixed(4)}, BW≈${r.values.bw.toFixed(3)} Hz`, 28, 72);
    drawFmSpectrum(ctx,w,h,r.values);
    return true;
  }
  if(r.type === 'rfMixer'){
    ctx.fillText('Mixer / IF helper', 28, 32);
    ctx.fillText(`RF=${(r.values.rf/1e6).toFixed(6)} MHz`, 28, 52);
    ctx.fillText(`LO=${(r.values.lo/1e6).toFixed(6)} MHz`, 28, 72);
    ctx.fillText(`IF=|RF-LO|=${(r.values.iff/1e6).toFixed(6)} MHz`, 28, 92);
    drawMixerDiagram(ctx,w,h,r.values);
    return true;
  }

  if(r.type === 'rfFspl'){
    ctx.fillText('Free-space path loss', 28, 32);
    ctx.fillText(`distance = ${r.values.distance} m`, 28, 52);
    ctx.fillText(`frequency = ${(r.values.frequency/1e6).toFixed(3)} MHz`, 28, 72);
    ctx.fillText(`loss = ${r.values.fspl.toFixed(2)} dB`, 28, 92);
    drawRfPath(ctx,w,h,r.values.fspl);
    return true;
  }
  if(r.type === 'rfLinkBudget'){
    ctx.fillText('RF link budget', 28, 32);
    ctx.fillText(`TX=${r.values.pt} dBm, Gt=${r.values.gt} dBi, Gr=${r.values.gr} dBi`, 28, 52);
    ctx.fillText(`FSPL=${r.values.fspl.toFixed(2)} dB, extra loss=${r.values.loss} dB`, 28, 72);
    ctx.fillText(`RX estimate=${r.values.pr.toFixed(2)} dBm`, 28, 92);
    drawRfPath(ctx,w,h,r.values.fspl);
    return true;
  }
  if(r.type === 'rfEirp'){
    ctx.fillText('EIRP / usable beam cone', 28, 32);
    ctx.fillText(`TX=${r.values.pt} dBm, gain=${r.values.gain} dBi, loss=${r.values.loss} dB`, 28, 52);
    ctx.fillText(`EIRP=${r.values.eirp.toFixed(2)} dBm = ${r.values.watt.toFixed(6)} W`, 28, 72);
    ctx.fillText(`usable cone ≈ ${r.values.beam.toFixed(1)}°, sketch range=${r.values.range.toFixed(1)} m`, 28, 92);
    drawBeamCone(ctx,w,h,r.values);
    return true;
  }
  if(r.type === 'rfFarField'){
    ctx.fillText('Near-field / far-field', 28, 32);
    ctx.fillText(`λ=${r.values.lambda.toFixed(6)} m, D=${r.values.d} m`, 28, 52);
    ctx.fillText(`Far-field starts around R≈${r.values.r.toFixed(4)} m`, 28, 72);
    drawFarField(ctx,w,h);
    return true;
  }
  if(r.type === 'rfLc'){
    ctx.fillText('LC resonance', 28, 32);
    ctx.fillText(`L=${r.values.l} H, C=${r.values.cap} F`, 28, 52);
    ctx.fillText(`f=${r.values.frequency.toFixed(3)} Hz`, 28, 72);
    drawLcWave(ctx,w,h);
    return true;
  }
  if(r.type === 'rfPower'){
    ctx.fillText('RF power conversion', 28, 32);
    ctx.fillText(`${r.values.dbm.toFixed(3)} dBm`, 28, 56);
    ctx.fillText(`${r.values.watt.toFixed(9)} W`, 28, 76);
    ctx.fillText(`${r.values.mw.toFixed(6)} mW`, 28, 96);
    drawPowerMeter(ctx,w,h,r.values.dbm);
    return true;
  }
  return false;
}

function drawAmEnvelope(ctx,w,h,v){
  const left=45, right=w-45, mid=h/2+30, plotW=right-left;
  const m=Math.max(0, Math.min(1.25, Number(v.m||0)));
  ctx.strokeStyle='rgba(214,255,231,.28)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(left,mid); ctx.lineTo(right,mid); ctx.stroke();
  const envTop=[], envBot=[];
  for(let i=0;i<=plotW;i++){
    const x=left+i;
    const t=i/plotW;
    const env=45 + 62*(1 + m*Math.sin(t*Math.PI*2*2))/2;
    envTop.push([x, mid-env]); envBot.push([x, mid+env]);
  }
  ctx.strokeStyle='rgba(255,243,214,.9)'; ctx.lineWidth=2;
  ctx.beginPath(); envTop.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.stroke();
  ctx.beginPath(); envBot.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.stroke();
  glowStroke(ctx,'#8fffd0',1.6,()=>{
    ctx.beginPath();
    for(let i=0;i<=plotW;i++){
      const x=left+i, t=i/plotW;
      const env=45 + 62*(1 + m*Math.sin(t*Math.PI*2*2))/2;
      const y=mid + Math.sin(t*Math.PI*2*42)*env;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });
  if(m>1){ctx.fillStyle='#ffb878';ctx.fillText('overmodulation risk', left, h-32);}
}

function drawAmSpectrum(ctx,w,h,v){
  const base=h-62, cx=w/2, span=Math.max(1, Number(v.fm||1));
  ctx.strokeStyle='rgba(214,255,231,.35)'; ctx.beginPath(); ctx.moveTo(60,base); ctx.lineTo(w-60,base); ctx.stroke();
  const line=(x,height,label,color)=>{ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,base-height);ctx.stroke();ctx.fillStyle=color;ctx.fillText(label,x-42,base-height-12);};
  line(cx,170,'carrier fc','#fff3d6');
  line(cx-145,92,'fc - fm','#8fffd0');
  line(cx+145,92,'fc + fm','#8fffd0');
  ctx.fillStyle='#d6ffe7'; ctx.fillText(`Bandwidth = 2·fm = ${v.bw.toFixed(3)} Hz`, cx-105, base+34);
}

function drawAmPowerBars(ctx,w,h,v){
  const base=h-55, x0=120, gap=95, max=Math.max(v.total, v.pc, v.sideTotal, v.each, 1);
  const bars=[['Carrier',v.pc],['LSB',v.each],['USB',v.each],['Total',v.total]];
  bars.forEach((b,i)=>{
    const x=x0+i*gap, bh=Math.max(4,b[1]/max*(h-135));
    const grad=ctx.createLinearGradient(0,base-bh,0,base); grad.addColorStop(0,'rgba(143,255,208,.95)'); grad.addColorStop(1,'rgba(80,170,255,.38)');
    ctx.fillStyle=grad; ctx.fillRect(x,base-bh,42,bh); ctx.strokeStyle='rgba(255,243,214,.55)'; ctx.strokeRect(x,base-bh,42,bh);
    ctx.fillStyle='#fff3d6'; ctx.fillText(b[0],x-8,base+22); ctx.fillText(b[1].toFixed(2)+' W',x-13,base-bh-10);
  });
}

function drawFmDeviation(ctx,w,h,v){
  const left=45,right=w-45,mid=h/2+26,plotW=right-left;
  ctx.strokeStyle='rgba(214,255,231,.25)'; ctx.beginPath(); ctx.moveTo(left,mid); ctx.lineTo(right,mid); ctx.stroke();
  ctx.fillStyle='#fff3d6'; ctx.fillText('+Δf', left, mid-72); ctx.fillText('-Δf', left, mid+82);
  glowStroke(ctx,'#8fffd0',2,()=>{
    ctx.beginPath();
    for(let i=0;i<=plotW;i++){
      const x=left+i, t=i/plotW;
      const y=mid-Math.sin(t*Math.PI*2*3)*70;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });
  ctx.strokeStyle='rgba(255,243,214,.55)'; ctx.lineWidth=1;
  for(let i=0;i<34;i++){
    const t=i/33, local=1+0.65*Math.sin(t*Math.PI*2*3);
    const x=left+t*plotW;
    ctx.beginPath();ctx.moveTo(x,mid+105);ctx.lineTo(x+8/local,mid+105);ctx.stroke();
  }
  ctx.fillStyle='#d6ffe7'; ctx.fillText('upper curve = instantaneous frequency deviation', left+90, h-28);
}

function drawFmSpectrum(ctx,w,h,v){
  const base=h-62,cx=w/2,bwPix=Math.min(w-190, Math.max(120, 260 + Math.log10(v.bw+1)*22));
  ctx.strokeStyle='rgba(214,255,231,.35)';ctx.beginPath();ctx.moveTo(60,base);ctx.lineTo(w-60,base);ctx.stroke();
  ctx.fillStyle='rgba(143,255,208,.10)';ctx.fillRect(cx-bwPix/2,105,bwPix,base-105);
  ctx.strokeStyle='rgba(143,255,208,.65)';ctx.strokeRect(cx-bwPix/2,105,bwPix,base-105);
  for(let i=-6;i<=6;i++){
    const amp=Math.max(16,105*Math.exp(-Math.abs(i)/3.2));
    const x=cx+i*(bwPix/14);
    ctx.strokeStyle=i===0?'#fff3d6':'#8fffd0'; ctx.lineWidth=i===0?4:2;
    ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,base-amp);ctx.stroke();
  }
  ctx.fillStyle='#fff3d6';ctx.fillText('fc',cx-8,base+24);
  ctx.fillText('Carson BW ≈ 2(Δf + fm)',cx-115,88);
}

function drawMixerDiagram(ctx,w,h,v){
  const y=h/2+25;
  const box=(x,label,val)=>{ctx.fillStyle='rgba(143,255,208,.12)';ctx.strokeStyle='#8fffd0';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y-38,130,76,12);ctx.fill();ctx.stroke();ctx.fillStyle='#d6ffe7';ctx.fillText(label,x+16,y-8);ctx.fillStyle='#fff3d6';ctx.fillText(val,x+14,y+16);};
  box(80,'RF',(v.rf/1e6).toFixed(3)+' MHz');
  box(w/2-65,'MIXER','×');
  box(w-210,'IF',(v.iff/1e6).toFixed(3)+' MHz');
  ctx.strokeStyle='#fff3d6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(210,y);ctx.lineTo(w/2-70,y);ctx.moveTo(w/2+70,y);ctx.lineTo(w-210,y);ctx.stroke();
  ctx.fillStyle='#d6ffe7';ctx.fillText('LO '+(v.lo/1e6).toFixed(3)+' MHz',w/2-70,y+70);
}

function drawRfPath(ctx,w,h,loss){
  const txX = 90, rxX = w-110, y = h/2 + 35;
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.arc(txX,y,16,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(rxX,y,16,0,Math.PI*2); ctx.fill();
  ctx.fillText('TX', txX-10, y+42);
  ctx.fillText('RX', rxX-10, y+42);
  ctx.strokeStyle = 'rgba(143,255,208,.32)';
  ctx.lineWidth = 2;
  for(let i=0; i<6; i++){
    ctx.beginPath();
    ctx.ellipse(txX + 70 + i*90, y, 30+i*5, 70-i*6, 0, -Math.PI/2, Math.PI/2);
    ctx.stroke();
  }
  const attenuation = Math.max(0.1, Math.min(1, 120 / Math.max(1, loss)));
  ctx.strokeStyle = `rgba(143,255,208,${attenuation})`;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(txX+22,y); ctx.lineTo(rxX-22,y); ctx.stroke();
}

function drawBeamCone(ctx,w,h,v={}){
  const ax = 120;
  const ay = h/2 + 35;
  const plotW = w - 250;

  const beamDeg = Math.max(1, Math.min(180, Number(v.beam || 35)));
  const rangeM = Math.max(1, Number(v.range || 100));
  const eirpDbm = Number.isFinite(Number(v.eirp)) ? Number(v.eirp) : 0;
  const txDbm = Number.isFinite(Number(v.pt)) ? Number(v.pt) : 0;
  const gainDbi = Number.isFinite(Number(v.gain)) ? Number(v.gain) : 0;
  const lossDb = Number.isFinite(Number(v.loss)) ? Number(v.loss) : 0;

  // Dynamic drawing values from input data:
  // - beam width controls cone angle
  // - sketch range controls cone length on a logarithmic display scale
  // - EIRP controls brightness/glow
  // - antenna gain controls how dominant the main lobe is compared with side lobes
  const rangeNorm = Math.max(0.12, Math.min(1, Math.log10(rangeM + 1) / Math.log10(10000 + 1)));
  const coneLen = Math.max(110, plotW * rangeNorm);
  const endX = ax + coneLen;

  const powerNorm = Math.max(0, Math.min(1, (eirpDbm + 20) / 80)); // -20..60 dBm useful UI scale
  const coneAlphaNear = 0.22 + 0.55 * powerNorm;
  const coneAlphaFar = 0.08 + 0.22 * powerNorm;
  const edgeAlpha = 0.62 + 0.38 * powerNorm;
  const glow = 12 + 30 * powerNorm;

  // Gain visualization scale:
  // 0 dBi = reference isotropic-ish display point.
  // 40 dBi and above is displayed as maximum visual gain, but the numeric value is still shown.
  const gainNorm = Math.max(0, Math.min(1, gainDbi / 40));
  const gainOverScale = gainDbi > 40;
  const sideLobeAlpha = Math.max(0.025, 0.24 - gainNorm * 0.18);
  const sideLobeSize = 1.08 - gainNorm * 0.46;

  const half = beamDeg * Math.PI / 360;
  const rawSpread = Math.tan(half) * coneLen;
  const maxSpread = h * 0.41;
  const spreadScale = rawSpread > maxSpread ? maxSpread / rawSpread : 1;
  const endSpread = rawSpread * spreadScale;

  // Dynamic range axis
  const axisY = h - 58;
  ctx.strokeStyle = 'rgba(214,255,231,.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, axisY);
  ctx.lineTo(ax + plotW, axisY);
  ctx.stroke();
  ctx.fillStyle = 'rgba(214,255,231,.78)';
  ctx.fillText('0 m', ax-9, axisY+18);
  ctx.fillText('dynamic display scale', ax+plotW-145, axisY+18);

  // Main cone fill intensity follows EIRP
  const grad = ctx.createLinearGradient(ax, ay, endX, ay);
  grad.addColorStop(0, `rgba(143,255,208,${coneAlphaNear.toFixed(3)})`);
  grad.addColorStop(1, `rgba(143,255,208,${coneAlphaFar.toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX, ay - endSpread);
  ctx.lineTo(endX, ay + endSpread);
  ctx.closePath();
  ctx.fill();

  // Bright inner core: this is where antenna gain becomes visually obvious.
  // Higher gain = stronger, tighter main-lobe core. Beam width input still controls the outer cone.
  const coreSpread = Math.max(6, endSpread * (0.46 - gainNorm * 0.31));
  const coreAlphaNear = 0.20 + 0.58 * gainNorm;
  const coreAlphaFar = 0.06 + 0.32 * gainNorm;
  const coreGrad = ctx.createLinearGradient(ax, ay, endX, ay);
  coreGrad.addColorStop(0, `rgba(255,243,214,${coreAlphaNear.toFixed(3)})`);
  coreGrad.addColorStop(1, `rgba(143,255,208,${coreAlphaFar.toFixed(3)})`);
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX, ay - coreSpread);
  ctx.lineTo(endX, ay + coreSpread);
  ctx.closePath();
  ctx.fill();

  // Cone edges and centerline follow beam width + range
  ctx.save();
  ctx.shadowColor = '#8fffd0';
  ctx.shadowBlur = glow + gainNorm * 18;
  ctx.strokeStyle = `rgba(143,255,208,${edgeAlpha.toFixed(3)})`;
  ctx.lineWidth = 2 + powerNorm * 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX, ay - endSpread);
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX, ay + endSpread);
  ctx.stroke();
  ctx.restore();

  // Centerline gets thicker/brighter with antenna gain.
  ctx.save();
  ctx.shadowColor = '#fff3d6';
  ctx.shadowBlur = 8 + gainNorm * 30;
  ctx.strokeStyle = `rgba(255,243,214,${(0.40 + gainNorm * 0.60).toFixed(3)})`;
  ctx.lineWidth = 2 + gainNorm * 7;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX, ay);
  ctx.stroke();
  ctx.restore();

  // Range markers inside current cone
  ctx.strokeStyle = 'rgba(255,243,214,.24)';
  ctx.lineWidth = 1;
  for(let i=1;i<=4;i++){
    const x = ax + coneLen * i/4;
    const s = endSpread * i/4;
    ctx.beginPath();
    ctx.moveTo(x, ay-s);
    ctx.lineTo(x, ay+s);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,243,214,.72)';
    ctx.fillText(`${(rangeM*i/4).toFixed(rangeM < 20 ? 1 : 0)} m`, x-18, axisY-8);
  }

  // Antenna symbol
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.arc(ax,ay,9,0,Math.PI*2); ctx.fill();
  ctx.fillText('antenna', ax-30, ay+32);

  // End target/edge marker at entered sketch range
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.arc(endX, ay, 6 + powerNorm*3, 0, Math.PI*2); ctx.fill();
  ctx.fillText('entered sketch range', Math.min(endX-70, w-205), ay-16);

  // Weak side lobes; gain affects visual dominance
  ctx.strokeStyle = `rgba(143,255,208,${sideLobeAlpha.toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(ax+130, ay-70, 125*sideLobeSize, 22*sideLobeSize, -0.32, 0, Math.PI*2);
  ctx.ellipse(ax+130, ay+70, 125*sideLobeSize, 22*sideLobeSize, 0.32, 0, Math.PI*2);
  ctx.stroke();

  // Antenna gain meter / directivity indicator
  const meterX = Math.min(w - 240, ax + plotW - 225);
  const meterY = 34;
  const meterW = 180;
  const meterH = 14;
  ctx.fillStyle = 'rgba(4,18,13,.82)';
  ctx.strokeStyle = 'rgba(255,243,214,.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(meterX - 10, meterY - 10, meterW + 28, 78, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3d6';
  ctx.fillText('antenna gain / directivity', meterX, meterY + 2);
  ctx.strokeStyle = 'rgba(214,255,231,.28)';
  ctx.strokeRect(meterX, meterY + 16, meterW, meterH);
  const fillW = meterW * gainNorm;
  const gainGrad = ctx.createLinearGradient(meterX, meterY + 16, meterX + meterW, meterY + 16);
  gainGrad.addColorStop(0, 'rgba(143,255,208,.35)');
  gainGrad.addColorStop(1, 'rgba(255,243,214,.95)');
  ctx.fillStyle = gainGrad;
  ctx.fillRect(meterX, meterY + 16, fillW, meterH);
  ctx.fillStyle = '#d6ffe7';
  ctx.fillText(`gain = ${gainDbi.toFixed(1)} dBi${gainOverScale ? '  (visual max)' : ''}`, meterX, meterY + 50);
  ctx.fillText('higher gain = brighter/tighter core', meterX, meterY + 68);

  // Labels based on input
  ctx.fillStyle = '#d6ffe7';
  ctx.fillText(`beam width = ${beamDeg.toFixed(1)}°`, ax+34, ay-20);
  ctx.fillText(`range input = ${rangeM.toFixed(1)} m`, ax+34, ay+50);
  ctx.fillText(`EIRP = ${eirpDbm.toFixed(2)} dBm`, ax+34, ay+70);
  ctx.fillText(`TX ${txDbm.toFixed(1)} dBm + gain ${gainDbi.toFixed(1)} dBi - loss ${lossDb.toFixed(1)} dB`, 28, h-24);
}

function drawRadiationLobes(ctx,w,h){
  drawBeamCone(ctx,w,h,{beam:55,range:100});
}

function drawFarField(ctx,w,h){
  const x0 = 100, y = h/2 + 40;
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.arc(x0,y,10,0,Math.PI*2); ctx.fill();
  ctx.fillText('antenna', x0-28, y+34);
  ctx.fillStyle = 'rgba(255,180,80,.18)';
  ctx.fillRect(x0+30, y-80, 150, 160);
  ctx.fillStyle = 'rgba(143,255,208,.15)';
  ctx.fillRect(x0+180, y-80, w-x0-230, 160);
  ctx.fillStyle = '#fff3d6';
  ctx.fillText('near field', x0+60, y-95);
  ctx.fillText('far field', x0+230, y-95);
}

function drawLcWave(ctx,w,h){
  drawSine(ctx,w,h,55,4);
  ctx.fillStyle = '#fff3d6';
  ctx.fillText('resonant oscillation', w/2-70, h-36);
}

function drawPowerMeter(ctx,w,h,dbm){
  const min = -80, max = 40;
  const t = Math.max(0, Math.min(1, (dbm-min)/(max-min)));
  const x = 80, y = h/2 + 50, barW = w-160;
  ctx.strokeStyle = 'rgba(214,255,231,.35)';
  ctx.strokeRect(x,y,barW,26);
  const grad = ctx.createLinearGradient(x,y,x+barW,y);
  grad.addColorStop(0,'rgba(80,170,255,.45)');
  grad.addColorStop(.55,'rgba(143,255,208,.75)');
  grad.addColorStop(1,'rgba(255,180,120,.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(x,y,barW*t,26);
  ctx.fillStyle = '#fff3d6';
  ctx.fillText('-80 dBm', x, y+48);
  ctx.fillText('+40 dBm', x+barW-55, y+48);
}



function findSmallestAncestorContaining(el, predicate){
  let n = el ? el.parentElement : null;
  while(n && n !== document.body){
    if(predicate(n)) return n;
    n = n.parentElement;
  }
  return null;
}

function configureCompactCalculatorLayout(){
  document.body.classList.add('compactCalcLayout');

  // Keep canvas low enough that the calculator fits in the browser without scrolling as much.
  const canvas = q('#calcCanvas');
  if(canvas){
    canvas.height = window.innerHeight < 850 ? 285 : 330;
    canvas.style.height = canvas.height + 'px';
  }

  // Move DATA / LOG IMPORT from the lower right area to the left control column.
  const dataFile = q('#dataFile');
  const calcFunction = q('#calcFunction');
  if(dataFile && calcFunction){
    const dataCard = findSmallestAncestorContaining(dataFile, n =>
      /DATA\s*\/\s*LOG\s*IMPORT/i.test(n.textContent || '') && n.querySelector('#btnLoadData')
    );
    const leftColumn = findSmallestAncestorContaining(calcFunction, n =>
      n.querySelector('#calcFunction') && n.querySelector('#inputPanel') && n.querySelector('#btnCalc')
    );
    if(dataCard && leftColumn && dataCard.parentElement !== leftColumn){
      dataCard.classList.add('calculatorDataMoved');
      leftColumn.insertBefore(dataCard, leftColumn.firstElementChild || null);
    }
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  configureCompactCalculatorLayout();
  qa('.calcTab').forEach(btn=>btn.onclick=()=>{
    qa('.calcTab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentTab=btn.dataset.tab;
    setOptions();
    configureCompactCalculatorLayout();
  });
  q('#calcFunction').onchange=renderInputs;
  q('#btnCalc').onclick=calculate;
  q('#btnClearCalc').onclick=()=>{renderInputs();q('#calcResult').textContent='Cleared.';};
  q('#btnLoadData').onclick=loadData;
  q('#btnClearData').onclick=()=>{q('#dataFile').value='';q('#dataSummary').textContent='Cleared.';drawEmpty();};
  setOptions();
  window.addEventListener('resize', () => { configureCompactCalculatorLayout(); drawEmpty(); });
});


// === Pointcloud controls/autofit override ===
function bindPointCloudButtons(){
  const bump = (sel, delta, min=-999, max=999) => {
    const el = q(sel);
    if(!el) return;
    const v = Number(el.value || 0);
    el.value = String(Math.max(min, Math.min(max, +(v + delta).toFixed(3))));
    calculate();
  };
  const bind = (id, fn) => { const el = q('#'+id); if(el) el.onclick = fn; };
  bind('pcXMinus', () => bump('#pcRotX', -10));
  bind('pcXPlus',  () => bump('#pcRotX',  10));
  bind('pcYMinus', () => bump('#pcRotY', -10));
  bind('pcYPlus',  () => bump('#pcRotY',  10));
  bind('pcZMinus', () => bump('#pcRotZ', -10));
  bind('pcZPlus',  () => bump('#pcRotZ',  10));
  bind('pcZoomMinus', () => bump('#pcZoom', -0.15, 0.15, 8));
  bind('pcZoomPlus',  () => bump('#pcZoom',  0.15, 0.15, 8));
}

function project3D(p, rxDeg, ryDeg, rzDeg, scale, cx, cy){
  const rx = rxDeg*Math.PI/180, ry = ryDeg*Math.PI/180, rz = rzDeg*Math.PI/180;
  let x = p.x, y = p.y, z = p.z;

  const czz = Math.cos(rz), szz = Math.sin(rz);
  const xz = x*czz - y*szz;
  const yz = x*szz + y*czz;
  x = xz; y = yz;

  const cyy = Math.cos(ry), syy = Math.sin(ry);
  const x1 = x*cyy - z*syy;
  const z1 = x*syy + z*cyy;

  const cxx = Math.cos(rx), sxx = Math.sin(rx);
  const y1 = y*cxx - z1*sxx;
  const z2 = y*sxx + z1*cxx;

  return {
    x1, y1, z2,
    sx: cx + x1*scale,
    sy: cy - y1*scale,
    depth: z2,
    dist: p.r ?? Math.sqrt(p.x*p.x+p.y*p.y+p.z*p.z)
  };
}

function drawAxis3D(ctx, rx, ry, rz, scale, cx, cy){
  const axes = [
    {name:'X', p:{x:1.2,y:0,z:0,r:1}, color:'#fff3d6'},
    {name:'Y', p:{x:0,y:1.2,z:0,r:1}, color:'#8fffd0'},
    {name:'Z', p:{x:0,y:0,z:1.2,r:1}, color:'#55aaff'}
  ];
  const origin = project3D({x:0,y:0,z:0,r:0}, rx, ry, rz, scale, cx, cy);
  for(const a of axes){
    const end = project3D(a.p, rx, ry, rz, scale, cx, cy);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(origin.sx, origin.sy);
    ctx.lineTo(end.sx, end.sy);
    ctx.stroke();
    ctx.fillStyle = a.color;
    ctx.fillText(a.name, end.sx+5, end.sy+4);
  }
}

function drawPointCloud3D(points, opts={}){
  const c = q('#calcCanvas');
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  drawGrid(ctx,w,h);

  const rx = Number(opts.rx ?? 25);
  const ry = Number(opts.ry ?? 35);
  const rz = Number(opts.rz ?? 0);
  const zoom = Math.max(0.15, Math.min(8, Number(opts.zoom ?? 1)));
  const cx = w/2, cy = h/2 + 8;

  // Auto-fit after rotation: prevents big r clouds from going outside the canvas.
  const raw = points.map(p => project3D(p, rx, ry, rz, 1, 0, 0));
  const maxX = Math.max(1e-9, ...raw.map(p => Math.abs(p.x1)));
  const maxY = Math.max(1e-9, ...raw.map(p => Math.abs(p.y1)));
  const fitX = (w * 0.42) / maxX;
  const fitY = (h * 0.42) / maxY;
  const scale = Math.min(fitX, fitY) * zoom;

  drawAxis3D(ctx, rx, ry, rz, scale, cx, cy);

  const projected = points.map(p => project3D(p, rx, ry, rz, scale, cx, cy))
    .sort((a,b)=>a.depth-b.depth);
  const maxDist = projected.reduce((m,p)=>Math.max(m,p.dist),1);

  for(const p of projected){
    const t = Math.max(0, Math.min(1, p.dist/maxDist));
    const depthBoost = (p.depth + 3) / 6;
    const size = Math.max(0.75, Math.min(2.25, 1.05 + depthBoost * 0.45));
    const alpha = Math.max(0.34, Math.min(0.92, 0.55 + depthBoost*0.18));
    const r = Math.round(105 + 70*t);
    const g = Math.round(255 - 35*t);
    const b = Math.round(205 + 45*(1-t));
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, size, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.fillStyle = '#d6ffe7';
  ctx.font = '13px Consolas, monospace';
  ctx.fillText(opts.title || '3D point cloud', 24, 30);
  ctx.fillText(`points: ${points.length}`, 24, 50);
  ctx.fillText(`rot X/Y/Z: ${rx.toFixed(0)}° / ${ry.toFixed(0)}° / ${rz.toFixed(0)}°`, 24, 70);
  ctx.fillText(`zoom: ${zoom.toFixed(2)}x`, 24, 90);
  q('#visualHint').textContent = '3D point cloud auto-fitted to canvas. Use X/Y/Z and zoom controls.';
}


// v11: keep the earlier visual layout intact, but make tab labels more practical.
document.addEventListener('DOMContentLoaded', () => {
  const renameTab = (tab, label) => {
    const el = document.querySelector(`.calcTab[data-tab="${tab}"]`);
    if(el) el.textContent = label;
  };
  renameTab('sensors', 'SENSORS / SIGNALS');
  renameTab('pointcloud', '3D / RADAR / LIDAR');
});
