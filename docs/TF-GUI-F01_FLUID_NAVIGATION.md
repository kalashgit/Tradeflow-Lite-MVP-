# TF-GUI-F01 · Fluid navigation review

Founder direction: TF-GUI-014, matte single capsule, immediate drag, subtle spring, four phone metrics. Frontend-only files; existing data-tab click remains the route authority. No authored app.js, host, AI, schema, financial or voice changes. PR #18 stays draft, unmerged, undeployed. AI PR #16 inspected at 23929a9; the existing frontend host contract is sufficient, so no unrelated upstream integration is required by this gesture.

## Run the actual app

From the GUI worktree: `python3 -m http.server 4224 --bind 127.0.0.1 --directory public`, then open `http://127.0.0.1:4224/` in Chromium with phone emulation. This is the existing app on a local development origin, not a Cloudflare deployment. Follow existing onboarding on that origin. Do not import synthetic fixtures into a customer profile. GUI tests use isolated browser profiles and fictional settings only, preserving actual empty/unknown values.

1. At 360 or 390px, Home shows Customers, Quotations, Active jobs and Tasks due in one row, sourced by the unchanged app.
2. Press a footer item off-center. The capsule immediately centers on contact, compresses slightly, follows horizontal movement and previews an underlined candidate. Routes do not load until release.
3. Drag across Home, Map, Calendar, Finance and More. Release once: the existing destination button is invoked once. Selected semantics and focus follow the new rendered footer. Spring motion is small; candidate hysteresis is 6px, vertical cancellation is 14px plus directional dominance.
4. Cancel, drag vertically, hide the page or replace the component: no gesture route is committed. A new press interrupts settling. Keyboard Home/End/arrows use the same buttons; Enter/Space retain native behavior.
5. Reduced motion has direct contact positioning and instant settle, without elastic deformation. There is no idle animation, native feedback or audio capture.

## Rollback

Set `window.TRADEFLOW_FLUID_NAV=false` before script execution to disable footer enhancement. For current-session review use `TradeFlowFluidNavigation.instance.setEnabled(false)`; `setEnabled(true)` re-enables it. `instance.dispose()` removes listeners, observer, capsule and scheduled motion. Static buttons and route handler remain intact. Four-metric CSS is separate presentation and can be removed by omitting fluid-navigation.css. No user-data migration or undo is needed.

## Accessibility tradeoff and verification

At normal 360/390 widths the four metrics fit. At 200% root text sizing their **local container** scrolls horizontally, keeping all values/labels and preventing page overflow. This is a controlled accessibility fallback for founder review, not clipped data. Browser tests reach the last metric and verify the page width. The test also applies actual Chromium CDP page scale 2 and captures zoom200 screenshots. CSS enlargement and emulated browser zoom are not physical Safari pinch or VoiceOver acceptance. The inline page's pre-existing gesture/zoom policy is unchanged.

`node --test tests/fluid-navigation.test.cjs` tests candidate logic; `node scripts/verify-fluid-navigation.cjs` exercises actual Chromium pointer capture, contact position, all candidates, commit counts, cancellation, keyboard, repeated navigation, rollback, offline reload, enlarged text and four metrics. It is part of test:browser. Screenshots (rest, pressed, between, settled, enlarged text and reduced) and Playwright interaction ZIP traces are under artifacts/fluid-navigation/. Inspect traces with `npx playwright show-trace artifacts/fluid-navigation/interaction-390-no-preference.zip`.

Known gates: physical iPhone touch/latency/battery, native haptics, VoiceOver and uncoached contractor validation remain unverified. Mouse pointer interaction and synthetic cancellation/visibility events do not prove those gates. Existing host/thread/approval/receipt suites remain required. No claims that the unfinished crew transport or full voice system works.
