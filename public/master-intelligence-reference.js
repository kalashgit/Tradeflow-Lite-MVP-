/* TradeFlow Master Intelligence — video-backed founder-approved orb.
 * Media changes ONLY the welcome-page visual. The surrounding button keeps its
 * existing voice activation and greeting behavior. No WebGL/canvas renderer.
 */
(function(root){
 'use strict';
 if(!root.document)return;
 const iconPaths=[
  '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  '<path d="M4 20V12M9 20V6M14 20V10M19 20V3"/>'
 ];
 let host=null,detach=null,observer=null,closed=false;
 const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)');
 function attach(button){
  const video=button.querySelector('.tf-master-orb-video');
  const fallback=button.querySelector('.tf-master-orb-gif-fallback');
  if(!video||!fallback)return ()=>{};
  let active=true,visible=false,playing=false,firstTime=null;
  const showFallback=()=>{
   button.classList.remove('video-ready');
   button.dataset.meshState='fallback';
   playing=false;
  };
  const onFallbackError=()=>{
   // Keep a known-good original image available even if the new GIF is missing.
   if(!fallback.dataset.legacyFallback){
    fallback.dataset.legacyFallback='1';
    fallback.src='./orb-concept-b/reference.gif';
   }
  };
  fallback.addEventListener('error',onFallbackError);
  const markReady=()=>{
   if(!active||reduced?.matches)return;
   // iOS WebKit may fire canplay without ever presenting a video frame.
   if(video.readyState<2||video.paused)return;
   playing=true;
   button.classList.add('video-ready');
   button.dataset.meshState='video';
  };
  const onPlaying=()=>{
   if(!active||reduced?.matches)return;
   // Wait for an actual decoded frame before removing the animated GIF.
   if(typeof video.requestVideoFrameCallback==='function'){
    video.requestVideoFrameCallback(()=>{if(active&&!video.paused)markReady()});
   }else markReady();
  };
  const tryPlay=()=>{
   if(!active||reduced?.matches||root.document.hidden)return;
   const promise=video.play();
   promise?.catch?.(()=>showFallback());
  };
  const onVisibility=()=>{
   if(root.document.hidden){video.pause();showFallback();}
   else tryPlay();
  };
  const onReduced=()=>{
   if(reduced?.matches){video.pause();showFallback();button.dataset.meshState='reduced';}
   else tryPlay();
  };
  const onError=()=>showFallback();
  const onWaiting=()=>{if(!playing)showFallback();};
  const listeners=[['playing',onPlaying],['loadeddata',onPlaying],['error',onError],['stalled',onError],['waiting',onWaiting],['emptied',onError]];
  listeners.forEach(([event,handler])=>video.addEventListener(event,handler));
  root.document.addEventListener('visibilitychange',onVisibility);
  reduced?.addEventListener?.('change',onReduced);
  video.muted=true;video.loop=true;video.playsInline=true;video.defaultMuted=true;
  button.dataset.meshState='loading';
  if(reduced?.matches){button.dataset.meshState='reduced';video.pause();}
  else tryPlay();
  return ()=>{
   active=false;
   video.pause();
   listeners.forEach(([event,handler])=>video.removeEventListener(event,handler));
   fallback.removeEventListener('error',onFallbackError);
   root.document.removeEventListener('visibilitychange',onVisibility);
   reduced?.removeEventListener?.('change',onReduced);
   button.classList.remove('video-ready');
  };
 }
 function sync(){
  if(closed)return;
  const current=root.document.querySelector('.tf-master-welcome .tf-master-orb');
  if(current!==host){
   detach?.();detach=null;
   host=current;
   if(host)detach=attach(host);
  }
  root.document.querySelectorAll('.tf-master-starters button span').forEach((el,i)=>{
   if(!iconPaths[i]||el.querySelector('svg'))return;
   el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconPaths[i]+'</svg>';
  });
 }
 function start(){
  observer=new root.MutationObserver(sync);
  observer.observe(root.document.querySelector('#app')||root.document.body,{childList:true,subtree:true});
  sync();
  root.addEventListener('pagehide',()=>{closed=true;observer?.disconnect();detach?.();detach=null;host=null},{once:true});
 }
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(window);
