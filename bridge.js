// Voice loop for the rice demo. The mic is stopped before every server call
// and stays stopped until all assistant audio has finished playing.
db = fresh();
const VOICE_STATES = new Set(['IDLE', 'LISTENING', 'THINKING', 'SPEAKING']);
let voiceState = 'IDLE';
let conversation = [];
let stateHistory = [];
let recorder = null;
let captureMode = null;
let stream = null;
let selectedMicrophoneId = localStorage.getItem('kadaiKuralMicId') || '';
let microphoneOptionsRefreshedAfterPermission = false;
let analyserContext = null;
let analyser = null;
let analyserSource = null;
let analyserData = null;
let raf = 0;
let chunks = [];
let speechStart = 0;
let lastLoud = 0;
let heardSpeech = false;
let micStarting = false;
let audioContext = null;
let wakeEnabled = false;
let conversationActive = false;
let pendingDecision = null;
let unclearCount = 0;
let lastTranscript = '—';
let lastReply = '—';
let phoneCall = null;
let callStarting = false;
let phoneTimer = null;
let ringTimer = null;
let answerTimer = null;
let ttsQueue = Promise.resolve();
let stopCurrentPlayback = null;

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {method, headers: body ? {'Content-Type':'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'கடை சர்வருடன் தொடர்பு கிடைக்கவில்லை.');
  return data;
}

async function refreshState() {
  const data = await api('/api/shop/state');
  db = {products:data.products.map(p=>({...p,min:p.min_stock})),sales:data.sales,orders:data.orders.map(o=>({...o,quote:o.status!=='draft'})),movements:data.movements,supplierInventory:data.supplierInventory||[]};
  render();
  updateRiceStock();
}

save = () => {};
render = function() {
  document.getElementById('low-count').textContent = lowProducts().length;
  document.getElementById('page-content').innerHTML = ({dashboard,billing,call:callPage,inventory,orders,analytics,settings}[activePage]||dashboard)();
  if(activePage==='billing') renderCart();
  syncVoiceStage();
  if(activePage==='call')syncPhoneUI();
};
const existingGo=go;
go=function(page){if(phoneCall&&['ringing','active'].includes(phoneCall.status)&&page!=='call'){showPhoneError('முதலில் phone call-ஐ முடித்துவிட்டு வேறு பக்கத்துக்குப் போங்க.');return;}existingGo(page);if(page==='call')document.getElementById('crumb-page').textContent='Wholesaler call';};

function setVoiceState(next, note='') {
  if (!VOICE_STATES.has(next)) throw new Error(`Invalid voice state: ${next}`);
  const previous = voiceState;
  voiceState = next;
  const message = `STATE: ${previous} -> ${next}`;
  if(previous!==next){console.info(message);stateHistory.unshift(message);if(stateHistory.length>8)stateHistory.pop();}
  const log = document.getElementById('state-log');
  if(log) { const line=document.createElement('div'); line.textContent=message; log.prepend(line); while(log.children.length>8)log.lastChild.remove(); }
  const panel=document.getElementById('voice-console'); if(panel)panel.dataset.state=next;
  const stateLabel=document.getElementById('voice-stage-state'); if(stateLabel)stateLabel.textContent=({IDLE:'தயார் · “Hey Kural” சொல்லுங்க',LISTENING:'சொல்லுங்க, கேட்கிறேன்',THINKING:'ஒரு நிமிஷம்…',SPEAKING:'பேசுகிறேன்…'})[next];
  const hint=document.getElementById('voice-stage-hint'); if(hint)hint.textContent=note||({IDLE:wakeEnabled?'மைக் wake phrase-ஐ மட்டும் கவனிக்கிறது. Talk அழுத்தியும் தொடங்கலாம்.':'மைக் நிறுத்தப்பட்டுள்ளது. Talk அழுத்தி மீண்டும் தொடங்குங்க.',LISTENING:'தொடர்ந்து பேசலாம். நிறுத்த Talk அழுத்துங்க.',THINKING:'மைக் இப்போது நிறுத்தப்பட்டுள்ளது.',SPEAKING:'பதில் முடிந்ததும் தான் மீண்டும் கேட்பேன்.'})[next];
  const current=document.getElementById('current-voice-state'); if(current)current.textContent=next;
  const toggle=document.getElementById('voice-stage-toggle'); if(toggle)toggle.textContent=next==='LISTENING'?'■ நிறுத்து':'▶ Talk';
  const orb=document.getElementById('voice-stage-mic'); if(orb)orb.title=next==='LISTENING'?'Stop listening':'Talk';
}

function addTranscript(text, role) {
  conversation.push({role,content:text});
  if(role==='user'){lastTranscript=text;const el=document.getElementById('last-transcript');if(el)el.textContent=text;}
  else {lastReply=text;const el=document.getElementById('last-reply');if(el)el.textContent=text;}
  syncVoiceStage();
}
function syncVoiceStage(){
  const log=document.getElementById('voice-stage-log');if(!log)return;
  log.innerHTML=conversation.map(turn=>`<div class="voice-turn ${turn.role==='user'?'owner':'agent'}"><b>${turn.role==='user'?'நீங்க':'கடை குரல்'}</b><span>${esc(turn.content)}</span></div>`).join('')||'<div class="voice-stage-empty">“Hey Kural” சொல்லுங்க அல்லது Talk அழுத்துங்க.</div>';
  log.scrollTop=log.scrollHeight;
  const transcript=document.getElementById('last-transcript'),reply=document.getElementById('last-reply');if(transcript)transcript.textContent=lastTranscript;if(reply)reply.textContent=lastReply;
  const stateLog=document.getElementById('state-log');if(stateLog)stateLog.innerHTML=stateHistory.map(item=>`<div>${esc(item)}</div>`).join('');
  setVoiceState(voiceState);
  const drawer=document.getElementById('chat-log');if(drawer){drawer.innerHTML=conversation.map(turn=>`<div class="chat-message ${turn.role==='user'?'user':'bot'}">${esc(turn.content)}</div>`).join('');drawer.scrollTop=drawer.scrollHeight;}
}
function updateRiceStock(){
  const p=product('rice');if(!p)return;
  const stock=document.getElementById('rice-current');if(stock)stock.textContent=`${p.stock} மூட்டை`;
  const threshold=document.getElementById('rice-threshold');if(threshold)threshold.textContent=`${p.min} மூட்டை`;
  const row=document.getElementById('rice-current-row');if(row)row.textContent=`${p.stock} மூட்டை`;
  const summary=document.getElementById('rice-summary');if(summary)summary.textContent=`${p.stock} மூட்டை கையிருப்பில் · குறைந்த அளவு ${p.min}`;
}

function getAudioContext(){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('இந்த browser-ல் audio playback கிடைக்கவில்லை.');if(!audioContext)audioContext=new C();return audioContext;}
async function refreshMicrophoneOptions(){
  const select=document.getElementById('microphone-select');if(!select||!navigator.mediaDevices?.enumerateDevices)return;
  try{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audioinput');
    select.innerHTML='';const system=document.createElement('option');system.value='';system.textContent='System default';select.appendChild(system);
    devices.forEach((device,index)=>{const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label||`Microphone ${index+1}`;select.appendChild(option);});
    if(selectedMicrophoneId&&!devices.some(device=>device.deviceId===selectedMicrophoneId))selectedMicrophoneId='';
    select.value=selectedMicrophoneId;select.disabled=devices.length===0;
  }catch(error){console.debug('Could not list microphones.',error);}
}
function ringPulse(){
  if(phoneCall?.status!=='ringing')return;
  try{const ctx=getAudioContext();if(ctx.state==='suspended')ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=440;gain.gain.setValueAtTime(.001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.045,ctx.currentTime+.03);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.32);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.34);}catch(error){console.debug('Ringtone audio is unavailable.',error);}
}
function queueTTS(text,voice,shouldPlay=()=>true){
  const task=ttsQueue.then(async()=>{
    const result=await api('/api/integrations/gnani/speak','POST',{text,...(voice?{voice}:{})});
    if(!shouldPlay())return;
    const raw=atob(result.audio),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const ctx=getAudioContext();if(ctx.state==='suspended')await ctx.resume();
    const buffer=await ctx.decodeAudioData(bytes.buffer);if(!shouldPlay())return;
    await new Promise((resolve,reject)=>{
      const source=ctx.createBufferSource(),gain=ctx.createGain();let done=false;
      const finish=(error)=>{if(done)return;done=true;if(stopCurrentPlayback===stop)stopCurrentPlayback=null;if(error)reject(error);else resolve();};
      const stop=()=>{try{source.stop();}catch{}finish();};stopCurrentPlayback=stop;
      gain.gain.value=1.7;source.buffer=buffer;source.connect(gain);gain.connect(ctx.destination);source.onended=()=>finish();source.onerror=()=>finish(new Error('Audio playback failed.'));source.start();
    });
  });
  ttsQueue=task.catch(()=>{});return task;
}
async function speak(text, voice){
  setVoiceState('SPEAKING');await stopCapture();
  await queueTTS(text,voice);
  addTranscript(text,'assistant');
}
async function sayThenListen(text){
  try{await speak(text);}catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();return;}
  setVoiceState('LISTENING');await startCapture('command');
}
function showVoiceError(message){const el=document.getElementById('voice-error');if(el){el.textContent=message;el.hidden=false;}else if(document.getElementById('phone-call-error'))showPhoneError(message);console.error(message);}
function clearVoiceError(){const el=document.getElementById('voice-error');if(el){el.textContent='';el.hidden=true;}}

