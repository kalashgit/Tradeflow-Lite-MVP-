# Concept B — supplied GIF reconstruction

Development branch: `feature/tf-concept-b-membrane-reconstruction`, draft PR #39 (based on PR #38). No merge or production deployment; PR #29/#31/#38 are preserved.

## What changed

The founder's actual nine-frame GIF is now extracted and analyzed. The previous procedural torus has been replaced with a **reference-derived 2.5D renderer**. Full-resolution weave, silhouette, depth shading and the exact T come from the supplied artwork. Bidirectional optical flow supplies a continuous shared displacement field between every frame pair, including 8→0. A 48 × 48 shared vertex grid evaluates that field at reference scale where supported; a fragment transport path covers GPUs without vertex texture sampling. This does **not** constitute recovery of a fully 3D membrane or new geometric lighting: source illumination is baked into the material.

The compact Home orb is 52px on mobile and 56px on desktop, bottom-right above navigation. Idle plays at 48% reference illumination. Real version-1 `assistant_playback` RMS/peak events brighten the membrane toward blue while playback presence slows movement by up to 72%; the center T is protected from extra deformation. No microphone data or synthetic events are generated in application code. Missing events expire after 600ms; energy decays smoothly. Reduced motion freezes geometric movement while retaining speech brightness feedback. The same renderer now replaces older wave artwork inside the existing Intelligence voice sheet. Existing controls, composer, approvals and business logic are retained.

## Actual artifacts

- [Compact Home review: dim idle → slower blue simulated speech → idle](compact-home-review.mp4)
- Compact Home stills: [idle](compact-idle.png), [simulated speaking](compact-speaking.png)

- [15-second idle recording](idle.webm)
- [15-second SIMULATED speaking recording](SIMULATED-speaking.webm): on-screen label, injected test features, **no real speech integration claim**.
- [All nine frames: supplied GIF versus actual application shader](comparison/all-nine-side-by-side.jpg)
- [Per-frame pixel errors and loop-boundary comparison](comparison/pixel-error.json)
- [Original GIF, extracted frames, contact sheet and analysis](reference/ANALYSIS.md)
- [420 × 408 application capture](reference-scale.png)
- Home: [360px](home-360.png), [390px](home-390.png), [430px](home-430.png), [desktop](home-1280.png)
- Intelligence: [360px](intelligence-360.png), [390px](intelligence-390.png), [430px](intelligence-430.png), [desktop](intelligence-1280.png)
- [Measurements](metrics.json): Chromium mobile viewports use DPR 2; desktop/reference use DPR 1. Paint costs measure **CPU command submission**, not GPU completion. Observed cadence is browser scheduling, not a physical-phone measurement.

Comparisons render the real app's material at the source's authored timestamps and brightness over black. Exact matches at these endpoints are expected because the supplied frame textures are retained. They prove pixel preservation, **not** independent geometry reconstruction or correctness of invented intermediate motion. Halfway captures cover all nine transitions, including 8→0; interpolated fibers can soften around disocclusions. Normal idle is intentionally dimmer than the comparison mode.

## Verification

`npm ci`; `npx playwright install chromium`; `node scripts/verify-intelligence-orb-idle.cjs`; `python3 scripts/report-concept-b-comparison.py` (Pillow/NumPy). Video capture requires FFmpeg; the retained files are trimmed to 15 seconds and encoded at Playwright’s 25 FPS (not a claim of 60 FPS recording). The browser entrypoint serves the actual app on an ephemeral local origin. It checks changing idle pixels, reduced-motion freezing, the existing voice-sheet tap/close path, renderer cleanup, injected speech response and stale-event decay, WebGL initialization, reference phase captures, and records videos. The source-frame comparison fails on >0.2/255 MAE or a loop-boundary difference >3/255.

WebGL context loss/restore and the forced Canvas-only animated fallback pass (backend-checks.json). Focused Node tests: 3/3 pass. Full Node: 728/729; the pre-existing notification-label assertion at `tests/notifications.test.cjs:54` still fails. Storage and all ten contractor checks pass. All 14 general browser scripts in `npm run test:browser` passed; results are retained in logs/orb-reference-browser-regressions.log. The final local capture measured Home cadence of 54.9 / 57.1 / 57.2 FPS at 360 / 390 / 430px DPR2 and 57.4 FPS on desktop. Native reference cadence was 39.3 FPS in this software Chromium environment. Exact-head CI status must be checked separately.

## Remaining limitations / preview

- Full physical 3D geometry/curvature illumination is not implemented; this is a source-artwork and measured-motion reconstruction. It prioritizes visual fidelity over claiming a recovered hidden surface.
- Physical phones and independent founder acceptance remain unverified. The 30Hz fallback responds to sustained missed refreshes; Canvas-only fallback crossfades artwork with reduced fidelity and does not run optical-flow transport.
- PR #31's feature event was checked against its real 50ms analyser emission. That runtime/providers are not running here, so **no actual speech-driven recording** is supplied.
- An access-gated local interactive review is available via `node scripts/serve-orb-review.cjs` (localhost:8081, random code stored outside the repo). It includes Home/reference scale and clearly labeled simulated-speaking controls in the actual app. No live APIs are served. The attempted temporary HTTPS tunnel failed to connect; **no founder-accessible private URL is available**. The local server is not represented as a delivered remote preview.
