
/* =========================================================
   MR MATZOS Radar Core Addon
   Minimal radar functions only:
   1) Geometry: XYZ <-> range/azimuth/elevation
   2) Doppler: frequency shift -> radial velocity
   3) Range resolution: bandwidth -> delta R
   ========================================================= */

(function(){
  const C = 299792458;

  function $(id){ return document.getElementById(id); }
  function num(id, fallback=0){
    const e=$(id); if(!e) return fallback;
    const v=parseFloat(e.value);
    return Number.isFinite(v)?v:fallback;
  }
  function fmt(v,d=3){ return Number.isFinite(v)?Number(v).toFixed(d):"--"; }
  function rad(deg){ return deg*Math.PI/180; }
  function deg(rad){ return rad*180/Math.PI; }

  function xyzToAngles(x,y,z){
    const ground=Math.sqrt(x*x+y*y);
    const range=Math.sqrt(x*x+y*y+z*z);
    const az=Math.atan2(y,x);
    const el=Math.atan2(z,ground);
    return {x,y,z,ground,range,azRad:az,elRad:el,azDeg:deg(az),elDeg:deg(el)};
  }

  function build(){
    if($("radarCoreAddon")) return;
    const mainCard=document.querySelector(".calcPage > .card");
    if(!mainCard) return;

    const section=document.createElement("section");
    section.className="card";
    section.id="radarCoreAddon";
    section.innerHTML=`
      <div class="radarCoreHead">
        <div>
          <div class="calcTitle">RADAR CORE TOOLBOX</div>
          <div class="helper">Endast de viktigaste radarberäkningarna: riktning/range, dopplerhastighet och range resolution.</div>
        </div>
        <button id="radarCoreCalc" class="btn" type="button">CALCULATE</button>
      </div>

      <div class="radarCoreLayout">
        <div>
          <div class="radarCoreTabs">
            <button class="btn ghost radarCoreTab active" data-radar-tab="geo" type="button">GEOMETRY</button>
            <button class="btn ghost radarCoreTab" data-radar-tab="doppler" type="button">DOPPLER</button>
            <button class="btn ghost radarCoreTab" data-radar-tab="resolution" type="button">RESOLUTION</button>
          </div>

          <div class="calcPanel radarBlock active" data-radar-block="geo">
            <div class="calcTitle">GEOMETRY / POINTING</div>
            <div class="triple">
              <div><label class="label">X</label><input id="radarX" class="field" type="number" step="any" value="4"></div>
              <div><label class="label">Y</label><input id="radarY" class="field" type="number" step="any" value="3"></div>
              <div><label class="label">Z</label><input id="radarZ" class="field" type="number" step="any" value="2"></div>
            </div>
            <div class="radarFormula">
              <code>slant range = √(x² + y² + z²)</code>
              <code>ground range = √(x² + y²)</code>
              <code>azimuth = atan2(y, x)</code>
              <code>elevation = atan2(z, ground range)</code>
            </div>
            <div class="resultBox">
              <div class="resultLabel">RESULT</div>
              <div id="radarGeoResult" class="resultValue">Press calculate.</div>
            </div>
          </div>

          <div class="calcPanel radarBlock" data-radar-block="doppler">
            <div class="calcTitle">DOPPLER / RADIAL SPEED</div>
            <div class="triple">
              <div><label class="label">Carrier f₀ MHz</label><input id="radarF0MHz" class="field" type="number" step="any" value="24000"></div>
              <div><label class="label">Doppler Δf Hz</label><input id="radarFdHz" class="field" type="number" step="any" value="1600"></div>
              <div><label class="label">Mode</label><select id="radarDopplerMode" class="field"><option value="mono">Monostatic</option><option value="oneway">One-way</option></select></div>
            </div>
            <div class="radarFormula">
              <code>monostatic radar: v = Δf · c / (2 · f₀)</code>
              <code>one-way wave/link: v = Δf · c / f₀</code>
            </div>
            <div class="resultBox">
              <div class="resultLabel">RESULT</div>
              <div id="radarDopplerResult" class="resultValue">Press calculate.</div>
            </div>
          </div>

          <div class="calcPanel radarBlock" data-radar-block="resolution">
            <div class="calcTitle">RANGE RESOLUTION</div>
            <div class="double">
              <div><label class="label">Bandwidth B MHz</label><input id="radarBandwidthMHz" class="field" type="number" step="any" value="150"></div>
              <div><label class="label">Factor</label><select id="radarResMode" class="field"><option value="radar">Radar: c/(2B)</option><option value="oneway">One-way: c/B</option></select></div>
            </div>
            <div class="radarFormula">
              <code>radar range resolution: ΔR = c / (2 · B)</code>
              <code>larger bandwidth = smaller distance cell = better separation</code>
            </div>
            <div class="resultBox">
              <div class="resultLabel">RESULT</div>
              <div id="radarResolutionResult" class="resultValue">Press calculate.</div>
            </div>
          </div>

          <div class="calcPanel">
            <div class="calcTitle">WHAT THIS IS FOR</div>
            <div class="radarNote">
              <b>Geometry</b> pekar radarn mot målet.<br>
              <b>Doppler</b> säger om målet rör sig mot/från radarn.<br>
              <b>Range resolution</b> säger hur nära två mål kan ligga i avstånd innan de flyter ihop.
            </div>
          </div>
        </div>

        <div class="calcPanel">
          <div class="radarVisTitle">
            <div>
              <div class="calcTitle">VISUALIZATION</div>
              <div id="radarVisualHint" class="helper">Geometry: blå = LOS, orange = markprojektion, grön = höjd.</div>
            </div>
          </div>
          <canvas id="radarCoreCanvas" width="900" height="390"></canvas>
          <div class="radarLegend">
            <span class="legendLine"><i class="lBlue"></i>Range / LOS</span>
            <span class="legendLine"><i class="lGold"></i>Ground projection</span>
            <span class="legendLine"><i class="lGreen"></i>Elevation / height</span>
            <span class="legendLine"><i class="lRed"></i>Doppler / resolution warning</span>
          </div>
        </div>
      </div>
    `;
    mainCard.insertAdjacentElement("afterend", section);
  }

  function activeTab(){
    const b=document.querySelector("#radarCoreAddon .radarCoreTab.active");
    return b ? b.dataset.radarTab : "geo";
  }

  function setTab(tab){
    document.querySelectorAll("#radarCoreAddon .radarCoreTab").forEach(b=>b.classList.toggle("active", b.dataset.radarTab===tab));
    document.querySelectorAll("#radarCoreAddon .radarBlock").forEach(b=>b.classList.toggle("active", b.dataset.radarBlock===tab));
    calculate();
  }

  function calculate(){
    const tab=activeTab();
    if(tab==="geo") calcGeo();
    if(tab==="doppler") calcDoppler();
    if(tab==="resolution") calcResolution();
  }

  function calcGeo(){
    const x=num("radarX",4), y=num("radarY",3), z=num("radarZ",2);
    const a=xyzToAngles(x,y,z);
    $("radarGeoResult").textContent =
      `Slant range: ${fmt(a.range,4)}\n`+
      `Ground range: ${fmt(a.ground,4)}\n`+
      `Azimuth: ${fmt(a.azDeg,2)}°  (${fmt(a.azRad,4)} rad)\n`+
      `Elevation: ${fmt(a.elDeg,2)}°  (${fmt(a.elRad,4)} rad)`;
    $("radarVisualHint").textContent="Geometry: blå = LOS/range, orange = projektion i XY-planet, grön = höjd/elevation.";
    drawGeometry(a);
  }

  function calcDoppler(){
    const f0=num("radarF0MHz",24000)*1e6;
    const fd=num("radarFdHz",1600);
    const mono=($("radarDopplerMode")?.value||"mono")==="mono";
    const v=fd*C/(mono?2*f0:f0);
    $("radarDopplerResult").textContent =
      `Radial speed: ${fmt(v,4)} m/s\n`+
      `Radial speed: ${fmt(v*3.6,2)} km/h\n`+
      `Direction sign: ${fd>=0 ? "positive Δf" : "negative Δf"}\n`+
      `${mono ? "Monostatic radar uses factor 2 because signal travels out and back." : "One-way link uses no round-trip factor."}`;
    $("radarVisualHint").textContent="Doppler: frekvensskift blir radialhastighet mot/från radarn.";
    drawDoppler(v,fd);
  }

  function calcResolution(){
    const B=num("radarBandwidthMHz",150)*1e6;
    const radar=($("radarResMode")?.value||"radar")==="radar";
    const dR=C/(radar?2*B:B);
    $("radarResolutionResult").textContent =
      `Range resolution ΔR: ${fmt(dR,4)} m\n`+
      `≈ ${fmt(dR*100,1)} cm\n`+
      `Two targets closer than this may merge in range.\n`+
      `Higher bandwidth gives better distance separation.`;
    $("radarVisualHint").textContent="Resolution: mindre cellbredd betyder bättre förmåga att separera två mål i avstånd.";
    drawResolution(dR);
  }

  function clearCanvas(){
    const c=$("radarCoreCanvas"); if(!c) return null;
    const ctx=c.getContext("2d");
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle="#020503"; ctx.fillRect(0,0,c.width,c.height);
    return {c,ctx,w:c.width,h:c.height};
  }

  function drawGeometry(a){
    const o=clearCanvas(); if(!o) return;
    const {ctx,w,h}=o;
    const ox=w*0.28, oy=h*0.72;
    const maxR=Math.max(1,a.range);
    const s=Math.min(w,h)*0.48/maxR;

    const px=ox+a.x*s*0.95;
    const gy=oy-a.y*s*0.32;
    const pz=gy-a.z*s*0.85;

    grid(ctx,w,h);

    // axes
    line(ctx,ox,oy,w-80,oy,"rgba(127,255,195,.42)",1);
    line(ctx,ox,oy,ox,40,"rgba(255,243,214,.42)",1);
    text(ctx,"ground plane",w-170,oy-10,"#bdf8d4");
    text(ctx,"Z",ox+8,48,"#fff3d6");

    // ground projection
    line(ctx,ox,oy,px,gy,"#d49b46",2,[7,5]);
    // height
    line(ctx,px,gy,px,pz,"#7fffc3",2,[5,4]);
    // LOS
    line(ctx,ox,oy,px,pz,"#55aaff",3);

    dot(ctx,ox,oy,"#7fffc3",5);
    dot(ctx,px,pz,"#55aaff",6);

    // az arc
    ctx.strokeStyle="#d49b46"; ctx.lineWidth=2; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(ox,oy,48,0,-Math.max(-1.4,Math.min(1.4,a.azRad)),a.azRad<0); ctx.stroke(); ctx.setLineDash([]);
    text(ctx,"azimuth",ox+55,oy-18,"#d49b46");

    text(ctx,`Target (${fmt(a.x,1)}, ${fmt(a.y,1)}, ${fmt(a.z,1)})`,px+8,pz-8,"#f6fff5");
    text(ctx,`R ${fmt(a.range,2)} | Az ${fmt(a.azDeg,1)}° | El ${fmt(a.elDeg,1)}°`,24,34,"#f6fff5");
  }

  function drawDoppler(v,fd){
    const o=clearCanvas(); if(!o) return;
    const {ctx,w,h}=o;
    grid(ctx,w,h);

    const cx=w*0.5, cy=h*0.52;
    const dir=fd>=0 ? -1 : 1;

    // radar
    ctx.strokeStyle="#7fffc3"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx-170,cy,32,0,Math.PI*2); ctx.stroke();
    text(ctx,"RADAR",cx-200,cy+55,"#7fffc3");

    // target
    ctx.fillStyle="#55aaff";
    ctx.beginPath(); ctx.arc(cx+120,cy,20,0,Math.PI*2); ctx.fill();
    text(ctx,"TARGET",cx+92,cy+50,"#55aaff");

    // waves
    for(let i=0;i<7;i++){
      ctx.strokeStyle=`rgba(85,170,255,${0.25+i*0.06})`;
      ctx.beginPath();
      ctx.arc(cx-130+i*38,cy,16+i*3,0,Math.PI*2);
      ctx.stroke();
    }

    // velocity arrow
    const ax1=cx+90, ax2=cx+90+dir*120;
    line(ctx,ax1,cy-48,ax2,cy-48,fd>=0?"#ff6b6b":"#7fffc3",4);
    arrow(ctx,ax1,cy-48,ax2,cy-48,fd>=0?"#ff6b6b":"#7fffc3");

    text(ctx,`${fmt(v,3)} m/s  (${fmt(v*3.6,1)} km/h)`,24,34,"#f6fff5");
    text(ctx,`Δf = ${fmt(fd,1)} Hz`,24,58,"#fff3d6");
  }

  function drawResolution(dR){
    const o=clearCanvas(); if(!o) return;
    const {ctx,w,h}=o;
    grid(ctx,w,h);

    const start=80, y=h*0.58, cells=7;
    const cellW=(w-160)/cells;

    for(let i=0;i<cells;i++){
      ctx.fillStyle=i===3?"rgba(255,235,140,.16)":"rgba(127,255,195,.08)";
      ctx.strokeStyle=i===3?"rgba(255,235,140,.45)":"rgba(127,255,195,.22)";
      ctx.lineWidth=1.5;
      ctx.fillRect(start+i*cellW,y-45,cellW-6,90);
      ctx.strokeRect(start+i*cellW,y-45,cellW-6,90);
      text(ctx,`cell ${i+1}`,start+i*cellW+12,y+68,"#bdf8d4");
    }

    dot(ctx,start+3*cellW+cellW*0.30,y,"#55aaff",7);
    dot(ctx,start+3*cellW+cellW*0.58,y+12,"#ff6b6b",7);
    text(ctx,"Two targets inside same range cell can merge",start+3*cellW-55,y-65,"#fff3d6");
    text(ctx,`ΔR = ${fmt(dR,3)} m`,24,34,"#f6fff5");
    text(ctx,"Increase bandwidth B to make cells smaller",24,58,"#bdf8d4");
  }

  function grid(ctx,w,h){
    ctx.strokeStyle="rgba(124,255,206,.055)";
    ctx.lineWidth=1;
    for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  }
  function line(ctx,x1,y1,x2,y2,color,width=2,dash=[]){
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();
  }
  function arrow(ctx,x1,y1,x2,y2,color){
    const a=Math.atan2(y2-y1,x2-x1), len=12;
    ctx.fillStyle=color; ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2-len*Math.cos(a-Math.PI/6), y2-len*Math.sin(a-Math.PI/6));
    ctx.lineTo(x2-len*Math.cos(a+Math.PI/6), y2-len*Math.sin(a+Math.PI/6));
    ctx.closePath(); ctx.fill();
  }
  function dot(ctx,x,y,color,r){
    ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }
  function text(ctx,t,x,y,color){
    ctx.fillStyle=color; ctx.font="12px Consolas, 'Courier New', monospace"; ctx.fillText(t,x,y);
  }

  function bind(){
    build();

    document.querySelectorAll("#radarCoreAddon .radarCoreTab").forEach(btn=>{
      btn.addEventListener("click",()=>setTab(btn.dataset.radarTab));
    });

    ["radarCoreCalc","radarX","radarY","radarZ","radarF0MHz","radarFdHz","radarDopplerMode","radarBandwidthMHz","radarResMode"].forEach(id=>{
      const e=$(id); if(!e) return;
      e.addEventListener(id==="radarCoreCalc" ? "click" : "input", calculate);
      e.addEventListener("change", calculate);
    });

    setTimeout(calculate,200);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind);
  else bind();
})();
