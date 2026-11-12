/* AION Genesis conversation projection.
   The existing TradeFlow device-local thread may contain *other* assistant outputs
   or customer details. Only past turns explicitly from the Genesis adviser
   may be reused as model history. Never send a previous TradeFlow record-
   grounded response to the general-purpose Genesis Qwen adviser. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowGenesisConversation=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const GENESIS_SOURCES=new Set(['genesis_qwen','genesis_reference','genesis_unavailable']);
 const LAB_SOURCES=new Set(['genesis_lab_qwen','genesis_lab_oracle','genesis_lab_unavailable']);
 function projection(turns,{limit=8,mode='general'}={}){
  if(!['general','lab'].includes(mode))throw Error('Invalid Genesis conversation mode');
  const allowed=mode==='lab'?LAB_SOURCES:GENESIS_SOURCES;
  if(!Array.isArray(turns)||!turns.length||
     !Number.isSafeInteger(limit)||limit<1||limit>8)throw Error('Invalid Genesis turn projection');
  const last=turns[turns.length-1];
  if(last?.role!=='user'||last.source!=='user'||typeof last.content!=='string'||!last.content.trim())
   throw Error('Genesis requires a finalized latest user message');
  // We deliberately do not inherit miscellaneous user turns, system notices,
  // record-backed assistant messages, or cross-mode conversation state.
  const selected=[last];let i=turns.length-2;
  while(i>=1&&selected.length+2<=limit){
   const a=turns[i],u=turns[i-1];
   if(a?.role!=='assistant'||!allowed.has(a.source)||
      u?.role!=='user'||u.source!=='user')break;
   if(typeof a.content!=='string'||!a.content.trim()||
      typeof u.content!=='string'||!u.content.trim())break;
   selected.unshift(u,a);
   i-=2;
  }
  return selected.map(t=>({role:t.role,content:t.content}));
 }
 return Object.freeze({projection});
});
