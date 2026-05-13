
/* =========================================================
   Radar Geometry Addon
   Additive module. Does not touch existing calculator.js.
   ========================================================= */

(function(){
  function $(id){ return document.getElementById(id); }
  function num(id, fallback = 0) {
    const e = $(id);
    if (!e) return fallback;
    const v = parseFloat(e.value);
    return Number.isFinite(v) ? v : fallback;
  }
  function fmt(v, d = 3) {
    return Number.isFinite(v) ? Number(v).toFixed(d) : "--";
  }
  function deg(rad){ return rad * 180 / Math.PI; }
  function rad(deg){ return deg * Math.PI / 180; }

  function xyzToAngles(x, y, z) {
    const ground = Math.sqrt(x*x + y*y);
    const range = Math.sqrt(x*x + y*y + z*z);
    const azRad = Math.atan2(y, x);
    const elRad = Math.atan2(z, ground);
    return {
      name: "MAIN",
      x, y, z,
      ground,
      range,
      azRad,
      elRad,
      azDeg: deg(azRad),
      elDeg: deg(elRad)
    };
  }

  function anglesToXYZ(range, azDeg, elDeg) {
    const az = rad(azDeg);
    const el = rad(elDeg);
    const ground = range * Math.cos(el);
    const x = ground * Math.cos(az);
    const y = ground * Math.sin(az);
    const z = range * Math.sin(el);
    return xyzToAngles(x, y, z);
  }

  function buildPanel() {
    if ($("radarGeoAddon")) return;

    const mainCard = document.querySelector(".calcPage > .card");
    if (!mainCard) return;

    const section = document.createElement("section");
    section.className = "card";
    section.id = "radarGeoAddon";
    section.innerHTML = `
      <div class="radarGeoHeader">
        <div>
          <div class="calcTitle">RADAR / LIDAR 3D GEOMETRY TOOLBOX</div>
          <div class="helper">
            Samma gröna MR MATZOS-design. Beräknar slant range, ground range, azimuth, elevation och XYZ.
            Visualiserar LOS-vektor, XY-projektion och höjdkomponent.
          </div>
        </div>
        <div class="radarGeoMode">
          <button id="radarDemoBtn" class="btn ghost" type="button">DEMO</button>
          <button id="radarCalcBtn" class="btn" type="button">CALCULATE</button>
        </div>
      </div>

      <div class="radarGeoLayout">
        <div>
          <div class="calcPanel">
            <div class="calcTitle">XYZ → ANGLES</div>
            <div class="triple">
              <div>
                <label class="label">X</label>
                <input id="radarX" class="field" type="number" step="any" value="4">
              </div>
              <div>
                <label class="label">Y</label>
                <input id="radarY" class="field" type="number" step="any" value="3">
              </div>
              <div>
                <label class="label">Z</label>
                <input id="radarZ" class="field" type="number" step="any" value="2">
              </div>
            </div>

            <div class="radarGeoFormula">
              <code>r = √(x² + y² + z²)</code>
              <code>ground = √(x² + y²)</code>
              <code>azimuth = atan2(y, x)</code>
              <code>elevation = atan2(z, ground)</code>
            </div>

            <div class="resultBox">
              <div class="resultLabel">XYZ RESULT</div>
              <div id="radarXYZResult" class="resultValue">Press calculate.</div>
            </div>
          </div>

          <div class="calcPanel">
            <div class="calcTitle">RANGE + ANGLES → XYZ</div>
            <div class="triple">
              <div>
                <label class="label">Range</label>
                <input id="radarRange" class="field" type="number" step="any" value="5.385">
              </div>
              <div>
                <label class="label">Azimuth °</label>
                <input id="radarAz" class="field" type="number" step="any" value="36.87">
              </div>
              <div>
                <label class="label">Elevation °</label>
                <input id="radarEl" class="field" type="number" step="any" value="21.80">
              </div>
            </div>

            <div class="radarGeoFormula">
              <code>ground = r · cos(elevation)</code>
              <code>x = ground · cos(azimuth)</code>
              <code>y = ground · sin(azimuth)</code>
              <code>z = r · sin(elevation)</code>
            </div>

            <div class="resultBox">
              <div class="resultLabel">ANGLE RESULT</div>
              <div id="radarAngleResult" class="resultValue">Press calculate.</div>
            </div>
          </div>

          <div class="calcPanel">
            <div class="calcTitle">MULTI TARGETS</div>
            <div class="helper">Format: namn,x,y,z — en rad per target.</div>
            <textarea id="radarTargets" class="field" spellcheck="false">T1,4,3,2
T2,7,-1,5
T3,2,6,1</textarea>
            <div id="radarTargetTable" class="radarGeoTable"></div>
          </div>
        </div>

        <div class="calcPanel">
          <div class="calcTitle">VISUALIZATION</div>
          <div class="radarGeoCanvasWrap">
            <canvas id="radarGeoCanvas" width="960" height="420"></canvas>
          </div>

          <div class="radarGeoControls">
            <label>View yaw
              <input id="radarYaw" type="range" min="-180" max="180" value="-35">
            </label>
            <label>View pitch
              <input id="radarPitch" type="range" min="-70" max="70" value="26">
            </label>
          </div>

          <div class="radarLegend">
            <span class="legendLine"><i class="legendBlue"></i> Slant range / LOS</span>
            <span class="legendLine"><i class="legendGold"></i> XY-projektion</span>
            <span class="legendLine"><i class="legendGreen"></i> Z/höjd</span>
            <span class="legendLine"><i class="legendPurple"></i> Extra targets</span>
          </div>

          <div id="radarVisualHint" class="helper top8">
            Azimuth är vridningen i XY-planet. Elevation är vinkeln upp från XY-planet.
          </div>
        </div>
      </div>
    `;

    mainCard.insertAdjacentElement("afterend", section);
  }

  function parseTargets() {
    const t = $("radarTargets");
    if (!t) return [];
    return t.value.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const p = line.split(/[,\t;]/).map(x => x.trim());
        if (p.length < 4) return null;
        const x = parseFloat(p[1]);
        const y = parseFloat(p[2]);
        const z = parseFloat(p[3]);
        if (![x,y,z].every(Number.isFinite)) return null;
        const obj = xyzToAngles(x,y,z);
        obj.name = p[0] || `T${idx+1}`;
        return obj;
      })
      .filter(Boolean);
  }

  function calculate() {
    if (!$("radarGeoAddon")) return;

    const x = num("radarX", 4);
    const y = num("radarY", 3);
    const z = num("radarZ", 2);
    const a = xyzToAngles(x, y, z);

    $("radarXYZResult").textContent =
      `Range/slant: ${fmt(a.range,4)}\n` +
      `Ground range: ${fmt(a.ground,4)}\n` +
      `Azimuth: ${fmt(a.azDeg,2)}°  (${fmt(a.azRad,4)} rad)\n` +
      `Elevation: ${fmt(a.elDeg,2)}°  (${fmt(a.elRad,4)} rad)`;

    const b = anglesToXYZ(num("radarRange", 0), num("radarAz", 0), num("radarEl", 0));
    $("radarAngleResult").textContent =
      `X: ${fmt(b.x,4)}\n` +
      `Y: ${fmt(b.y,4)}\n` +
      `Z: ${fmt(b.z,4)}\n` +
      `Ground range: ${fmt(b.ground,4)}`;

    const targets = parseTargets();
    draw([a].concat(targets), a);
    renderTable(targets.length ? targets : [a]);
  }

  function renderTable(targets) {
    const box = $("radarTargetTable");
    if (!box) return;
    box.innerHTML = `
      <table>
        <thead><tr><th>ID</th><th>X</th><th>Y</th><th>Z</th><th>R</th><th>Az</th><th>El</th></tr></thead>
        <tbody>
        ${targets.map(t => `
          <tr>
            <td>${esc(t.name)}</td>
            <td>${fmt(t.x,2)}</td>
            <td>${fmt(t.y,2)}</td>
            <td>${fmt(t.z,2)}</td>
            <td>${fmt(t.range,2)}</td>
            <td>${fmt(t.azDeg,1)}°</td>
            <td>${fmt(t.elDeg,1)}°</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function draw(targets, primary) {
    const canvas = $("radarGeoCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "#020503";
    ctx.fillRect(0,0,w,h);

    const yaw = rad(num("radarYaw", -35));
    const pitch = rad(num("radarPitch", 26));
    const maxR = Math.max(1, ...targets.map(t => Math.max(Math.abs(t.x), Math.abs(t.y), Math.abs(t.z), t.range)));
    const scale = Math.min(w, h) * 0.34 / maxR;
    const origin = { x: w * 0.46, y: h * 0.68 };

    function rotate(p) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);

      const x1 = p.x * cy - p.y * sy;
      const y1 = p.x * sy + p.y * cy;
      const z1 = p.z;

      const y2 = y1 * cp - z1 * sp;
      const z2 = y1 * sp + z1 * cp;
      return { x:x1, y:y2, z:z2 };
    }

    function project(p) {
      const r = rotate(p);
      return { x: origin.x + r.x * scale, y: origin.y - r.y * scale, d:r.z };
    }

    function line(a,b,color,width=2,dash=[]) {
      const pa = project(a), pb = project(b);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.restore();
    }

    function label(txt,p,color="#d6ffe7",dx=5,dy=-5) {
      const pp = project(p);
      ctx.fillStyle = color;
      ctx.font = "12px Consolas, monospace";
      ctx.fillText(txt, pp.x+dx, pp.y+dy);
    }

    // grid
    const grid = Math.ceil(maxR);
    for (let i=-grid; i<=grid; i++) {
      line({x:-grid,y:i,z:0},{x:grid,y:i,z:0},"rgba(124,255,206,.08)",1);
      line({x:i,y:-grid,z:0},{x:i,y:grid,z:0},"rgba(124,255,206,.08)",1);
    }

    // axes
    line({x:0,y:0,z:0},{x:maxR,y:0,z:0},"rgba(127,255,195,.75)",2);
    line({x:0,y:0,z:0},{x:0,y:maxR,z:0},"rgba(85,170,255,.75)",2);
    line({x:0,y:0,z:0},{x:0,y:0,z:maxR},"rgba(255,243,214,.80)",2);
    label("X",{x:maxR,y:0,z:0},"#7fffc3");
    label("Y",{x:0,y:maxR,z:0},"#55aaff");
    label("Z",{x:0,y:0,z:maxR},"#fff3d6");

    // azimuth arc
    drawArc(ctx, project, Math.max(primary.ground * 0.35, maxR * 0.18), 0, primary.azRad, "#d49b46", "azimuth");

    targets.forEach((t, idx) => {
      const p = {x:t.x,y:t.y,z:t.z};
      const g = {x:t.x,y:t.y,z:0};
      const color = idx === 0 ? "#55aaff" : "#b58aff";

      line({x:0,y:0,z:0}, g, "#d49b46", 2, [7,5]);
      line(g, p, "#7fffc3", 2, [4,4]);
      line({x:0,y:0,z:0}, p, color, idx === 0 ? 3 : 2);

      const pp = project(p);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, idx === 0 ? 6 : 4.5, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      label(`${t.name} (${fmt(t.x,1)},${fmt(t.y,1)},${fmt(t.z,1)})`, p, "#f6fff5", 7, -8);
    });

    drawElevation(ctx, project, primary);

    // info card
    ctx.fillStyle = "rgba(4,16,10,.78)";
    round(ctx, 18, 18, 330, 114, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(124,255,206,.22)";
    ctx.stroke();

    ctx.fillStyle = "#f6fff5";
    ctx.font = "14px Consolas, monospace";
    ctx.fillText(`MAIN XYZ: ${fmt(primary.x,2)}, ${fmt(primary.y,2)}, ${fmt(primary.z,2)}`, 34, 48);
    ctx.fillText(`R: ${fmt(primary.range,3)}   Ground: ${fmt(primary.ground,3)}`, 34, 74);
    ctx.fillText(`Az: ${fmt(primary.azDeg,2)}°   El: ${fmt(primary.elDeg,2)}°`, 34, 100);
  }

  function drawArc(ctx, project, radius, start, end, color, text) {
    const steps = 48;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    for (let i=0; i<=steps; i++) {
      const a = start + (end-start) * i / steps;
      const p = project({x:Math.cos(a)*radius, y:Math.sin(a)*radius, z:0});
      if (i === 0) ctx.moveTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const mid = (start + end) / 2;
    const lp = project({x:Math.cos(mid)*radius*1.15, y:Math.sin(mid)*radius*1.15, z:0});
    ctx.fillStyle = color;
    ctx.font = "12px Consolas, monospace";
    ctx.fillText(text, lp.x+4, lp.y-4);
    ctx.restore();
  }

  function drawElevation(ctx, project, t) {
    if (!t || t.ground <= 0) return;
    const g = {x:t.x,y:t.y,z:0};
    const p = {x:t.x,y:t.y,z:t.z};
    const pg = project(g);
    const pp = project(p);
    ctx.save();
    ctx.strokeStyle = "#7fffc3";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3,3]);
    ctx.beginPath();
    ctx.moveTo(pg.x, pg.y);
    ctx.lineTo(pp.x, pp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#7fffc3";
    ctx.font = "12px Consolas, monospace";
    ctx.fillText("elevation", (pg.x+pp.x)/2 + 7, (pg.y+pp.y)/2 - 9);
    ctx.restore();
  }

  function round(ctx,x,y,w,h,r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function loadDemo() {
    $("radarX").value = "4";
    $("radarY").value = "3";
    $("radarZ").value = "2";
    $("radarRange").value = "5.385";
    $("radarAz").value = "36.87";
    $("radarEl").value = "21.80";
    $("radarTargets").value = "T1,4,3,2\nT2,7,-1,5\nT3,2,6,1\nDrone,-3,2,4";
    calculate();
  }

  function bind() {
    buildPanel();

    ["radarCalcBtn", "radarYaw", "radarPitch", "radarTargets", "radarX", "radarY", "radarZ", "radarRange", "radarAz", "radarEl"].forEach(id => {
      const e = $(id);
      if (!e) return;
      e.addEventListener(id === "radarCalcBtn" ? "click" : "input", calculate);
    });

    const demo = $("radarDemoBtn");
    if (demo) demo.addEventListener("click", loadDemo);

    setTimeout(calculate, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
