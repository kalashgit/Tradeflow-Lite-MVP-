/* TradeFlow spoken replies v1. Saved-text playback only; no command execution. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TradeFlowSpeech=api})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const scopeKey=value=>JSON.stringify(value||null);
 function createPlayback({readContext,readTurn,getCode,fetchImpl=fetch,AudioContextImpl,emit=()=>{},onFeatures=()=>{}}){
  const tickets=new Map();let generation=0,active=null,unlockedAudio=null,state={status:'idle',turnId:null,message:''},disposed=false;
  const current=(operation=active)=>!disposed&&operation&&active===operation&&active.generation===generation&&active.scope===scopeKey(readContext())&&readTurn(active.turnId)?.status==='committed';
  function update(status,message='',turnId=state.turnId){state={status,message,turnId};emit(Object.freeze({...state}))}
  function stop(reason='Playback stopped.'){
   generation++;
   const old=active;active=null;
   if(old){old.abort.abort();clearInterval(old.meter);try{old.source?.stop()}catch{}try{old.source?.disconnect();old.analyser?.disconnect()}catch{}if(old.audio!==unlockedAudio)void old.audio.close().catch(()=>{})}
   onFeatures(Object.freeze({version:1,source:'assistant_playback',active:false,rms:0,peak:0,spectralCentroidHz:0,at:Date.now()}));
   update('idle',reason);
  }
  function register(turn,ticket){
   const context=readContext();
   if(!turn||turn.role!=='assistant'||turn.status!=='committed'||typeof turn.content!=='string'||ticket?.version!==1||turn.id!==ticket.turnId||turn.threadId!==ticket.threadId||context.threadId!==ticket.threadId||! /^[a-f0-9]{64}$/.test(ticket.textSha256||'')||! /^[\w-]{40,60}$/.test(ticket.ticket||''))return false;
   tickets.set(turn.id,{...ticket,scope:scopeKey(context)});while(tickets.size>32)tickets.delete(tickets.keys().next().value);return true;
  }
  async function speak(turnId){
   if(disposed)return;
   stop('');
   const context=readContext(),turn=readTurn(turnId),ticket=tickets.get(turnId);
   if(!turn||turn.role!=='assistant'||turn.status!=='committed'||turn.threadId!==context.threadId||ticket?.scope!==scopeKey(context)||ticket.expiresAt<=Date.now())return update('unavailable','Speech is unavailable for this saved reply. Send a new question.',turnId);
   if(!AudioContextImpl)return update('unavailable','Audio playback is unavailable. The text answer remains available.',turnId);
   let audio;
   try{
    // Runs synchronously from the click, before network awaits: explicit iOS audio unlock.
    audio=unlockedAudio||new AudioContextImpl();const unlocking=audio.resume();
    const operation={generation,scope:scopeKey(context),turnId,audio,abort:new AbortController()};active=operation;
    update('preparing','Preparing local speech…',turnId);
    await unlocking;if(!current(operation))return;
    const bytes=new TextEncoder().encode(turn.content),hash=await crypto.subtle.digest('SHA-256',bytes);
    const textHash=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
    if(textHash!==ticket.textSha256)throw Error('Saved reply changed. Speech cancelled.');
    if(!current(operation))return;
    const response=await fetchImpl('/api/ai/speech/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:operation.abort.signal,
     body:JSON.stringify({code:getCode(),ticket:ticket.ticket,threadId:turn.threadId,turnId,textSha256:textHash})});
    if(!current(operation))return;
    if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Local speech is unavailable. Use the text answer.')}
    if(response.headers.get('Content-Type')!=='audio/wav'||response.headers.get('X-TradeFlow-Text-SHA256')!==textHash)throw Error('Speech response does not match the saved reply.');
    const raw=await response.arrayBuffer();if(raw.byteLength>9000000)throw Error('Speech response too large.');
    const buffer=await audio.decodeAudioData(raw);if(!current(operation))return;
    const source=audio.createBufferSource(),analyser=audio.createAnalyser();analyser.fftSize=1024;
    source.buffer=buffer;source.connect(analyser);analyser.connect(audio.destination);
    operation.source=source;operation.analyser=analyser;
    const samples=new Float32Array(analyser.fftSize),bins=new Uint8Array(analyser.frequencyBinCount);
    operation.meter=setInterval(()=>{
     if(active!==operation)return;
     if(!current(operation)){stop('Context changed; playback cancelled.');return}
     analyser.getFloatTimeDomainData(samples);analyser.getByteFrequencyData(bins);
     let sum=0,peak=0,weight=0,mass=0;
     for(const x of samples){sum+=x*x;peak=Math.max(peak,Math.abs(x))}
     for(let i=0;i<bins.length;i++){mass+=bins[i];weight+=bins[i]*i*audio.sampleRate/analyser.fftSize}
     onFeatures(Object.freeze({version:1,source:'assistant_playback',active:true,rms:Math.sqrt(sum/samples.length),peak,spectralCentroidHz:mass?weight/mass:0,at:Date.now()}));
    },50);
    source.onended=()=>{if(active===operation)stop('Reply finished.')};
    source.start();update('speaking','Speaking saved reply.',turnId);
   }catch(error){
    // Old promises must never stop or relabel a newer generation.
    if(audio&&active?.audio!==audio)return;
    stop('');if(error.name!=='AbortError')update('unavailable',error.message||'Speech unavailable; use text.',turnId);
   }
  }
  return {register,speak,stop,unlock(){if(!AudioContextImpl)return Promise.reject(Error('Audio unavailable'));try{unlockedAudio=unlockedAudio||new AudioContextImpl();return unlockedAudio.resume()}catch(error){return Promise.reject(error)}},releaseAudio(){stop('');const old=unlockedAudio;unlockedAudio=null;if(old)void old.close().catch(()=>{})},getState:()=>({...state}),has:id=>tickets.has(id),contextChanged(){if(active&&!current())stop('Context changed; playback cancelled.')},dispose(){disposed=true;stop('');const old=unlockedAudio;unlockedAudio=null;if(old)void old.close().catch(()=>{});tickets.clear()}};
 }
 let playback=null,readContext=null;
 function paint(state){
  if(typeof document==='undefined')return;
  for(const box of document.querySelectorAll('[data-speech-controls]')){
   const mine=box.dataset.speechControls===state.turnId,button=box.querySelector('[data-speech-speak]'),stop=box.querySelector('[data-speech-stop]'),status=box.querySelector('[role="status"]');
   const busy=mine&&['preparing','speaking'].includes(state.status);
   if(button)button.disabled=busy;if(stop)stop.hidden=!busy;if(status)status.textContent=mine?state.message:'';
  }
 }
 function connect(host){
  playback?.dispose();readContext=host.readContext;
  playback=createPlayback({...host,AudioContextImpl:rootAudio(),emit:paint,onFeatures:features=>{
   // Read-only port for the approved orb renderer. No artistic geometry or fake level data.
   window.dispatchEvent(new CustomEvent('tradeflow:speech-features',{detail:features}));
  }});return playback;
 }
 function rootAudio(){return typeof window==='object'&&(window.AudioContext||window.webkitAudioContext)}
 if(typeof document==='object'){
  document.addEventListener('click',event=>{
   const speak=event.target.closest('[data-speech-speak]'),stop=event.target.closest('[data-speech-stop]');
   if(speak){event.preventDefault();void playback?.speak(speak.dataset.speechSpeak)}
   if(stop){event.preventDefault();playback?.stop()}
   if(event.target.closest('[data-tab],[data-action="tfAiNewThread"],[data-action="tfAiClear"],[data-action="tfAiLock"]'))playback?.stop('Context changed; playback cancelled.');
  },true);
  document.addEventListener('submit',event=>{if(['tfAiChatForm','tfAiQuickForm'].includes(event.target.id))playback?.stop('New question; playback stopped.')},true);
  document.addEventListener('change',event=>{if(event.target.id==='tfAiThreadPicker')playback?.stop('Conversation changed; playback stopped.')},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)playback?.stop('Page hidden; playback stopped.')});
  window.addEventListener('pagehide',()=>playback?.stop('Page closed.'));
 }
 return {version:1,createPlayback,connect,register:(...args)=>playback?.register(...args),refresh(){playback?.contextChanged();if(playback)paint(playback.getState())},stop:reason=>playback?.stop(reason),
  controls(turnId){return /^[\w-]{1,120}$/.test(turnId)&&playback?.has(turnId)?'<div class="tf-speech-controls" data-speech-controls="'+turnId+'"><button type="button" data-speech-speak="'+turnId+'">Listen to reply</button><button type="button" data-speech-stop hidden>Stop speech</button><span role="status" aria-live="polite"></span></div>':''},
  speak:turnId=>playback?.speak(turnId),has:turnId=>playback?.has(turnId),unlock:()=>playback?.unlock(),releaseAudio:()=>playback?.releaseAudio(),getState:()=>playback?.getState()||{status:'disabled'}};
});
