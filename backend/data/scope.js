
const q=(s)=>document.querySelector(s);
const st={ws:null,wsOpen:false,pollBusy:false,scopeOn:false,freeze:false,pwmOn:false,auto:true,trig:false,trigEdge:'rising',rec:false,zoom:1,trigLevel:50,samples:[],record:[],maxSamples:1200,lastDutySent:-1,lastDutySendMs:0,pendingPwm:null,pendingScope:null,pendingFs:null,pendingPwf:null};

function setText(sel,t){const el=q(sel); if(el) el.textContent=t;}
function setActive(sel,on){const el=q(sel); if(el) el.classList.toggle('active',!!on);}
function pulse(btn){ if(!btn) return; btn.classList.add('flash'); setTimeout(()=>btn.classList.remove('flash'),120); }
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function parseStateText(text){
  const out={};
  String(text||'').split(';').forEach(part=>{
    const i=part.indexOf('=');
    if(i<0) return;
    out[part.slice(0,i).trim()] = part.slice(i+1).trim();
  });
  return out;
}

function updateUiFromState(d){
  if(d.scope!==undefined){
    const v=d.scope==='1'||d.scope===1||d.scope===true;
    if(st.pendingScope===null||st.pendingScope===v){
      st.scopeOn=v; st.pendingScope=null; setActive('#btnScope',v); setText('#scopeStateLbl',v?'ON':'OFF');
    }
  }
  if(d.pwm!==undefined){
    const v=d.pwm==='1'||d.pwm===1||d.pwm===true;
    if(st.pendingPwm===null||st.pendingPwm===v){
      st.pwmOn=v; st.pendingPwm=null; setActive('#btnPwmToggle',v); setText('#pwmStateLbl',v?'ON':'OFF');
    }
  }
  if(d.pwf!==undefined){
    const v=Number(d.pwf);
    if(!st.pendingPwf||st.pendingPwf===v){
      const inp=q('#pwmFreqInput'); if(inp&&document.activeElement!==inp) inp.value=d.pwf;
      setText('#pwmFreqLbl',`${d.pwf} Hz`); st.pendingPwf=null;
    }
  }
  if(d.fs!==undefined){
    const v=Number(d.fs);
    if(!st.pendingFs||st.pendingFs===v){
      const inp=q('#scopeFsInput'); if(inp&&document.activeElement!==inp) inp.value=d.fs;
      setText('#fsLbl',`${d.fs} Hz`); st.pendingFs=null;
    }
  }
  if(d.pwp!==undefined){
    const slider=q('#dutySlider');
    if(slider&&document.activeElement!==slider) slider.value=d.pwp;
    setText('#dutyPreview',`${d.pwp}%`);
    setText('#pwmDutyLbl',`${d.pwp} %`);
  }
  setText('#statusLbl', st.wsOpen?'WS OK':'HTTP OK');
}

async function pollState(){
  if(st.pollBusy||st.freeze||st.wsOpen) return;
  st.pollBusy=true;
  try{
    const r=await fetch('/api/state',{cache:'no-store'});
    const txt=await r.text();
    updateUiFromState(parseStateText(txt));
  }catch(e){ setText('#statusLbl','STATE ERR'); }
  finally{ st.pollBusy=false; }
}

function sendWs(msg){
  try{ if(st.ws&&st.ws.readyState===1) st.ws.send(msg); else setText('#statusLbl','WS DOWN'); }catch(e){}
}

function parseWsText(line){
  const s=String(line||'').trim();
  if(!s) return;
  if(s.startsWith('PWM=')) updateUiFromState({pwm:s.endsWith('1')?'1':'0'});
  else if(s.startsWith('PWF=')) updateUiFromState({pwf:s.split('=')[1]});
  else if(s.startsWith('PWP=')) updateUiFromState({pwp:s.split('=')[1]});
  else if(s.startsWith('FS=')) updateUiFromState({fs:s.split('=')[1]});
  else if(s.startsWith('SCOPE=')) updateUiFromState({scope:s.endsWith('1')?'1':'0'});
  if(s.startsWith('ACK')||s.startsWith('ERR')||s.startsWith('WARN')) setText('#statusLbl', s.replace(/=/g,' ').slice(0,26));
}

function ingestBinary(buf){
  const bytes=new Uint8Array(buf);
  for(let i=0;i+7<bytes.length;i+=8){
    const t=(bytes[i])|(bytes[i+1]<<8)|(bytes[i+2]<<16)|(bytes[i+3]<<24);
    const adc=(bytes[i+4])|(bytes[i+5]<<8);
    const mv=(bytes[i+6])|(bytes[i+7]<<8);
    st.samples.push({t:(t>>>0),adc,mv});
    if(st.rec) st.record.push({t:(t>>>0),adc,mv});
  }
  if(st.samples.length>st.maxSamples) st.samples.splice(0,st.samples.length-st.maxSamples);
  if(st.record.length>10000) st.record.splice(0,st.record.length-10000);
  if(!st.freeze) queueDraw();
}

