# TF-UX-08 flagship demonstration and acceptance

Run `node scripts/verify-host-presentation.cjs` for reproducible phone/desktop × normal/reduced-motion fixtures. No real customer data, audio capture, provider call or deployment. Synthetic recognition exercises actual host/controller abort callbacks; it is not physical microphone or ASR evidence.

Manual story with an existing representative job:
1. Home → Open Intelligence → type an unsent question → Return to work. Home and draft remain.
2. Open the saved job → Ask Intelligence about this record. Use the saved job's name in a review question; the host does not invent a customer/job identity.
3. Inspect existing findings and evidence, explicitly approve the supported internal cost review, and inspect the actual saved task/command receipt. Explain that a review task does not resolve costs, authorize billing or prove collection.
4. Type an unsent continuation → Return to work. The exact selected job and keyboard focus return. Reopen Intelligence and verify the same thread/draft/receipt.
5. Select a different conversation; return must report thread_changed rather than silently attach that thread to another origin. Select the original thread to continue.
6. Open/close voice UI; microphone stops before the visual exit. New interaction interrupts exit; Escape closes safely. If a synchronous host listener vetoes close, the mic is still stopped and the panel stays readable.

Browser fixtures additionally verify deleted origin rejection, explicitly supplied captured origin after offline reload with matching thread, exact one task/receipt and no new-thread approval leakage. Traces/screenshots: artifacts/host-lifecycle/. Unit negatives cover actor/business/thread changes, invalidation during record checks, close cancellation, disconnected panels, zero-animation repeated closes and reentrant close.

Host/API review: https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/16#issuecomment-6572213126 . Optional visual-open port, generation guards and focus correction remain reviewable on draft frontend PR #18; neither PR was merged. No financial/role permissions changed.

Remaining: independent uncoached contractor walkthrough and measured usability, physical iPhone/VoiceOver/real recognition and latency, approved cloud identity/two-device gates. Existing host only preserves the supported screen/selected record/thread/AI composer draft fields; arbitrary unsaved business forms or new navigation history are not claimed. Origins remain ephemeral; no automatic cross-session authority or second conversation/draft store.

Next ready task after CI: turn this verified path into the concise founder/customer sales walkthrough and obtain independent acceptance; do not add more animation infrastructure.
