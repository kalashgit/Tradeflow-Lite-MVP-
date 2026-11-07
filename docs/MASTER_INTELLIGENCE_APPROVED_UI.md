# TradeFlow Master Intelligence — founder-approved visual direction

Approved 2026-11-06. Reference: the generated mobile preview in the ChatGPT project conversation, together with the two founder-supplied mobile screenshots. This document records the approved target; it is not evidence of pixel parity in a running browser.

## Welcome (default for new empty conversation)
- Matte near-black full-screen canvas, TradeFlow cyan accents, white text.
- Top: back navigation, cyan TradeFlow T and wordmark with 'Master Intelligence' subtitle; history and overflow buttons on right.
- Center: luminous fine cyan-blue organically deforming mesh membrane orb with TradeFlow T emblem. Mesh must be visibly animated in the running app; a CSS approximation is not final artwork acceptance.
- Heading 'Master Intelligence'; subtitle 'Your TradeFlow AI. Business, operations and execution.'; compact 'Ready · Local-first' pill only when runtime readiness genuinely supports it.
- Four actions: Business Overview, Prepare a Quotation, Schedule Work, Analyze Profitability.
- Fixed bottom composer: plus, 'Message TradeFlow...', microphone, send arrow.

## Conversation state
- Sending text from welcome opens the same saved Master Intelligence conversation, resembling the founder's first screenshot: minimal header, user messages right in cyan, assistant messages left, bottom composer pinned.
- Keep existing authenticated conversation history, text/voice command pipeline, permissions, receipts and backend; do not substitute synthetic responses or claim business operations completed without server confirmation.
- Existing thread should open in conversation state. New empty thread should show welcome.

## Acceptance / release gates
- Mobile Safari and desktop screenshots compared against founder references; orb animation/material reviewed independently.
- End-to-end Send -> real response -> persisted history -> reload; starter actions, keyboard, safe areas, accessibility and reduced-motion verified.
- No production merge or deployment until explicit authorization and all required regression checks pass.

Implementation draft: PR #44, branch `codex/ai-welcome-chat`. The generated preview is a design target, not a captured running build.