async function stopCapture(){
  if(raf)cancelAnimationFrame(raf);raf=0;
  if(analyserSource){try{analyserSource.disconnect();}catch{}analyserSource=null;}
  analyser=null;analyserData=null;
  if(recorder&&recorder.state==='recording'){recorder.onstop=null;recorder.stop();}
  recorder=null;captureMode=null;stream?.getTracks().forEach(track=>track.stop());stream=null;
}
function speechMeter(){
  if(!recorder||recorder.state!=='recording'||!analyser)return;
  analyser.getFloatTimeDomainData(analyserData);let sum=0;for(const value of analyserData)sum+=value*value;
  const now=performance.now(),rms=Math.sqrt(sum/analyserData.length);
  if(rms>0.002){heardSpeech=true;lastLoud=now;if(captureMode==='call-owner'&&phoneCall&&phoneCall.ownerState!=='SPEAKING')setPhoneStates('SPEAKING','LISTENING');}
  // Leave time for natural pauses inside Tamil/Tanglish phrases.
  if(heardSpeech&&now-lastLoud>900){recorder.stop();return;}
  if(!heardSpeech&&now-speechStart>6500){recorder.stop();return;}
  if(now-speechStart>15000){recorder.stop();return;}
  raf=requestAnimationFrame(speechMeter);
}
async function audioToWav16k(blob){
  const C=window.AudioContext||window.webkitAudioContext,ctx=new C();
  try{
    const audio=await ctx.decodeAudioData(await blob.arrayBuffer()),rate=16000;
    const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    let mono;
    if(Offline){
      // Let WebAudio apply a proper low-pass resampler instead of dropping
      // most source samples, which can blur quiet consonants and numbers.
      const render=new Offline(1,Math.ceil(audio.duration*rate),rate),source=render.createBufferSource();
      source.buffer=audio;source.connect(render.destination);source.start(0);
      mono=(await render.startRendering()).getChannelData(0);
    }else{
      const count=Math.ceil(audio.duration*rate),ratio=audio.sampleRate/rate;mono=new Float32Array(count);
      for(let i=0;i<count;i++){
        const first=Math.floor(i*ratio),last=Math.min(audio.length,Math.ceil((i+1)*ratio));let sum=0,n=0;
        for(let at=first;at<last;at++){for(let channel=0;channel<audio.numberOfChannels;channel++)sum+=audio.getChannelData(channel)[at]||0;n+=audio.numberOfChannels;}
        mono[i]=n?sum/n:0;
      }
    }
    const samples=new Int16Array(mono.length);
    for(let i=0;i<mono.length;i++){const value=mono[i]||0;samples[i]=Math.max(-32768,Math.min(32767,Math.round(value*(value<0?32768:32767))));}
    const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer),write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,samples[i],true);return new Blob([buffer],{type:'audio/wav'});
  }finally{await ctx.close();}
}
async function transcribe(blob){
  const wav=await audioToWav16k(blob),form=new FormData();form.append('audio_file',wav,'kural.wav');
  const response=await fetch('/api/integrations/gnani/transcribe',{method:'POST',body:form}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.detail||'Gnani Prisma transcription failed.');return String(data.transcript||'').trim();
}
async function startCapture(mode){
  if(micStarting||recorder?.state==='recording')return;
  if(mode==='wake'&&(!wakeEnabled||voiceState!=='IDLE'))return;
  if(mode==='command'&&voiceState!=='LISTENING')return;
  if(mode==='command'&&phoneCall?.status==='active')return;
  if(mode==='call-owner'&&(!phoneCall||phoneCall.status!=='active'||phoneCall.micMuted||phoneCall.ownerState!=='LISTENING'))return;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){showVoiceError('இந்த browser-ல் மைக் வசதி இல்லை. Talk அழுத்தி மீண்டும் முயற்சி செய்யுங்க.');return;}
  micStarting=true;
  try{
    const audio={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
    if(selectedMicrophoneId)audio.deviceId={exact:selectedMicrophoneId};
    try{stream=await navigator.mediaDevices.getUserMedia({audio});}
    catch(error){
      if(!selectedMicrophoneId||!['OverconstrainedError','NotFoundError'].includes(error.name))throw error;
      selectedMicrophoneId='';localStorage.removeItem('kadaiKuralMicId');await refreshMicrophoneOptions();
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    }
    if(!microphoneOptionsRefreshedAfterPermission){await refreshMicrophoneOptions();microphoneOptionsRefreshedAfterPermission=true;}
    if((mode==='wake'&&(!wakeEnabled||voiceState!=='IDLE'))||(mode==='command'&&voiceState!=='LISTENING')||(mode==='call-owner'&&(!phoneCall||phoneCall.status!=='active'||phoneCall.micMuted||phoneCall.ownerState!=='LISTENING'))){await stopCapture();return;}
    const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'';
    recorder=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:64000}:{});captureMode=mode;chunks=[];heardSpeech=false;lastLoud=0;
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=async()=>{
      const audio=new Blob(chunks,{type:recorder?.mimeType||'audio/webm'}),hadSpeech=heardSpeech;
      await stopCapture();
      if(!hadSpeech){if(mode==='wake'&&wakeEnabled&&voiceState==='IDLE')setTimeout(()=>startCapture('wake'),180);else if(mode==='command'&&voiceState==='LISTENING')setTimeout(()=>startCapture('command'),180);else if(mode==='call-owner'&&phoneCall?.status==='active'&&!phoneCall.micMuted&&phoneCall.ownerState==='LISTENING')setTimeout(()=>startCapture('call-owner'),180);return;}
      try{
        if(mode==='wake'){
          setVoiceState('THINKING','“Hey Kural” wake phrase-ஐ சரிபார்க்கிறேன்.');
          const text=await transcribe(audio);const normalized=text.toLowerCase().replace(/[^a-z\u0B80-\u0BFF ]/g,' ').replace(/\s+/g,' ').trim();
          const wake=/\bhey\s*(?:kural|குரல்|குறள்)/.test(normalized)||/ஹேய்?\s*(?:குரல்|குறள்)|ஹே\s*குரல்|ஹேகுரல்|கே\s*குரல்|ஏய்\s*குரல்/.test(normalized);
          if(wake){wakeEnabled=false;await beginConversation();return;}
          setVoiceState('IDLE');if(wakeEnabled)setTimeout(()=>startCapture('wake'),180);return;
        }
        if(mode==='call-owner'){
          if(!phoneCall||phoneCall.status!=='active'||voiceState!=='LISTENING')return;
          setVoiceState('THINKING','Call transcript-ஐ backend process செய்கிறது.');setPhoneStates('THINKING','THINKING');
          const text=await transcribe(audio);
          if(!phoneCall||phoneCall.status!=='active')return;
          const oneWordApproval=Boolean(phoneCall.pendingApproval&&(yesAnswer(text)||noAnswer(text)));
          if(!text||(!oneWordApproval&&text.trim().split(/\s+/).length<2)){
            setVoiceState('LISTENING');setPhoneStates('LISTENING','LISTENING');setTimeout(()=>startCapture('call-owner'),180);return;
          }
          addPhoneLine('owner',text);await sendPhoneTurn(text);return;
        }
        // A user command is accepted only for the LISTENING capture that produced it.
        if(voiceState!=='LISTENING')return;
        setVoiceState('LISTENING','மைக் நிறுத்தப்பட்டுள்ளது. Gnani Prisma பேச்சை மாற்றுகிறது…');
        const text=await transcribe(audio);if(voiceState!=='LISTENING')return;
        const singleWordDecision=Boolean(pendingDecision&&(yesAnswer(text)||noAnswer(text)||(pendingDecision.type==='await_order_quantity'&&quantityFrom(text))));
        const singleWordOrder=/^(order|reorder|restock|pannu|pannunga|podu|podunga|பண்ணு|பண்ணுங்க|போடு|போடுங்க|ஆர்டர்)$/i.test(text.trim());
        if(!text||(!singleWordDecision&&!singleWordOrder&&text.trim().split(/\s+/).length<2)){
          showVoiceError('பேச்சு தெளிவாக கேட்கவில்லை. மைக்குக்கு அருகில் இருந்து மீண்டும் சொல்லுங்க.');
          setVoiceState('LISTENING','கேட்டது புரியவில்லை; மீண்டும் சொல்லுங்க.');setTimeout(()=>startCapture('command'),250);return;
        }
        setVoiceState('THINKING','குரலைப் புரிந்துகொண்டு பதில் தயார் செய்கிறேன்.');
        addTranscript(text,'user');await processCommand(text);
      }catch(error){
        if(mode==='call-owner'&&phoneCall?.status==='active'){showPhoneError(error.message);setVoiceState('LISTENING');setPhoneStates('LISTENING','LISTENING');setTimeout(()=>startCapture('call-owner'),500);}
        else if(mode==='command'){
          showVoiceError(`குரலை process செய்ய முடியவில்லை: ${error.message}`);
          setVoiceState('LISTENING','பிழை வந்தது; மீண்டும் சொல்லுங்க.');setTimeout(()=>startCapture('command'),700);
        }
        else{showVoiceError(error.message);setVoiceState('IDLE');armWake();}
      }
    };
    recorder.start();speechStart=performance.now();
    analyserContext=getAudioContext();if(analyserContext.state==='suspended')await analyserContext.resume();analyser=analyserContext.createAnalyser();analyser.fftSize=1024;analyserData=new Float32Array(analyser.fftSize);analyserSource=analyserContext.createMediaStreamSource(stream);analyserSource.connect(analyser);await analyserContext.resume();raf=requestAnimationFrame(speechMeter);
  }catch(error){
    await stopCapture();const message=error.name==='NotAllowedError'?'Browser settings-ல் localhost-க்கு மைக் அனுமதி கொடுங்க.':error.message;
    if(mode==='call-owner'&&phoneCall?.status==='active'){showPhoneError(message);setVoiceState('LISTENING');setPhoneStates('LISTENING','LISTENING');}
    else{showVoiceError(message);setVoiceState('IDLE');}
  }
  finally{micStarting=false;}
}
function armWake(){if(phoneCall&&['ringing','active'].includes(phoneCall.status))return;wakeEnabled=true;if(voiceState==='IDLE')startCapture('wake');}
async function beginConversation(){
  clearVoiceError();pendingDecision=null;unclearCount=0;conversationActive=true;
  try{
    // Backend builds this greeting from the same live database used by inventory and billing.
    const welcome=await api('/api/welcome');
    await speak(welcome.reply);
    setVoiceState('LISTENING');await startCapture('command');
  }
  catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();}
}
async function talk(){
  if(phoneCall&&['ringing','active'].includes(phoneCall.status)){showPhoneError('Call நடக்கிறது. Shop owner phone controls-ஐ பயன்படுத்துங்க.');return;}
  clearVoiceError();wakeEnabled=false;
  if(voiceState==='LISTENING'){conversationActive=false;await stopCapture();setVoiceState('IDLE','மைக் நிறுத்தப்பட்டது. மீண்டும் Talk அழுத்தி தொடங்குங்க.');return;}
  if(voiceState==='IDLE')beginConversation();
}

