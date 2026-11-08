/* Explicit, on-device-only voice input for the existing Intelligence conversation.
 * Never fall back to the remote Web Speech service when local support is absent. */
(function(root){
 'use strict';
 async function availability(scope=root,lang='en-US'){
  const Engine=scope.SpeechRecognition||scope.webkitSpeechRecognition;
  if(!Engine||typeof Engine.available!=='function'||!('processLocally' in new Engine()))
   return {ready:false,reason:'On-device speech recognition is not supported in this browser. Type your question instead.'};
  try{
   const state=await Engine.available({langs:[lang],processLocally:true});
   if(state!=='available')return {ready:false,reason:state==='downloadable'||state==='downloading'?'An offline speech pack is not installed. No cloud speech fallback will be used.':'On-device speech recognition is unavailable for this language.'};
   return {ready:true,Engine};
  }catch{return {ready:false,reason:'The browser could not verify on-device speech. No microphone session started.'}}
 }
 function create({scope=root,onStatus=()=>{},onFinal=()=>{}}={}){
  let active=null;
  const stop=()=>{if(!active)return;const session=active;active=null;try{session.stop()}catch{}onStatus('Stopped listening.');};
  async function start(){
   if(active){stop();return {started:false,reason:'stopped'}}
   const result=await availability(scope);
   if(!result.ready){onStatus(result.reason);return {started:false,reason:result.reason}}
   const session=new result.Engine();
   session.processLocally=true;
   session.lang='en-US';session.continuous=false;session.interimResults=false;
   session.onresult=e=>{
    if(active!==session)return;
    const final=Array.from(e.results||[]).filter(r=>r.isFinal).map(r=>r?.[0]?.transcript||'').join(' ').trim();
    if(final){active=null;onStatus('Offline transcript captured.');onFinal(final)}
   };
   session.onerror=e=>{if(active!==session)return;active=null;onStatus(e.error==='not-allowed'?'Microphone permission denied.':'Offline speech recognition failed. Type your question instead.')};
   session.onend=()=>{if(active!==session)return;active=null;onStatus('No final speech captured. Type your question or try again.')};
   try{active=session;session.start();onStatus('Listening on device · offline speech');return {started:true}}
   catch{active=null;onStatus('Could not start on-device speech recognition.');return {started:false,reason:'start-failed'}}
  }
  return Object.freeze({start,stop,isListening:()=>!!active});
 }
 root.TradeFlowAIOfflineVoice=Object.freeze({availability,create});
})(typeof window==='undefined'?globalThis:window);
