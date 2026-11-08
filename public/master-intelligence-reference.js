/* TradeFlow Master Intelligence approved cyan mesh.
 * Restore the original optically-transported membrane, NOT a four-frame colour
 * blend. Keep the approved GIF visible unless rendered output actually moves.
 * Business/voice commands are unchanged. */
(function(root){
 'use strict';
 if(!root.document)return;
 const iconPaths=[
  '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  '<path d="M4 20V12M9 20V6M14 20V10M19 20V3"/>'
 ];
 let host=null,renderer=null,probe=0,observer=null,disposed=false;
 function teardown(){
  if(probe)root.cancelAnimationFrame(probe);
  probe=0;renderer?.dispose();renderer=null;
  host?.querySelectorAll('canvas.tf-master-live-mesh').forEach(el=>el.remove());
 }
 function startAnimation(button){
  button.dataset.meshState='loading';
  const canvas=root.document.createElement('canvas');
  canvas.className='tf-master-live-mesh';
  canvas.setAttribute('aria-hidden','true');
  canvas.dataset.motionFrames='0';
  button.appendChild(canvas);
  if(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   button.dataset.meshState='fallback';
   return;
  }
  const engine=root.TradeFlowOrbIdle;
  if(!engine?.createRenderer){
   button.dataset.meshState='fallback';
   return;
  }
  let frameCount=0,lastFingerprint=null,changes=0,firstReady=0;
  // A renderer being initialized is not evidence that its pixels are moving.
  // Test three real rendered frames before hiding the original reference GIF.
  function check(now){
   probe=0;
   if(disposed||host!==button||!button.isConnected)return;
   const stats=renderer?.stats?.();
   if(!stats?.ready||stats.backend!=='webgl-flow'||stats.contextLost){
    if(firstReady&&now-firstReady>1800)button.dataset.meshState='fallback';
    else probe=root.requestAnimationFrame(check);
    return;
   }
   if(!firstReady)firstReady=now;
   if(!stats.frames||now-firstReady>1800&&changes<2){
    if(now-firstReady>1800)button.dataset.meshState='fallback';
    else probe=root.requestAnimationFrame(check);
    return;
   }
   if(frameCount!==stats.frames){
    frameCount=stats.frames;
    canvas.dataset.motionFrames=String(frameCount);
    try{
     // Read a stable, tiny set of samples; toDataURL returns actual WebGL output
     // because the renderer uses preserveDrawingBuffer.
     const fingerprint=canvas.toDataURL('image/png');
     if(lastFingerprint&&fingerprint!==lastFingerprint)changes++;
     lastFingerprint=fingerprint;
    }catch{button.dataset.meshState='fallback';return;}
   }
   if(changes>=2){
    button.dataset.meshState='flowing';
    return;
   }
   probe=root.requestAnimationFrame(check);
  }
  try{
   renderer=engine.createRenderer(canvas,{document:root.document,root,continuousFlow:true,referenceMode:true,
    onReady:()=>{if(host===button&&button.isConnected&&!probe)probe=root.requestAnimationFrame(check)}});
  }catch{
   button.dataset.meshState='fallback';
   canvas.remove();
  }
 }
 function sync(){
  if(disposed)return;
  const current=root.document.querySelector('.tf-master-welcome .tf-master-orb');
  if(current!==host){
   teardown();host=current;
   if(host)startAnimation(host);
  }
  if(!host)return;
  root.document.querySelectorAll('.tf-master-starters button span').forEach((el,i)=>{
   if(!iconPaths[i]||el.querySelector('svg'))return;
   el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconPaths[i]+'</svg>';
  });
 }
 function start(){
  observer=new root.MutationObserver(sync);
  observer.observe(root.document.querySelector('#app')||root.document.body,{childList:true,subtree:true});
  sync();
  root.addEventListener('pagehide',()=>{disposed=true;observer?.disconnect();teardown();host=null},{once:true});
 }
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(window);
