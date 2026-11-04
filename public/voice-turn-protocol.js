(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TradeFlowVoiceTurnProtocol=factory()})(typeof globalThis==='object'?globalThis:this,function(){
// TradeFlow voice-turn protocol v0: pure, provider-independent turn-state reducer.
// No microphone access, model calls, business reads/writes, audio retention or command execution.
// Event producers must authenticate sessions and validate assistant output BEFORE dispatch.
'use strict';
const STATES=Object.freeze(['idle','requesting_permission','listening','capturing','transcribing','reasoning','ready_to_speak','speaking','failed']);
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{4,100}$/.test(s);
function createVoiceTurnMachine({sessionId,threadId}={}){
 if(!safeId(sessionId)||!safeId(threadId))throw Error('Valid voice session and thread IDs required');
 let state='idle',sequence=-1,generation=0,partial='',lastUserFinal='',lastAssistantText='';
 const seen=new Map();
 function remember(event,signature){seen.set(event.event_id,signature);if(seen.size>2048)seen.delete(seen.keys().next().value)}
 function snapshot(){return Object.freeze({sessionId,threadId,state,sequence,generation,partial,lastUserFinal,lastAssistantText})}
 function dispatch(event){
  if(!event||event.version!==1||event.session_id!==sessionId||event.thread_id!==threadId||!safeId(event.event_id)||!Number.isSafeInteger(event.sequence)||event.sequence<0||typeof event.kind!=='string')throw Error('Voice event contract invalid');
  const signature=JSON.stringify(event);
  if(seen.has(event.event_id)){
   if(seen.get(event.event_id)!==signature)throw Error('Conflicting duplicate voice event');
   return {status:'duplicate',snapshot:snapshot(),effects:[]};
  }
  if(event.sequence<=sequence)throw Error('Voice event sequence not increasing');
  const effects=[],kind=event.kind,data=event.payload||{};
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid voice event payload');
  if(kind==='tts.audio.chunk'&&(!Number.isSafeInteger(data.generation)||data.generation!==generation||state!=='speaking')){
   // Frames queued before an interruption are never allowed to resume playback.
   remember(event,signature);sequence=event.sequence;
   return {status:'stale_audio_ignored',snapshot:snapshot(),effects:[]};
  }
  const from=state;
  switch(kind){
   case 'voice.session.request':
    if(state!=='idle')throw Error('Voice session is already active');
    state='requesting_permission';effects.push({kind:'mic.request_permission'});break;
   case 'voice.permission.granted':
    if(state!=='requesting_permission')throw Error('Voice permission result out of order');
    state='listening';effects.push({kind:'mic.start'});break;
   case 'voice.permission.denied':
    if(state!=='requesting_permission')throw Error('Voice permission result out of order');
    state='failed';effects.push({kind:'mic.release',reason:'permission_denied'});break;
   case 'vad.speech_start':
    if(state!=='listening')throw Error('Speech start requires listening');
    state='capturing';partial='';lastUserFinal='';lastAssistantText='';effects.push({kind:'caption.begin'});break;
   case 'asr.partial':
    if(!['capturing','transcribing'].includes(state))throw Error('ASR partial requires capture');
    if(typeof data.text!=='string'||data.text.length>2000)throw Error('Invalid partial ASR');
    partial=data.text;effects.push({kind:'caption.provisional',text:partial});break;
   case 'vad.speech_end':
    if(state!=='capturing')throw Error('Speech end requires capture');
    state='transcribing';effects.push({kind:'asr.finalize'});break;
   case 'asr.final':
    if(state!=='transcribing')throw Error('ASR final requires transcription stage');
    if(typeof data.text!=='string'||!data.text.trim()||data.text.length>2000)throw Error('Invalid final transcript');
    lastUserFinal=data.text.trim();partial='';state='reasoning';
    effects.push({kind:'conversation.user_turn.final',modality:'voice',text:lastUserFinal,threadId});break;
   case 'assistant.text.final':
    if(state!=='reasoning')throw Error('Assistant final requires reasoning stage');
    // Flag is attestable only after trusted external validation. This module cannot grant authority.
    if(data.validated!==true||typeof data.text!=='string'||!data.text.trim()||data.text.length>2500)throw Error('Validated assistant text required');
    lastAssistantText=data.text.trim();state='ready_to_speak';
    effects.push({kind:'conversation.assistant_turn.validated',modality:'voice',text:lastAssistantText,threadId,executionAuthority:false});break;
   case 'tts.audio.start':
    if(state!=='ready_to_speak')throw Error('Audio start requires validated assistant text');
    state='speaking';effects.push({kind:'audio.playback.start',generation});break;
   case 'tts.audio.chunk':
    if(state!=='speaking')throw Error('TTS chunk requires speaking');
    effects.push({kind:'audio.playback.accept_chunk',generation});break;
   case 'tts.audio.final':
    if(state!=='speaking'||data.generation!==generation)throw Error('TTS final generation mismatch');
    state='listening';effects.push({kind:'audio.playback.complete',generation});break;
   case 'voice.interrupt':
    if(state!=='speaking')throw Error('Voice interruption requires speaking');
    generation++;state='capturing';partial='';lastAssistantText='';
    effects.push({kind:'audio.playback.cancel_prior_generation',generation},{kind:'conversation.assistant_turn.interrupted'},{kind:'caption.begin'});
    break;
   case 'voice.session.end':
    generation++;state='idle';partial='';
    effects.push({kind:'audio.playback.cancel_all'},{kind:'mic.release'});
    break;
   case 'voice.session.error':
    generation++;state='failed';partial='';
    effects.push({kind:'audio.playback.cancel_all'},{kind:'mic.release'});
    break;
   default:throw Error('Unknown voice event kind');
  }
  remember(event,signature);sequence=event.sequence;
  return {status:'accepted',transition:from+'->'+state,snapshot:snapshot(),effects};
 }
 return Object.freeze({dispatch,snapshot});
}
return {createVoiceTurnMachine,STATES};

});
