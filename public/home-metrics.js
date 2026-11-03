/* Ephemeral presentation state only. Host remains the identity/navigation authority. */
(function(root){'use strict';
function createMemory(){let owner=null,left=0;const key=c=>c&&typeof c.actorId==='string'&&c.actorId&&typeof c.businessId==='string'&&c.businessId?JSON.stringify([c.actorId,c.businessId]):null;function scope(c){const k=key(c);if(k!==owner){owner=k;left=0}return k}return Object.freeze({save(c,x){if(scope(c)&&c.screen==='dashboard'&&Number.isFinite(x))left=Math.max(0,x)},read(c){return scope(c)&&c.screen==='dashboard'?left:0},clear(){owner=null;left=0}})}
function connect({document=root.document,getContext=()=>root.TradeFlowHostLifecycle?.getContext()}={}){
 const app=document.getElementById('app'),memory=createMemory();let row=null;
 const context=()=>{try{return getContext()}catch{return null}};
 function save(){if(row?.isConnected)memory.save(context(),row.scrollLeft)}
 function mount(){const c=context(),next=app.querySelector('.tf-home-stats');memory.read(c);if(next===row)return;row?.removeEventListener('scroll',save);row=next;if(row){row.scrollLeft=memory.read(c);row.addEventListener('scroll',save,{passive:true})}}
 const observer=new root.MutationObserver(mount);observer.observe(app,{childList:true,subtree:true});mount();
 return Object.freeze({dispose(){observer.disconnect();row?.removeEventListener('scroll',save);memory.clear();row=null}});
}
const api={createMemory,connect};if(typeof module==='object'&&module.exports)module.exports=api;else{root.TradeFlowHomeMetrics=api;const start=()=>{api.instance=connect()};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start()}
})(typeof window==='object'?window:globalThis);
