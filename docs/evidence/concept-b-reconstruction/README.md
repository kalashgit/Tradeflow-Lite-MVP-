# Concept B reconstruction — work in progress, NOT visually accepted

Isolated from PR #38 head on `feature/tf-concept-b-membrane-reconstruction`.
No merge or production deployment. PR #29/#31/#38 untouched.

Replaced the flat displaced grid and independent ribbons with two strand families sampled on one corrugated 3D parametric membrane. Surface normals determine lighting, shared grid compression determines strand convergence, depth bins order the fibers, and crest-only scattering follows geometry. No new dependency. T path and proportions revised. Assistant playback event version/source validation is retained, with a 600ms stale-signal timeout. Reduced motion freezes the renderer; navigation attachment and visibility resume remain.

## Evidence and reproduction

Run `npm ci`, `npx playwright install chromium`, serve `public` on localhost:8080, then `node scripts/capture-concept-b.cjs`. Uses a synthetic business in disposable browser storage, checks changing idle pixels and frozen reduced-motion pixels at 360/390/430/1280, opens the existing Intelligence overlay, captures screenshots, and records 15 seconds each of idle and **SIMULATED** speaking in the actual app. Speaking is injected analyser features, not real audio. Videos include an on-screen label. Paint timing and observed frame intervals are recorded in metrics.json; headless viewport sizes do not prove physical mobile performance.

Source GIF is NOT available as an uploaded filesystem file or downloadable URL in this session. Only the rendered still in the conversation was available. Nine-frame extraction, frame comparisons, motion fitting and loop continuity against the original are therefore **NOT RUN**. No fabricated comparison sheet is supplied.

## Validation / remaining gates

- Focused orb Node contracts: 4/4 pass.
- Full Node: 729/730 pass; untouched notifications.test.cjs:54 expects PRIORITY / GROWTH INTELLIGENCE / ACTIVITY labels. Rerun alone reproduces failure. No unrelated label change made.
- Storage migration checks pass; ten contractor checks pass.
- Captures and measured performance are in the adjacent evidence files.
- General browser regression suite and physical mobile devices: not run.
- Actual PR #31 voice providers/runtime: not running in this branch/environment; no actual speech recording claimed. Voice branch remains separate.
- Fine surface weave and silhouette still differ materially from the supplied reference. This is a reviewable engineering increment, **not completion of the founder's fidelity acceptance**. Further fold/material work is required.
- No private externally reachable preview was provisioned. Localhost:8080 is a local development origin, not a founder-accessible private link. No forwarding capability is exposed by this environment.
