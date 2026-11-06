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
  const MEAN_RADIUS = .895;
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
    return MEAN_RADIUS+.014*Math.sin(3*a-.09*time+1.1)
      +.009*Math.sin(7*a+.16*time)
      +.003*Math.sin(14*a-.11*time+.3)
      +.059*(edgePacket(a,.35+.14*time,.43)-edgePacket(a,3.15-.12*time,.43))
      +.041*(edgePacket(a,-1.45+.11*time,.39)-edgePacket(a,1.7+.09*time,.39))
      +.020*(edgePacket(a,-2.6+.08*time,.35)-edgePacket(a,.95-.09*time,.35));
  }
  // A bounded per-time angular table prevents thousands of extra Gaussian
  // evaluations when the mobile weave follows the same folded perimeter.
  const rimResolution=256, rimValues=new Float32Array(rimResolution),rimSlopes=new Float32Array(rimResolution);
  let rimTime=NaN;
  function prepareContour(t){
    if(t!==rimTime){
      for(let i=0;i<rimResolution;i++)rimValues[i]=surfaceRadius(i*TAU/rimResolution,t);
      for(let i=0;i<rimResolution;i++){
        // Six sample intervals approximate the original symmetric .08-radian
        // derivative while requiring zero extra exponentials per thread.
        rimSlopes[i]=(rimValues[(i+3)%rimResolution]-rimValues[(i+rimResolution-3)%rimResolution])/(6*TAU/rimResolution);
      }
      rimTime=t;
    }
  }
  function sampleContour(values,angle){
    // atan2 supplies [-pi,pi]; avoid modulo in the inner rendering loop.
    const raw=angle*rimResolution/TAU,at=raw<0?raw+rimResolution:raw;
    const i=Math.floor(at),f=at-i;
    return values[i]*(1-f)+values[(i+1)&255]*f;
  }
  // A single advected displacement field drives every neighboring strand.
  // The boundary term draws internal threads into the SAME moving edge folds.
  function meshPoint(x,y,t){
    const distance=Math.min(1,Math.hypot(x,y));
    const angle=Math.atan2(y,x);
    if(distance>.5)prepareContour(t);
    const boundaryCoupling=distance>.5
      ?(sampleContour(rimValues,angle)/MEAN_RADIUS-1)*distance*distance*.78
      :0;
    // The reference's threads form continuous, mostly horizontal families.
    // Two broad traveling folds advect their neighbors together. Deliberately
    // omit the old high-frequency fingerprint field and its static swirls.
    const foldA=Math.sin(2.65*x+1.25*y-.47*t);
    const foldB=Math.sin(5.1*x-1.25*y+.31*t);
    const crestX=.47*Math.sin(.22*t+.6);
    const ridge=Math.exp(-Math.pow((x-crestX-.28*y)/.28,2));
    const edgeGain=.52+.48*distance*distance;
    const dx=(.022*Math.sin(1.8*y+2.1*x+.25*t)+.009*foldB)*edgeGain;
    const dy=(.032*foldA+.013*foldB+.027*ridge*Math.sin(3.5*y+.42*t))*edgeGain;
    return [(x+dx)*(1+boundaryCoupling),(y+dy)*(1+boundaryCoupling)];
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
        const edge=new Path2D(),edgeSteps=240;
        for(let i=0;i<=edgeSteps;i++){
          const a=TAU*i/edgeSteps,rr=r*surfaceRadius(a,t);
          if(i===0)edge.moveTo(cx+rr*Math.cos(a),cy+rr*Math.sin(a));
          else edge.lineTo(cx+rr*Math.cos(a),cy+rr*Math.sin(a));
        }
        edge.closePath();
        ctx.save();
        ctx.clip(edge);
        // A dark, nearly opaque interior is essential at the compact size:
        // it prevents underlying Home text/cards showing through the fabric.
        // Depth comes from thread spacing and occlusion, not a plastic sphere.
        ctx.fillStyle='rgba(3,7,25,.97)';
        ctx.fill(edge);
        const backing=ctx.createLinearGradient(0,cy-r,0,cy+r);
        backing.addColorStop(0,'rgba(10,24,67,.33)');
        backing.addColorStop(.50,'rgba(5,14,43,.16)');
        backing.addColorStop(1,'rgba(9,24,75,.39)');
        ctx.fillStyle=backing;
        ctx.fill(edge);
        // A shallow back sheet, slightly displaced in phase, shows through
        // the moving front sheet. Neither plane is a rotating globe grid.
        const threads=clamp(Math.round(size*.93),92,205);
        const steps=clamp(Math.round(size*.94),112,256);
        const drawWeave=(back)=>{
          const count=back?Math.round(threads*.65):threads;
          ctx.lineWidth=back?clamp(size/280,.40,.58):clamp(size/230,.56,.78);
          for(let j=0;j<=count;j++){
            const y0=(2*j/count-1)*.94+(back?-.012:0);
            const gradient=ctx.createLinearGradient(cx-r*.88,0,cx+r*.88,0);
            for(let m=0;m<=8;m++){
              const x0=(m/4-1)*.90;
              const prev=meshPoint(x0-.020,y0,t),next=meshPoint(x0+.020,y0,t);
              const bend=clamp(Math.abs(next[1]-prev[1])/.040,0,1);
              const radial=clamp(Math.hypot(x0,y0)/MEAN_RADIUS,0,1);
              const folded=clamp((bend-.05)*.7,0,.34);
              const phase=.5+.5*Math.sin(2.6*x0+1.8*y0-.36*t);
              const alpha=back?.12+.08*phase:
                clamp(.48+.15*radial+.17*folded+.10*phase,.38,.83);
              const red=back?19:Math.round(31+16*folded);
              const green=back?80:Math.round(128+43*radial+18*folded);
              const blue=back?176:Math.round(226+18*radial);
              gradient.addColorStop(m/8,'rgba('+red+','+green+','+blue+','+alpha.toFixed(3)+')');
            }
            ctx.strokeStyle=gradient;
            ctx.beginPath();
            for(let k=0;k<=steps;k++){
              const x0=(2*k/steps-1)*.94;
              const p=meshPoint(x0,y0+(back?-.010:0),t+(back?-1.6:0));
              const x=cx+p[0]*r,y=cy+p[1]*r;
              if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
            }
            ctx.stroke();
          }
        };
        ctx.lineJoin='round';
        ctx.lineCap='round';
        ctx.globalCompositeOperation='screen';
        drawWeave(true);
        drawWeave(false);
        ctx.restore();
        // An uneven thread-thin edge glows only where the same deforming
        // contour bends toward the eye. This is NOT a fixed halo or hard ring.
        ctx.save();
        ctx.globalCompositeOperation='screen';
        for(let i=0;i<edgeSteps;i++){
          const a=TAU*i/edgeSteps,b=TAU*(i+1)/edgeSteps,mid=(a+b)/2;
          const light=foldLight(mid,t);
          const ra=r*surfaceRadius(a,t),rb=r*surfaceRadius(b,t);
          ctx.globalAlpha=clamp(.16+.54*light+.11*Math.max(0,Math.sin(mid*3-.33*t)),.12,.77);
          ctx.lineWidth=clamp(size/250,.50,.82);
          ctx.strokeStyle=light>.57?'#83d9ff':'#368ee9';
          ctx.beginPath();
          ctx.moveTo(cx+ra*Math.cos(a),cy+ra*Math.sin(a));
          ctx.lineTo(cx+rb*Math.cos(b),cy+rb*Math.sin(b));
          ctx.stroke();
          if(light>.48){
            // A fine secondary contour appears only next to a local fold.
            const inset=r*(.016+.014*light);
            ctx.globalAlpha=(light-.48)*.34;
            ctx.strokeStyle='#56b9ff';
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
      canvas.setAttribute('data-idle-material', 'membrane-blue-v11');
      // Decorative child only: parent button's data-action owns the click.
      button.appendChild(canvas);
      renderer = createRenderer(canvas, { document, root });
      button.dataset.orbMaterial = renderer ? 'membrane-blue-v11' : 'fallback';
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
  return Object.freeze({ version: 'membrane-blue-v11', surfaceRadius, meshPoint, foldLight,
    createRenderer, attach, stats:()=>activeController?.stats()||null });
});
