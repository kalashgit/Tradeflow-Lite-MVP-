# TradeFlow host lifecycle/context API — v1
**Owner:** AI host (PR #16). **Consumer:** Codex TF-UX-01 motion (PR #18). **Status:** development contract; no PR merge or deployment.

The shared global `window.TradeFlowHostLifecycle` is installed by the existing app after host setup. It is a lightweight adapter over the current app tab, selected-record, local conversation, unsent prompt and voice controller; it is **not** a new source of authorization, conversation persistence or navigation.

Methods:
- `version === 1`.
- `captureOrigin()`: immutable `{version,actorId,businessId,screen,selected,threadId,contextRecordId,draft}`.
- `getContext()`: same live fields plus nullable `origin`.
- `setDraft(text)`: change unsent prompt in existing host, max 1,200 characters.
- `openFromOrigin({from?})`: capture/pin origin then open existing AI workspace; results `opened`, `already_open`, `scope_changed`, `record_unavailable`, `interrupted`.
- `returnToOrigin({from?})`: check identity, thread and selected record existence; use existing navigation; restore current draft and keyboard focus. Result `returned` or a specific failure status. Without explicit `from`, origin is in-memory; after offline reload, pass a previously captured snapshot explicitly. No silent cross-session origin authority.
- `onBeforeClose(callback)`: unsubscribe function. Return `false` or throw to cancel visual close. Callbacks must be synchronous; no promise-based veto.
- `requestClose({reason?})`: synchronous mic stop, before-close listeners, visual close if allowed, focus restoration. Reentrant call returns `already_closing`.
- `stopMicrophoneNow()`: synchronous SpeechRecognition abort and waveform shutdown **before** waiting for animation; safe to call repeatedly.
- `invalidate()`: cancel outstanding navigation generations, clear captured origin, stop microphone.

Do not use this interface as a tenant authorization check. Device-local actor/business labels are not authenticated. Missing/deleted records, changed actor/business, changed thread and interrupted navigation fail closed; the caller should surface the result rather than guess a destination. The UI remains responsible for actual visible focus affordances and motion timing. The existing voice sheet close button may close directly; Codex should call `stopMicrophoneNow()` before any animated exit, then use `requestClose()` at completion without delaying mic shutdown.

**Codex coordination:** review the signature on PR #18 discussion before implementing animated exit or origin restoration. The AI branch does not modify PR #18's owned presentation files.

## TF-UX-08 frontend integration review notes (PR #18)

Host presentation consumes the API for Home/record → Intelligence, explicit return, draft ownership, context reads, mic stop and close; it keeps no origin/draft store. Source restoration after offline reload requires an explicitly captured snapshot and matching saved thread. Presenter close calls stopMicrophoneNow synchronously, plays the shared fixed exit preset, rechecks context and connection, then calls requestClose. No asynchronous onBeforeClose listener or animation timer is registered. Cancelled/vetoed/interrupted exits restore readable UI; no success is inferred from animation.

Narrow AI-host patches included for owner review: optional `isVisualOpen()` port permits a genuinely reopened legacy panel to close while sequential closes remain idempotent; app uses logical voice/panel state for this port. Replaced invalid standard DOM `:visible` focus selector with visible-element filtering. Navigation generations now begin before awaited record validation and recheck actor/business/thread after validation and navigation, so invalidated/stale preflights cannot navigate. Public method signatures, financial permissions and business commands are unchanged. These are development patches in the isolated frontend PR, not changes to the AI branch or production.

Explicit reload restoration clarification (TF-UX-08 owner-review patch): `returnToOrigin({from: capturedSnapshot})` restores that snapshot's draft when the current composer is empty, after successful scope/thread/record revalidation and navigation. A nonempty current draft always wins. Normal in-memory `returnToOrigin()` preserves intentional empty/cleared drafts. This is explicit restoration, not automatic persistence or extra authority.

Explicit origins pinned to an existing thread must also match the current thread before `openFromOrigin` can copy their captured draft. A foreign-thread explicit open returns thread_changed without navigation or draft replacement. This closes the matching-thread invariant on both entry and return; it grants no role/record permission.
