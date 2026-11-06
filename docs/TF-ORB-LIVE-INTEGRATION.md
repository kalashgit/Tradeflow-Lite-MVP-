# Approved orb integration into the existing GUI pilot

User requested “Place this into the actual thing” after approving the compact, dim-idle / calmer-blue-speaking orb. This release targets only the existing GUI pilot:
https://tradeflow-library-pilot-preview.bartoszszarafinski.workers.dev

Base is that live origin's release commit 3408c4036f183e0032f295c78a7a6da0cd9e0152 (GUI branch feature/tf-ux-01-command-center). Orb source is 7b841c145f329dc6e55b1e7868564ce1fb018fb0, draft PR #39. Copied only orb renderer/styles/material, focused verification and reference evidence. HTML changes only the orb JS/CSS versions. Service worker adds the material assets and bumps its existing GUI cache version. public/app.js, all unrelated GUI assets, src and wrangler.jsonc are unchanged from the live base.

Dedicated branch/workflow uses the existing tradeflow-preview environment and existing Worker release process. It retains the full Node/storage/contractor/browser/proactive-labor/disposable-D1 gates and adds the approved orb verification. Before deploy, it rejects a concurrent GUI release and checks that every unrelated live asset still matches. Existing pilot bindings/vars/authentication are preserved; no migrations, database writes or permission changes are requested. All existing draft PRs and production remain unmerged/unchanged.

After release, verify the exact live release manifest and asset digests, denied unauthenticated business API, and real Chromium Home at mobile/desktop size plus tap-to-open Intelligence. Real PR #31 speech providers remain separate; playback features are consumed when that runtime emits them. Any speaking injection in QA is labeled simulated.

## GIF cadence and continuous-motion fix

Idle now advances at the source GIF's real-time 170ms/frame cadence (1.53s loop), instead of 55% speed. Genuine assistant playback slows that movement while retaining blue brightness feedback. A real animated GIF replaces the static error/loading background, including texture-load failure and WebGL context loss. Reduced-motion preferences still select the static poster. The renderer reattaches when a host retains its DOM node but replaces its canvas, and resumes on pageshow. Browser checks now verify real-time phase advance, canvas replacement recovery and visibly changing fallback GIF screenshots with a blocked flow resource.

The animation clock uses actual elapsed time across dropped frames. A visible-page scheduling loop also detects motion-preference changes even when a browser misses the media-query event; reduced-motion frames are not repainted unless lighting or preference changes.
