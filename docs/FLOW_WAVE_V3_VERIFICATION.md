# Flow Wave ribbon replacement

Scope: wave artwork and its motion only. The existing heading, panel, status, microphone controls, cards, composer, navigation and command/data paths are unchanged from integration baseline 5804212. The earlier local short-viewport layout experiment was reversed before delivery, following the owner's scope clarification.

## Implementation

- Four fixed, closed cubic Bézier ribbon surfaces replace the generated strands and fine traces.
- Reference-derived silhouette: upper blue crest, counter-flowing blue surfaces, cyan central crossover, broad left/right troughs and violet at the right.
- Translucent multi-stop fills, surface sheen, masked edge lighting and localized bloom; no stroked graphs, fibers, bitmap downloads or extra dependencies.
- Preserved aspect ratio prevents the ribbons being squeezed into a knot at narrow widths.
- Separate slow idle, gentle listening and controlled processing transforms. Reduced motion stops animation. These are state-based animations, not audio-level measurements.
- Only artwork/CSS cache URLs and service-worker cache name were advanced to v3. Existing command JavaScript remains unchanged.

## Verification

- Focused regression command: `node --test tests/document-intake.test.cjs tests/job-intake-links.test.cjs tests/library-commands.test.cjs tests/location-quality.test.cjs tests/flow-wave-art.test.cjs tests/voice-command.test.cjs tests/voice-command-integration-fix.test.cjs tests/customer-create.test.cjs tests/pilot-integration.test.cjs`: **57 passed, 0 failed**.
- Full suite `node --test tests/*.test.cjs`: **137 passed, 3 failed**. All three failures reproduced on untouched baseline 5804212:
  - `finance-ui-and-map-retry.test.cjs:20`: “View Map checks full eligible queue again”.
  - `map-all.test.cjs:8`: “View on Map starts all eligible addresses”.
  - `opportunities-v5.test.cjs:35`: “Confirmed imports start mapping without manual button”.
  These concern existing automatic geocoding expectations, unrelated to the wave; their code and assertions were preserved.
- Standalone smoke suite: **71 checks passed**. Address-resolution and Calendar standalone suites passed.
- Voice Stop test's fake `closest()` selector was corrected so quick-action detection no longer intercepts its simulated microphone click. No controller change was needed.
- Chromium rendered the actual application at 375×812, 390×844, 430×932, 375×568 and 390×360. Four broad surfaces rendered at every size. Three animation states changed transforms; reduced motion disabled animation; typed input stayed editable.
- Repeatable browser harness: `BROWSERS=chromium PLAYWRIGHT_MODULE=/path/to/playwright OUTPUT_DIR=/tmp/flow-review node scripts/verify-flow-wave.cjs`. Set `BASE_URL` for a preview; omit `BROWSERS` to attempt Chromium and WebKit. Playwright must already be installed in the development environment.
- WebKit was attempted but could not launch: missing libgtk-4, libgraphene, libharfbuzz-icu, libmanette, libhyphen and libGLESv2. No claim of Safari coverage.

## Visual review and limits

Actual application screenshots and a side-by-side wave crop were reviewed against supplied Photo 1. The broad silhouette, cyan crossover and violet distribution follow the reference; lighting remains an SVG approximation rather than pixel-identical source artwork. The existing graphite backdrop is preserved. The former mesh is gone.

Screenshots use reduced motion for repeatable comparison and a synthetic recognition lifecycle to hold the listening state. No physical microphone, transcription accuracy, iPhone frame rate, Safari browser-toolbar behavior or software keyboard was tested. Short viewport screenshots simulate reduced available height only. Existing card/composer overlap at short heights was left unchanged as explicitly requested; this delivery does not claim to fix surrounding UI.

Artifacts are saved under `/workspace/artifacts/tradeflow-flow-wave/`: `verified/chromium-390x844.png`, other phone sizes, `verified/chromium-wave.png`, `verified/browser-results.json` and `wave-comparison-final.png`.

Deployment is handled by the existing branch preview workflow, targeting only `tradeflow-library-pilot-preview`; production is excluded. Verify the workflow result and live artwork/CSS/HTML/service-worker bytes before reporting deployment success.