function connectWs(){
  const proto=location.protocol==='https:'?'wss':'ws';
  const ws=new WebSocket(`${proto}://${location.host}/ws`);
  ws.binaryType='arraybuffer';
  st.ws=ws;
  ws.onopen=()=>{ st.wsOpen=true; setText('#statusLbl','WS OK'); };
  ws.onclose=()=>{ st.wsOpen=false; setText('#statusLbl','WS DOWN'); setTimeout(connectWs,1200); };
  ws.onerror=()=>{ st.wsOpen=false; setText('#statusLbl','WS ERR'); };
  ws.onmessage=(ev)=>{ if(typeof ev.data==='string') parseWsText(ev.data); else if(ev.data instanceof ArrayBuffer) ingestBinary(ev.data); };
}

function queueDraw(){ if(st._raf) return; st._raf=requestAnimationFrame(()=>{ st._raf=0; drawScope(); }); }

function findTriggerIndex(arr, trigMv){
  if(arr.length < 2) return 0;
  for(let i=1;i<arr.length;i++){
    const a=arr[i-1].mv, b=arr[i].mv;
    if(st.trigEdge==='rising'){
      if(a < trigMv && b >= trigMv) return i;
    }else{
      if(a > trigMv && b <= trigMv) return i;
    }
  }
  return 0;
}

