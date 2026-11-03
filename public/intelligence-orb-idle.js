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
    const a = Number(angle), time = Number(t);
    if (!Number.isFinite(a) || !Number.isFinite(time)) return 0.8;
    return .804 + .012 * Math.sin(5 * a + .29 * time + .2 * Math.sin(time * .15))
      + .008 * Math.sin(8 * a - .18 * time)
      + .005 * Math.sin(12 * a + .14 * time)
      + .003 * Math.sin(16 * a - .1 * time);
  }
  // Advection of closely related mesh threads: adjacent points deform together.
  function meshPoint(x, y, t) {
    const xx = x + .014 * Math.sin(y * 8 + x * 3.1 - t * .22)
      + .006 * Math.sin(y * 17 - x * 8 + t * .16);
    const yy = y + .032 * Math.sin(x * 7.6 + y * 4.8 + t * .27)
      + .019 * Math.sin(x * 13 - y * 8.6 - t * .23)
      + .009 * Math.sin(x * 29 + y * 18 + t * .13);
    return [xx, yy];
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
    function render(t = 0) {
      if (disposed || painting) return;
      painting = true;
      try {
        const size = resize(), w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, r = size / 2;
        ctx.clearRect(0, 0, w, h);
        const edge = new Path2D();
        for (let i = 0; i <= 240; i++) {
          const angle = TAU * i / 240, rr = r * surfaceRadius(angle, t);
          const x = cx + rr * Math.cos(angle), y = cy + rr * Math.sin(angle);
          if (i === 0) edge.moveTo(x, y); else edge.lineTo(x, y);
        }
        edge.closePath();
        ctx.save();
        ctx.clip(edge);
        const fill = ctx.createRadialGradient(cx - r * .05, cy - r * .08, r * .02, cx, cy, r * .84);
        fill.addColorStop(0, '#05091c');
        fill.addColorStop(.50, '#091340');
        fill.addColorStop(1, '#0a2964');
        ctx.fillStyle = fill;
        ctx.fill(edge);
        // Very fine, interrelated threads; stationary center of mass, changing local curvature.
        const threads = size < 85 ? 110 : 168;
        const steps = 73;
        const left = cx - r * .81, right = cx + r * .81;
        const lineWidth = clamp(size / 180, .43, .8);
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        for (let j = 0; j <= threads; j++) {
          const y0 = (2 * j / threads - 1) * .81;
          const alpha = .23 + .10 * Math.pow(Math.abs(y0), .8) + .075 * Math.pow(Math.sin(j * .11 + t * .19), 2);
          const grad = ctx.createLinearGradient(left, 0, right, 0);
          grad.addColorStop(0, 'rgba(91,69,220,' + alpha.toFixed(3) + ')');
          grad.addColorStop(.35, 'rgba(60,80,226,' + (alpha * .85).toFixed(3) + ')');
          grad.addColorStop(.72, 'rgba(44,134,242,' + alpha.toFixed(3) + ')');
          grad.addColorStop(1, 'rgba(72,213,250,' + (alpha * 1.06).toFixed(3) + ')');
          ctx.strokeStyle = grad;
          ctx.beginPath();
          for (let k = 0; k <= steps; k++) {
            const x0 = (2 * k / steps - 1) * .84;
            const point = meshPoint(x0, y0, t);
            const x = cx + point[0] * r, y = cy + point[1] * r;
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // Dim cross-threading prevents appearance of unrelated horizontal bars.
        ctx.strokeStyle = 'rgba(74,148,246,.052)';
        ctx.lineWidth = Math.max(.4, size / 320);
        for (let i = 0; i <= 38; i++) {
          const x0 = (2 * i / 38 - 1) * .80;
          ctx.beginPath();
          for (let k = 0; k <= 54; k++) {
            const y0 = (2 * k / 54 - 1) * .84, p = meshPoint(x0, y0, t);
            if (k === 0) ctx.moveTo(cx + p[0] * r, cy + p[1] * r);
            else ctx.lineTo(cx + p[0] * r, cy + p[1] * r);
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        const rim = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
        rim.addColorStop(0, '#7848d3');
        rim.addColorStop(.30, '#5473f3');
        rim.addColorStop(.60, '#47b5f3');
        rim.addColorStop(.86, '#8ff3ff');
        rim.addColorStop(1, '#4c7bf5');
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(.9, size / 115);
        ctx.shadowColor = '#3f9cff';
        ctx.shadowBlur = Math.max(2, size * .026);
        ctx.stroke(edge);
        ctx.shadowBlur = 0;
        // Three grazing glints travel with the same deformed rim.
        for (let n = 0; n < 3; n++) {
          const angle0 = [-1.75, .45, 2.55][n] + .09 * Math.sin(t * [.22, .17, .16][n] + n);
          ctx.beginPath();
          for (let k = 0; k <= 24; k++) {
            const a = angle0 + (k / 24 - .5) * .37, rr = r * surfaceRadius(a, t);
            const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.globalAlpha = .29 + .12 * Math.pow(Math.sin(t * .31 + n), 2);
          ctx.strokeStyle = n === 2 ? '#af8bff' : '#b4f9ff';
          ctx.lineWidth = Math.max(.6, size / 165);
          ctx.stroke();
        }
        ctx.restore();
        frameCount++;
      } finally { painting = false; }
    }
    function animate(now) {
      if (disposed) return;
      raf = 0;
      if (document.hidden || !canvas.isConnected || reducedQuery?.matches) return;
      if (lastTime === null) lastTime = now;
      const dt = clamp((now - lastTime) / 1000, 0, .05);
      lastTime = now;
      // Time accumulation remains bounded across background/suspension.
      elapsed += dt;
      render(elapsed);
      raf = root.requestAnimationFrame(animate);
    }
    function resume() {
      if (disposed) return;
      if (raf) root.cancelAnimationFrame(raf);
      lastTime = null;
      render(reducedQuery?.matches ? 0 : elapsed);
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
      stats: () => Object.freeze({ frames: frameCount, time: elapsed, reducedMotion: !!reducedQuery?.matches }),
      dispose() {
        disposed = true;
        if (raf) root.cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', visibility);
        reducedQuery?.removeEventListener?.('change', preference);
      }
    });
  }
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
      canvas.setAttribute('data-idle-material', 'fine-mesh-v1');
      // Decorative child only: parent button's data-action owns the click.
      button.appendChild(canvas);
      renderer = createRenderer(canvas, { document, root });
      button.dataset.orbMaterial = renderer ? 'fine-mesh-v1' : 'fallback';
    }
    const observer = new root.MutationObserver(() => sync());
    const host = document.querySelector('#app');
    if (host) observer.observe(host, { childList: true, subtree: true });
    else observer.observe(document.documentElement, { childList: true, subtree: true });
    sync();
    return Object.freeze({
      sync, active: () => !!renderer,
      stats: () => renderer?.stats() || null,
      dispose() { disposed = true; observer.disconnect(); renderer?.dispose(); renderer = null; }
    });
  }
  return Object.freeze({ version: 'idle-mesh-v1', surfaceRadius, meshPoint, createRenderer, attach });
});