function yesAnswer(text){return /\b(seri|sari|order\s*panu|aama|ama|yes)\b/i.test(text)||/(ஆம்|ஆமா|சரி|போடுங்க|ஆர்டர்)/.test(text);}
function noAnswer(text){return /\b(venam|vendam|no|illa)\b/i.test(text)||/(இல்ல|வேண்டாம்|வேணாம்)/.test(text);}
function quantityFrom(text){const found=text.match(/\b(\d{1,4})\b/);if(found)return Number(found[1]);const tamilDigits={'௦':'0','௧':'1','௨':'2','௩':'3','௪':'4','௫':'5','௬':'6','௭':'7','௮':'8','௯':'9'};const indic=text.replace(/[௦-௯]/g,d=>tamilDigits[d]).match(/\b(\d{1,4})\b/);if(indic)return Number(indic[1]);const words={oru:1,onnu:1,one:1,rendu:2,irandu:2,two:2,moonnu:3,moonu:3,three:3,naalu:4,nalu:4,four:4,anju:5,aindhu:5,five:5,aaru:6,six:6,ezhu:7,ettu:8,onpathu:9,pathu:10,ten:10};for(const [word,value] of Object.entries(words))if(new RegExp(`\\b${word}\\b`,'i').test(text))return value;const tamilWords={'ஒரு':1,'ஒன்னு':1,'ஒன்று':1,'ரெண்டு':2,'இரண்டு':2,'மூணு':3,'மூன்று':3,'நாலு':4,'நான்கு':4,'அஞ்சு':5,'ஐந்து':5,'ஆறு':6,'ஏழு':7,'எட்டு':8,'ஒன்பது':9,'பத்து':10};for(const [word,value] of Object.entries(tamilWords))if(text.includes(word))return value;return null;}
function latestConfirmedOrder(){return db.orders.find(order=>order.status==='confirmed');}
function isReceipt(text){
  const receiptVerb=/(vandhiruk|vandhuruk|vandhuch|vandhuduch|received|arrived|got\s+(it|delivered)|வந்திருக்க|வந்துருக்கு|வந்துச்சு|வந்துடுச்சு|கிடைச்சிருக்கு)/i.test(text);
  const itemContext=/(mutta|moottai|mootai|bag|kg|litre|rice|arisi|sugar|seeni|oil|ennai|dal|paruppu|அரிசி|சர்க்கரை|எண்ணெய்|பருப்பு|மூட்டை|order|item|சரக்கு|ஆர்டர்)/i.test(text);
  return receiptVerb&&(itemContext||Boolean(latestConfirmedOrder()));
}
function isStockQuestion(text){return /(stock|ஸ்டாக்|இருப்பு|arisi|rice|அரிசி|mutta|மூட்டை|sugar|seeni|சர்க்கரை|cooking\s*oil|oil|ennai|எண்ணெய்|dal|paruppu|பருப்பு)/i.test(text);}
function productIdFromSpeech(text){const t=text.toLowerCase();if(/sugar|seeni|சர்க்கரை/.test(t))return 'sugar';if(/cooking\s*oil|sunflower|oil|ennai|எண்ணெய்/.test(t))return 'oil';if(/dal|paruppu|துவரம்|பருப்பு/.test(t))return 'dal';if(/rice|arisi|அரிசி|மூட்டை|mutta/.test(t))return 'rice';return null;}
function unitTamil(p){return ({rice:'மூட்டை',sugar:'கிலோ',oil:'லிட்டர்',dal:'கிலோ'}[p?.id]||p?.unit||'');}
function itemTamil(p){return p?.tamil||p?.name||'பொருள்';}
async function processCommand(text){
  clearVoiceError();const normalized=text.toLowerCase();
  if(pendingDecision){
    const decision=pendingDecision;pendingDecision=null;
    if(decision.type==='await_order_quantity'){
      if(noAnswer(text)){await finishAndIdle('சரி, ஆர்டர் கேட்கல.');return;}
      const quantity=quantityFrom(text), productId=decision.product_id||'rice';
      if(!quantity){pendingDecision=decision;await sayThenListen(`எத்தனை ${unitTamil(product(productId))} ஆர்டர் கேட்கட்டும்?`);return;}
      await requestSupplierQuote(quantity,productId);return;
    }
    if(yesAnswer(text)){
      if(decision.type==='receipt'){
        try{const result=await api('/api/shop/stock-receipt','POST',{product_id:'rice',quantity:decision.quantity});await refreshState();await finishAndIdle(`சரி, ${result.added} மூட்டை அரிசி ஸ்டாக்ல சேர்த்துட்டேன். இப்போ ${result.stock} மூட்டை இருக்கு.`);}
        catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();}return;
      }
      if(decision.type==='receive_order'){
        try{await api(`/api/shop/orders/${decision.order_id}/receive`,'POST',{});await refreshState();await finishAndIdle(`${decision.quantity} மூட்டை அரிசி வந்துச்சுன்னு பதிவு பண்ணிட்டேன். ஸ்டாக் அப்டேட் ஆயிடுச்சு; இப்போ ${product('rice').stock} மூட்டை இருக்கு.`);}
        catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();}return;
      }
      if(decision.type==='supplier_order'){
        try{
          await api(`/api/shop/orders/${decision.order_id}/confirm`,'POST',{});await refreshState();
          // Owner approval authorizes the purchase; call again to tell the
          // wholesaler to finalize it before returning to the dashboard.
          await startPhoneCall({order_id:decision.order_id});
        }catch(error){showVoiceError(`ஆர்டர் உறுதி செய்ய முடியவில்லை: ${error.message}`);setVoiceState('IDLE');armWake();}return;
      }
      await requestSupplierQuote(decision.quantity||10,decision.product_id||'rice');return;
    }
    if(noAnswer(text)){
      if(decision.type==='supplier_order'){
        try{await api(`/api/shop/orders/${decision.order_id}`,'DELETE');await refreshState();await finishAndIdle('சரி முருகன், அந்த ஆர்டரை போடல.');}
        catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();}return;
      }
      await finishAndIdle('சரி, இப்போதைக்கு எதுவும் செய்யல.');return;
    }
    unclearCount++;
    if(unclearCount===1){pendingDecision=decision;await sayThenListen(decision.type==='supplier_order'?'சப்ளையர் சொன்ன விலைக்கு ஆர்டர் போடட்டுமா? ஆம் அல்லது வேண்டாம் சொல்லுங்க.':'சரி, ஆர்டர் உறுதி செய்யட்டுமா? ஆம் அல்லது வேண்டாம் சொல்லுங்க.');return;}
    await finishAndIdle('சரி, தெளிவாகக் கேட்கல. பின்னாடி பேசலாம்.');return;
  }
  if(isReceipt(normalized)){
    try{const result=await api('/api/chat','POST',{message:text,history:[]});await refreshState();await finishAndIdle(result.reply);}
    catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();}return;
  }
  if(/\b(order|reorder|restock|pannu|pannunga|podu|podunga)\b|ஆர்டர்|ரீஸ்டாக்|மீண்டும் வாங்க|பண்ணு|பண்ணுங்க|போடு|போடுங்க|வாங்கு/i.test(normalized)){
    const quantity=quantityFrom(normalized);
    const productId=productIdFromSpeech(normalized)||'rice';
    if(!quantity){pendingDecision={type:'await_order_quantity',product_id:productId};await sayThenListen(`எத்தனை ${unitTamil(product(productId))} ${itemTamil(product(productId))} ஆர்டர் கேட்கட்டும்?`);return;}
    await requestSupplierQuote(quantity,productId);return;
  }
  if(/sold\s*1|sale|விற்ற|போட்டேன்|bill/i.test(normalized)){await sellProduct(productIdFromSpeech(normalized)||'rice');return;}
  if(isStockQuestion(normalized)){try{const result=await api('/api/chat','POST',{message:text,history:[]});await finishAndIdle(result.reply);}catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();}return;}
  await finishAndIdle('ஸ்டாக் கேட்கலாம், பில் போடலாம், சப்ளையரிடம் விலை விசாரிக்கலாம், இல்ல வந்த சரக்கைப் பதிவு செய்யலாம்.');
}
async function finishAndIdle(text){
  try{await speak(text);}catch(error){showVoiceError(error.message);}
  if(conversationActive){setVoiceState('LISTENING');await startCapture('command');}
  else{setVoiceState('IDLE');armWake();}
}
function updatePreview(quantity){
  const preview=document.getElementById('receipt-preview');if(preview){preview.hidden=false;preview.textContent=`சரிபார்க்கவும்: பொன்னி அரிசி · ${quantity} மூட்டை. “ஆம்” சொன்னால் மட்டும் ஸ்டாக் சேர்க்கப்படும்.`;}
}
function setPhoneStates(owner, wholesaler){
  if(!phoneCall)return;
  phoneCall.ownerState=owner;phoneCall.wholesalerState=wholesaler;syncPhoneUI();
}
function showPhoneError(message){const el=document.getElementById('phone-call-error');if(el){el.textContent=message;el.hidden=false;}console.error(message);}
function addPhoneLine(who,text){
  if(!phoneCall)return;
  (who==='owner'?phoneCall.ownerLines:phoneCall.wholesalerLines).push(text);syncPhoneUI();
}
function renderPhoneLines(element,lines,label){
  if(!element)return;element.innerHTML='';
  if(!lines.length){element.innerHTML=`<div class="phone-empty">${label}</div>`;return;}
  for(const entry of lines){const item=typeof entry==='string'?{speaker:'',text:entry}:entry;const line=document.createElement('div');line.className=`phone-transcript-line ${item.speaker==='Kadai Kural'?'agent-line':''}`;if(item.speaker){const speaker=document.createElement('small');speaker.className='phone-line-speaker';speaker.textContent=item.speaker;line.appendChild(speaker);}const words=document.createElement('span');words.textContent=item.text;line.appendChild(words);element.appendChild(line);}
  element.scrollTop=element.scrollHeight;
}
function syncPhoneUI(){
  if(!document.getElementById('wholesaler-phone'))return;
  const wState=document.getElementById('wholesaler-call-state'),oState=document.getElementById('owner-call-state');
  const incoming=phoneCall?.status==='ringing',active=phoneCall?.status==='active',ended=phoneCall?.status==='ended';
  if(wState)wState.textContent=!phoneCall?'தயார்':incoming?'உள்வரும் அழைப்பு…':active?({SPEAKING:'பதில் சொல்கிறார்',THINKING:'பதில் தயார் செய்கிறார்',LISTENING:'கேட்கிறார்'}[phoneCall.wholesalerState]||'Call active'):'Call ended';
  if(oState)oState.textContent=!phoneCall?'தொலைபேசி தயாராக உள்ளது':incoming?'சப்ளையருக்கு அழைக்கிறது…':active?(phoneCall.ownerState==='SPEAKING'?'கடை குரல் பேசுகிறது':phoneCall.wholesalerState==='SPEAKING'?'சப்ளையர் பதில் சொல்கிறார்':'உரையாடல் நடக்கிறது'):'அழைப்பு முடிந்தது';
  const ownerCaption=document.getElementById('owner-live-caption'),supplierCaption=document.getElementById('wholesaler-live-caption');
  if(ownerCaption)ownerCaption.textContent=incoming?'சப்ளையருக்கு அழைப்பு செல்கிறது…':active?phoneCall.ownerState==='SPEAKING'?'கடை குரல் சப்ளையரிடம் பேசுகிறது…':phoneCall.wholesalerState==='SPEAKING'?'சப்ளையர் பதில் சொல்கிறார்…':phoneCall.ownerState==='THINKING'?'பதிலை தயார் செய்கிறது…':'அழைப்பு இணைந்தது':ended?'அழைப்பு முடிந்தது':'ஆரம்பிக்கத் தயாராக உள்ளது';
  if(supplierCaption)supplierCaption.textContent=incoming?'அழைப்பு வருகிறது…':active?phoneCall.wholesalerState==='SPEAKING'?'முருகன் கடைக்குப் பதில் சொல்கிறார்…':phoneCall.wholesalerState==='THINKING'?'விலை மற்றும் ஸ்டாக் பார்க்கிறார்…':'அழைப்பு இணைந்தது':ended?'அழைப்பு முடிந்தது':'அழைப்பு தொடங்க காத்திருக்கிறது';
  const callStatus=document.getElementById('phone-call-status');if(callStatus)callStatus.textContent=incoming?'Calling…':active?'Connected':ended?'Ended':'Ready';
  for(const speaker of [document.getElementById('phone-speaker'),document.getElementById('owner-phone-speaker')])if(speaker){speaker.classList.toggle('is-muted',Boolean(phoneCall&&!phoneCall.speakerEnabled));speaker.innerHTML=`${phoneCall?.speakerEnabled===false?'🔇':'🔊'}<small>Speaker</small>`;}
  for(const start of document.querySelectorAll('[data-call-action="start"]')){start.disabled=Boolean(phoneCall&&['ringing','active'].includes(phoneCall.status));start.textContent=phoneCall&&['ringing','active'].includes(phoneCall.status)?'☎  Call in progress':'☎  Call wholesaler';}
  const answerPhone=document.getElementById('owner-phone'),supplierPhone=document.getElementById('wholesaler-phone');
  supplierPhone?.classList.toggle('is-ringing',incoming);answerPhone?.classList.toggle('is-active',active);supplierPhone?.classList.toggle('is-speaking',active&&phoneCall.wholesalerState==='SPEAKING');answerPhone?.classList.toggle('owner-speaking',active&&phoneCall.ownerState==='SPEAKING');
  renderPhoneLines(document.getElementById('owner-call-log'),phoneCall?.ownerLines||[],'உங்க பேச்சும் Kadai Kural பதிலும் இங்கே வரும்.');
  renderPhoneLines(document.getElementById('wholesaler-call-log'),phoneCall?.wholesalerLines||[],'Wholesaler பேசும் வரிகள் இங்கே வரும்.');
  if(active&&phoneCall.startedAt){const elapsed=Math.floor((Date.now()-phoneCall.startedAt)/1000),time=document.getElementById('phone-call-duration');if(time)time.textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;}
}
async function startPhoneCall(options={}){
  if(callStarting||phoneCall&&['ringing','active'].includes(phoneCall.status))return;
  callStarting=true;
  wakeEnabled=false;await stopCapture();clearVoiceError();
  const previousError=document.getElementById('phone-call-error');if(previousError){previousError.textContent='';previousError.hidden=true;}
  try{
    const result=await api('/api/phone-calls/start','POST',{order_id:options.order_id||null});
    phoneCall={id:result.call_id,status:result.status,ownerState:'IDLE',wholesalerState:'CALLING',order:result.order||null,pendingApproval:false,micMuted:false,speakerEnabled:true,ownerLines:[],wholesalerLines:[],startedAt:null,busy:false};
    setVoiceState('IDLE');go('call');
    if(phoneTimer)clearInterval(phoneTimer);phoneTimer=setInterval(syncPhoneUI,1000);
    if(ringTimer)clearInterval(ringTimer);ringPulse();ringTimer=setInterval(()=>{if(phoneCall?.status==='ringing')ringPulse();else{clearInterval(ringTimer);ringTimer=null;}},2100);
    if(answerTimer)clearTimeout(answerTimer);answerTimer=setTimeout(()=>{answerTimer=null;if(phoneCall?.status==='ringing')answerPhoneCall();},1600);
  }catch(error){if(activePage!=='call')go('call');showPhoneError(error.message);syncPhoneUI();}
  finally{callStarting=false;}
}
async function speakWholesaler(text){
  if(!phoneCall||phoneCall.status!=='active')return;
  setVoiceState('SPEAKING','Wholesaler பதில் ஒலிக்கிறது; மைக் நிறுத்தப்பட்டுள்ளது.');setPhoneStates('THINKING','SPEAKING');addPhoneLine('wholesaler',text);syncPhoneUI();
  await queueTTS(text,'Asmita',()=>Boolean(phoneCall&&phoneCall.status==='active'&&phoneCall.speakerEnabled));
}
function ownerAcknowledgement(text){
  if(phoneCall?.pendingApproval){
    if(noAnswer(text))return 'சரி, இந்த ஆர்டரை வேண்டாம்னு சொல்றேன்.';
    if(yesAnswer(text))return 'சரி, இந்த ஆர்டரை உறுதி செய்யச் சொல்றேன்.';
  }
  const quantity=quantityFrom(text);
  if(quantity){const p=product(productIdFromSpeech(text)||phoneCall?.order?.product_id||'rice');return `சரி, ${quantity} ${unitTamil(p)} ${itemTamil(p)} கேட்டிருக்கீங்க. இதுக்கு விலையும் டெலிவரி நேரமும் கேட்கிறேன்.`;}
  if(phoneCall?.order&&text.match(/\d/))return 'சரி, இந்த அளவுக்கு விலையும் டெலிவரி நேரமும் கேட்கிறேன்.';
  return 'சரி, இதை சப்ளையர்கிட்ட கேட்கிறேன்.';
}
async function speakOwnerAgent(text){
  if(!phoneCall||phoneCall.status!=='active')return;
  setVoiceState('SPEAKING','கடை குரல் பதில் ஒலிக்கிறது; மைக் நிறுத்தப்பட்டுள்ளது.');setPhoneStates('SPEAKING','THINKING');
  phoneCall.ownerLines.push({speaker:'Kadai Kural',text});syncPhoneUI();
  try{await queueTTS(text,undefined,()=>Boolean(phoneCall&&phoneCall.status==='active'&&phoneCall.speakerEnabled));}
  catch(error){showPhoneError(`Kadai Kural Timbre: ${error.message}`);}
}
async function returnToOwnerDashboard(order){
  if(!phoneCall||phoneCall.completionHandled)return;
  phoneCall.completionHandled=true;const callId=phoneCall.id;
  phoneCall.status='ended';phoneCall.ownerState='IDLE';phoneCall.wholesalerState='IDLE';
  await stopCapture();stopCurrentPlayback?.();
  if(phoneTimer){clearInterval(phoneTimer);phoneTimer=null;}if(ringTimer){clearInterval(ringTimer);ringTimer=null;}if(answerTimer){clearTimeout(answerTimer);answerTimer=null;}
  try{await api(`/api/phone-calls/${callId}/end`,'POST',{});}catch(error){console.warn('Call session close failed.',error);}
  setVoiceState('IDLE');go('dashboard');await refreshState();
  const quantity=order?.quantity||order?.qty||phoneCall.order?.quantity||phoneCall.order?.qty||0;
  const productId=order?.productId||order?.product_id||phoneCall.order?.product_id||phoneCall.order?.productId||'rice';
  const callProduct=product(productId), productName=itemTamil(callProduct), unit=unitTamil(callProduct);
  let message;
  if(order?.status==='quoted'){
    const quote=db.orders.find(item=>item.id===order.id),unitCost=Number(quote?.unitCost??order.unit_cost??0),total=unitCost*quantity;
    pendingDecision={type:'supplier_order',order_id:order.id,quantity,product_id:productId};unclearCount=0;
    message=`முருகன், சப்ளையர் ${quantity} ${unit} ${productName} தர்றேன்னு சொல்றார். ஒரு ${unit} ${unitCost} ரூபா; மொத்தம் ${total} ரூபா. நாளைக்கு அனுப்புவாராம். ஆர்டரை உறுதி பண்ணட்டுமா?`;
  }else if(order?.status==='confirmed'){
    pendingDecision=null;
    message=`சரி முருகன், ${quantity} ${unit} ${productName} ஆர்டர் உறுதி ஆயிடுச்சு. சரக்கு வந்ததும் ${productName} வந்துடுச்சுன்னு சொல்லுங்க; ஸ்டாக்ல சேர்த்துடுவேன்.`;
  }else{
    pendingDecision={type:'await_order_quantity',product_id:productId};
    message=`சப்ளையர் ${productName} ஸ்டாக்கும் விலையும் சொன்னார். எத்தனை ${unit} ஆர்டர் கேட்கட்டும்?`;
  }
  await sayThenListen(message);
}
async function answerPhoneCall(){
  if(!phoneCall||phoneCall.status!=='ringing'||phoneCall.busy)return;
  if(answerTimer){clearTimeout(answerTimer);answerTimer=null;}
  phoneCall.busy=true;syncPhoneUI();
  try{
    if(ringTimer){clearInterval(ringTimer);ringTimer=null;}
    phoneCall.status='active';phoneCall.startedAt=Date.now();syncPhoneUI();
    const quantity=phoneCall.order?.quantity||phoneCall.order?.qty;
    const alreadyApproved=phoneCall.order?.status==='confirmed';
    const orderProduct=product(phoneCall.order?.product_id||phoneCall.order?.productId||'rice');
    const productName=itemTamil(orderProduct), unit=unitTamil(orderProduct);
    const buyerLine=alreadyApproved
      ?`வணக்கம் சார், நான் ஸ்ரீ முருகன் ஸ்டோர்ஸ்ல இருந்து முருகன் பேசுறேன். ${quantity||10} ${unit} ${productName}க்கான விலையை என் உரிமையாளர் ஒப்புக்கிட்டார். ஆர்டரை உறுதி செய்து நாளைக்கு அனுப்பி வைங்க.`
      :quantity
      ?`வணக்கம் சார், நான் ஸ்ரீ முருகன் ஸ்டோர்ஸ்ல இருந்து முருகன் பேசுறேன். ${quantity} ${unit} ${productName} ஸ்டாக்ல இருக்கா? ஒரு ${unit} விலை என்ன?`
      :'வணக்கம் சார், நான் ஸ்ரீ முருகன் ஸ்டோர்ஸ்ல இருந்து முருகன் பேசுறேன். '+productName+' ஸ்டாக்ல இருக்கா? ஒரு '+unit+' விலை என்ன?';
    setPhoneStates('SPEAKING','THINKING');await speakOwnerAgent(buyerLine);
    setVoiceState('THINKING','சப்ளையர் ஸ்டாக் மற்றும் விலையைச் சரிபார்க்கிறார்.');setPhoneStates('THINKING','THINKING');
    const result=await api(`/api/phone-calls/${phoneCall.id}/answer`,'POST',{});
    phoneCall.generatedBy=result.generated_by;phoneCall.supplierReply=result.reply;
    await speakWholesaler(result.reply);
    if(phoneCall?.status==='active'){
      await speakOwnerAgent(alreadyApproved?'நன்றி சார். நாளைக்கு அனுப்பி வைங்க.':'சரி சார், ஒரு நிமிஷம். என் கடை உரிமையாளர்கிட்ட கேட்டு உறுதி செய்து சொல்றேன்.');
      await returnToOwnerDashboard(phoneCall.order);
    }
  }catch(error){showPhoneError(error.message);}
  finally{if(phoneCall)phoneCall.busy=false;syncPhoneUI();}
}
async function sendPhoneTurn(text){
  if(!phoneCall||phoneCall.status!=='active'||phoneCall.busy)return;
  const callId=phoneCall.id;phoneCall.busy=true;const ack=ownerAcknowledgement(text);await speakOwnerAgent(ack);if(!phoneCall||phoneCall.id!==callId||phoneCall.status!=='active')return;setVoiceState('THINKING','சப்ளையர் பதிலுக்காக காத்திருக்கிறேன்.');setPhoneStates('THINKING','THINKING');
  try{
    const result=await api(`/api/phone-calls/${callId}/turn`,'POST',{text});
    if(!phoneCall||phoneCall.id!==callId||phoneCall.status!=='active')return;
    phoneCall.pendingApproval=Boolean(result.pending_approval);phoneCall.order=result.order||phoneCall.order;phoneCall.generatedBy=result.generated_by;
    await speakWholesaler(result.reply);
    if(phoneCall?.id===callId&&phoneCall.status==='active'&&phoneCall.order?.status==='confirmed'&&!phoneCall.pendingApproval){await returnToOwnerDashboard(phoneCall.order);return;}
    if(phoneCall?.id===callId&&phoneCall.status==='active'){setVoiceState('LISTENING');setPhoneStates('LISTENING','LISTENING');await startCapture('call-owner');}
  }catch(error){
    if(phoneCall?.id===callId&&phoneCall.status==='active'){showPhoneError(error.message);setVoiceState('LISTENING');setPhoneStates('LISTENING','LISTENING');setTimeout(()=>startCapture('call-owner'),350);}
  }finally{if(phoneCall?.id===callId)phoneCall.busy=false;}
}
async function endPhoneCall(){
  if(!phoneCall)return;
  const callId=phoneCall.id;phoneCall.status='ended';phoneCall.ownerState='IDLE';phoneCall.wholesalerState='IDLE';
  await stopCapture();stopCurrentPlayback?.();if(phoneTimer){clearInterval(phoneTimer);phoneTimer=null;}if(ringTimer){clearInterval(ringTimer);ringTimer=null;}if(answerTimer){clearTimeout(answerTimer);answerTimer=null;}
  try{await api(`/api/phone-calls/${callId}/end`,'POST',{});}catch(error){showPhoneError(error.message);}
  setVoiceState('IDLE');syncPhoneUI();
}
async function toggleOwnerMute(){
  if(!phoneCall||phoneCall.status!=='active')return;
  phoneCall.micMuted=!phoneCall.micMuted;
  if(phoneCall.micMuted){await stopCapture();phoneCall.ownerState=phoneCall.wholesalerState==='SPEAKING'?'THINKING':'LISTENING';syncPhoneUI();}
  else if(phoneCall.ownerState==='LISTENING'){setVoiceState('LISTENING');startCapture('call-owner');}
  syncPhoneUI();
}
function toggleCallSpeaker(){
  if(!phoneCall)return;phoneCall.speakerEnabled=!phoneCall.speakerEnabled;
  if(!phoneCall.speakerEnabled)stopCurrentPlayback?.();syncPhoneUI();
}
async function sellProduct(productId='rice'){
  try{
    wakeEnabled=false;await stopCapture();setVoiceState('THINKING','பில்லிங் ஸ்டாக்கை புதுப்பிக்கிறேன்.');
    const selected=product(productId);if(!selected)throw new Error('பொருளை கண்டுபிடிக்க முடியவில்லை.');
    const result=await api('/api/shop/sales','POST',{items:[{product_id:productId,quantity:1}]});await refreshState();
    const alert=result.low_stock_alerts?.find(item=>item.product_id===productId);
    if(alert){go('dashboard');pendingDecision={type:'order',product_id:productId,quantity:alert.suggested_quantity};unclearCount=0;await sayThenListen(`${alert.tamil_name} ஸ்டாக் ${alert.stock} ${alert.unit_tamil}தான் இருக்கு. ${alert.suggested_quantity} ${alert.unit_tamil} ஆர்டர் கேட்கட்டுமா?`);return;}
    const updated=product(productId);await finishAndIdle(`பில் போட்டாச்சு. இப்போ ${updated.tamil} ${updated.stock} ${unitTamil(updated)} இருக்கு.`);
  }catch(error){showVoiceError(error.message);setVoiceState('IDLE');armWake();}
}
async function sellOneRice(){return sellProduct('rice');}
async function requestSupplierQuote(quantity, productId='rice'){
  try{
    setVoiceState('THINKING','சப்ளையரிடம் ஸ்டாக் மற்றும் விலையை விசாரிக்கிறேன்.');
    const order=await api('/api/shop/orders','POST',{product_id:productId,quantity});
    await api(`/api/shop/orders/${order.id}/quote`,'POST',{});
    await refreshState();
    // First simulate the supplier call and collect its quote. The owner only
    // confirms the purchase after hearing the quote back on the dashboard.
    await startPhoneCall({order_id:order.id});
  }catch(error){showVoiceError(`ஆர்டர் உறுதி செய்ய முடியவில்லை: ${error.message}`);setVoiceState('IDLE');armWake();}
}

