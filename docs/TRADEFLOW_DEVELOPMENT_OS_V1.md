# TradeFlow — ChatGPT × Claude Development OS V1

**Status:** manual, human-in-the-loop operating system; not an autonomous agent service.  
**Notion source of truth:** [TradeFlow Development Operating System V1](https://app.notion.com/p/412f639e2373812fbb0dcd19e56ecf59)  
**Coordination epic:** [#50](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/50)  
**First GUI job:** [#51 — Compact orb + left chat bubble](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/51)  
**Simulator draft:** [PR #49](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/49)

## Non-negotiable
- One app, one tenant-scoped set of records, one conversation and typed approval-gated command system.
- Notion owns product decisions; GitHub owns exact code, issues, tests and evidence.
- Worker chats do **not** automatically run. Assign and invoke ChatGPT/Claude conversations manually. GitHub Actions automatically runs code tests only when configured.
- Freeze exact base SHA for tasks, use separate worker branches, keep at most three active implementation tasks, and leave integration to one owner.
- Do not auto-merge, deploy production, access customer records or issue external/financial actions.
- A mocked conversation or successful Node test is not proof a contractor workflow works on iPhone.

## Work lanes
| ID | Responsibility | Suggested active chat |
| --- | --- | --- |
| D00 | Product director: integration, prioritization, conflicts, acceptance | ChatGPT manager |
| D01 | GUI, adaptive navigation, orb, mobile visual QA | Claude GUI |
| D02 | Intelligence reasoning, knowledge, conversation, memory | ChatGPT Intelligence |
| D03 | Contractor workflow, commands, financial data/contracts | Claude workflows |
| D04 | Auth, caching, deployment, offline and online runtime | ChatGPT infrastructure |
| D05 | Independent contractor simulation and regression review | Other model from author |

## Mandatory issue packet
Every issue must contain:
1. Role, owner problem and real user journey.
2. Authoritative Notion references and founder screenshot.
3. Base branch and exact SHA.
4. Owned files and forbidden files.
5. Shared contracts: conversation, data, permissions, typed commands, app states.
6. Synthetic inputs, expected output and test assertions.
7. Failure conditions, fallback and rollback.
8. Required screenshot/browser/device evidence.
9. Approval needed for merge and release.

### START PROMPT — copy into either ChatGPT or Claude chat
> You are TradeFlow worker [Dxx] for issue [#]. Read the canonical Notion control center, the Development OS V1 page and the specific issue. Inspect current GitHub HEAD, code and tests. Respect exact base SHA and file ownership. Build one small vertical slice on an isolated branch; do not invent second conversation/data/command systems. Where connected coding tools are unavailable, provide an exact patch plus tests and handoff without claiming to have committed. Verify your own code; report test commands, exact SHA, browser screenshots, limitations and integration conflicts. Never deploy production or claim physical iPhone testing from a desktop test.

### FINISH REPORT — use this exact shape
```text
ISSUE:
ROLE:
BASE SHA:
BRANCH / HEAD SHA:
FILES:
USER JOURNEY:
TESTS PASS / FAIL:
BROWSER EVIDENCE:
ACTUAL IPHONE TESTED? yes/no:
SECURITY, PRIVACY & DATA CHANGES:
UNRESOLVED / KNOWN BUGS:
NEXT DEPENDENCY / HANDOFF:
PR / DEPLOYMENT STATUS:
```

## Contractor acceptance journey
Use the resettable synthetic 5-, 12- and 20-person businesses in PR #49 and the existing ten contractor workflow tests. Target the complete workflow:

**Owner question → inspect authorized evidence → detect job/cash/schedule risk → answer with references → prepare unsent action → request approval → execute through typed command registry → record receipt → continue same chat after reload.**

Evaluate actual owner outcomes (accurate figures, sufficient evidence, useful prioritization and zero unauthorized writes). A role-labeled simulation record is not an authenticated customer fact.

## Release gate
- Correct task/contract scope, separate integration review.
- All mandatory Node/synthetic checks pass at exact commit.
- Actual browser screenshots at 360/390/430 px and desktop where GUI changed.
- Access and no-real-data checks, cache update, offline/online truth.
- Physical iPhone checks for microphone, TTS and actual tap behavior; keep status **pending** until physically verified.
- Explicit human acceptance before merging or deploying into customer environments.

## Work order
1. [#51](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/51) — remove legacy large command sheet; brighten original orb and place compact chat bubble on its left, reuse existing AI thread.
2. [#50](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/50) — integrate simulator through an isolated/resettable profile and capture real browser evidence.
3. Wire read-only business records into Intelligence with source distinctions.
4. Add approval-gated workflows and receipts.
5. Enforce independent QA before accepting unified mobile experience.

Never interpret the presence of this file, a PR, or an issue as an autonomous worker having run.
