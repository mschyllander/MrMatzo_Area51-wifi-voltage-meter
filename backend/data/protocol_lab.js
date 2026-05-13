const q=(s)=>document.querySelector(s);
const st={ws:null,last:'',proto:'UART'};

const HELP_LINES = [
  'AVAILABLE COMMANDS:',
  'PING',
  'STATUS',
  'HELP',
  'LED ON',
  'LED OFF',
  'GREEN ON',
  'GREEN OFF',
  'RED ON',
  'RED OFF',
  'BLINK SLOW',
  'BLINK MIDDLE',
  'BLINK FAST',
  'BLINK CRAZY',
  'RED BLINK SLOW',
  'RED BLINK MIDDLE',
  'RED BLINK FAST',
  'RED BLINK CRAZY',
  'MODE LINK',
  'DIM 10',
  'DIM 20',
  'DIM 30',
  'DIM 50',
  'DIM 100',
  'TEXT hello',
  'PWM 1',
  'PWM 0',
  'PWF 500',
  'PWP 50',
  'PROTO UART'
];

function setText(id,t){const el=q(id);if(el)el.textContent=t;}

function shouldIgnore(raw){
  const s=String(raw||'').trim();
  if(!s) return true;
  const upper=s.toUpperCase();

  if(
    s.includes('STAT ') ||
    s.includes('mode=STA') ||
    s.includes('mode=AP') ||
    s.includes('rssi=') ||
    s.includes('heap=') ||
    s.includes('scope=') ||
    s.includes('fs_set=') ||
    s.includes('fs_eff=') ||
    s.includes('dt_us_avg=') ||
    s.includes('dt_us_min=') ||
    s.includes('dt_us_max=') ||
    s.includes('loop(us)avg') ||
    s.includes('loop_us_avg=') ||
    s.includes('loop_us_min=') ||
    s.includes('loop_us_max=') ||
    s.includes('ws_bytes=') ||
    s.includes('ws_bursts=') ||
    s.includes('buf_fill=') ||
    s.includes('ws_clients=') ||
    s.includes('ms=')
  ) return true;

  if(
    upper === 'HB' ||
    upper === 'ACK HB' ||
    upper === 'HEARTBEAT' ||
    upper.startsWith('HB ') ||
    upper.startsWith('HEARTBEAT ') ||
    upper.includes('DBG_PROTO=HB') ||
    upper.includes('HB_TICK')
  ) return true;

  return false;
}

function appendLog(line){
  const s=String(line||'').trim();
  if(shouldIgnore(s)) return;
  if(s===st.last) return;
  st.last=s;
  const box=q('#termLog');
  if(!box) return;
  const t=new Date().toLocaleTimeString();
  box.value += `[${t}] ${s}\n`;
  box.scrollTop=box.scrollHeight;
}

function appendPlain(line){
  const s=String(line||'');
  const box=q('#termLog');
  if(!box) return;
  const t=new Date().toLocaleTimeString();
  box.value += `[${t}] ${s}\n`;
  box.scrollTop=box.scrollHeight;
}

function showHelpList(){
  appendPlain('---------------- HELP ----------------');
  HELP_LINES.forEach(line => appendPlain(line));
  appendPlain('--------------------------------------');
}

function wsSend(msg){
  try{
    if(st.ws && st.ws.readyState===1){
      st.ws.send(msg);
      appendLog(`TX: ${msg}`);
      return true;
    }
  }catch(e){}
  appendLog('ERR: WS DOWN');
  return false;
}

function isScopeOrFsCommand(upper){
  return upper === 'SCOPE' ||
         upper.startsWith('SCOPE ') ||
         upper === 'FS' ||
         upper.startsWith('FS ');
}

function normalizeUserCommand(txt){
  const raw=String(txt||'').trim();
  if(!raw) return '';
  const upper=raw.toUpperCase();

  if(upper==='HELP') return 'HELP_LOCAL_ONLY';
  if(upper==='PING') return 'PINGSLAVE';
  if(upper==='STATUS') return 'STATUSSLAVE';

  if(isScopeOrFsCommand(upper)) return 'SCOPE_BLOCKED';

  if(
    upper==='LED ON' || upper==='LED OFF' ||
    upper==='GREEN ON' || upper==='GREEN OFF' ||
    upper==='RED ON' || upper==='RED OFF' ||
    upper==='MODE LINK' ||
    upper.startsWith('DIM ') ||
    upper.startsWith('TEXT ') ||
    upper.startsWith('BLINK ') ||
    upper.startsWith('RED BLINK ') ||
    upper.startsWith('GREEN BLINK ')
  ){
    return `SEND TEXT ${raw}`;
  }

  return raw;
}

function clearInputFocus(){
  const input=q('#textInput');
  if(!input) return;
  input.value='';
  input.focus();
}

function sendTextCommand(){
  const input=q('#textInput');
  const txt=(input?.value || '').trim();
  if(!txt){
    appendLog('INFO: Type a command, or press HELP.');
    if(input) input.focus();
    return;
  }
  const out=normalizeUserCommand(txt);
  if(out==='HELP_LOCAL_ONLY'){
    showHelpList();
    clearInputFocus();
    return;
  }
  if(out==='SCOPE_BLOCKED'){
    appendLog('INFO: Scope commands are disabled in Protocol LAB. Use the Scope page instead.');
    clearInputFocus();
    return;
  }
  if(wsSend(out)) clearInputFocus();
}

function sendDim(level){
  if(wsSend(`SEND TEXT DIM ${level}`)) clearInputFocus();
}

function connectWs(){
  try{
    const proto=location.protocol==='https:'?'wss':'ws';
    const ws=new WebSocket(`${proto}://${location.host}/ws`);
    st.ws=ws;
    ws.onopen=()=>setText('#wsLbl','CONNECTED');
    ws.onclose=()=>{ setText('#wsLbl','DOWN'); setTimeout(connectWs,1200); };
    ws.onerror=()=>setText('#wsLbl','ERR');
    ws.onmessage=(ev)=>{
      if(typeof ev.data !== 'string') return;
      const s=String(ev.data||'');
      if(s.startsWith('PROTO=')){
        st.proto=s.split('=')[1];
        setText('#modeLbl',st.proto);
        return;
      }
      appendLog(s);
    };
  }catch(e){
    appendLog(`ERR: ${e.message||e}`);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  const btnSend=q('#btnSend');
  const btnHelp=q('#btnHelp');
  const btnClear=q('#btnClear');
  const textInput=q('#textInput');

  if(btnSend) btnSend.onclick=()=>sendTextCommand();
  if(btnHelp) btnHelp.onclick=()=>{
    showHelpList();
    clearInputFocus();
  };
  if(btnClear) btnClear.onclick=()=>{
    const box=q('#termLog');
    if(box) box.value='';
    st.last='';
    clearInputFocus();
  };

  const dimMap={
    '#btnDim10':10,
    '#btnDim20':20,
    '#btnDim30':30,
    '#btnDim50':50,
    '#btnDim100':100
  };
  Object.entries(dimMap).forEach(([sel,level])=>{
    const btn=q(sel);
    if(btn) btn.onclick=()=>sendDim(level);
  });

  if(textInput){
    textInput.addEventListener('keydown',(e)=>{
      if(e.key==='Enter'){
        e.preventDefault();
        sendTextCommand();
      }
    });
    textInput.focus();
  }

  const box=q('#termLog');
  if(box) box.value='[READY] UART terminal started. Press HELP or type a command.\n';
  connectWs();
});
