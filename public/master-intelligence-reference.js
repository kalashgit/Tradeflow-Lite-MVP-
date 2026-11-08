/* Master Intelligence welcome orb — continuously flowing frame-spline canvas.
   Nine native membrane atlas frames are blended with cubic B-spline weights.
   The reference GIF stays visible until canvas draws its first frame and is
   used as fallback when Canvas2D, image decode or animation is unavailable.
   No business data, microphone, or command authority is used. */
(function(root){
 'use strict';
 if(!root.document)return;
 const iconPaths=[
  '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  '<path d="M4 20V12M9 20V6M14 20V10M19 20V3"/>'
 ];
 const FRAME_WIDTH=420,FRAME_HEIGHT=408,FRAME_COUNT=9,SECONDS_PER_FRAME=.25;
 const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)');
 let host=null,disposeAnimation=null;
 let animationGeneration=0;
 function initAnimation(button){
  const generation=++animationGeneration;
  const canvas=root.document.createElement('canvas');
  canvas.className='tf-master-live-mesh';
  canvas.setAttribute('aria-hidden','true');
  canvas.dataset.motionFrames='0';
  button.appendChild(canvas);
  button.dataset.meshState='loading';
  const context=canvas.getContext('2d',{alpha:false});
  if(!context){button.dataset.meshState='fallback';return ()=>canvas.remove();}
  const image=new root.Image();
  image.decoding='async';
  let running=true,raf=0,startTime=null,pauseOffset=0,pausedAt=null,paintCount=0,lastDraw=-Infinity;
  const stop=()=>{running=false;if(raf)root.cancelAnimationFrame(raf);raf=0;image.onload=null;image.onerror=null;observer?.disconnect();canvas.remove();};
  const observer=new root.ResizeObserver(()=>{lastDraw=-Infinity;});
  observer.observe(button);
  function frame(now){
   raf=0;
   if(!running||!button.isConnected||generation!==animationGeneration)return;
   if(root.document.hidden){pausedAt=now;return;}
   if(pausedAt!==null){pauseOffset+=now-pausedAt;pausedAt=null;}
   if(startTime===null)startTime=now;
   const elapsed=Math.max(0,(now-startTime-pauseOffset)/1000);
   // Draw in every animation frame when possible (up to the device refresh rate).
   if(now-lastDraw>=12||lastDraw===-Infinity){
    lastDraw=now;
    const box=button.getBoundingClientRect();
    const dpr=Math.min(2,Math.max(1,root.devicePixelRatio||1));
    const w=Math.max(2,Math.round(box.width*dpr));
    const h=Math.max(2,Math.round(box.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const phase=elapsed/SECONDS_PER_FRAME;
    const index=Math.floor(phase)%FRAME_COUNT;
    const t=phase-Math.floor(phase);
    // Cubic uniform B-spline blends four adjacent frames, providing continuous
    // position, velocity and acceleration at every boundary. Unlike smoothstep
    // crossfades, it never brakes to a stop between adjacent atlas frames.
    const t2=t*t,t3=t2*t;
    const weights=[(1-3*t+3*t2-t3)/6,(4-6*t2+3*t3)/6,(1+3*t+3*t2-3*t3)/6,t3/6];
    context.clearRect(0,0,w,h);
    context.save();
    context.translate(w/2,h/2);
    const breath=reduced?.matches?1:1+.012*Math.sin(elapsed*1.9);
    const sway=reduced?.matches?0:.012*Math.sin(elapsed*.83);
    context.rotate(sway);
    context.scale(breath,breath);
    context.globalCompositeOperation='lighter';
    for(let k=0;k<4;k++){
     const frameIndex=(index+k+FRAME_COUNT-1)%FRAME_COUNT;
     context.globalAlpha=weights[k];
     context.drawImage(image,(frameIndex%3)*FRAME_WIDTH,Math.floor(frameIndex/3)*FRAME_HEIGHT,
      FRAME_WIDTH,FRAME_HEIGHT,-w/2,-h/2,w,h);
    }
    context.restore();
    paintCount++;
    canvas.dataset.motionFrames=String(paintCount);
    if(button.dataset.meshState!=='flowing')button.dataset.meshState='flowing';
   }
   if(running)raf=root.requestAnimationFrame(frame);
  }
  function resume(){
   if(!running||!image.complete||!image.naturalWidth||raf||root.document.hidden)return;
   pausedAt=root.performance.now();
   raf=root.requestAnimationFrame(frame);
  }
  function visibility(){
   if(root.document.hidden){if(raf)root.cancelAnimationFrame(raf);raf=0;pausedAt=root.performance.now();}
   else resume();
  }
  image.onload=()=>{if(!running)return;if(image.naturalWidth!==1260||image.naturalHeight!==1224){button.dataset.meshState='fallback';return;}resume();};
  image.onerror=()=>{if(running)button.dataset.meshState='fallback';};
  root.document.addEventListener('visibilitychange',visibility);
  const originalStop=stop;
  image.src=new URL('orb-concept-b/membrane.png',root.document.baseURI).href;
  return ()=>{root.document.removeEventListener('visibilitychange',visibility);originalStop();};
 }
 function sync(){
  const current=root.document.querySelector('.tf-master-welcome .tf-master-orb');
  if(current!==host){
   disposeAnimation?.();disposeAnimation=null;host=current;
   if(host)disposeAnimation=initAnimation(host);
  }
  if(!host)return;
  const cards=root.document.querySelectorAll('.tf-master-starters button span');
  cards.forEach((el,i)=>{
   if(!iconPaths[i]||el.querySelector('svg'))return;
   el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconPaths[i]+'</svg>';
  });
 }
 function start(){
  const target=root.document.querySelector('#app')||root.document.body;
  const observer=new root.MutationObserver(sync);
  observer.observe(target,{childList:true,subtree:true});
  sync();
  root.addEventListener('pagehide',()=>{observer.disconnect();disposeAnimation?.();disposeAnimation=null;host=null;},{once:true});
 }
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(window);