function submitTyped(text){
  if(phoneCall&&['ringing','active'].includes(phoneCall.status)){showPhoneError('Call நடக்கிறது. பேசுவதற்கு owner phone-ஐ பயன்படுத்துங்க.');return;}
  text=(text||document.getElementById('voice-stage-input')?.value||'').trim();if(!text)return;
  document.getElementById('voice-stage-input').value='';
  wakeEnabled=false;stopCapture();
  if(voiceState==='IDLE'||voiceState==='LISTENING'){
    conversationActive=true;addTranscript(text,'user');setVoiceState('THINKING');
    processCommand(text).catch(error=>{showVoiceError(`கடை உதவியாளர் பதில் தர முடியவில்லை: ${error.message}`);setVoiceState('IDLE');armWake();});
  }
}

document.addEventListener('click',async event=>{
  if(event.target.closest('#mic-btn')){talk();return;}
  const callAction=event.target.closest('[data-call-action]');
  if(callAction){
    const action=callAction.dataset.callAction;
    if(action==='start')await startPhoneCall();
    else if(action==='answer')await answerPhoneCall();
    else if(action==='end')await endPhoneCall();
    else if(action==='mic')await toggleOwnerMute();
    else if(action==='speaker')toggleCallSpeaker();
    return;
  }
  const target=event.target.closest('[data-action]');if(target?.dataset.action==='toggle-voice'){talk();return;}
  if(target?.dataset.action==='test-gnani'){await testGnani();return;}
  const replay=event.target.closest('[data-speak]');if(replay){try{await speak(replay.dataset.speak);}catch(error){showVoiceError(error.message);setVoiceState('IDLE');}}
});
document.addEventListener('submit',event=>{if(event.target?.id==='voice-stage-form'){event.preventDefault();submitTyped(document.getElementById('voice-stage-input')?.value);}});
document.addEventListener('change',async event=>{
  if(event.target?.id!=='microphone-select')return;
  const previousMode=captureMode,wasRecording=recorder?.state==='recording';
  selectedMicrophoneId=event.target.value;localStorage.setItem('kadaiKuralMicId',selectedMicrophoneId);
  if(wasRecording){await stopCapture();if(previousMode==='wake'&&wakeEnabled)setTimeout(()=>startCapture('wake'),150);else if(previousMode==='command'&&voiceState==='LISTENING')setTimeout(()=>startCapture('command'),150);}
});
document.addEventListener('click',event=>{const sold=event.target.closest('[data-sold-product]');if(sold)sellProduct(sold.dataset.soldProduct);});
submitChat=function(text){submitTyped(text||document.getElementById('assistant-input')?.value||'');const input=document.getElementById('assistant-input');if(input)input.value='';};

async function testGnani(){
  const button=document.getElementById('test-gnani'),out=document.getElementById('gnani-result'),player=document.getElementById('gnani-audio');if(!button||!out)return;
  button.disabled=true;out.className='connection-result pending';out.textContent='Gnani Timbre-ஐ சோதிக்கிறேன்…';
  try{const result=await api('/api/integrations/gnani/test','POST',{});player.src=`data:${result.content_type};base64,${result.audio}`;player.hidden=false;await player.play();out.className='connection-result success';out.textContent='Gnani TTS வேலை செய்கிறது.';}
  catch(error){out.className='connection-result failure';out.textContent=error.message;}
  finally{button.disabled=false;}
}

window.addEventListener('load',()=>{
  setVoiceState('IDLE');
  refreshMicrophoneOptions();
  refreshState().catch(error=>showVoiceError(`Shop database load ஆகவில்லை: ${error.message}`));
  // A user gesture is required once by browsers before automatic speech.
  document.addEventListener('pointerdown',()=>{try{const ctx=getAudioContext();if(ctx.state==='suspended')ctx.resume();}catch{}},{once:true});
  // Wake listening arms after a short delay; no greeting is spoken on page load.
  setTimeout(()=>{armWake();},500);
});
