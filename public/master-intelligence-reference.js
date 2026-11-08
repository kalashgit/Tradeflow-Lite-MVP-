/* Attach TradeFlow's existing living-mesh renderer to the Master Intelligence welcome orb.
   Preserves its separate persistent button renderer and its AI backend. */
(function(root){
 'use strict';
 if(!root.document)return;
 const iconPaths=[
  '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  '<path d="M4 20V12M9 20V6M14 20V10M19 20V3"/>'
 ];
 let host=null,renderer=null;
 function sync(){
  const current=root.document.querySelector('.tf-master-welcome .tf-master-orb');
  if(current===host&&(!host||host.querySelector('canvas')))return;
  if(renderer){renderer.dispose();renderer=null}
  host=current;
  if(!host)return;
  host.querySelectorAll('canvas').forEach(el=>el.remove());
  const canvas=root.document.createElement('canvas');
  canvas.className='tf-master-live-mesh';
  canvas.setAttribute('aria-hidden','true');
  host.appendChild(canvas);
  host.dataset.meshState='loading';
  renderer=root.TradeFlowOrbIdle?.createRenderer?.(canvas,{
   document:root.document,root,continuousFlow:true,referenceMode:true,
   onReady:()=>{if(host===current&&host.isConnected)host.dataset.meshState='flowing'}
  })||null;
  if(!renderer)host.dataset.meshState='unavailable';
  const cards=root.document.querySelectorAll('.tf-master-starters button span');
  cards.forEach((el,i)=>{if(!iconPaths[i]||el.querySelector('svg'))return;el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconPaths[i]+'</svg>'});
 }
 const start=()=>{
  const target=root.document.querySelector('#app')||root.document.body;
  const observer=new MutationObserver(sync);
  observer.observe(target,{childList:true,subtree:true});
  sync();
  root.addEventListener('pagehide',()=>{renderer?.dispose();renderer=null;observer.disconnect()},{once:true});
 };
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(window);
