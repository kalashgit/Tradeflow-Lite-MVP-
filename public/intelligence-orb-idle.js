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
    if(distance>.55)prepareContour(t);
    const boundaryCoupling=distance>.55
      ?(sampleContour(rimValues,angle)/MEAN_RADIUS-1)*distance*distance*.78
      :0;
    // Rolling surface folds pull the adjacent weave along the edge tangent.
    // This uses the derivative of the same silhouette, so crease/mesh/rim
    // cannot drift independently or turn into an unrelated looping particle.
    const nearEdge=clamp((distance-.60)/.31,0,1);
    const tangentFold=nearEdge?nearEdge*clamp(sampleContour(rimSlopes,angle)*.27,-.037,.037):0;
    // The low-frequency field carries the whole fabric; finer oscillations
    // ride on it as tiny woven creases, instead of repeating rigid stripes.
    const xx=x+.047*Math.sin(y*3.2+x*2.4-t*.18)
      +.014*Math.sin(y*5.4+x*3.2-t*.20)
      +.008*Math.sin(y*15.1-x*6.3+t*.16)
      +.003*Math.sin(y*30+x*11-t*.07)-Math.sin(angle)*tangentFold;
    const yy=y+.059*Math.sin(x*3.1+y*1.8-t*.16)
      +.012*Math.sin(x*3.5+y*2.1+t*.11)
      +.026*Math.sin(x*7.4+y*2.7-t*.28)
      +.013*Math.sin(x*14.8-y*5.4+t*.20)
      +.005*Math.sin(x*28.2+y*10.1-t*.13)
      +.002*Math.sin(x*43-y*17+t*.09)+Math.cos(angle)*tangentFold;
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
        // The reference is light carried by a thin membrane against the app's
        // dark backdrop. An opaque navy disk made the previous weave read as a
        // patterned solid ball, especially at 66 CSS pixels.
        ctx.fillStyle='rgba(4,12,34,.18)';
        ctx.fill(edge);
        // At native 66 CSS px, 57 broad lines looked like stripes; recover a
        // finer membrane using raster-adaptive hairlines, not a resized ball.
        const threads=clamp(Math.round(size*1.05),100,224);
        const steps=clamp(Math.round(size*.95),112,256);
        const left=cx-r*.88,right=cx+r*.88;
        ctx.lineWidth=clamp(size/270,.42,.72);
        ctx.lineCap='round';
        ctx.lineJoin='round';
        ctx.globalCompositeOperation='screen';
        for(let j=0;j<=threads;j++){
          const y0=(2*j/threads-1)*.90;
          // Every bright interval is derived from actual local thread
          // compression and tilt. Brightness moves WITH the woven material.
          const grad=ctx.createLinearGradient(left,0,right,0);
          for(let m=0;m<=10;m++){
            const u=m/10,x0=(u*2-1)*.88;
            const upper=meshPoint(x0,y0+.008,t)[1],lower=meshPoint(x0,y0-.008,t)[1];
            const spacing=(upper-lower)/.016;
            const density=clamp((1.02-spacing)*2.6,-.5,.65);
            const before=meshPoint(x0-.008,y0,t)[1],after=meshPoint(x0+.008,y0,t)[1];
            const foldTilt=clamp(Math.abs(after-before)/.016,0,.9);
            const radial=Math.min(1,Math.hypot(x0,y0)/MEAN_RADIUS);
            // A translucent center and densely lit grazing surface are
            // essential: the reference is a membrane, not a blue disc.
            const grazing=.24+.27*Math.pow(radial,2.25);
            const localRidge=clamp(.10*density+.07*foldTilt,-.07,.11);
            // This broad, slowly advected fold field shades entire groups of
            // adjacent filaments, creating a continuous sheet rather than a
            // uniform illuminated contour map. It is not a radial ball glow.
            const sheetWave=Math.sin(x0*3.15+y0*2.1-t*.16);
            const sheetCrest=Math.pow(Math.max(0,Math.sin(x0*4.6-y0*2.8+t*.12)),2);
            const materialShade=.15*sheetWave+.12*sheetCrest;
            const alpha=clamp(grazing+localRidge+materialShade,.12,.78);
            // Founder correction: reference texture and motion, deliberately
            // BLUE rather than the source video's violet-dominant palette.
            const red=Math.round(24+20*u+10*foldTilt);
            const green=Math.round(106+72*u+20*density);
            const blue=Math.round(207+40*u);
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
        ctx.lineWidth=clamp(size/430,.30,.55);
        ctx.strokeStyle='rgba(70,164,245,.055)';
        for(let i=0;i<=54;i++){
          const x0=(2*i/54-1)*.85;
          ctx.beginPath();
          for(let k=0;k<=64;k++){
            const y0=(2*k/64-1)*.89,p=meshPoint(x0,y0,t);
            if(k===0)ctx.moveTo(cx+p[0]*r,cy+p[1]*r);
            else ctx.lineTo(cx+p[0]*r,cy+p[1]*r);
          }
          ctx.stroke();
        }
        // Three shallow translucent sheets fold over the woven surface.
        // Their shaded troughs and thin luminous crests are both derived from
        // the moving outer geometry; unlike an outline echo they occlude the
        // underlying fibers for a few pixels, as the reference membrane does.
        function drawFoldVeil(center,width,depth,strength){
          const n=56;
          const shape=(u,inner)=>{
            const angle=center+(2*u-1)*width;
            const envelope=Math.pow(Math.sin(Math.PI*u),2);
            const base=surfaceRadius(angle,t);
            const radius=r*(base-(inner?depth*envelope:0));
            return [cx+radius*Math.cos(angle),cy+radius*Math.sin(angle),envelope];
          };
          ctx.save();
          ctx.globalCompositeOperation='source-over';
          ctx.fillStyle=`rgba(1,5,23,${(.42*strength).toFixed(3)})`;
          ctx.beginPath();
          for(let i=0;i<=n;i++){
            const p=shape(i/n,false);
            if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);
          }
          for(let i=n;i>=0;i--){const p=shape(i/n,true);ctx.lineTo(p[0],p[1]);}
          ctx.closePath();ctx.fill();
          ctx.globalCompositeOperation='screen';
          // A single blurred continuous crest supplies the source's soft
          // folded-sheet illumination; per-fiber details stay sharp beneath.
          ctx.globalAlpha=.26*strength;
          ctx.lineWidth=clamp(size/145,.8,1.7);
          ctx.strokeStyle='#367df4';
          ctx.shadowColor='rgba(52,133,255,.38)';
          ctx.shadowBlur=clamp(size*.025,1.5,5);
          ctx.beginPath();
          for(let i=7;i<=n-7;i++){
            const p=shape(i/n,true);
            if(i===7)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);
          }
          ctx.stroke();
          ctx.shadowBlur=0;
          ctx.lineWidth=clamp(size/220,.56,.97);
          ctx.strokeStyle='#7bcfff';
          for(let i=0;i<n;i++){
            const a=shape(i/n,true),b=shape((i+1)/n,true);
            const local=(a[2]+b[2])/2;
            if(local<.045)continue;
            ctx.globalAlpha=clamp(local*.74*strength,0,.68);
            ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
          }
          ctx.restore();
        }
        drawFoldVeil(.35+.14*t,.91,.13,1);
        drawFoldVeil(-1.45+.11*t,.83,.115,.85);
        drawFoldVeil(-2.6+.08*t,.68,.095,.72);
        ctx.restore();
        ctx.save();
        const rim=ctx.createLinearGradient(cx-r,cy+r,cx+r,cy-r);
        rim.addColorStop(0,'rgba(40,109,224,.15)');
        rim.addColorStop(.32,'rgba(63,147,242,.20)');
        rim.addColorStop(.67,'rgba(77,185,251,.28)');
        rim.addColorStop(1,'rgba(99,214,255,.18)');
        ctx.strokeStyle=rim;
        ctx.lineWidth=clamp(size/260,.48,.93);
        ctx.shadowColor='rgba(36,120,242,.37)';
        ctx.shadowBlur=clamp(size*.022,1.8,4.5);
        ctx.stroke(edge);
        ctx.shadowBlur=0;
        // Localized curvature glints and near-edge folded-sheet contours.
        // Both follow the SAME surfaceRadius field as the mesh boundary.
        for(let i=0;i<edgeSteps;i++){
          const a=TAU*i/edgeSteps,b=TAU*(i+1)/edgeSteps;
          const light=foldLight((a+b)/2,t);
          if(light<.28)continue;
          const ra=r*surfaceRadius(a,t),rb=r*surfaceRadius(b,t);
          ctx.globalAlpha=clamp((light-.15)*1.23,0,.89);
          ctx.lineWidth=clamp(size/260,.48,.94);
          ctx.strokeStyle=light>.68?'#acebff':'#57beff';
          ctx.beginPath();
          ctx.moveTo(cx+ra*Math.cos(a),cy+ra*Math.sin(a));
          ctx.lineTo(cx+rb*Math.cos(b),cy+rb*Math.sin(b));
          ctx.stroke();
          if(light>.43){
            // An inner displaced sheet is visible ONLY beside a fold, not as
            // an always-on concentric neon ring. Both contours travel.
            const crease=r*(.020+.006*light);
            ctx.globalAlpha=(light-.36)*.52;
            ctx.lineWidth=clamp(size/215,.55,1.0);
            ctx.strokeStyle='#020b29';
            ctx.beginPath();
            ctx.moveTo(cx+(ra-crease)*Math.cos(a),cy+(ra-crease)*Math.sin(a));
            ctx.lineTo(cx+(rb-crease)*Math.cos(b),cy+(rb-crease)*Math.sin(b));
            ctx.stroke();
            const inset=r*(.041+.015*light);
            ctx.globalAlpha=(light-.38)*.76;
            ctx.lineWidth=clamp(size/275,.46,.85);
            ctx.strokeStyle='#7ed1ff';
            ctx.beginPath();
            ctx.moveTo(cx+(ra-inset)*Math.cos(a),cy+(ra-inset)*Math.sin(a));
            ctx.lineTo(cx+(rb-inset)*Math.cos(b),cy+(rb-inset)*Math.sin(b));
            ctx.stroke();
            if(light>.72){
              const innerInset=r*(.081+.009*light);
              ctx.globalAlpha=(light-.66)*.28;
              ctx.strokeStyle='#438eff';
              ctx.beginPath();
              ctx.moveTo(cx+(ra-innerInset)*Math.cos(a),cy+(ra-innerInset)*Math.sin(a));
              ctx.lineTo(cx+(rb-innerInset)*Math.cos(b),cy+(rb-innerInset)*Math.sin(b));
              ctx.stroke();
            }
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
      canvas.setAttribute('data-idle-material', 'woven-blue-v10');
      // Decorative child only: parent button's data-action owns the click.
      button.appendChild(canvas);
      renderer = createRenderer(canvas, { document, root });
      button.dataset.orbMaterial = renderer ? 'woven-blue-v10' : 'fallback';
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
  return Object.freeze({ version: 'woven-blue-v10', surfaceRadius, meshPoint, foldLight,
    createRenderer, attach, stats:()=>activeController?.stats()||null });
});
