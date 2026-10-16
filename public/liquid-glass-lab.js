/* TradeFlow Liquid Glass Lab V0.8
   Opt-in on the development preview with ?glass-preview=1.
   No customer data, Worker calls, app state migrations or production changes.
   The original AI launcher remains the default when the flag is absent.
*/
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 if(new URLSearchParams(window.location.search).get('glass-preview')!=='1')return;

 const media=window.matchMedia('(max-width:850px)');
 const reduceMotion=window.matchMedia('(prefers-reduced-motion:reduce)');
 const HOLD_MS=930,TRANSITION_MS=1180;
 const ease=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x)};
 const smooth=(a,b,v)=>ease((v-a)/(b-a));
 const clamp=v=>Math.min(1,Math.max(0,v));
 let state='visible',transition=null,hold=null,raf=0,skipClickUntil=0;
 let orbRect=null,bar=null,footer=null,glass=null,rim=null,root=null,trigger=null,fluid=null,glint=null,hint=null;
 let hintTimer=0,frameQueued=false,latestFill=0;
 try{state=sessionStorage.getItem('tf-glass-lab-docked')==='yes'?'docked':'visible'}catch(e){}

 function init(){
  if(!document.body)return;
  root=document.createElement('div');
  root.id='tf-lg-root';
  root.setAttribute('aria-label','TradeFlow glass prototype');
  root.innerHTML=
    '<svg class="tf-lg-flow" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">'+
      '<defs><linearGradient id="tf-lg-fluid-fill" x1="0" y1="0" x2="1" y2="0">'+
        '<stop offset="0" stop-color="#e5fbff" stop-opacity=".32"/>'+
        '<stop offset=".27" stop-color="#f6ffff" stop-opacity=".68"/>'+
        '<stop offset=".57" stop-color="#cadce5" stop-opacity=".19"/>'+
        '<stop offset="1" stop-color="#e4f7fb" stop-opacity=".53"/>'+
      '</linearGradient></defs>'+
      '<path class="tf-lg-flow-path"/><path class="tf-lg-flow-highlight"/>'+
    '</svg>'+
    '<button class="tf-lg-trigger" type="button" aria-label="TradeFlow AI. Tap to open, hold for glass docking" title="TradeFlow AI · hold to merge into footer">'+
      '<span class="tf-lg-rim-charge"></span>'+
      '<span class="tf-lg-optics"><span class="tf-lg-brand"><span class="tf-brand-mark" aria-hidden="true"><span class="tf-brand-top"></span><span class="tf-brand-stem"></span><span class="tf-brand-accent"></span></span></span></span>'+
    '</button>'+
    '<div class="tf-lg-hint" role="status" aria-live="polite"></div>';
  document.body.appendChild(root);
  trigger=root.querySelector('.tf-lg-trigger');
  fluid=root.querySelector('.tf-lg-flow-path');
  glint=root.querySelector('.tf-lg-flow-highlight');
  hint=root.querySelector('.tf-lg-hint');

  footer=document.createElement('div');
  footer.className='tf-lg-footer-layer';
  footer.innerHTML='<div class="tf-lg-foot-glass"></div>'+
    '<svg class="tf-lg-foot-rim" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path/></svg>';
  glass=footer.querySelector('.tf-lg-foot-glass');
  rim=footer.querySelector('.tf-lg-foot-rim');

  trigger.addEventListener('pointerdown',onVisiblePointerDown);
  trigger.addEventListener('pointerup',onVisiblePointerUp);
  trigger.addEventListener('pointercancel',cancelHold);
  trigger.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});
  trigger.addEventListener('keydown',e=>{
   if(e.key!=='Enter'&&e.key!==' ')return;
   e.preventDefault();
   if(state==='docked')startTransition('restore');
   else if(state==='visible')openOriginalAI();
  });
  document.addEventListener('pointerdown',onDockedPointerDown,true);
  document.addEventListener('pointermove',onPointerMove,true);
  document.addEventListener('pointerup',onDocumentPointerUp,true);
  document.addEventListener('pointercancel',onDocumentPointerCancel,true);
  document.addEventListener('click',e=>{
   if(Date.now()>skipClickUntil||!orbRect)return;
   if(inside(e.clientX,e.clientY,orbRect)){
    e.preventDefault();e.stopImmediatePropagation();
   }
  },true);
  document.addEventListener('contextmenu',e=>{
   if(state==='docked'&&orbRect&&inside(e.clientX,e.clientY,orbRect))e.preventDefault();
  },true);
  window.addEventListener('resize',scheduleSync,{passive:true});
  window.visualViewport?.addEventListener('resize',scheduleSync,{passive:true});
  media.addEventListener?.('change',scheduleSync);

  const app=document.getElementById('app');
  if(app)new MutationObserver(scheduleSync).observe(app,{childList:true,subtree:true});
  sync();
  if(root&&!root.hidden)showHint(state==='docked'?'Hold the same corner to reform the AI glass':'GLASS LAB · Hold AI for 0.9s to merge it into the footer');
 }
 function inside(x,y,r){
  return Number.isFinite(x)&&Number.isFinite(y)&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
 }
 function scheduleSync(){
  if(frameQueued)return;
  frameQueued=true;
  requestAnimationFrame(()=>{frameQueued=false;sync()});
 }
 function sync(){
  const mobile=media.matches;
  const native=document.querySelector('#tfAiOverlayRoot .tf-ai-orb');
  const nav=document.querySelector('.mobilebar');
  const canShow=!!(mobile&&native&&nav&&getComputedStyle(nav).display!=='none');
  document.body.classList.toggle('tf-lg-enabled',canShow);
  root.hidden=!canShow;
  if(!canShow){if(hold)cancelHold();return}
  bar=nav;
  orbRect=native.getBoundingClientRect();
  trigger.style.left=orbRect.left+'px';
  trigger.style.top=orbRect.top+'px';
  trigger.style.width=orbRect.width+'px';
  trigger.style.height=orbRect.height+'px';
  if(footer.parentElement!==bar)bar.prepend(footer);
  root.querySelector('.tf-lg-flow').setAttribute('viewBox','0 0 '+window.innerWidth+' '+window.innerHeight);
  trigger.classList.toggle('is-docked',state==='docked');
  trigger.tabIndex=0;
  trigger.setAttribute('aria-label',state==='docked'?'AI glass merged into footer. Press Enter or hold this corner to restore':'TradeFlow AI. Tap to open, hold to merge glass into footer');
  footer.classList.toggle('is-full',state==='docked');
  if(!transition)renderFrame(state==='docked'?1:0,0,false);
 }
 function showHint(message){
  hint.textContent=message;
  hint.classList.add('visible');
  clearTimeout(hintTimer);
  hintTimer=setTimeout(()=>hint.classList.remove('visible'),3600);
 }
 function openOriginalAI(){
  const original=document.querySelector('#tfAiOverlayRoot .tf-ai-orb');
  if(original&&state==='visible')original.click();
 }
 function cancelHold(){
  if(!hold)return;
  clearTimeout(hold.timer);
  cancelAnimationFrame(hold.frame);
  hold=null;
  trigger.classList.remove('is-holding');
  trigger.style.setProperty('--lg-charge','0deg');
  if(!transition)resetOrbVisual();
 }
 function trackHold(){
  if(!hold)return;
  const amount=clamp((performance.now()-hold.start)/HOLD_MS);
  trigger.style.setProperty('--lg-charge',(amount*360)+'deg');
  hold.frame=requestAnimationFrame(trackHold);
 }
 function startHold(event,mode){
  if(transition||hold)return;
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const record={id:event.pointerId,start:performance.now(),x:event.clientX,y:event.clientY,mode,timer:null,frame:0};
  hold=record;
  trigger.classList.add('is-holding');
  trackHold();
  record.timer=setTimeout(()=>{
   if(hold!==record)return;
   hold=null;
   cancelAnimationFrame(record.frame);
   trigger.classList.remove('is-holding');
   trigger.style.setProperty('--lg-charge','0deg');
   skipClickUntil=Date.now()+720;
   vibrate();
   startTransition(record.mode==='restore'?'restore':'dock');
  },HOLD_MS);
 }
 function onVisiblePointerDown(e){
  if(state!=='visible'||transition)return;
  e.preventDefault();
  startHold(e,'dock');
  try{trigger.setPointerCapture(e.pointerId)}catch(err){}
 }
 function onVisiblePointerUp(e){
  if(state!=='visible'||!hold||hold.id!==e.pointerId)return;
  cancelHold();
  if(Date.now()>skipClickUntil)openOriginalAI();
 }
 function onDockedPointerDown(e){
  if(state!=='docked'||transition||!orbRect||e.target.closest?.('#tf-lg-root'))return;
  if(!inside(e.clientX,e.clientY,orbRect))return;
  // This target does not intercept short taps: the map or screen beneath stays usable.
  startHold(e,'restore');
 }
 function onPointerMove(e){
  if(!hold||e.pointerId!==hold.id)return;
  if(Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>12)cancelHold();
 }
 function onDocumentPointerUp(e){
  if(!hold||e.pointerId!==hold.id||hold.mode!=='restore')return;
  cancelHold();
 }
 function onDocumentPointerCancel(e){
  if(hold&&e.pointerId===hold.id)cancelHold();
 }
 function vibrate(){
  if(typeof navigator.vibrate!=='function')return;
  try{if(localStorage.getItem('tf-ui-haptics')!=='off')navigator.vibrate(11)}catch(e){}
 }
 function resetOrbVisual(){
  const shell=trigger.querySelector('.tf-lg-optics');
  shell.style.transform='';
  shell.style.opacity=state==='docked'?'0':'1';
  shell.style.borderRadius='';
  trigger.style.setProperty('--lg-charge','0deg');
 }
 function surface(fill,time,rect){
  const pts=[],wv=2.4*Math.sin(Math.PI*fill);
  for(let i=0;i<=30;i++){
   const u=i/30;
   const lag=.085*(1-u);
   const local=clamp((fill-lag)/(1-lag));
   const wave=wv*(.58*Math.sin(u*15.2+time*4)+.42*Math.sin(u*7.1-time*2));
   pts.push([u*rect.width,(1-local)*rect.height+wave]);
  }
  return pts;
 }
 function updateFooter(fill,time){
  if(!bar||footer.parentElement!==bar)return;
  const rect=bar.getBoundingClientRect();
  const pts=surface(fill,time,rect);
  if(fill<=.001){
   glass.style.clipPath='inset(100% 0 0 0)';
   glass.style.opacity='0';
   rim.style.opacity='0';
  }else if(fill>=.999){
   glass.style.clipPath='inset(0)';
   glass.style.opacity='1';
   rim.style.opacity='.15';
  }else{
   const polygon=['0% 100%'];
   for(const [x,y] of pts)polygon.push((x/rect.width*100).toFixed(2)+'% '+clamp(y/rect.height).toFixed(4)*100+'%');
   polygon.push('100% 100%');
   glass.style.clipPath='polygon('+polygon.join(',')+')';
   glass.style.opacity='1';
   rim.style.opacity=String(.32+.4*Math.sin(Math.PI*fill));
  }
  rim.setAttribute('viewBox','0 0 '+rect.width+' '+rect.height);
  rim.firstChild.setAttribute('d',pts.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' '));
  latestFill=fill;
 }
 function updateFlow(p,isAnimating){
  if(!isAnimating||!bar||!orbRect){fluid.setAttribute('d','');glint.setAttribute('d','');return}
  // One continuous strand of optical glass with a subtle curved edge; not a blue liquid jet.
  const stream=Math.sin(Math.PI*smooth(.10,.81,p));
  if(stream<.035){fluid.setAttribute('d','');glint.setAttribute('d','');return}
  const rect=bar.getBoundingClientRect(),x=orbRect.left+orbRect.width*.56;
  const sy=orbRect.top+orbRect.height*.72+smooth(.08,.7,p)*15;
  const ey=sy+(rect.top+5-sy)*smooth(.10,.52,p);
  const width=(4+8*Math.sin(Math.PI*clamp(p)))*stream;
  const bend=3.5*Math.sin(p*9);
  const left=x-width/2,right=x+width/2;
  const d='M '+left.toFixed(2)+' '+sy.toFixed(2)+
   ' C '+(left-2+bend).toFixed(2)+' '+(sy+18).toFixed(2)+
   ' '+(x-8+bend).toFixed(2)+' '+(ey-13).toFixed(2)+
   ' '+(x-3).toFixed(2)+' '+ey.toFixed(2)+
   ' Q '+x.toFixed(2)+' '+(ey+3).toFixed(2)+' '+(x+3).toFixed(2)+' '+ey.toFixed(2)+
   ' C '+(x+7+bend).toFixed(2)+' '+(ey-15).toFixed(2)+
   ' '+(right+2+bend).toFixed(2)+' '+(sy+20).toFixed(2)+
   ' '+right.toFixed(2)+' '+sy.toFixed(2)+' Z';
  fluid.setAttribute('d',d);
  fluid.style.opacity=String(stream*.74);
  glint.setAttribute('d','M '+(left+1.1).toFixed(2)+' '+(sy+1).toFixed(2)+
   ' C '+(left-1+bend).toFixed(2)+' '+(sy+16).toFixed(2)+
   ' '+(x-8+bend).toFixed(2)+' '+(ey-12).toFixed(2)+
   ' '+(x-3).toFixed(2)+' '+(ey-2).toFixed(2));
  glint.style.opacity=String(stream*.65);
 }
 function renderFrame(melt,t,isAnimating){
  if(!root||root.hidden)return;
  const shell=trigger.querySelector('.tf-lg-optics');
  const movement=smooth(.04,.79,melt);
  const collapse=smooth(.27,.82,melt);
  shell.style.transform='translate3d(0,'+(movement*23).toFixed(2)+'px,0) scale('+
   (1-.64*collapse+.04*Math.sin(melt*Math.PI)).toFixed(3)+','+
   (1-.62*collapse).toFixed(3)+')';
  shell.style.opacity=String(1-smooth(.43,.91,melt));
  shell.style.borderRadius=(20+12*movement).toFixed(1)+'px '+(20+12*movement).toFixed(1)+'px '+(20+13*movement).toFixed(1)+'px '+(20+13*movement).toFixed(1)+'px';
  const fill=smooth(.37,.98,melt);
  updateFooter(fill,t);
  updateFlow(melt,isAnimating);
 }
 function startTransition(direction){
  if(transition||!(state==='visible'||state==='docked'))return;
  cancelHold();
  if(direction==='dock'){
   // Dismiss any open AI panel before the orb is merged with navigation.
   const panel=document.getElementById('tfAiPanel');
   if(panel){const close=panel.querySelector('[data-action="tfAiClose"]');close?.click()}
  }
  footer.classList.remove('is-full');
  state='animating';
  transition={direction,start:performance.now(),duration:reduceMotion.matches?230:TRANSITION_MS};
  showHint(direction==='dock'?'LIQUID GLASS / MERGING INTO FOOTER':'LIQUID GLASS / REFORMING');
  if(!raf)raf=requestAnimationFrame(tick);
 }
 function tick(now){
  raf=0;
  if(!transition||root.hidden)return;
  const p=clamp((now-transition.start)/transition.duration);
  const melt=transition.direction==='dock'?p:1-p;
  renderFrame(melt,now/1000,true);
  if(p>=1){
   state=transition.direction==='dock'?'docked':'visible';
   transition=null;
   try{sessionStorage.setItem('tf-glass-lab-docked',state==='docked'?'yes':'no')}catch(e){}
   footer.classList.toggle('is-full',state==='docked');
   trigger.classList.toggle('is-docked',state==='docked');
   trigger.setAttribute('aria-label',state==='docked'?'AI glass merged into footer. Hold here again to restore':'TradeFlow AI. Tap to open, hold to merge into footer');
   showHint(state==='docked'?'AI MERGED · Hold the same corner to restore':'AI RESTORED · Tap to open');
   if(state==='visible')resetOrbVisual();
   else trigger.querySelector('.tf-lg-optics').style.opacity='0';
   updateFlow(0,false);
   return;
  }
  raf=requestAnimationFrame(tick);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
