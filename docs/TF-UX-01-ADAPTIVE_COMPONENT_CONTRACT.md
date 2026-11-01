# Adaptive conversation component v1 — frontend contract

Scope: existing vanilla JavaScript/HTML templates and CSS tokens; no framework or animation dependency, execution service, conversation backend or voice processor added. Runs in the current offline PWA/Cloudflare static frontend. Native touch, keyboard, details/summary, shared icons and graphite tokens remain authoritative. PR #18 is isolated from the AI engineer's integration branch.

## Schema and ownership

Only `version:1,type:"job-review"` is registered. Exact keys:

```json
{"version":1,"type":"job-review","id":"card-id","threadId":"saved-thread-id","messageId":"saved-assistant-message-id","jobId":"saved-job-id","explanation":"Saved explanation","evidence":["jobs:saved-job-id@0"]}
```

IDs: bounded ASCII identifiers; explanation: 1–2500 characters; evidence: at most eight typed revision-formatted references. Unknown types/versions/fields, executable payloads, non-text explanations and malformed references fail validation. The trusted host independently supplies current actor/business/thread/message, saved job and saved assistant turn. The turn must be device-local evidence, match the explanation/references exactly, and reference that job. A model cannot designate its own action, HTML, callback, evidence trust or renderer. Text/attributes are escaped. `@0` is explicitly unverified device-local provenance, not a server revision.

The host adapter renders only the currently investigated job in its original thread. The existing trusted `decisions.view` owns its action slot and unchanged controller owns preparation, explicit confirmation, authorization, idempotency, receipt checking and uncertain-write recovery. Source navigation uses existing `record.open`, validates that the reference belongs to the saved turn, and rechecks thread/actor/business after preparation. Missing/stale/denied sources report failure, never success. Unsupported components fall back to the existing review presentation; raw model HTML is never rendered.

## State and interaction

Business records and saved message IDs remain in their existing stores. Expansion preferences alone live in a bounded ephemeral map (100 entries), keyed by actor, business, thread, message and component. Switching threads removes the other thread's controls; returning to the original thread may restore its own review/receipt. Expansion is never approval. No schema/storage migration or new approval store.

Motion tokens: press 90ms, reveal 180ms, panel 240ms; easing cubic-bezier(.2,.8,.2,1); press scale .985. The proof uses press feedback and an interruptible opacity/4px translation reveal. Prior animations cancel; no numerical/business-value tween, height animation, spring library or scroll-driven motion. Reduced motion disables both reveal and press transforms. Panel token is reserved for later existing sheet/dialog adoption, not a claim that every surface has been converted.

Dark graphite only, per the founder’s latest decision. No white/light variant or theme selector. System light preference cannot switch these surfaces to white. Touch targets are at least 44px; native disclosure keyboard semantics, focus indicators, source labels and unchanged live receipt/status regions are retained. Full VoiceOver and physical-device acceptance remain separate gates.

## Feedback and voice boundary

`createFeedback({enabled:false,nativeImpact})` is silent by default and requires an explicit trusted host capability/opt-in. Semantic events: selection, light_impact, confirmation, warning, error, boundary, gesture_snapped, voice_state. Unknown events and unavailable/throwing native bridges safely do nothing. Confirmation additionally requires the host's verified task-receipt status; no model/UI selection can supply business authorization. The proof only emits selection on explicit disclosure interaction, never token/scroll/background events. No vibration permission, microphone capture or synthetic audio activity is introduced. Standard iPhone Safari provides no native haptic bridge here; no actual haptics or ASR/TTS capability is claimed. Future speech-session visuals must consume the AI engineer's real session/level contracts; current voice/waveform remains unchanged.

## Reproduction

`node --test tests/adaptive-ui.test.cjs`; `node scripts/verify-adaptive-ui.cjs`; full existing npm/SQL/browser/D1 suites through exact-head CI. Four synthetic browser journeys: phone/desktop × normal/reduced motion, keyboard disclosure, no-haptics fallback, explicit approval, repeated tap producing one task/canonical receipt, conversation switching and original-thread receipt return. Screenshots/results: `artifacts/adaptive-ui/`. No real customer or financial outcomes. No merge/deployment; 0/62 retired.

## Shared motion primitive increment

`createMotion({media,document,style})` centralizes the existing reveal and fixed panel/navigation presets. CSS tokens live in workspace-tokens.css (90/180/240ms); durations accept milliseconds/seconds, respect zero, cap at 320ms and safely fall back on malformed CSS. New motion cancels the previous effect for that element. Preference changes, document hiding and explicit disposal cancel active effects; completed/cancelled effects release their map entries. Unsupported or throwing animation APIs leave the readable final DOM intact. The registry now consumes this primitive; it never accepts model keyframes or animates financial numbers. Panel/navigation presets are available for the agreed host integration, not a claim that all navigation is converted. Existing haptic/voice processing and authorization remain unchanged.
