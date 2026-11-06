/* TradeFlow Intelligence Orb / Concept B — complete replacement.
 * Visual-only. Actual assistant playback drives brightness; no synthetic speech.
 * The parent button remains TradeFlow's existing, authorized AI entry point.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.TradeFlowConceptBOrb = api; root.TradeFlowOrbIdle = api; }
  if (root && root.document) {
    const begin = () => api.attach({ root, document: root.document });
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', begin, { once: true });
    else begin();
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const finite = n => Number.isFinite(n) ? n : 0;
  const assetVersion = 'concept-b-v2';
  const labelMarkup = '<svg class="tf-orb-concept-b-emblem" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><path d="M8 26C12 17 16 15 26 15H31C37 15 40 18 40 24C47 17 51 15 59 15H67C65 25 60 29 51 29H45L33 51C29 59 24 62 15 62L32 29H6Z" fill="currentColor"/></svg>';

  // Both motion modes share one physical surface. Audio changes lighting and
  // local deformation strength; it never swaps the renderer or the T.
  function contour(angle, time, activity = 0) {
    const a = finite(angle), t = finite(time), v = clamp(finite(activity), 0, 1);
    const soft = .026 * Math.sin(3 * a - .35 * t) + .019 * Math.sin(5 * a + .27 * t + 1.7);
    const folds = (.023 + .021 * v) * Math.sin(7 * a - (.42 + .19 * v) * t + 1.2)
      + (.011 + .012 * v) * Math.sin(11 * a + (.31 + .17 * v) * t);
    return .87 + soft + folds;
  }
  function membranePoint(x, y, time, activity = 0) {
    const t = finite(time), v = clamp(finite(activity), 0, 1);
    const strength = 1 + .55 * v;
    const dx = strength * (.034 * Math.sin(3.3*y + 2.1*x - .26*t)
      + .013 * Math.sin(8.9*y - 2.4*x + .21*t));
    const dy = strength * (.047 * Math.sin(2.8*x + 1.9*y - .23*t)
      + .015 * Math.sin(9.2*x - 3.1*y + .29*t));
    return [x + dx, y + dy];
  }
  function normalizeSpeech(detail) {
    if (!detail || detail.version !== 1 || detail.source !== 'assistant_playback') return null;
    if (detail.active !== true) return { active: false, level: 0 };
    const rms = clamp(finite(detail.rms), 0, 1);
    const peak = clamp(finite(detail.peak), 0, 1);
    return { active: true, level: clamp(.18 + rms * 4.4 + peak * .32, .18, 1) };
  }
  function createRenderer(canvas, { root, document, button } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return null;
    let disposed = false, raf = 0, seconds = 0, lastTime = null, lastPaint = -Infinity;
    let speaking = false, speechLevel = 0, activity = 0, frames = 0, speechAt = -Infinity;
    const reduced = root.matchMedia?.('(prefers-reduced-motion: reduce)');
    const SIZE_LIMIT = 840;
    let quality='fine'; const paintTimes=[]; const frameIntervals=[];
    const onFeatures = event => {
      const value = normalizeSpeech(event?.detail);
      if (!value) return;
      speechAt = root.performance.now();
      speaking = value.active;
      speechLevel = value.level;
    };
    const onVoice = event => {
      // Voice-state alone cannot trigger the "speaking" glow: only genuine
      // assistant output's audio analyser is authoritative for illumination.
      if (event?.detail?.status === 'idle' || event?.detail?.status === 'unavailable') {
        speaking = false; speechLevel = 0;
      }
    };
    const updateSize = () => {
      const b = canvas.getBoundingClientRect();
      const dpr = clamp(root.devicePixelRatio || 1, 1, 2);
      const size = clamp(Math.round(Math.min(b.width, b.height) * dpr), 2, SIZE_LIMIT);
      if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
      return size;
    };
    function render(time = seconds, level = activity) {
      if (disposed) return;
      const size = updateSize();
      const started = root.performance.now();
      const center = size / 2, radius = size * .39;
      ctx.clearRect(0, 0, size, size);
      // A closed, corrugated toroidal membrane. Both strand families are
      // sampled from this ONE parameterization, including the rear surface.
      // Folding the poloidal coordinate creates real overlap and compression.
      const surface = (u, v) => {
        const phase = time * .22;
        const fold = Math.sin(3*u + phase) + .42*Math.sin(5*u-phase*.71+1.4);
        const twist = v + .65*Math.sin(2*u-phase*.83) + .22*Math.sin(4*u+phase);
        const tube = .29 + .065*Math.sin(3*u-phase+1);
        const r = .70 + tube*Math.cos(twist) + .065*fold
          + (.085+.024*level)*Math.sin(4*u+2*twist-phase*1.3);
        const z = tube*Math.sin(twist) + .15*Math.sin(3*u+phase)
          + .07*Math.cos(2*u-2*twist-phase*.7);
        return [r*Math.cos(u), r*Math.sin(u)*.97 - z*.24, z];
      };
      const segments = [];
      const large=size>300;
      const nu=quality==='fine'?(large?160:80):(large?96:56), nv=quality==='fine'?(large?112:56):(large?64:40);
      const grid=Array.from({length:nu},(_,i)=>Array.from({length:nv},(_,j)=>surface(TAU*i/nu,TAU*j/nv)));
      for(let i=0;i<nu;i++)for(let j=0;j<nv;j++) {
        const p=grid[i][j],du=grid[(i+1)%nu][j],dv=grid[i][(j+1)%nv];
        const ax=du[0]-p[0],ay=du[1]-p[1],az=du[2]-p[2];
        const bx=dv[0]-p[0],by=dv[1]-p[1],bz=dv[2]-p[2];
        const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
        const norm=Math.hypot(nx,ny,nz)||1;
        const facing=Math.abs(nz)/norm,crest=Math.pow(1-facing,3);
        const light=Math.max(0,(-nx*.3-ny*.65+nz*.7)/norm);
        const depth=clamp((p[2]+.48)/.95,.08,1);
        const energy=(.13+.28*light+.82*crest)*depth*(.78+.65*level);
        segments.push([p,du,energy,p[2],crest],[p,dv,energy,p[2],crest]);
      }
      // Opaque navy interior protects fold contrast over the host interface.
      ctx.beginPath();
      for(let i=0;i<nu;i++) {
        const row=grid[i];
        const p=row.reduce((a,b)=>Math.hypot(a[0],a[1])>Math.hypot(b[0],b[1])?a:b);
        if(i===0)ctx.moveTo(center+p[0]*radius,center+p[1]*radius);
        else ctx.lineTo(center+p[0]*radius,center+p[1]*radius);
      }
      ctx.closePath();ctx.fillStyle='rgba(0,7,18,.97)';ctx.fill();
      const bins=Array.from({length:120},()=>new Path2D());
      for(const [a,b,e,z,crest] of segments) {
        const depth=clamp(Math.floor((z+.5)*6),0,5);
        const light=clamp(Math.floor(e*19),0,19);
        const path=bins[depth*20+light];
        path.moveTo(center+a[0]*radius,center+a[1]*radius);
        path.lineTo(center+b[0]*radius,center+b[1]*radius);
      }
      ctx.lineWidth=size/540;
      for(let d=0;d<6;d++)for(let l=0;l<20;l++) {
        ctx.strokeStyle='rgba(0,'+Math.round(90+l*7)+',255,'+(.035+l*.045).toFixed(3)+')';
        ctx.stroke(bins[d*20+l]);
      }
      // Scatter only the geometry's bright crests; no independent halo paths.
      ctx.globalCompositeOperation='screen';
      ctx.lineWidth=size/280;
      ctx.shadowBlur=size/65;ctx.shadowColor='#00bfff';
      for(let i=0;i<segments.length;i+=3) {
        const [a,b,e,z,crest]=segments[i];
        if(crest<.82||e<.43)continue;
        ctx.strokeStyle='rgba(0,210,255,'+(e*.12).toFixed(3)+')';
        ctx.beginPath();ctx.moveTo(center+a[0]*radius,center+a[1]*radius);
        ctx.lineTo(center+b[0]*radius,center+b[1]*radius);ctx.stroke();
      }
      ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
      const cost=root.performance.now()-started;
      paintTimes.push(cost);if(paintTimes.length>300)paintTimes.shift();
      if(paintTimes.length===20 && paintTimes.reduce((a,b)=>a+b,0)/20>16)quality='adaptive';
      if (button) {
        button.style.setProperty('--tf-orb-concept-voice', String(clamp(level,0,1).toFixed(3)));
        button.style.setProperty('--tf-orb-concept-glow', (2 + 7 * clamp(level,0,1)).toFixed(1) + 'px');
        button.dataset.orbState = level > .12 ? 'speaking' : 'idle';
      }
      frames++;
    }
    function frame(now) {
      raf = 0;
      if (disposed || document.hidden || !canvas.isConnected || reduced?.matches) return;
      const dt = lastTime == null ? 0 : clamp((now-lastTime)/1000,0,.09);
      lastTime = now; seconds += dt;
      if(now-speechAt>600){speaking=false;speechLevel=0;}
      const target = speaking ? speechLevel : 0;
      activity += (target-activity) * clamp(dt * (speaking ? 4.5 : 2.8), 0, 1);
      if (now-lastPaint>=(quality==='fine'? 0 : 32)) { if(Number.isFinite(lastPaint)){frameIntervals.push(now-lastPaint);if(frameIntervals.length>300)frameIntervals.shift();} render(seconds,activity); lastPaint=now; }
      raf=root.requestAnimationFrame(frame);
    }
    function resume() {
      if (raf) root.cancelAnimationFrame(raf);
      raf=0;lastTime=null;lastPaint=-Infinity;
      if (!disposed) render(reduced?.matches ? 0 : seconds, reduced?.matches ? 0 : activity);
      if (!disposed && !document.hidden && !reduced?.matches) raf=root.requestAnimationFrame(frame);
    }
    function visibility() {
      if (document.hidden) {
        if (raf) root.cancelAnimationFrame(raf);
        raf=0;lastTime=null;
        speaking=false;speechLevel=0;activity=0;
      } else resume();
    }
    root.addEventListener('tradeflow:speech-features',onFeatures);
    root.addEventListener('tradeflow:voice-state',onVoice);
    document.addEventListener('visibilitychange',visibility);
    reduced?.addEventListener?.('change',resume);
    resume();
    return Object.freeze({
      renderAt: render,
      stats: () => ({frames, quality, paintMs:paintTimes.slice(), frameIntervals:frameIntervals.slice(), time:seconds, activity, speaking, reducedMotion:!!reduced?.matches, canvasPx:{width:canvas.width,height:canvas.height}}),
      dispose() {
        disposed=true;
        if (raf) root.cancelAnimationFrame(raf);
        root.removeEventListener('tradeflow:speech-features',onFeatures);
        root.removeEventListener('tradeflow:voice-state',onVoice);
        document.removeEventListener('visibilitychange',visibility);
        reduced?.removeEventListener?.('change',resume);
      }
    });
  }
  let current = null;
  function attach({root,document} = {}) {
    if (!root || !document) return null;
    current?.dispose();
    let button = null, renderer = null, disposed = false;
    function sync() {
      if (disposed) return;
      const next = document.querySelector('.tf-ai-orb');
      if (next === button && renderer) return;
      renderer?.dispose(); renderer=null; button=next;
      if (!button) return;
      // Delete legacy orb markup/canvases — never layer the old renderer
      // underneath Concept B. Parent button/action remains unchanged.
      button.querySelectorAll('.tf-orb-mesh,.tf-orb-concept-b-canvas,.tf-orb-concept-b-emblem').forEach(el=>el.remove());
      const canvas=document.createElement('canvas');
      canvas.className='tf-orb-concept-b-canvas';
      canvas.setAttribute('aria-hidden','true');
      button.appendChild(canvas);
      button.insertAdjacentHTML('beforeend',labelMarkup);
      button.dataset.orbMaterial=assetVersion;
      renderer=createRenderer(canvas,{root,document,button});
      if (!renderer) button.dataset.orbMaterial='concept-b-fallback';
    }
    const observer = new root.MutationObserver(sync);
    const host=document.querySelector('#app') || document.documentElement;
    observer.observe(host,{childList:true,subtree:true});
    sync();
    const api=Object.freeze({
      sync, active:()=>!!renderer,
      stats:()=>renderer?.stats()||null,
      dispose() {disposed=true;observer.disconnect();renderer?.dispose();renderer=null;if(current===api)current=null;}
    });
    current=api;return api;
  }
  return Object.freeze({version:assetVersion,contour,membranePoint,normalizeSpeech,createRenderer,attach,stats:()=>current?.stats()||null});
});
