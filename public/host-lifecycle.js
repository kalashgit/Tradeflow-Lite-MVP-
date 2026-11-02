/* TradeFlow host lifecycle contract v1. No new state authority or command execution. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowHostLifecycleFactory=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const plain=x=>JSON.parse(JSON.stringify(x));
const valid=x=>typeof x==='string'&&x.length>0&&x.length<=150;
function createHostLifecycle(ports){
 if(!ports||!['read','navigate','recordExists','stopMicrophone','readDraft','writeDraft'].every(k=>typeof ports[k]==='function'))throw Error('Host lifecycle requires existing host services');
 const listeners=new Set();let generation=0,origin=null,closing=false,closed=false;
 const safe=()=>{const s=ports.read();if(!s||!valid(s.actorId)||!valid(s.businessId)||!valid(s.screen))throw Error('Host identity or screen unavailable');return s};
 function snapshot(){
  const s=safe(),selected=s.selected&&valid(s.selected.store)&&valid(s.selected.id)?{store:s.selected.store,id:s.selected.id}:null;
  return Object.freeze({version:1,actorId:s.actorId,businessId:s.businessId,screen:s.screen,selected,threadId:valid(s.threadId)?s.threadId:null,contextRecordId:valid(s.contextRecordId)?s.contextRecordId:null,draft:String(ports.readDraft()||'').slice(0,1200)});
 }
 function matches(a,b){return a.actorId===b.actorId&&a.businessId===b.businessId}
 function captureOrigin(){return Object.freeze(plain(snapshot()))}
 function getContext(){return Object.freeze({...plain(snapshot()),origin:origin?plain(origin):null})}
 function setDraft(value){if(typeof value!=='string'||value.length>1200)throw Error('Invalid unsent draft');ports.writeDraft(value);return true}
 function onBeforeClose(fn){if(typeof fn!=='function')throw Error('Close listener required');listeners.add(fn);return ()=>listeners.delete(fn)}
 function stopMicrophoneNow(){ports.stopMicrophone();return true}
 async function openFromOrigin({from}={}){
  const s=snapshot();if(s.screen==='ai')return {status:'already_open',context:getContext()};
  const selected=from||s;
  if(!selected||selected.version!==1||!matches(selected,s))return {status:'scope_changed'};
  const token=++generation;
  const available=!selected.selected||await ports.recordExists(selected.selected);
  if(token!==generation||!matches(snapshot(),s)||snapshot().threadId!==s.threadId)return {status:'interrupted'};
  if(!available)return {status:'record_unavailable'};
  const next=Object.freeze(plain(selected));
  await ports.navigate({screen:'ai',selected:null});
  if(token!==generation||!matches(snapshot(),next)||snapshot().threadId!==s.threadId)return {status:'interrupted'};
  origin=next;closed=false;ports.writeDraft(next.draft);
  return {status:'opened',context:getContext()};
 }
 async function returnToOrigin({from}={}){
  const target=from||origin;if(!target)return {status:'no_origin'};
  const current=snapshot();
  if(target.version!==1||!matches(target,current))return {status:'scope_changed'};
  if(target.threadId&&current.threadId&&target.threadId!==current.threadId)return {status:'thread_changed'};
  const token=++generation;
  const available=!target.selected||await ports.recordExists(target.selected);
  if(token!==generation||!matches(snapshot(),current)||snapshot().threadId!==current.threadId)return {status:'interrupted'};
  if(!available)return {status:'record_unavailable'};
  stopMicrophoneNow();
  await ports.navigate({screen:target.screen,selected:target.selected});
  if(token!==generation||!matches(snapshot(),target)||snapshot().threadId!==current.threadId)return {status:'interrupted'};
  ports.writeDraft(from&&current.draft===''?(typeof target.draft==='string'?target.draft.slice(0,1200):''):current.draft);
  origin=null;
  ports.restoreFocus?.(target);
  return {status:'returned',screen:target.screen,selected:target.selected};
 }
 function requestClose({reason='dismiss'}={}){
  stopMicrophoneNow(); // Synchronous, even if the visual close is vetoed.
  if(closing)return {status:'already_closing'};
  if(closed&&ports.isVisualOpen?.()!==true)return {status:'already_closed'};
  closing=true;
  try{
   const current=getContext();
   for(const fn of [...listeners]){
    let allowed;
    try{allowed=fn(Object.freeze({reason,context:current,cancelable:true}))}catch{return {status:'cancelled'}}
    if(allowed===false)return {status:'cancelled'};
   }
   ++generation;
   ports.closeVisual?.();closed=true;
   ports.restoreFocus?.(current.origin||current);
   return {status:'closed'};
  }finally{closing=false}
 }
 function invalidate(){++generation;origin=null;stopMicrophoneNow()}
 return Object.freeze({version:1,captureOrigin,getContext,setDraft,onBeforeClose,stopMicrophoneNow,openFromOrigin,returnToOrigin,requestClose,invalidate});
}
return Object.freeze({version:1,createHostLifecycle});
});
