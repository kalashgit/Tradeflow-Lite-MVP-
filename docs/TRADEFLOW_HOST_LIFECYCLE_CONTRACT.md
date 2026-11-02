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
