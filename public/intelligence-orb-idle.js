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
  const assetVersion = 'concept-b-v1';
  const labelMarkup = '<svg class="tf-orb-concept-b-emblem" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><path d="M10 23H32C36 23 38 26 39 29C43 25 47 23 53 23H63C62 30 58 35 51 35H43L31 59H20L30 35H8Z" fill="currentColor"/></svg>';

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
    let speaking = false, speechLevel = 0, activity = 0, frames = 0;
    const reduced = root.matchMedia?.('(prefers-reduced-motion: reduce)');
    const SIZE_LIMIT = 256;
    const onFeatures = event => {
      const value = normalizeSpeech(event?.detail);
      if (!value) return;
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
      const center = size / 2, radius = size * .48;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      const path = new Path2D();
      for (let i = 0; i <= 192; i++) {
        const a = TAU * i / 192, r = radius * contour(a, time, level);
        const x = center + r * Math.cos(a), y = center + r * Math.sin(a);
        if (!i) path.moveTo(x, y); else path.lineTo(x, y);
      }
      path.closePath();
      ctx.clip(path);
      // Actual dark/airy membrane, not a filled opaque sphere.
      const base = ctx.createRadialGradient(center, center, radius * .12, center, center, radius);
      base.addColorStop(0, 'rgba(0,5,22,.80)');
      base.addColorStop(.66, 'rgba(0,17,40,.42)');
      base.addColorStop(1, 'rgba(0,29,67,.22)');
      ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'screen';
      // Two coherent fine fiber directions follow the same displacement field.
      // High-precision coordinates scale with the compact 66px host.
      const strandCount = 90, steps = 96;
      const brightness = .55 + .95 * level;
      for (let axis = 0; axis < 2; axis++) {
        for (let j = 0; j <= strandCount; j++) {
          const lane = (j / strandCount * 2 - 1) * .93;
          const tint = Math.sin(lane * 8.1 + time * .31 + axis * 1.6);
          const alpha = clamp((axis ? .075 : .16) * brightness * (1 + .6 * tint), .02, .48);
          ctx.lineWidth = axis ? .34 : .51;
          ctx.strokeStyle = axis
            ? 'rgba(29,159,255,' + alpha.toFixed(3) + ')'
            : 'rgba(15,123,255,' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          for (let k = 0; k <= steps; k++) {
            const along = (k / steps * 2 - 1) * .94;
            const x = axis ? lane : along, y = axis ? along : lane;
            const p = membranePoint(x, y, time, level);
            const bx = center + radius * p[0], by = center + radius * p[1];
            if (!k) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
          }
          ctx.stroke();
        }
      }
      // Moving local folds: illumination follows the displaced fabric, not a
      // fixed circular halo. The voice state only raises these measured crests.
      for (let ribbon = 0; ribbon < 3; ribbon++) {
        const phase = time * (.23 + ribbon * .047) + ribbon * 2.1;
        ctx.beginPath();
        for (let k = 0; k <= 112; k++) {
          const a = TAU * k / 112;
          const r = radius * (.73 + .14 * Math.sin(2 * a + phase) + .04 * Math.cos(5 * a - phase));
          const x = center + r * Math.cos(a), y = center + r * Math.sin(a);
          if (!k) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(5,183,255,' + (.07 + .19 * level).toFixed(3) + ')';
        ctx.lineWidth = 1.0 + 1.1 * level;
        ctx.shadowBlur = 2.1 + 4.2 * level;
        ctx.shadowColor = '#00d8ff';
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // The perimeter must not become a rigid neon ring. Illuminated glints
      // cover only local curvature crests and drift with the surface.
      const edgeCount = 192;
      for (let j = 0; j < edgeCount; j++) {
        const a = TAU * j / edgeCount, b = TAU * (j+1) / edgeCount;
        const curv = Math.abs(contour(a-.08,time,level)-2*contour(a,time,level)+contour(a+.08,time,level));
        const traveling = .5 + .5 * Math.sin(3*a - time*.38);
        const light = clamp(curv * 35 + traveling * .18, 0, 1);
        if (light < .22) continue;
        ctx.lineWidth = .45 + .6 * level;
        ctx.strokeStyle = 'rgba(8,210,255,' + clamp((light-.19) * (.29 + .53*level),0,.85).toFixed(3) + ')';
        ctx.beginPath();
        let r=radius*contour(a,time,level);
        ctx.moveTo(center+r*Math.cos(a),center+r*Math.sin(a));
        r=radius*contour(b,time,level);
        ctx.lineTo(center+r*Math.cos(b),center+r*Math.sin(b));
        ctx.stroke();
      }
      ctx.restore();
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
      const target = speaking ? speechLevel : 0;
      activity += (target-activity) * clamp(dt * (speaking ? 4.5 : 2.8), 0, 1);
      if (now-lastPaint>=32) { render(seconds,activity); lastPaint=now; }
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
      stats: () => ({frames, time:seconds, activity, speaking, reducedMotion:!!reduced?.matches, canvasPx:{width:canvas.width,height:canvas.height}}),
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
