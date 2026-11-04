/* TF-GUI-ORB-IDLE-01 — visual-only, reference-informed living mesh.
 * No voice capture, speech claim, record access, or new command executor.
 * Renders into the existing TradeFlow Intelligence button and preserves its click.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TradeFlowOrbIdle = api;
  if (root && root.document) {
    const begin = () => api.attach({ document: root.document, root });
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', begin, { once: true });
    else begin();
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const MEAN_RADIUS = .90;
  // Wrapped Gaussian packets make fold activity local rather than imposing
  // a regular pentagonal / hexagonal silhouette on the whole membrane.
  const edgePacket=(angle,center,width)=>{
    const d=Math.sin((angle-center)/2);
    return Math.exp(-2*d*d/(width*width));
  };
  // Zero-mean angular modes keep the diameter stable while localized folds
  // pass around the edge. None of the modes scales the orb as a whole.
  function surfaceRadius(angle, t) {
    const a=Number(angle),time=Number(t);
    if(!Number.isFinite(a)||!Number.isFinite(time))return MEAN_RADIUS;
    return MEAN_RADIUS+.009*Math.sin(6*a+.24*time)
      +.005*Math.sin(13*a-.13*time+.3)
      +.030*(edgePacket(a,.35+.16*time,.33)-edgePacket(a,3.15-.11*time,.33))
      +.015*(edgePacket(a,-1.45+.12*time,.22)-edgePacket(a,1.7+.09*time,.22));
  }
  // A single advected displacement field drives every neighboring strand.
  // The boundary term draws internal threads into the SAME moving edge folds.
  function meshPoint(x,y,t){
    const distance=Math.min(1,Math.hypot(x,y));
    const boundaryCoupling=distance>.55
      ?(surfaceRadius(Math.atan2(y,x),t)/MEAN_RADIUS-1)*distance*distance*.78
      :0;
    const xx=x+.013*Math.sin(y*8.7+x*3.8-t*.28)
      +.007*Math.sin(y*14.1-x*7.3+t*.16);
    const yy=y+.046*Math.sin(x*7.4+y*2.7-t*.35)
      +.018*Math.sin(x*15.8-y*5.4+t*.29)
      +.010*Math.sin(x*24.0+y*8.8-t*.13);
    return [xx*(1+boundaryCoupling),yy*(1+boundaryCoupling)];
  }
  // Light is a differential of the actual deforming contour, never a rotating halo.
  function foldLight(angle,t){
    const delta=.056,r=surfaceRadius(angle,t);
    const curvature=Math.abs(surfaceRadius(angle+delta,t)-2*r+surfaceRadius(angle-delta,t));
    const slope=Math.abs(surfaceRadius(angle+delta,t)-surfaceRadius(angle-delta,t));
    return clamp(curvature*210+slope*15,0,1);
  }
  function createRenderer(canvas, { root, document } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return null;
    let disposed = false, lastTime = null, elapsed = 0, raf = 0, frameCount = 0, painting = false;
    const reducedQuery = root.matchMedia?.('(prefers-reduced-motion: reduce)');
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      // This is a tiny persistent UI surface; cap raster work on high-DPR phones.
      const ratio = clamp(root.devicePixelRatio || 1, 1, 2);
      const width = clamp(Math.round(bounds.width * ratio), 2, 520);
      const height = clamp(Math.round(bounds.height * ratio), 2, 520);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      return Math.min(width, height);
    };
    const paintTimes=[],drawIntervals=[];
    let lastDrawTime=-Infinity,lastPaintAt=null;
    const sample=(array,n)=>{array.push(n);if(array.length>180)array.shift()};
    const nowMs=()=>root.performance?.now?.()??Date.now();
    function render(t=0){
      if(disposed||painting)return;
      painting=true;
      const started=nowMs();
      try{
        const size=resize(),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,r=size/2;
        ctx.clearRect(0,0,w,h);
        const edge=new Path2D();
        const edgeSteps=240;
        for(let i=0;i<=edgeSteps;i++){
          const angle=TAU*i/edgeSteps,rr=r*surfaceRadius(angle,t);
          const x=cx+rr*Math.cos(angle),y=cy+rr*Math.sin(angle);
          if(i===0)edge.moveTo(x,y);else edge.lineTo(x,y);
        }
        edge.closePath();
        ctx.save();
        ctx.clip(edge);
        // Near-black membrane backing: the Home cards must never show through.
        // No opaque colored disc, radial glass gradient, or baked-in highlight.
        ctx.fillStyle='rgba(3,9,26,.975)';
        ctx.fill(edge);
        // At native 66 CSS px the old 78 dim threads averaged into one dark
        // color. Calibrate thread spacing to actual raster pitch instead.
        const threads=clamp(Math.round(size*.43),44,154);
        const steps=clamp(Math.round(size*.68),78,230);
        const left=cx-r*.88,right=cx+r*.88;
        ctx.lineWidth=clamp(size/160,.76,1.30);
        ctx.lineCap='round';
        ctx.lineJoin='round';
        ctx.globalCompositeOperation='screen';
        for(let j=0;j<=threads;j++){
          const y0=(2*j/threads-1)*.90;
          // Every bright interval is derived from actual local thread
          // compression and tilt. Brightness moves WITH the woven material.
          const grad=ctx.createLinearGradient(left,0,right,0);
          for(let m=0;m<=8;m++){
            const u=m/8,x0=(u*2-1)*.88;
            const upper=meshPoint(x0,y0+.008,t)[1],lower=meshPoint(x0,y0-.008,t)[1];
            const spacing=(upper-lower)/.016;
            const density=clamp((1.04-spacing)*2.5,-.35,.65);
            const before=meshPoint(x0-.008,y0,t)[1],after=meshPoint(x0+.008,y0,t)[1];
            const foldTilt=clamp(Math.abs(after-before)/.016,0,.9);
            const edgeGlow=.12*Math.pow(Math.abs(x0)/.88,2);
            const alpha=clamp(.71+.22*density+.12*foldTilt+edgeGlow,.60,.98);
            // Founder correction: reference texture and motion, deliberately
            // BLUE rather than the source video's violet-dominant palette.
            const red=Math.round(37+28*u+23*foldTilt);
            const green=Math.round(94+103*u+23*density);
            const blue=Math.round(205+47*u);
            grad.addColorStop(u,`rgba(${red},${green},${blue},${alpha.toFixed(3)})`);
          }
          ctx.strokeStyle=grad;
          ctx.beginPath();
          for(let k=0;k<=steps;k++){
            const x0=(2*k/steps-1)*.88,p=meshPoint(x0,y0,t);
            const x=cx+p[0]*r,y=cy+p[1]*r;
            if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          }
          ctx.stroke();
        }
        // Subtle cross-woven fibers share the same displaced surface.
        // Very low contrast keeps them from becoming a rigid latitude grid.
        ctx.globalCompositeOperation='source-over';
        ctx.lineWidth=clamp(size/320,.40,.70);
        ctx.strokeStyle='rgba(60,157,252,.095)';
        for(let i=0;i<=26;i++){
          const x0=(2*i/26-1)*.85;
          ctx.beginPath();
          for(let k=0;k<=64;k++){
            const y0=(2*k/64-1)*.89,p=meshPoint(x0,y0,t);
            if(k===0)ctx.moveTo(cx+p[0]*r,cy+p[1]*r);
            else ctx.lineTo(cx+p[0]*r,cy+p[1]*r);
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        const rim=ctx.createLinearGradient(cx-r,cy+r,cx+r,cy-r);
        rim.addColorStop(0,'rgba(51,117,235,.45)');
        rim.addColorStop(.32,'rgba(60,150,253,.50)');
        rim.addColorStop(.67,'rgba(83,198,255,.55)');
        rim.addColorStop(1,'rgba(103,219,255,.48)');
        ctx.strokeStyle=rim;
        ctx.lineWidth=clamp(size/195,.64,1.10);
        ctx.shadowColor='rgba(38,136,255,.42)';
        ctx.shadowBlur=clamp(size*.022,1.8,4.5);
        ctx.stroke(edge);
        ctx.shadowBlur=0;
        // Localized curvature glints and near-edge folded-sheet contours.
        // Both follow the SAME surfaceRadius field as the mesh boundary.
        for(let i=0;i<edgeSteps;i++){
          const a=TAU*i/edgeSteps,b=TAU*(i+1)/edgeSteps;
          const light=foldLight((a+b)/2,t);
          if(light<.37)continue;
          const ra=r*surfaceRadius(a,t),rb=r*surfaceRadius(b,t);
          ctx.globalAlpha=clamp((light-.28)*.86,0,.67);
          ctx.lineWidth=clamp(size/220,.58,.99);
          ctx.strokeStyle=light>.68?'#b9edff':'#66c7ff';
          ctx.beginPath();
          ctx.moveTo(cx+ra*Math.cos(a),cy+ra*Math.sin(a));
          ctx.lineTo(cx+rb*Math.cos(b),cy+rb*Math.sin(b));
          ctx.stroke();
          if(light>.66){
            const inset=r*(.018+.009*light);
            ctx.globalAlpha=(light-.55)*.32;
            ctx.strokeStyle='#8fcfff';
            ctx.beginPath();
            ctx.moveTo(cx+(ra-inset)*Math.cos(a),cy+(ra-inset)*Math.sin(a));
            ctx.lineTo(cx+(rb-inset)*Math.cos(b),cy+(rb-inset)*Math.sin(b));
            ctx.stroke();
          }
        }
        ctx.restore();
        frameCount++;
      } finally {
        const measured=nowMs()-started;
        if(Number.isFinite(measured)&&measured>=0)sample(paintTimes,measured);
        painting=false;
      }
    }
    function animate(now){
      if(disposed)return;
      raf=0;
      if(document.hidden||!canvas.isConnected||reducedQuery?.matches)return;
      if(lastTime===null)lastTime=now;
      const dt=clamp((now-lastTime)/1000,0,.07);
      lastTime=now;elapsed+=dt;
      // Cap the paint workload around 30 fps on mobile. Intervening RAFs only
      // advance the shared time field; no hidden high-rate canvas work.
      if(now-lastDrawTime>=32){
        if(lastPaintAt!==null)sample(drawIntervals,now-lastPaintAt);
        lastPaintAt=now;
        render(elapsed);
        lastDrawTime=now;
      }
      raf=root.requestAnimationFrame(animate);
    }
    function resume() {
      if (disposed) return;
      if (raf) root.cancelAnimationFrame(raf);
      lastTime = null;
      render(reducedQuery?.matches ? 0 : elapsed);
      lastDrawTime=-Infinity;lastPaintAt=null;
      if (!document.hidden && !reducedQuery?.matches) raf = root.requestAnimationFrame(animate);
    }
    const visibility = () => {
      if (document.hidden) { if (raf) root.cancelAnimationFrame(raf); raf = 0; }
      else resume();
    };
    const preference = () => resume();
    document.addEventListener('visibilitychange', visibility);
    reducedQuery?.addEventListener?.('change', preference);
    resume();
    return Object.freeze({
      renderAt: render,
      stats: () => {
        const sorted=[...paintTimes].sort((a,b)=>a-b);
        const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:0;
        const interval=mean(drawIntervals);
        return Object.freeze({frames:frameCount,time:elapsed,
          reducedMotion:!!reducedQuery?.matches,
          avgPaintMs:+mean(paintTimes).toFixed(2),
          p95PaintMs:+(sorted[Math.floor((sorted.length-1)*.95)]||0).toFixed(2),
          maxPaintMs:+(sorted[sorted.length-1]||0).toFixed(2),
          observedFps:interval?+(1000/interval).toFixed(1):0,
          canvasPx:{width:canvas.width,height:canvas.height}});
      },
      dispose() {
        disposed = true;
        if (raf) root.cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', visibility);
        reducedQuery?.removeEventListener?.('change', preference);
      }
    });
  }
  let activeController=null;
  function attach({ document, root } = {}) {
    if (!document || !root) return null;
    let currentButton = null, renderer = null, disposed = false;
    function sync() {
      if (disposed) return;
      const button = document.querySelector('.tf-ai-orb');
      if (button === currentButton && renderer) return;
      renderer?.dispose();
      renderer = null; currentButton = button;
      if (!button) return;
      const canvas = document.createElement('canvas');
      canvas.className = 'tf-orb-mesh';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('data-idle-material', 'woven-blue-v3');
      // Decorative child only: parent button's data-action owns the click.
      button.appendChild(canvas);
      renderer = createRenderer(canvas, { document, root });
      button.dataset.orbMaterial = renderer ? 'woven-blue-v3' : 'fallback';
    }
    const observer = new root.MutationObserver(() => sync());
    const host = document.querySelector('#app');
    if (host) observer.observe(host, { childList: true, subtree: true });
    else observer.observe(document.documentElement, { childList: true, subtree: true });
    sync();
    const controller=Object.freeze({
      sync, active:()=>!!renderer,
      stats:()=>renderer?.stats()||null,
      dispose(){disposed=true;observer.disconnect();renderer?.dispose();renderer=null;
        if(activeController===controller)activeController=null;}
    });
    activeController=controller;
    return controller;
  }
  return Object.freeze({ version: 'woven-blue-v3', surfaceRadius, meshPoint, foldLight,
    createRenderer, attach, stats:()=>activeController?.stats()||null });
});
