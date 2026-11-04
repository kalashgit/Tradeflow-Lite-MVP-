/* Actual local microphone/ASR modality for the existing saved conversation. No business writer. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TradeFlowConversationVoice=api})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function encodeWav(chunks,sampleRate){
  if(!Number.isFinite(sampleRate)||sampleRate<16000||sampleRate>96000)throw Error('Unsupported microphone sample rate');
  const size=chunks.reduce((n,c)=>n+c.length,0);if(size<sampleRate*.1||size>sampleRate*30)throw Error('Speak for between 0.1 and 30 seconds');
  const input=new Float32Array(size);let offset=0;for(const chunk of chunks){input.set(chunk,offset);offset+=chunk.length}
  const count=Math.floor(size*16000/sampleRate),bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes);
  const ascii=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i))};
  ascii(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);ascii(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,count*2,true);
  // Area-average downsampling; field values/phone digits are never rewritten by capture.
  for(let i=0;i<count;i++){const begin=Math.floor(i*sampleRate/16000),end=Math.max(begin+1,Math.floor((i+1)*sampleRate/16000));let value=0;for(let n=begin;n<end;n++)value+=input[n];view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,value/(end-begin)))*32767),true)}
  return bytes;
 }
 function createSession({protocol,readContext,ensureThread,getMedia,capture,recognize,submit,play,stopPlayback,releaseAudio=()=>{},cancelInference=()=>{},onDraft=()=>{},emit=()=>{}}){
  let generation=0,turnGeneration=0,resource=null,abort=null,machine=null,scope='',sequence=0,state={status:'idle',message:'',transcript:''},frames=[],frameCount=0,rate=16000,speechMs=0,silenceMs=0,pre=[],preMs=0;
  const key=()=>JSON.stringify(readContext());
  const same=token=>token===generation&&scope===key()&&!abort?.signal.aborted;
  const update=(status,message='',transcript=state.transcript)=>{state={status,message,transcript};emit(Object.freeze({...state}))};
  const dispatch=(kind,payload={})=>machine.dispatch({version:1,session_id:machine.snapshot().sessionId,thread_id:machine.snapshot().threadId,event_id:crypto.randomUUID(),sequence:sequence++,kind,payload});
  function stop(message='Voice stopped. Text remains available.'){
   generation++;turnGeneration++;abort?.abort();abort=null;resource?.stop();resource=null;stopPlayback();releaseAudio();cancelInference();frames=[];pre=[];frameCount=0;preMs=0;
   if(machine){try{dispatch('voice.session.end')}catch{}machine=null}update('idle',message);
  }
  async function finish(token){
   if(!same(token)||state.status!=='capturing')return;
   if(speechMs<160){frames=[];frameCount=0;dispatch('vad.speech_end');stop('No clear speech captured. Tap to try again.');return}
   const turnEpoch=++turnGeneration;const valid=()=>same(token)&&turnEpoch===turnGeneration;
   dispatch('vad.speech_end');update('transcribing','Transcribing locally…');
   try{
    const wav=encodeWav(frames,rate);frames=[];frameCount=0;
    const result=await recognize(wav,abort.signal);if(!valid())return;
    const text=typeof result.text==='string'?result.text.trim():'';
    if(!text){stop('No clear speech recognized. Text remains available.');return}
    if(result.confidence==='requires_review'){onDraft(text);stop('Review the uncertain transcript in the text input before sending.');return}
    dispatch('asr.final',{text});update('reasoning','Final transcript saved through the existing conversation.',text);
    const reply=await submit(text,abort.signal);if(!valid())return;
    if(!reply||reply.role!=='assistant'||reply.status!=='committed'){stop('No confirmed assistant reply. Inspect the conversation.');return}
    dispatch('assistant.text.final',{text:reply.content,validated:true});
    // Only a committed, ticketed answer can play. No fallback voice or fabricated reply.
    update('preparing','Preparing the saved reply…',text);
    const playing=await play(reply,abort.signal,()=>{if(valid()){dispatch('tts.audio.start');update('speaking','Speaking. Say your next question to interrupt, or tap Stop.',text)}});
    if(!valid())return;
    if(!playing){stop('Spoken output unavailable for this reply. Read the saved text.');return}
    dispatch('tts.audio.final',{generation:machine.snapshot().generation});
    frames=[];pre=[];frameCount=0;preMs=0;speechMs=0;silenceMs=0;update('listening','Microphone on. Ask a follow-up, or tap Stop.');
   }catch(error){if(valid()){stop('Voice failed. Text remains available.');update('unavailable',error.message||'Local speech unavailable.')}}
  }
  function onFrame(chunk,sampleRate){
   const token=generation;if(!same(token)||!['listening','capturing','speaking'].includes(state.status))return;
   if(!(chunk instanceof Float32Array)||chunk.length>8192)return;
   rate=sampleRate;const ms=chunk.length/rate*1000;let energy=0;for(const x of chunk)energy+=x*x;const rms=Math.sqrt(energy/chunk.length),voiced=rms>.018;
   if(state.status==='listening'||state.status==='speaking'){
    pre.push(chunk);preMs+=ms;while(preMs>400&&pre.length>1)preMs-=pre.shift().length/rate*1000;
    speechMs=voiced?speechMs+ms:0;
    if(speechMs<160)return;
    if(state.status==='speaking'){
     // Actual input energy, not a fabricated barge-in. Acoustic echo cancellation is
     // requested from the browser; speakerphone false triggers remain a device gate.
     turnGeneration++;dispatch('voice.interrupt');stopPlayback();
    }else dispatch('vad.speech_start');
    frames=pre.slice();frameCount=frames.reduce((n,c)=>n+c.length,0);pre=[];preMs=0;silenceMs=0;update('capturing','Listening to your speech…');return;
   }
   frames.push(chunk);frameCount+=chunk.length;speechMs+=voiced?ms:0;silenceMs=voiced?0:silenceMs+ms;
   if(frameCount>sampleRate*29.5){stop('Speech reached the 30-second limit. Nothing was submitted; use shorter phrases or text.');return}
   if(silenceMs>=1200)void finish(token);
  }
  async function start(){
   stop('');const initial=readContext();const token=generation;abort=new AbortController();const controller=abort;update('requesting_permission','Microphone permission requested. Audio goes to your private development server for transcription; not retained.','');
   let stream;
   try{
    // Invoke permission request from the actual user gesture, not an automatic timer.
    const pending=getMedia();
    stream=await pending;
    if(token!==generation){stream.getTracks().forEach(t=>t.stop());return}
    const before=readContext();if(before.actorId!==initial.actorId||before.businessId!==initial.businessId||before.screen!==initial.screen||initial.threadId&&before.threadId!==initial.threadId){stream.getTracks().forEach(t=>t.stop());stop('Context changed before microphone startup.');return}
    await ensureThread();if(token!==generation){stream.getTracks().forEach(t=>t.stop());return}
    const after=readContext();if(after.actorId!==initial.actorId||after.businessId!==initial.businessId||after.screen!==initial.screen||initial.threadId&&after.threadId!==initial.threadId){stream.getTracks().forEach(t=>t.stop());stop('Context changed before microphone startup.');return}
    scope=key();const context=readContext();machine=protocol.createVoiceTurnMachine({sessionId:crypto.randomUUID(),threadId:context.threadId});sequence=0;
    dispatch('voice.session.request');dispatch('voice.permission.granted');
    const acquired=await capture(stream,onFrame,controller.signal);
    if(!same(token)){acquired.stop();stream.getTracks().forEach(t=>t.stop());return}
    resource=acquired;
    frames=[];pre=[];frameCount=0;preMs=0;speechMs=0;silenceMs=0;update('listening','Microphone on. Speak naturally; silence ends your turn.');
   }catch(error){stream?.getTracks().forEach(t=>t.stop());if(token===generation){stop('');update('unavailable',error?.name==='NotAllowedError'?'Microphone permission denied. Type your question instead.':'Microphone capture unavailable. Use text. '+(error.message||''))}}
  }
  return {start,stop,finish:()=>finish(generation),onFrame,getState:()=>({...state}),contextChanged(){if(resource&&scope!==key())stop('Context changed. Microphone and playback stopped.')},dispose(){stop('')}};
 }
 async function capturePcm(stream,onFrame,signal){
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Audio capture unavailable. Use text.');
  const audio=new Audio();let source,node;
  const stop=()=>{stream.getTracks().forEach(t=>t.stop());try{source?.disconnect();node?.disconnect()}catch{}void audio.close().catch(()=>{})};
  try{
   await audio.resume();await audio.audioWorklet.addModule('./voice-pcm-worklet.js?v=spoken-v1');if(signal.aborted){stop();throw new DOMException('Cancelled','AbortError')}
   source=audio.createMediaStreamSource(stream);node=new AudioWorkletNode(audio,'tradeflow-pcm-capture');node.port.onmessage=e=>{if(!signal.aborted)onFrame(e.data,audio.sampleRate)};source.connect(node);node.connect(audio.destination);
   return {stop};
  }catch(error){stop();throw error}
 }
 let session=null,host=null;
 function paint(state){
  if(typeof document==='undefined')return;
  for(const panel of document.querySelectorAll('[data-conversation-voice]')){
   const active=!['idle','unavailable'].includes(state.status);panel.querySelector('[data-voice-start]').hidden=active;panel.querySelector('[data-voice-stop]').hidden=!active;
   panel.querySelector('[data-voice-finish]').hidden=state.status!=='capturing';panel.querySelector('[role=status]').textContent=state.message;
   panel.querySelector('[data-voice-transcript]').textContent=state.transcript?'You said: '+state.transcript:'';
  }
  window.dispatchEvent(new CustomEvent('tradeflow:voice-state',{detail:{version:1,...state,rawAudioRetention:'none'}}));
 }
 function connect(adapter){
  session?.dispose();host=adapter;
  session=createSession({...adapter,protocol:window.TradeFlowVoiceTurnProtocol,
   getMedia:()=>navigator.mediaDevices?.getUserMedia?navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}):Promise.reject(Error('Microphone unavailable. Use text.')),
   capture:capturePcm,
   recognize:async(wav,signal)=>{
    const bytes=new Uint8Array(wav);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const response=await fetch('/api/ai/speech/recognize',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal,body:JSON.stringify({code:adapter.getCode(),wav:btoa(binary)})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Local recognition unavailable.');return result;
   },emit:paint});return session;
 }
 if(typeof document==='object'){
  document.addEventListener('click',event=>{
   if(event.target.closest('[data-voice-start]')){event.preventDefault();void session?.start();void host?.unlockAudio()}
   if(event.target.closest('[data-voice-stop]')){event.preventDefault();session?.stop();host?.releaseAudio()}
   if(event.target.closest('[data-voice-finish]')){event.preventDefault();void session?.finish()}
   if(event.target.closest('[data-tab],[data-action="tfAiNewThread"],[data-action="tfAiClear"],[data-action="tfAiLock"],[data-action="tfAiClose"]')){session?.stop('Context changed.');host?.releaseAudio()}
  },true);
  document.addEventListener('submit',event=>{if(['tfAiChatForm','tfAiQuickForm'].includes(event.target.id)){session?.stop('Text question submitted.');host?.releaseAudio()}},true);
  document.addEventListener('change',event=>{if(event.target.id==='tfAiThreadPicker'){session?.stop('Conversation changed.');host?.releaseAudio()}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){session?.stop('Page hidden.');host?.releaseAudio()}});
  window.addEventListener('pagehide',()=>{session?.stop('Page closed.');host?.releaseAudio()});
 }
 return {version:1,encodeWav,createSession,connect,start:()=>session?.start(),stop:()=>session?.stop(),getState:()=>session?.getState()||{status:'disabled'},refresh(){session?.contextChanged();if(session)paint(session.getState())},
  controls(){return '<div class="tf-conversation-voice" data-conversation-voice><button type="button" data-voice-start>Start voice conversation</button><button type="button" data-voice-finish hidden>Finish speaking</button><button type="button" data-voice-stop hidden>Stop voice</button><span role="status" aria-live="polite"></span><small data-voice-transcript></small><small>Private server speech · connection required · no audio retained · headphones recommended for interruption</small></div>'}};
});
