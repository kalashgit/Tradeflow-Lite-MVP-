/* Read-only bridge from committed app DOM to the existing shared motion API. */
(function(root){'use strict';
function connect({document,readState,motion,Observer=root.MutationObserver,frame=f=>root.requestAnimationFrame(f),cancelFrame=id=>root.cancelAnimationFrame(id)}){
 const app=document.getElementById('app');if(!app||!motion||!Observer)return Object.freeze({dispose(){}});
 document.documentElement?.classList.add('tf-presentation-motion');
 let disposed=false,pending=null,previousContent=null,route=null;const panels=new Map(),statuses=new Map();
 const panelSelectors=['.tf-ai-mini-panel','.tf-voice-sheet','.tf-notif-panel','.tf-record-modal'];
 function sync(){pending=null;if(disposed)return;if(drag&&!drag.node.isConnected)drag=null;
  const content=app.querySelector('.main > .content'),selected=app.querySelector('.sidebar .nav.active,.mobilebar .active');
  const dossier=content?.querySelector('.tf-record-dossier'),record=dossier?.querySelector('[data-action="tfDecisionExplain"],[data-action="tfRecordEdit"]')?.dataset.id||'';
  let hostContext=null;try{hostContext=root.TradeFlowHostLifecycle?.getContext()}catch{}
  const next=hostContext?hostContext.screen+':'+(hostContext.selected?.id||''):selected?.dataset.tab?selected.dataset.tab+':'+record:null;
  if(previousContent&&previousContent!==content)motion.cancel(previousContent);
  if(content&&route!==null&&next!==null&&next!==route)motion.play(content,'navigation');
  previousContent=content;route=next;
  for(const selector of panelSelectors){const old=panels.get(selector),node=app.querySelector(selector);if(old&&old!==node)motion.cancel(old);if(node&&!old&&drag?.node!==node)motion.play(node,'panel');if(node)panels.set(selector,node);else panels.delete(selector)}
  const scope=hostContext?{actor:hostContext.actorId,businessId:hostContext.businessId,threadId:hostContext.threadId}:readState(),owner=JSON.stringify([scope.actor,scope.businessId,scope.threadId]);const current=new Map();
  for(const node of app.querySelectorAll('[data-decision-status],[data-decision-receipt]')){const job=node.closest('[data-decision-job]')?.dataset.decisionJob;if(!job)continue;const key=owner+':'+job+':'+(node.hasAttribute('data-decision-receipt')?'receipt':'status'),text=node.textContent.trim(),old=statuses.get(key);if(old?.node!==node&&old?.node)motion.cancel(old.node);if(old&&old.text!==text&&text)motion.play(node,'reveal');current.set(key,{node,text})}
  for(const [key,old]of statuses)if(!current.has(key))motion.cancel(old.node);statuses.clear();for(const [key,value]of current)statuses.set(key,value);
 }
 let drag=null;
 function resetDrag(){if(drag){drag.node.style.transition='';drag.node.style.transform='';drag=null}}
 function visibility(){if(document.hidden)resetDrag()}
 document.addEventListener?.('visibilitychange',visibility);
 function direct(event){if(drag&&drag.id!==event.pointerId)return;const panel=event.target.closest?.('.tf-ai-mini-head,.tf-voice-top')?.closest('.tf-ai-mini-panel,.tf-voice-sheet');if(panel)motion.cancel(panel);const voice=event.target.closest?.('.tf-voice-top')?.closest('.tf-voice-sheet');if(voice&&!event.target.closest?.('button,input,textarea,a')&&event.button!==2){drag={node:voice,id:event.pointerId,start:event.clientY,dy:0};voice.style.transition='none'}}
 function move(event){if(!drag||event.pointerId!==drag.id)return;if(!drag.node.isConnected){drag=null;return}drag.dy=Math.max(0,Math.min(160,event.clientY-drag.start));drag.node.style.transform='translate3d(0,'+drag.dy+'px,0)'}
 function end(event){if(!drag||event.pointerId!==drag.id)return;const current=drag;drag=null;if(!current.node.isConnected)return;current.node.style.transition='';current.node.style.transform='';if(event.type!=='pointercancel'&&current.dy>=90)current.node.querySelector('[data-voice="close"]')?.click()}
 document.addEventListener?.('pointerdown',direct,true);document.addEventListener?.('pointermove',move,true);document.addEventListener?.('pointerup',end,true);document.addEventListener?.('pointercancel',end,true);
 function schedule(){if(!disposed&&pending===null)pending=frame(sync)}
 const observer=new Observer(schedule);observer.observe(app,{childList:true,subtree:true,characterData:true});
 function dispose(){if(disposed)return;disposed=true;observer.disconnect();if(pending!==null)cancelFrame(pending);pending=null;motion.dispose();document.removeEventListener?.('pointerdown',direct,true);document.removeEventListener?.('pointermove',move,true);document.removeEventListener?.('pointerup',end,true);document.removeEventListener?.('pointercancel',end,true);document.removeEventListener?.('visibilitychange',visibility);resetDrag();document.documentElement?.classList.remove('tf-presentation-motion');panels.clear();statuses.clear();previousContent=null;document.defaultView?.removeEventListener('pagehide',hide)}
 function hide(event){resetDrag();if(!event.persisted){dispose();return}if(pending!==null)cancelFrame(pending);pending=null;if(previousContent)motion.cancel(previousContent);for(const node of panels.values())motion.cancel(node);for(const value of statuses.values())motion.cancel(value.node)}
 document.defaultView?.addEventListener('pagehide',hide);sync();return Object.freeze({dispose});
}
const api=Object.freeze({connect});if(typeof module==='object'&&module.exports)module.exports=api;else root.TradeFlowPresentationMotion=api;
})(typeof window==='object'?window:globalThis);
