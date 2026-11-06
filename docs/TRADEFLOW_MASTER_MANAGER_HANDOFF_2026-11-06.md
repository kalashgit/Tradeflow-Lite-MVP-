# TRADEFLOW — MASTER MANAGER HANDOFF
## Product, engineering, Intelligence, voice, S.T.A.R., GUI, commercial readiness

**Document ID:** TF-MANAGER-HANDOFF-2026-11-06  
**Prepared:** 6 November 2026, Europe/Athens  
**Purpose:** Make the next TradeFlow product/engineering manager effective immediately, without repeating the last several weeks of decisions.  
**Status:** Founder-directed roadmap and verified checkpoints; **not** a claim that the full system is built, released, or safe for customers.  
**Repository:** https://github.com/kalashgit/Tradeflow-Lite-MVP-  
**Primary existing program:** [GitHub Issue #36](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/36)  
**Canonical earlier specification:** [TF-MI-UNIFIED-01 in Notion](https://app.notion.com/p/40ff639e237381c99438e163bef7a3cf)

> **NEXT MANAGER — START HERE.** TradeFlow must become one offline-first, AI-native business operating system for small American electrical contractors. Master Intelligence should understand the whole authorized company, remember the right things over short and long horizons, apply approved business and electrical-operational knowledge, speak and listen naturally, navigate and operate the entire authorized app, and summarize interdependent workflows visually in S.T.A.R. The founder intends to finish the Intelligence, S.T.A.R., connected workflows and More-section polish, then validate and start selling. **Do not mark these as complete based on existence of issues, diagrams, code seeds or mockups.**

---

## 1. Decisions locked by the founder

1. **One application / one business truth / one Master Intelligence.** Do not build another assistant, a separate action system, or a disconnected database. All UI, voice, S.T.A.R., automation and memory use the same identity, tenant/role permissions, typed actions, authoritative records, audit and evidence model.
2. **Initial market:** owner-operated US electrical contracting businesses, roughly 5–20 employees (earlier plan sometimes said 2–15 or 5–15); validate actual buying segment. Typical work includes commercial service/maintenance, renovations, tenant improvement and smaller projects. Expand to plumbing, HVAC and adjacent trades later, not before initial fit.
3. **Offline-first applies to core Intelligence too.** User ultimately wants private on-device AI, local speech recognition and synthesis, on-device memory and workflows, plus sync and higher-compute services only as optional enhancements. Existing dev voice is **not** already running fully on iPhone offline. Measure model memory, latency, battery and accuracy on a physical device before claiming this.
4. **Voice is a first-class operating interface.** Tap the bottom-right orb on Home → begin microphone/listening directly, without the old AI mini-panel. Genuine AI answers audibly, with an approved distinct original voice; the orb brightens on activation and follows real assistant audio. Follow-up questions retain thread/context. Explicit Stop must work. Optional “Hey TradeFlow” opt-in wake detection when app is visible, not a false promise of locked-iPhone always-on microphone.
5. **Microphone permissions:** Request when browser/OS requires, avoid redundant custom prompts, but never bypass privacy or iOS re-prompts. User must have visible listening state and control. Voice commands cannot bypass role, confirmation, spending, external-send, or safety rules.
6. **Master Intelligence thinking:** establish short-term working context and long-term episodic, procedural/semantic and strategic-goal memory, with governed evaluation of outcomes. This is a reasoning and memory architecture around the chosen model(s), **not** evidence that a new neural network has been trained on books.
7. **Business expertise:** Source-grounded Academy of 59 business/operational/AI references, grounded in authorized electrical contractor processes and jurisdiction-specific official material. Distinguish publisher metadata, legally available study notes, actual retrieved source passages, company facts and hypotheses. Never confuse a book index with the content of a book.
8. **S.T.A.R. map:** an immersive, real interactive spatial summary of the business: star systems and selected workflows, pan/pinch/semantic zoom, energy flowing through **red, amber, green and purple lines** between neutral stellar-looking nodes, based on actual records/status; sidebar/detail panel appears **adjacent to a selected star at close zoom**, not an always-present bottom dashboard card. Avoid zoom +/- and “100%” chrome, fake metrics, UI clutter. Preserve the existing **geographic Map** separately. No official acronym expansion was accepted for S.T.A.R.
9. **Brand/UI:** keep existing TradeFlow black/near-black identity, white text, cyan/blue accent, original T mark and compact mobile 5-tab navigation. The founder's appearance setting can change highlights (e.g. yellow observed in screenshots), so **do not mistake personalized accent color for a design defect or globally force cyan over user settings.** Avoid generic blue panels, neon accents unrelated to brand, and uncontrolled CSS cascade conflicts.
10. **Home:** fixed premium wordmark and search/notification/profile controls; greeting, four individually outlined cards (Customers, Quotations, Active Jobs, Tasks Due); Revenue card below; compact bottom-right Concept B orb; Home/Map/Calendar/Finance/More dock. **No big “Ask TradeFlow anything” Home strip, no “Today's Focus” card, no oversized operating-picture section.** Live data must be real or visibly labeled fixture—not hardcoded screenshot values.
11. **Intelligence chat design — newest visual direction:** **ChatGPT-like simplicity, TradeFlow brand.** An initial **welcome/empty state** may show large/centered Concept B orb, “Master Intelligence” title and optional four suggested actions; a **conversation with messages** uses a compact header and minimalist transcript. **Assistant replies are plain white text directly on the black background, NO bubble/card/panel behind them, with small timestamp underneath. User messages are right-aligned bubbles in the established TradeFlow cyan/blue accent; timestamp beneath.** Bottom controls: rounded message input + separate ChatGPT-style plus, microphone and send/voice actions. No giant animated orb obscuring active chat; no preview unlock/diagnostics/export controls cluttering conversation. Preserve AI page access separately from Home orb tap-to-talk.
12. **More section:** clear up/navigation-consolidate the overcrowded More menu **without deleting capabilities or destroying deep links**. Organize workspaces/settings under logical groups; audit every route and permission. Founder wants this as the last major GUI cleanup before sale.
13. **No unauthorized releases:** work on isolated branches/draft PRs, preserve current production and working preview, do not merge, publish customer data, deploy production, buy API services or perform consequential business actions without explicit authorization. Isolated preview is acceptable only when specifically authorized; verify exact SHA.

## 2. What has actually been verified (as of 2026-11-06 ~21:00 EET)

### Live preview versus development branches

- Latest verified **Cloudflare TradeFlow pilot preview** script: `tradeflow-library-pilot-preview`, last deployment **2026-11-06 18:18 UTC** (20:18 Greece time), Cloudflare deployment `3c1591b0-ce5e-435b-aa54-ee9531373143`, annotated Git SHA **`eda453a7e5933d0d5c0a097978494206cb7d24c7`**, from `feature/tf-orb-live-integration-20261106`. Deploy URL: https://tradeflow-library-pilot-preview.bartoszszarafinski.workers.dev . The latest commit message is “Keep notification content above the assistant orb [preview-release].” This shows a preview was deployed; it **does not verify all features or prove commercial readiness**. Refresh Cloudflare deployment status before using this as the current build.
- **Separate earlier isolated Concept B orb preview**: https://tradeflow-concept-b-preview.bartoszszarafinski.workers.dev — initially used a simple simulated speaking demo and is **not** a reliable representation of the latest PR #39 orb; do not send as “latest.”
- Current production-release target, actual API keys, runtime bindings and precise D1 schema/sync deployment **must be audited**, not guessed from preview existence.

### Important draft PRs (not merged as of verification)

| Workstream | Snapshot at handoff | What is real | What's not yet proven |
| --- | --- | --- | --- |
| [PR #16](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/16), AI/cloud infrastructure | `feature/cloud-record-discovery`, `6409cd6bfa4a3238993aba33e529afd3e0611ce2` | Existing scoped app/data infrastructure and tests | All 34 capabilities interconnected and production-ready |
| [PR #18](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/18), GUI | `feature/tf-ux-01-command-center`, `3408c4036f183e0032f295c78a7a6da0cd9e0152` | Home structure, nav and visual corrections developed; historic CI evidence | Current live phone design necessarily equals founder's latest chat/welcome mockups |
| [PR #29](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/29), original mesh orb | `feature/tf-orb-idle-mesh-20261103`, `296164f753708caa81ef6a63f195bbe57d418408` | Earlier renderer | Superseded visual specification; founder rejected old sphere |
| [PR #31](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/31), real spoken AI | `feature/tf-voice-01-spoken-intelligence`, `a16c556768d646c0798bcc3fd90c2aa27929719d` | Genuine dev ASR → LLM → TTS chain tested in Chromium with **simulated microphone input**, real generated playback and same thread; implemented speech analyser and contracts | Fully offline **on iPhone**, natural physical-device mic/audio, final cast voice, universal commands, production deployment |
| [PR #35](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/35), Academy seed | `feature/tf-academy-source-seed-20261105`, `827c79100a2cd9a02a7b6d4183dfbd14651a7904` | 59-source Academy **bibliographic/objective metadata** + 8 electrical-regulatory/reference entry-point links and tests authored | Actual book contents loaded, knowledge retrieval into chat, source rights cleared, on-device learning |
| [PR #38](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/38), Concept B replacement | `feature/tf-orb-concept-b-replacement-20261106`, `f9fc845690a8ab17ef46d392d9d2e35df456ad22` | Replacement renderer, cyan T, idle/audio-light contract | Reference visual fidelity in latest app; predecessor of PR #39 |
| [PR #39](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/39), newer orb | `feature/tf-concept-b-membrane-reconstruction`, `7b841c145f329dc6e55b1e7868564ce1fb018fb0` | Reference-derived 2.5D moving membrane, 52px mobile/56px desktop, dim idle and audio-driven blue brightening, browser evidence/video; CI snapshot reported passing | Physical iPhone voice-triggered speech demo, local full 3D dynamic mesh, founder sign-off after latest integrated preview; voice integration and deploy remain separate |

**Important branch caveat:** Some PR body text refers to commits on a **separate visual-correction branch** and some PRs build on other PRs. Do not copy an SHA from prose and assume it is the current PR head. Fetch live branch ancestry, compare changes and reconcile `public/app.js`, `public/index.html`, CSS cascade and service worker in **one isolated integration branch**. The preview SHA above is newer than some draft PR heads and needs its own test baseline.

**Tests are not a substitute for customer verification:** PR #39 recorded Chromium app screenshots/videos and an exact-head CI pass; its own report notes a broader Node rerun 728/729 with an existing notification-label assertion. Verify again at the actual integration SHA. Physical iPhone testing remains mandatory for native mic/output/PWA lifecycle and wake-word realism.

## 3. Current product and business roadmap

**North star:** A business owner asks/commands TradeFlow naturally, and one Intelligence can inspect all permitted business records, reason with provenance and historical memory, propose and (where approved) execute the existing workflow, then show the resulting business-system consequences in S.T.A.R. The whole business becomes one connected, owner-controlled headquarters.

**Initial buyer:** US electrical contractor with owner-operator responsibilities and about 5–20 employees. Core pains: lead quality, quoting, jobs, crew and material scheduling, change orders, job profitability, invoice/collections, operational visibility, and follow-through. Do not turn generic book wisdom into unsupported claims about electrical code or local licensing. Build realistic contractor scenarios first.

**Commercial strategy still to validate:** founder wants private daily usability, then commercial sales. No verified price, paid pilot, launch customer list, legal entity/payment flow, SOC/security posture, customer-support process or regulatory coverage should be assumed from design or marketing work. Stage-gate actual first pilot with clear acceptance rather than launching to paying operators immediately.

### Functional inventory: **18 user areas + 16 intelligence capabilities**

User areas: **Home, Map (geographic), Calendar, Finance, Library, Opportunities, Customers, Quotations, Jobs, Tasks, Suppliers, Invoices, Job Costing, Marketing Studio, Research Briefs, Crew and Dispatch, Integrations, Target Customers and Buyer Personas.**

Intelligence capabilities: **Lead Discovery Engine, Contact Enrichment, Workflow Runs, Scheduled Research, Performance Analysis, Business Health Checks, Growth Recommendations, Conversion Improvements, Message Templates, Scheduled Communication, AI Response Drafting, Review Requests, Opportunity Signals, Buyer Fit Analysis, Source Monitoring, Data Quality.**

This is **required coverage and connectivity inventory**, not a statement that all 34 items are implemented or safe to voice-operate. Track each item as observed UI, backed record, typed command, approved execution, offline handling, tests and actual end-to-end receipt. One canonical register: [TF-WF-ALL-01](https://app.notion.com/p/40ef639e237381b9b8faef3cf85dde85).

## 4. Master Intelligence: short-term and long-term architecture to implement

The founder calls this a “short-term/long-term neural network.” Interpret as **one effective reasoning system with hierarchical memory**, not a second unsupported trained model or mandatory custom foundation model from scratch. Choose/benchmark local model(s) based on actual hardware capabilities, privacy, quality and cost.

| Memory/reasoning layer | Source and example | Lifetime, constraints | Acceptance |
| --- | --- | --- | --- |
| **Working memory** | Current turn, active job/quote/customer, user intention, pending actions, last few conversational turns | Short-lived; scoped to actor, tenant, thread, session; token budget, interruptible; discard on permission invalidation | Follow-up “what about tomorrow?” retains proper job context without leaking a different job |
| **Episodic memory** | Approved decision, recommendation, attempted step, receipt, outcome, corrected error, conversation summary | Persistent, versioned, evidence pointers, tenant/actor scope; editable/supersedable; TTL where appropriate | Reconstruct what was decided last week, distinguish “proposed” from “done” |
| **Semantic/procedural knowledge** | Academy principles, safe SOPs, policy, product capabilities and evidence-based contractor lessons | Source rights, original page/section, author/edition, claim type, jurisdiction, freshness, confidence, approval state | Retrieves relevant *actual* material and cites it, not just book titles |
| **Business truth** | Actual records, quotes, crew, supplies, invoices, payments, approved sync snapshots | **Authoritative records**, role/tenant filtered; immutable audit for consequential writes | AI never replaces missing dollars or job counts with plausibly invented ones |
| **Strategic goals and outcomes** | Owner objectives, target margin, cash-flow constraints, experiments, measured changes | Approved and reviewable; limited scheduled/event triggers rather than constant runaway loop | Trend analysis with traceable evidence, counterexamples and stop rules |
| **Reasoning coordinator** | Fast reactive alerts → retrieval → deeper deliberation → reviewable plan → typed command → evaluate outcome | Bounded iterations/compute, explicit tool privileges, fallbacks and honest unsupported states | Same result path works in typed chat and spoken conversation; no unapproved autonomous sending |

Proposed implementation types (pending engineering design review): `WorkingContext`, `MemoryEpisode`, `BusinessGoal`, `KnowledgeItem`, `SourceRecord`, `EvidencePointer`, `WorkflowPlan`, `ActionProposal`, `ActionReceipt`, `OutcomeEvaluation`. Each needs source/tenant, type, version, timestamps, permissions, confidence, provenance and lifecycle. No private model chain-of-thought in persistent storage. **Do not fine-tune on private company records** or pool data across customers without explicit lawful agreements.

**Learning loop:** detect actual outcome change → recheck evidence → compare to previous recommendation → surface proposed updated lesson/policy for review → approve/decline → save revision and source link. “Learning” is principally governed memory/procedural update and measurable outcome evaluation, not silent self-training.

**Reasoning design principle:** urgent daily answers should be fast; deeper thinking only when warranted; weekly/monthly strategic review should be event/schedule-triggered and owner-controlled. Separate observed record, inference, estimate and unverified hypothesis in output.

Read first: [Knowledge Fabric Notion](https://app.notion.com/p/40cf639e2373812aa4d5e008b280551d), [Hybrid architecture GitHub #21](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/21), [Knowledge substrate #20](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/20).

## 5. Academy and electrical contracting specialization

**Academy:** [59-source Notion curriculum](https://app.notion.com/p/40df639e237381928ea2eef4c1ea4d16). The Academy distinguishes: 1–19 foundational business study guides described as original paraphrases; 20–39 structured original notes; 40–59 source descriptions and learning objectives **only**. PR #35 copied **metadata** for all 59; it did not transfer complete published books or all actual study guide bodies. Verify source rights and availability before indexing. A related 19-source Notion Learning Library had empty Key Insight/Application placeholder properties when checked previously; do not count it as ingested mastery.

**Illustrative foundational authors/concepts:** business systems and delegation (e.g., *The E-Myth Revisited*), Theory of Constraints (*The Goal*), sales/offer strategy, customer communication, cash and capital allocation, Toyota/continuous improvement. Apply when causally relevant, compare incompatible frameworks, explain when they do *not* apply. No inspirational filler or invented page citations.

**Domain expertise:** begin with owner-led US electrical service and commercial workflow: lead identification, customer fit, estimate/bid/no-bid, labor/material allowance, schedule/crew availability, material ordering, change orders, on-site safety, inspection/closeout, job costing, AR/invoicing, collections, margin and customer retention. Create approved original SOPs and tested realistic scenarios, then connect to canonical records.

**Source pointers in PR #35:** OSHA construction electrical rules; NFPA 70/NEC edition discovery; NECA installation standards; Texas TDLR licensing and adoption; Austin Development Services technical codes/inspection pages. These are **entry-point links, not ingested or licensed standards**. For regulatory or safety advice identify authority having jurisdiction, date, applicable adopted edition, local amendments and real source clauses; human licensed review for high-stakes acts. Update exact dates when used: do not assume an NFPA *publication* automatically applies in every locality.

**Proof scenario:** “Our accepted quotations have worse-than-expected job margins. Why?” Intelligence identifies **verified** labor/material/job-cost variance from synthetic or authorized company records; retrieves 2–3 real approved framework notes, offers competing reasons, transparent uncertainty, a bounded experiment and a human-reviewable proposed next action with receipts. Offline tests should be included.

Read: [Issue #32](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/32), [draft PR #35](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/35).

## 6. Voice OS, wake word, and orb contract

**Founder target:** original natural, calm, authoritative deep-ish adult male voice, neutral American English, not a celebrity impersonation; choose final cast by listening tests, not model name or marketing demo. Read [Official Voice Identity](https://app.notion.com/p/40cf639e237381d7b998cd659ff94c74).

**App interaction:** tap compact Home orb → immediately start a voice session (once/when browser grants mic); do not open old panel. The orb visibly transitions: dim blue idle → brighter activated/listening → thinking → bright speaking driven by real TTS RMS/peak → dim on finish. Short spoken greeting once per session (optional and concise), not every follow-up. Interruption/Stop must cancel playback and stale responses; continue same conversation thread. Full text conversation remains reachable separately.

**Foreground wake:** user may explicitly enable “Hey TradeFlow” with visible mic indicator; when app visible and supported, local keyword engine activates identical voice pipeline. iOS Safari/PWA **cannot be assumed to offer microphone capture in background/locked-phone**; OS may ask permission again. Do not promise a bypass. Full native always-listening capabilities require distinct product/privacy/security study and still face OS constraints.

**Models in current dev evidence:** Whisper ASR, Qwen reasoning, Piper/Kokoro TTS tested through local/backend components in draft PR #31, not confirmed as all running natively on iPhone. Future target should benchmark local iOS runtime(s), WER, response time, output voice naturalness, model size, storage, thermal/battery limits and offline install. Text/voice must call the same authenticated model/context/command pipeline; old `SpeechRecognition` limited command overlay is not a substitute for full voice AI.

**Universal authorized actions:** voice should be able to understand/read/navigate/draft/review/execute **whatever the currently implemented app can safely do through existing typed commands**, with capability matrix for all 34 named areas. No free-form code/SQL as shortcut; explicit confirmation/preview for sending invoices, purchases, public communication, money and other irreversible changes. “I did it” requires persisted audited receipt.

**Known integration hazard:** GUI PR #18 `tfAiToggle` currently invokes `TradeFlowVoice?.startListening()` while PR #31 exports a distinct `TradeFlowConversationVoice.start()` API; trace adapter and integrate carefully. Do not wire taps to older overlay. PR #39's `tradeflow:speech-features` expects genuine `assistant_playback` audio metadata from PR #31. Preserve original Concept B wave movement and T center (founder later approved the T; the earlier “no T inside orb” direction is obsolete).

Read: [Voice OS #19](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/19), [Speech #30](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/30), [tap/wake #41](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/41), [PR #31](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/31), [PR #39](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/39).

## 7. GUI: exact known founder decisions and recent reviews

### Home

Use the **current real Home screenshot** `IMG_5603.png` in the attached reference pack as the primary current style and layout. The branded T and wordmark, icons, near-black background, clean revenue graph and bottom dock reflect the desired treatment. The small right orb with visible fine-blue membrane and cyan T is part of the direction. **Keep user-configurable accent colors.** Avoid reintroducing the old big inline AI composer or Today's Focus block.

### Conversation / active chat — latest approved *reference direction*

See the generated mockup `a_sleek_dark_high_contrast_mobile_app_tradeflow.png` and `tradeflow_master_intelligence_chat.png` in the reference archive. The last founder changes require: (a) assistant words **directly on near-black canvas, no panel/bubble behind assistant message**; (b) time below each assistant message; (c) **user bubbles in TradeFlow cyan/blue**, time below each; (d) composer styled like ChatGPT with separate round plus, rounded dark input, mic and send/voice control; (e) compact logo header and history/menu; (f) **no oversized glowing orb in active thread**. These are *reference images*, not code/feature acceptance; screenshots contain synthetic example business data and must not be treated as actual customer facts.

### Welcome / no active chat

See `a_dark_high_contrast_mobile_app_ui_iphone_like.png`: centered larger blue Concept B orb with cyan T, Master Intelligence heading, short subtitle, optionally four business action shortcuts, clean input at bottom. On first user message, welcome surface disappears and transcript takes priority. “Ready” or “Offline” badge must reflect runtime truth, not hardcode “Local-first” when model is remote.

### Notifications and More

Founder showed **broken notifications layout**, `IMG_5605.jpeg` and `IMG_5606.jpeg`: panel clipped/offset horizontally, large deadline form embedded in notification sheet, nav overlap. Later live preview SHA `eda453a7` specifically adjusted notification overlay z-index above orb; inspect current actual layout in 360/390/430 px, forms, safe-area, scroll, VoiceOver, and reopen states rather than assume all issues fixed. Notifications list should be compact and actionable; creating a deadline should occur in its own appropriate workflow, not inside huge notification drawer.

**More**: categorize Settings/account, business setup, operational workspaces, Intelligence tools, integrations, help and admin; keep the exact existing 18+16 capability inventory discoverable. Remove duplicates/obsolete debug entry points only with test-backed mapping. Maintain all deep links and permissions.

**Style warning:** Screenshot yellow is a user-selected appearance accent, not automatically incorrect or something to strip. Recent references emphasize cyan for TradeFlow brand and user bubble—but honor theming controls and distinguish logo brand cyan from configurable active accents. Fix CSS cascade rather than stack `!important` overrides indiscriminately.

Read: [GUI #24](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/24), [Intelligence Page #34](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/34), [PR #18](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/18).

## 8. S.T.A.R. business system map — interactive experience and visuals

This is **NOT** Google Earth, the existing geographic Map, or a generic graph widget. It is the visual “living connected business” interface. Founder requires:

- Dark immersive outer-space depth with **realistic, restrained stellar-looking anchor points**, not glowing colored starbursts as schematic nodes or Earth/globe rendering.
- **Neutral/stellar-looking nodes** distinct from the link-color semantics. Color-coding belongs primarily to **flow lines**: **green** healthy; **amber** awaiting attention; **red** constrained/high risk; **purple** growth/opportunity/optimization. Exact business-status taxonomy requires real-data mapping and legend/documentation; colors should not become invented business truth.
- Fine, elegant curved trajectories between verified connected systems, with animated small energy pulses flowing in direction of actual handoffs. No garish neon pipes, excessive arrows or fake motion suggesting a transaction where none exists. Offline stale/unknown must be apparent.
- Touch pan, pinch zoom, semantic zoom from systems → workflow clusters → exact records, role-filtered source/target relationships; names and labels stay readable. No plus/minus zoom buttons or 100% chips, and no unnecessary floating control clutter.
- When close enough and user selects e.g. **Jobs**, **Quotations**, **Invoices**, show a matte dark **adjacent right-side contextual panel**, anchored near the selected star as space permits; on narrow phone viewport adapt panel positioning without clipping or covering required nodes. Side panel has actual status/evidence, bottlenecks, source freshness and an authorized action/navigation, not stock AI predictions. Keep the detail panel hidden at far zoom.
- Voice and UI share selection/navigation: “Show S.T.A.R.”, “Zoom into delayed quotations,” “Which system has a bottleneck?” must operate only on existing supported graph and evidence.
- Backend graph is a read-only projection of source-of-truth company records and known links; missing relationship remains missing. Provide an accessible outline/list fallback, role/revocation tests, deterministic layout, progressive rendering and reduced-motion mode.

**Visual references are still exploratory.** Generated iterations `tradeflow_s.t.a.r._map_dashboard.png`, `tradeflow_s.t.a.r._map_in_space.png`, `tradeflow_s.t.a.r._map_jobs_hub.png`, `tradeflow_s.t.a.r._map_jobs_at_risk.png` were critiqued for unrealistic neon “stars,” excessive glow, or Google Earth aesthetic. **Do not report a final art reference as founder-approved.** Preserve the detailed interaction requirements while conducting a better visual acceptance review. Earlier interactive artifacts `TradeFlow_Star_Interactive_Walkthrough.mp4`, `TradeFlow_Star_Interactive_Concept.html` and related desktop/mobile preview PNGs are historical ideas; audit source before reusing.

Read: [S.T.A.R. issue #33](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/33), [Unified program #36](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/36).

## 9. Execution order for next manager (prioritized)

**P0 — Establish one verified integration baseline and a private phone test build.** Recheck GitHub PR heads (not this static list), live deployed SHA and exact tests. Inventory branch ancestry/conflicts. Pick one writer/coordinator for app router and styles. Compare latest live branch to draft PR #31/#39 and GUI. Capture real iPhone/Home/notifications/AI screenshots and current resource utilization. Don't merge untested branches into production. Deliver an actionable defects list + reproducible test suite.

**P1 — Finalize UI design and real voice vertical slice.** Implement approved AI **welcome and chat layouts**; remove preview console from chat area but retain necessary authentication/security in appropriate controlled entry. Tap orb starts voice, no old panel. Choose/listen-test original voice, integrate ASR/LLM/TTS actual speech and true orb audio brightening. Test mic consent and iOS lifecycle; truthful offline fallback. This is the first end-to-end founder demo.

**P2 — Local-first Intelligence and memory.** Choose mobile on-device stack only after benchmarks. Ship a working text-only offline reasoning path first, then local ASR and TTS when viable. Implement WorkingContext, episodic/goal memory, permissioned retrieval and correction/expiry; source-linked company evidence; no unauthorized training. Verify fresh vs stale and cross-tenant isolation.

**P3 — Book/contractor knowledge retrieval and real workflows.** Legally ingest actual available Academy notes and approved contractor SOPs, not metadata only. Connect the existing voice/text assistant to all *implemented* typed business actions; create 34-capability matrix, fill gaps, transaction receipts, QA contractor scenarios. Demonstrate customer→quote→job→materials→cost→invoice safe workflow.

**P4 — Implement S.T.A.R. v1 from actual relationships.** Agree visual art direction, start with truthful system graph, accessible list, pan/pinch/semantic zoom and right-adjacent contextual panel. Add energy flows only on evidence-backed links/status. Integrate navigation/voice through the same command/evidence path; compare actual business updates.

**P5 — Clean More, finish all reachable workflows and commercial hardening.** Sort navigation and settings, remove developer-facing panels from customer-facing UX. Secure tenant boundaries, backups/restore/sync conflict handling, authentication, billing, privacy, support, logs, model resource packaging/licenses, app PWA/native roadmap and availability; independent end-to-end usability tests with real electrical contractors and trial users. Only then move to first paid pilot/launch decisions.

This is **dependency order**, not a promise every full module should be built before any pilot. First sellable scope must be defined by genuine customer validation and measurable workflows; commercially sensitive actions require approvals.

## 10. Mandatory QA, safety and acceptance gates

- **Truthfulness:** No synthetic business values disguised as live, no false “AI learned 59 books,” “on-device/offline” or “payment sent” claims. Real action receives a typed command receipt and auditable source revision.
- **Permissions:** Authenticated actors, tenant scopes, and source citations; reject cross-tenant info in memory, voice, S.T.A.R. graph counts/labels and screenshots. Invalidate cached snippets and memory on revocation.
- **Offline:** airplane-mode tests on actual iPhone for local records, navigation, memory and model tasks genuinely shipped locally. Distinguish offline-capable UI from offline neural model; test queued edits, conflicts and safe sync.
- **Voice:** physical iPhone Safari and installed PWA separately, tap/unlock, denied grant, app hidden, cold relaunch, mic indicator, interruptions, assistant echo/self-activation, TTS cancellation and stale audio. “Hey TradeFlow” foreground opt-in only until actual OS capability verified.
- **UI:** Chromium 360/390/430 px plus desktop, safe areas/keyboard, contrast/themes, large user text, VoiceOver/keyboard where applicable; no notification offscreen drawer or bottom nav covering forms; active chat readability.
- **S.T.A.R.:** 1000-node stress scenario with clustering fallback, unknown/stale links, semantic zoom thresholds, accessible list, no fictitious metrics or arbitrary flow directions.
- **Knowledge:** citations to actual retrieved passages, rights/jurisdiction/edition, uncertainty and counterexamples, resistance to prompt injection within study materials.
- **Evidence:** exact base/head SHAs, pass/fail counts from actual execution, video/screenshots, unresolved blockers, no claims of tests not run. Independent QA sign-off for important code changes; final founder approval for orb, chat, S.T.A.R. and voice casting.
- **Release controls:** no production deploy/merge, customer outbound, external payment or new paid API service absent explicit approval.

## 11. Existing related research and assets

- **E01 Austin electrical research:** user-supplied `TradeFlow Research Plan.txt` in this project. Describes initial opportunity pilot targeting 100 authentic records then 300–600, using Austin issued permits, airport project packages and public procurement. Its reported starter state: 8 authentic public project packages, 7 rejected, 0 confirmed live purchasing demands; different from 8 paying contractor prospects. Evidence must be refreshed before customer-facing use. Six worker roles planned, not proof six active agents completed the pilot.
- **Core Notion references:** [Official Product & Intelligence Index](https://app.notion.com/p/40cf639e237381a9b0fbfabe7b74267d), [Unified Intelligence Contract](https://app.notion.com/p/40ff639e237381c99438e163bef7a3cf), [59-source Academy](https://app.notion.com/p/40df639e237381928ea2eef4c1ea4d16), [34 capability inventory](https://app.notion.com/p/40ef639e237381b9b8faef3cf85dde85), [Knowledge Fabric](https://app.notion.com/p/40cf639e2373812aa4d5e008b280551d), [Voice casting](https://app.notion.com/p/40cf639e237381d7b998cd659ff94c74), [Orb spec (historical)](https://app.notion.com/p/40df639e23738111aa1cf4ab810cf597).
- **Engineering issues:** [#36 unified](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/36), [#41 voice UX](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/41), [#34 Intelligence GUI](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/34), [#33 S.T.A.R.](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/33), [#32 Academy](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/32), [#21 hybrid](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/21), [#20 knowledge](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/20), [#19 voice parity](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/19), [#24 GUI](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/24).
- **Reference bundle attached alongside this Markdown:** The assets are **design and defect evidence**, not a substitute for implementation. Some generated UI text is illustrative/fabricated. Always obtain current runtime screenshots before a final design or completion claim.

## 12. Ready-to-send incoming manager / Codex directive

> **You are the Principal TradeFlow Product, Master Intelligence, Software Engineering and Independent QA Manager.** Your job is to continue the **existing** TradeFlow application to a secure, functional, offline-first AI-native business operating system for owner-led American electrical contractors. First read `TRADEFLOW_MASTER_MANAGER_HANDOFF_2026-11-06.md` and all linked Notion sources, inspect live GitHub branches/PRs and the actual current Cloudflare preview commit, load repository engineering skills, and verify real code/tests before writing. Do not start from a blank UI or assume prior reports are current. One authoritative business record system, one permissioned typed-command execution path, one Master Intelligence and continuous text/voice thread, with versioned evidence, source-backed knowledge and tenant-scoped short/long-term memory. Preserve founder-approved Home and chatbot styles, implement the actual genuine speech system and unique voice, foreground optional “Hey TradeFlow,” and Concept B audio-reactive orb. Finish the S.T.A.R. interactive evidence graph with realistic stellar nodes, distinct colored moving workflow links and adjacent at-zoom detail panels. Then clean the More section and systematically verify cross-module workspaces and commercial gates. Prioritize a real phone-usable integrated vertical slice, audited data and independently verified tests. Work on isolated branches and draft PRs; never invent completion, model training, iPhone support, customer data, citations, screenshots or receipts. **Do not merge or deploy production without explicit founder authorization.** Report exact SHAs, changed files, screenshots, traces, real voice audio/video and remaining blockers at each milestone.

## 13. The manager's first-session deliverable

Return, **with evidence**, the latest deployed preview SHA and exact URL; current integration branch and competing PR ancestry; an updated 34-capability feature matrix; a reviewed screenshot comparison for Home/AI welcome/chat/notifications/More; voice model and local-on-iPhone feasibility tests; prioritized P0 blockers and first draft PR scope. Then implement one real tested integrated improvement, not another generic architecture deck. If any references cannot be accessed, list the gap and proceed with the verified code rather than fabricating source content.

---

**Handoff change control:** This is a snapshot at 2026-11-06. Recheck mutable GitHub and Cloudflare state before building. Historical decisions that were explicitly superseded (e.g. no T in orb, old sphere, fixed “never yellow”) must **not** override newer founder instructions. The product's future commercial readiness remains **unverified** until hard release gates pass.

**Note for GitHub readers:** The separate reference-image/video ZIP is attached to the originating ChatGPT handoff as `TRADEFLOW_MANAGER_REFERENCE_ASSETS_2026-11-06.zip`; this documentation-only Git branch does not include binary reference media. Ask the founder to supply that ZIP for a new Codex/Work task.