function drawScope(){
  const c=q('#scopeCanvas'); if(!c) return;
  const ctx=c.getContext('2d');
  const w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);

  ctx.strokeStyle='rgba(88,255,186,0.14)';
  ctx.lineWidth=1;
  for(let x=0;x<=w;x+=60){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=0;y<=h;y+=25){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

  const src=st.samples;
  const vdiv=Number(q('#vDivSel').value||0.5);
  const totalV=vdiv*8;
  let totalUs = Number(q('#timeDivSel').value||20) * 1000 * 10;
  totalUs = totalUs / st.zoom;

  if(!src.length){
    const y=h*(1-st.trigLevel/100);
    ctx.setLineDash([6,6]);
    ctx.strokeStyle='rgba(255,180,80,0.25)';
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    ctx.setLineDash([]);
    setText('#trigInfoLbl', st.trig ? `ON ${st.trigEdge==='rising'?'↑':'↓'}` : 'OFF');
    return;
  }

  const lastT = src[src.length-1].t;
  const firstNeeded = Math.max(0, lastT - totalUs*1.25);
  let arr = src.filter(s => s.t >= firstNeeded);
  if(!arr.length) return;

  let minMv=Infinity,maxMv=-Infinity;
  for(const s of arr){ if(s.mv<minMv) minMv=s.mv; if(s.mv>maxMv) maxMv=s.mv; }

  let centerMv = st.auto ? (minMv+maxMv)/2 : 1500;
  const halfSpanMv = (totalV*1000)/2;
  if(st.auto && (maxMv-minMv) < 100) centerMv = 1500;

  const lo = centerMv - halfSpanMv;
  const hi = centerMv + halfSpanMv;
  const trigMv = lo + (st.trigLevel/100)*(hi-lo);

  if(st.trig){
    const idx = findTriggerIndex(arr, trigMv);
    if(idx > 0){
      const trigT = arr[idx].t;
      arr = arr.filter(s => s.t >= trigT && s.t <= trigT + totalUs);
      if(!arr.length) return;
    }else{
      arr = arr.slice(-Math.max(10, Math.floor(arr.length*0.8)));
    }
  }else{
    arr = arr.filter(s => s.t >= lastT - totalUs);
  }

  const leftT = arr[0].t;
  const rightT = leftT + totalUs;
  const mapY=(mv)=>{
    const frac=(mv-lo)/Math.max(1,(hi-lo));
    return h-8-frac*(h-16);
  };
  const mapX=(t)=> ((t-leftT)/Math.max(1,(rightT-leftT)))*(w-1);

  const ty=mapY(trigMv);
  ctx.setLineDash([6,6]);
  ctx.strokeStyle=st.trig?'rgba(255,230,150,1.0)':'rgba(255,230,150,0.65)';
  ctx.beginPath(); ctx.moveTo(0,ty); ctx.lineTo(w,ty); ctx.stroke();
  ctx.setLineDash([]);

  // glow underlay
  ctx.strokeStyle='rgba(143,255,208,0.16)';
  ctx.lineWidth=6;
  ctx.beginPath();
  arr.forEach((s,i)=>{
    const x=mapX(s.t), y=mapY(s.mv);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // crisp trace
  ctx.strokeStyle='#8fffd0';
  ctx.lineWidth=2;
  ctx.beginPath();
  arr.forEach((s,i)=>{
    const x=mapX(s.t), y=mapY(s.mv);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  const dtUs = Math.max(0, arr[arr.length-1].t - arr[0].t);
  setText('#scopeMetaLbl', `samples:${arr.length} zoom:${st.zoom.toFixed(1)} dt:${dtUs}us rec:${st.record.length}`);
  setText('#trigInfoLbl', st.trig ? `ON ${st.trigEdge==='rising'?'↑':'↓'}` : 'OFF');
}

function exportCsv(){
  const src=st.record.length?st.record:st.samples;
  if(!src.length){ setText('#statusLbl','NO DATA'); return; }
  const rows=['t_us,adc,mv,volt'];
  src.forEach(s=>rows.push(`${s.t},${s.adc},${s.mv},${(s.mv/1000).toFixed(6)}`));
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='scope_capture.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

function sendDuty(force=false){
  const v=Number(q('#dutySlider').value);
  const now=performance.now();
  if(!force&&v===st.lastDutySent&&now-st.lastDutySendMs<35) return;
  st.lastDutySent=v; st.lastDutySendMs=now;
  setText('#dutyPreview',`${v}%`);
  setText('#pwmDutyLbl',`${v} %`);
  sendWs(`PWP ${v}`);
}

function bindControls(){
  q('#btnPwmToggle').onclick=()=>{
    const next=!st.pwmOn;
    st.pwmOn=next; st.pendingPwm=next;
    setActive('#btnPwmToggle',next); setText('#pwmStateLbl',next?'ON':'OFF');
    sendWs(`PWM ${next?1:0}`); pulse(q('#btnPwmToggle'));
  };
  q('#btnPwmFreqSet').onclick=()=>{
    const inp=q('#pwmFreqInput');
    const v=clamp(Number(inp.value)||200,50,5000);
    st.pendingPwf=v; inp.value=v; setText('#pwmFreqLbl',`${v} Hz`);
    sendWs(`PWF ${v}`); pulse(q('#btnPwmFreqSet'));
    setTimeout(()=>{ if(st.pendingPwf===v) st.pendingPwf=null; },1500);
  };
  q('#pwmFreqInput').addEventListener('keydown',e=>{ if(e.key==='Enter') q('#btnPwmFreqSet').click(); });
  q('#btnDutySend').onclick=()=>{ sendDuty(true); pulse(q('#btnDutySend')); };
  q('#dutySlider').addEventListener('input',()=> setText('#dutyPreview',`${Number(q('#dutySlider').value)}%`));
  q('#dutySlider').addEventListener('change',()=> sendDuty(true));

  q('#btnScope').onclick=()=>{
    const next=!st.scopeOn;
    st.scopeOn=next; st.pendingScope=next;
    setActive('#btnScope',next); setText('#scopeStateLbl',next?'ON':'OFF');
    sendWs(`SCOPE ${next?1:0}`); pulse(q('#btnScope'));
  };
  q('#btnScopeFsSet').onclick=()=>{
    const v=clamp(Number(q('#scopeFsInput').value)||200,50,4000);
    st.pendingFs=v; q('#scopeFsInput').value=v; setText('#fsLbl',`${v} Hz`);
    sendWs(`FS ${v}`); pulse(q('#btnScopeFsSet'));
    setTimeout(()=>{ if(st.pendingFs===v) st.pendingFs=null; },1500);
  };
  q('#scopeFsInput').addEventListener('keydown',e=>{ if(e.key==='Enter') q('#btnScopeFsSet').click(); });

  q('#btnFreeze').onclick=()=>{ st.freeze=!st.freeze; setActive('#btnFreeze',st.freeze); if(!st.freeze) queueDraw(); };
  q('#btnAuto').onclick=()=>{ st.auto=!st.auto; if(st.auto){ st.trig=false; setActive('#btnTrig',false); setText('#trigModeLbl','AUTO'); } setActive('#btnAuto',st.auto); queueDraw(); };
  q('#btnTrig').onclick=()=>{ st.trig=!st.trig; if(st.trig){ st.auto=false; setActive('#btnAuto',false); } setActive('#btnTrig',st.trig); setText('#trigModeLbl',st.trig?'TRIG':'AUTO'); queueDraw(); };
  q('#btnTrigEdge').onclick=()=>{
    st.trigEdge = st.trigEdge === 'rising' ? 'falling' : 'rising';
    q('#btnTrigEdge').textContent = st.trigEdge === 'rising' ? 'EDGE ↑' : 'EDGE ↓';
    queueDraw();
  };
  q('#btnRec').onclick=()=>{ st.rec=!st.rec; if(st.rec) st.record=[]; setActive('#btnRec',st.rec); queueDraw(); };
  q('#btnCsv').onclick=exportCsv;
  q('#trigSlider').addEventListener('input',e=>{ st.trigLevel=Number(e.target.value)||50; queueDraw(); });
  q('#timeDivSel').addEventListener('change',e=>{ setText('#timeDivLblTop',`${e.target.value} ms/div`); queueDraw(); });
  q('#vDivSel').addEventListener('change',e=>{ setText('#vDivLblTop',`${e.target.value} V/div`); queueDraw(); });
  q('#btnZoomOut').onclick=()=>{ st.zoom=clamp(st.zoom/1.6,1,16); queueDraw(); };
  q('#btnZoomIn').onclick=()=>{ st.zoom=clamp(st.zoom*1.6,1,16); queueDraw(); };
}

document.addEventListener('DOMContentLoaded',()=>{
  bindControls();
  setActive('#btnAuto',true);
  setText('#scopeStateLbl','OFF');
  setText('#pwmStateLbl','OFF');
  connectWs();
  pollState();
  setInterval(()=>{ if(!st.wsOpen) pollState(); },1000);
  queueDraw();
});
