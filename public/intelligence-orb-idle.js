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
  // Keep diameter stable: shallow traveling folds, not a pulsing 3D sphere.
  function surfaceRadius(angle, t) {
    const a=Number(angle),time=Number(t);
    if(!Number.isFinite(a)||!Number.isFinite(time))return .807;
    // A nearly fixed mean radius, with shallow independent traveling folds.
    return .807+.0105*Math.sin(5*a+.23*time+.16*Math.sin(time*.12))
      +.007*Math.sin(8*a-.17*time)
      +.0048*Math.sin(12*a+.115*time)
      +.0025*Math.sin(17*a-.09*time);
  }
  // All strands sample the same advected field. This is a membrane, not a
  // collection of independently phased lines or a globally scaled sphere.
  function meshPoint(x,y,t){
    const angle=Math.atan2(y,x),distance=Math.min(1,Math.hypot(x,y));
    const boundaryCoupling=(surfaceRadius(angle,t)/.807-1)*distance*distance*.55;
    const xx=x+.009*Math.sin(y*5.7+x*4.6-t*.18)
      +.004*Math.sin(y*12.4-x*7.3+t*.14);
    const yy=y+.027*Math.sin(x*6.5+y*3.3+t*.24)
      +.014*Math.sin(x*11.6-y*7.7-t*.19)
      +.005*Math.sin(x*19.4+y*10.2+t*.11);
    return [xx*(1+boundaryCoupling),yy*(1+boundaryCoupling)];
  }
  // Lighting is a property of the deforming rim, not a separate rotating glow.
  function foldLight(angle,t){
    const delta=.075,r=surfaceRadius(angle,t);
    const curvature=Math.abs(surfaceRadius(angle+delta,t)-2*r+surfaceRadius(angle-delta,t));
    const slope=Math.abs(surfaceRadius(angle+delta,t)-surfaceRadius(angle-delta,t));
    return clamp(curvature*105+slope*10,0,1);
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
      const width = clamp(Math.round(bounds.width * ratio), 2, 196);
      const height = clamp(Math.round(bounds.height * ratio), 2, 196);
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
        // The center is dark and translucent; NO opaque sphere or radial gloss.
        ctx.fillStyle='rgba(4,9,28,.15)';
        ctx.fill(edge);
        const threads=size<170?102:150;
        const steps=size<170?64:78;
        const left=cx-r*.85,right=cx+r*.85;
        ctx.lineWidth=clamp(size/190,.62,.86);
        ctx.lineCap='round';
        ctx.lineJoin='round';
        for(let j=0;j<=threads;j++){
          const y0=(2*j/threads-1)*.84;
          // Compression of neighboring strands gives a natural density light.
          const upper=meshPoint(0,y0+.009,t)[1],lower=meshPoint(0,y0-.009,t)[1];
          const spacing=(upper-lower)/.018;
          const density=clamp(1.12-spacing,0,.8);
          const alpha=clamp(.43+.14*density+.07*Math.abs(y0),.40,.62);
          const grad=ctx.createLinearGradient(left,0,right,0);
          grad.addColorStop(0,'rgba(74,66,190,'+(alpha*.83).toFixed(3)+')');
          grad.addColorStop(.25,'rgba(104,81,211,'+(alpha*1.00).toFixed(3)+')');
          grad.addColorStop(.57,'rgba(68,109,227,'+(alpha*1.05).toFixed(3)+')');
          grad.addColorStop(.84,'rgba(57,157,242,'+(alpha*1.09).toFixed(3)+')');
          grad.addColorStop(1,'rgba(64,201,250,'+(alpha*.94).toFixed(3)+')');
          ctx.strokeStyle=grad;
          ctx.beginPath();
          for(let k=0;k<=steps;k++){
            const x0=(2*k/steps-1)*.86,p=meshPoint(x0,y0,t);
            const x=cx+p[0]*r,y=cy+p[1]*r;
            if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          }
          ctx.stroke();
        }
        // Faint crossing fibers create subtle folds without a rigid grid.
        ctx.lineWidth=.44;
        ctx.strokeStyle='rgba(67,136,219,.028)';
        for(let i=0;i<=23;i++){
          const x0=(2*i/23-1)*.78;
          ctx.beginPath();
          for(let k=0;k<=55;k++){
            const y0=(2*k/55-1)*.85,p=meshPoint(x0,y0,t);
            if(k===0)ctx.moveTo(cx+p[0]*r,cy+p[1]*r);
            else ctx.lineTo(cx+p[0]*r,cy+p[1]*r);
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        const rim=ctx.createLinearGradient(cx-r,cy+r,cx+r,cy-r);
        rim.addColorStop(0,'rgba(94,75,205,.80)');
        rim.addColorStop(.32,'rgba(69,109,230,.86)');
        rim.addColorStop(.67,'rgba(59,180,245,.87)');
        rim.addColorStop(1,'rgba(99,212,250,.81)');
        ctx.strokeStyle=rim;
        ctx.lineWidth=clamp(size/172,.69,1.03);
        ctx.shadowColor='rgba(64,154,248,.40)';
        ctx.shadowBlur=Math.min(2,size*.016);
        ctx.stroke(edge);
        ctx.shadowBlur=0;
        // Localized curvature glints and near-edge folded-sheet contours.
        // Both follow the SAME surfaceRadius field as the mesh boundary.
        for(let i=0;i<edgeSteps;i++){
          const a=TAU*i/edgeSteps,b=TAU*(i+1)/edgeSteps;
          const light=foldLight((a+b)/2,t);
          if(light<.32)continue;
          const ra=r*surfaceRadius(a,t),rb=r*surfaceRadius(b,t);
          ctx.globalAlpha=clamp((light-.22)*.75,0,.65);
          ctx.lineWidth=clamp(size/224,.5,.79);
          ctx.strokeStyle=light>.65?'#a8e8ff':'#739bff';
          ctx.beginPath();
          ctx.moveTo(cx+ra*Math.cos(a),cy+ra*Math.sin(a));
          ctx.lineTo(cx+rb*Math.cos(b),cy+rb*Math.sin(b));
          ctx.stroke();
          if(light>.63){
            const inset=r*(.011+.008*light);
            ctx.globalAlpha=(light-.55)*.23;
            ctx.strokeStyle='#b2baff';
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
      canvas.setAttribute('data-idle-material', 'fine-mesh-v2');
      // Decorative child only: parent button's data-action owns the click.
      button.appendChild(canvas);
      renderer = createRenderer(canvas, { document, root });
      button.dataset.orbMaterial = renderer ? 'fine-mesh-v2' : 'fallback';
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
  return Object.freeze({ version: 'idle-mesh-v2', surfaceRadius, meshPoint, foldLight,
    createRenderer, attach, stats:()=>activeController?.stats()||null });
});
