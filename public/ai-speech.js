/* Opt-in speech playback for the existing local TradeFlow conversation. No microphone or command authority. */
(function(root){
 'use strict';
 let generation=0,controller=null,audio=null,objectUrl=null,auto=false,speaker='orion';
 const listeners=new Set();
 let state='idle';
 function emit(next){state=next;for(const fn of listeners)try{fn(state)}catch{}}
 function stop(){generation++;controller?.abort();controller=null;if(audio){audio.pause();audio.removeAttribute('src');audio.load?.();audio=null}if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}emit('idle')}
 async function speak(text,code,selectedSpeaker=speaker){
  stop();
  if(typeof text!=='string'||!text.trim()||typeof code!=='string'||!code)return false;
  const current=++generation;controller=new AbortController();emit('loading');
  try{
   const response=await fetch('/api/ai/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,1200),code,speaker:selectedSpeaker}),signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('Speech service unavailable ('+response.status+')');
   const blob=await response.blob();
   if(current!==generation)return false;
   if(!blob.size||!/^audio\//.test(response.headers.get('Content-Type')||''))throw Error('Invalid speech audio');
   objectUrl=URL.createObjectURL(blob);audio=new Audio(objectUrl);
   audio.onended=()=>{if(current===generation)stop()};
   audio.onerror=()=>{if(current===generation)stop()};
   await audio.play();
   if(current!==generation)return false;
   emit('speaking');return true;
  }catch(err){if(current===generation){stop();emit(err?.name==='AbortError'?'idle':'unavailable')}return false}
 }
 root.TradeFlowSpeech={speak,stop,get state(){return state},get auto(){return auto},get speaker(){return speaker},setAuto(value){auto=!!value;if(!auto)stop()},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}};
 function mount(){
  const wakeActive=!!root.TradeFlowVoice?.isWakeActive?.();
  for(const orb of document.querySelectorAll('.tf-ai-orb,.tf-master-orb')){
   orb.classList.toggle('is-wake-listening',wakeActive);
   if(orb.matches('.tf-ai-orb'))orb.setAttribute('aria-label',wakeActive?'Hey TradeFlow microphone listening':'Talk to TradeFlow');
  }
  const panel=document.querySelector('.tf-master,.tf-ai-chat-box');
  if(!panel)return;
  const options=panel.matches('.tf-master')?panel.querySelector('#tfMasterToolbar'):null;
  let controls=panel.querySelector('[data-ai-speech-controls]');
  if(!controls){
   controls=document.createElement('div');controls.dataset.aiSpeechControls='';controls.className='tf-ai-speech-controls';
   controls.innerHTML='<label><input type="checkbox" data-ai-speech-auto> Speak replies</label> <label>Voice <select data-ai-speech-speaker aria-label="Speech voice"><option value="orion">Orion</option><option value="asteria">Asteria</option><option value="angus">Angus</option><option value="orpheus">Orpheus</option><option value="luna">Luna</option></select></label> <button type="button" data-ai-speech-stop>Stop audio</button> <button type="button" data-ai-wake-toggle>Enable “Hey TradeFlow”</button> <small data-ai-speech-status role="status">Speech ready</small>';
   if(options)options.append(controls);
   else (panel.querySelector('.tf-ai-chat-top')||panel.firstElementChild)?.after(controls);
   controls.querySelector('[data-ai-speech-auto]').checked=auto;
   controls.querySelector('[data-ai-speech-speaker]').value=speaker;
  }
  const wake=controls.querySelector('[data-ai-wake-toggle]');
  if(wake){const status=root.TradeFlowVoice?.wakeStatus?.()||'off';const label=wakeActive?'Stop wake listening':status==='unsupported'?'Wake phrase unsupported in this browser':status==='permission_denied'?'Microphone permission denied — retry':'Enable “Hey TradeFlow”';if(wake.textContent!==label)wake.textContent=label;wake.setAttribute('aria-pressed',String(wakeActive))}
  for(const bubble of panel.querySelectorAll('.tf-ai-theirs,.tf-master-message.is-assistant')){
   if(bubble.querySelector('[data-ai-speech-play]'))continue;
   const button=document.createElement('button');button.type='button';button.dataset.aiSpeechPlay='';button.textContent='▶ Listen';button.setAttribute('aria-label','Read this assistant response aloud');bubble.append(button);
  }
  const stateLabel=controls.querySelector('[data-ai-speech-status]');
  const label=state==='idle'?'Speech ready':state;
  if(stateLabel.textContent!==label)stateLabel.textContent=label;
 }
 root.TradeFlowSpeech.mount=mount;
 root.TradeFlowSpeech.subscribe(()=>{const label=document.querySelector('[data-ai-speech-status]');if(label)label.textContent=state==='idle'?'Speech ready':state});
 document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-ai-speech-stop]')){stop();return}
  if(event.target.closest?.('[data-ai-wake-toggle]')){const voice=root.TradeFlowVoice;if(!voice)return;voice.enableWake();mount();return}
  const button=event.target.closest?.('[data-ai-speech-play]');if(!button)return;
  const message=button.closest('.tf-ai-theirs,.tf-master-message.is-assistant')?.querySelector('p,.tf-master-message-text')?.textContent;
  if(message)void speak(message,root.TradeFlowSpeech.previewCode?.()||'');
 });
 document.addEventListener('change',event=>{if(event.target.matches?.('[data-ai-speech-auto]'))root.TradeFlowSpeech.setAuto(event.target.checked);if(event.target.matches?.('[data-ai-speech-speaker]')){speaker=event.target.value;stop()}});
 document.addEventListener('DOMContentLoaded',()=>{
  const observer=new MutationObserver(()=>mount());
  observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});mount();
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 root.addEventListener?.('pagehide',stop);
})(window);
