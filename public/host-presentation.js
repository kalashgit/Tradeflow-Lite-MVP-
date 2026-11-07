/* Frontend consumer of AI-owned host lifecycle v1; no navigation/draft store. */
(function(root){'use strict';
const same=(a,b)=>a.actorId===b.actorId&&a.businessId===b.businessId&&a.threadId===b.threadId&&a.screen===b.screen;
const feedbackMessages=Object.freeze({
 thread_changed:'This investigation belongs to another conversation. Select the original conversation before returning.',
 scope_changed:'Your business context changed. Open Intelligence again from your current workspace.',
 record_unavailable:'The original record is no longer available to this workspace. Your question remains here; open a current record to continue.',
 no_origin:'There is no saved place to return to in this session. Open a record or Home and start the investigation there.',
 interrupted:'Navigation was interrupted. Check your current workspace before trying again.',
 cancelled:'The panel stayed open. The microphone has stopped.',
 unavailable:'This operation is unavailable right now. Check your current workspace before trying again.'});
function feedbackFor(status,kind='navigation'){const known=Object.hasOwn(feedbackMessages,status)?status:'unavailable';return Object.freeze({status:known,kind:kind==='close'?'close':'navigation',message:feedbackMessages[known]})}
function createController({getHost,motion,notify=()=>{}}){
 let serial=0,pending=null,animation=null,activePanel=null,disposed=false;
 const host=()=>{const h=getHost();if(h?.version!==1)throw Error('Host lifecycle unavailable');return h};
 function cancel(){if(pending){const state=activePanel?.querySelector?.('.tf-voice-state');if(state)state.textContent='Close interrupted. Use the controls to continue.'}activePanel=null;serial++;try{animation?.cancel()}catch{}animation=null;pending=null}
 async function navigate(kind,from){cancel();const h=host();h.stopMicrophoneNow();const result=kind==='open'?await h.openFromOrigin({from:from||h.captureOrigin()}):await h.returnToOrigin(from?{from}:{});if(!['opened','already_open','returned'].includes(result.status))notify(feedbackFor(result.status).message,feedbackFor(result.status));return result}
 function close(panel,reason='dismiss'){
  const h=host();h.stopMicrophoneNow();const state=panel?.querySelector?.('.tf-voice-state');if(state)state.textContent='Microphone stopped. Closing…';panel?.querySelector?.('.tf-voice-wave')?.classList.remove('is-listening');if(pending)return pending;
  activePanel=panel;const token=++serial,before=h.getContext();animation=panel?motion.play(panel,'exit'):null;const effect=animation;
  const operation=(async()=>{try{if(effect?.finished)await effect.finished;if(disposed||token!==serial||panel&&!panel.isConnected||!same(before,h.getContext()))return {status:'interrupted'};
    const result=h.requestClose({reason});if(!['closed','already_closed'].includes(result.status)&&state)state.textContent='Microphone stopped. Close '+result.status+'.';if(!['closed','already_closed'].includes(result.status))notify(feedbackFor(result.status,'close').message,feedbackFor(result.status,'close'));return result;
   }catch{return {status:'interrupted'}}finally{try{effect?.cancel()}catch{}if(token===serial){animation=null;activePanel=null}}
  })();pending=operation;const clear=()=>{if(pending===operation)pending=null};void operation.then(clear,clear);return operation;
 }
 function invalidate(){cancel();host().invalidate()}
 return Object.freeze({open:from=>navigate('open',from),returnToOrigin:from=>navigate('return',from),close,cancel,invalidate,dispose(){disposed=true;invalidate();motion.dispose()}});
}
function connect({document,getHost,motion,notify}){
 const app=document.getElementById('app');if(!app)return;
 function report(message,detail={status:'unavailable',kind:'navigation'}){
  let region=document.getElementById('tfHostFeedback');if(!region){region=document.createElement('section');region.id='tfHostFeedback';region.className='tf-host-feedback';region.setAttribute('role','alert');(app.querySelector('.tf-ai-chat-box,.tf-record-dossier,.content')||app).prepend(region)}
  region.dataset.hostStatus=detail.status;const title=document.createElement('strong');title.textContent=detail.kind==='close'?'Panel remains open':'Couldn’t open that workspace';const text=document.createElement('p');text.textContent=message;const dismiss=document.createElement('button');dismiss.type='button';dismiss.dataset.hostDismiss='';dismiss.textContent='Dismiss notice';region.replaceChildren(title,text,dismiss);
  const input=document.getElementById('tfAiPrompt');if(input){const ids=new Set((input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(region.id);input.setAttribute('aria-describedby',[...ids].join(' '))}
 }
 const controller=createController({getHost,motion,notify:report});let focusPending=false;
 function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.hostAction=action;b.className='tf-host-context';return b}
 function decorate(){const h=getHost();if(h?.version!==1)return;let context;try{context=h.getContext()}catch{return}
  const orb=app.querySelector('.tf-ai-orb[data-orb-material="fallback"]');if(orb){orb.title='Intelligence — orb graphic unavailable';orb.setAttribute('aria-label','Open Intelligence; orb graphic unavailable')}
  const voice=app.querySelector('.tf-voice-sheet');if(voice&&!voice.querySelector('[data-host-action="open"]'))voice.querySelector('.tf-voice-top')?.after(button('Open conversation','open'));
  const dossier=app.querySelector('.tf-record-dossier');if(dossier&&!dossier.querySelector('[data-host-action]'))dossier.prepend(button('Ask Intelligence about this record','open'));
  const chat=app.querySelector('.tf-ai-chat-top');if(chat){const old=chat.querySelector('[data-host-action="return"]');if(context.origin&&!old)chat.append(button('Return to work','return'));if(!context.origin)old?.remove()}
  if(focusPending&&!app.querySelector('.tf-voice-sheet,.tf-ai-mini-panel')){focusPending=false;const target=context.screen==='ai'?document.getElementById('tfAiPrompt'):app.querySelector('.tf-record-dossier h2')||[...app.querySelectorAll('[data-tab]')].find(n=>n.dataset.tab===context.screen&&n.getClientRects().length);if(target){if(!target.matches('button,input,textarea'))target.tabIndex=-1;target.focus()}}
 }
 const observer=new root.MutationObserver(decorate);observer.observe(app,{childList:true,subtree:true});decorate();
 async function click(event){const dismiss=event.target.closest?.('[data-host-dismiss]');if(dismiss){event.preventDefault();event.stopImmediatePropagation();document.getElementById('tfHostFeedback')?.remove();const input=document.getElementById('tfAiPrompt');if(input){const ids=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='tfHostFeedback');if(ids.length)input.setAttribute('aria-describedby',ids.join(' '));else input.removeAttribute('aria-describedby');input.focus()}return}const b=event.target.closest?.('.tf-ai-orb,[data-host-action],.tf-command-center [data-tab="ai"],[data-voice="close"],[data-action="tfAiClose"]');if(!b)return;event.preventDefault();event.stopImmediatePropagation();if(b.disabled)return;
  b.disabled=true;try{let result;if(b.dataset.voice==='close'||b.dataset.action==='tfAiClose')result=await controller.close(b.closest('.tf-voice-sheet,.tf-ai-mini-panel'));else if(b.dataset.hostAction==='open'&&b.closest('.tf-voice-sheet')){const h=getHost(),from=h.captureOrigin(),closed=h.requestClose({reason:'expand'});if(!['closed','already_closed'].includes(closed.status)){report(feedbackFor(closed.status,'close').message,feedbackFor(closed.status,'close'));return}result=await controller.open(from)}else result=await (b.dataset.hostAction==='return'?controller.returnToOrigin():controller.open());if(['closed','already_closed','returned','opened','already_open'].includes(result.status)){focusPending=true;decorate()}}catch{report(feedbackFor('unavailable').message,feedbackFor('unavailable'))}finally{b.disabled=false}
 }
 app.addEventListener('click',click,true);
 function interact(event){if(event.type==='keydown'&&!['Enter',' ','Escape'].includes(event.key))return;const panel=event.target.closest?.('.tf-voice-sheet,.tf-ai-mini-panel')||(event.key==='Escape'?app.querySelector('.tf-voice-sheet,.tf-ai-mini-panel'):null);if(!panel)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();void controller.close(panel,'escape').then(result=>{if(['closed','already_closed'].includes(result.status)){focusPending=true;decorate()}},()=>report('Close could not be verified. Check the microphone control before continuing.',feedbackFor('unavailable','close')));return}if(!event.target.closest?.('[data-voice="close"],[data-action="tfAiClose"]'))controller.cancel()}
 app.addEventListener('pointerdown',interact,true);document.addEventListener('keydown',interact,true);
 function hide(){controller.invalidate()}
 document.defaultView?.addEventListener('pagehide',hide);
 return Object.freeze({controller,dispose(){observer.disconnect();app.removeEventListener('click',click,true);app.removeEventListener('pointerdown',interact,true);document.removeEventListener('keydown',interact,true);document.defaultView?.removeEventListener('pagehide',hide);controller.dispose()}});
}
const api=Object.freeze({createController,connect,feedbackFor});if(typeof module==='object'&&module.exports)module.exports=api;else root.TradeFlowHostPresentation=api;
})(typeof window==='object'?window:globalThis);
