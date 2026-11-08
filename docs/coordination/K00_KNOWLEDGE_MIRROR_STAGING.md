# K00 — Knowledge Mirror (staging directive)

**Status: proposal only. No automatic synchronization or production deployment is enabled.**

K00 is a shared read-only Notion-to-private-GitHub knowledge synchronization worker, not a replacement for the project’s canonical registries or engineering contracts.

## Findings
- This source repository is **public**. Do **not** commit copies of Notion pages, source content, internal financial data, licensed knowledge, access tokens, or sensitive material to it.
- K00 must use a dedicated **private** backup repository with branch protection and protected review requirements.
- Each Notion page is explicitly allowlisted by stable page ID. Preserve source IDs, structural blocks, last-edited timestamps, hash fingerprints, and provenance.
- Collect changed pages only; retry rate limits; report partial failures; retain last approved snapshots during outages.
- Proposed snapshot changes must go to **draft pull requests**, never direct writes to a protected/default branch. No automatic merges, deletions, or bidirectional sync.
- K00 must not redefine LAST LIGHT A00 canonical asset IDs, TradeFlow architecture contracts, or worker authority.

## Implementation package
A six-test Python prototype with manual-only GitHub Actions workflow has been prepared in the K00 handoff package. The package is intentionally **not** installed as an active workflow in this public source repository. Its security and API integration need independent review.

## Acceptance gates before schedule
1. Approve a private destination repository and the Notion page allowlist.
2. Verify read-only Notion integration permissions and narrowly scoped GitHub credentials.
3. Run fixture and integration tests for pagination, nested content, rates, permissions and attachment omissions.
4. Review a pilot draft PR against the original Notion pages for completeness and privacy.
5. Set explicit notifications and a concurrency lock; test failure paths.
6. Only then approve a scheduled interval. Never auto-merge into protected production contracts.

## Source references
- LAST LIGHT production command: https://app.notion.com/p/412f639e2373819c8f1cefc7ef9e908d
- TradeFlow engineering control center: https://app.notion.com/p/40cf639e237381be888be113c3d10565
- LAST LIGHT source repository: https://github.com/kalashgit/last-light-godot
- TradeFlow source repository: https://github.com/kalashgit/Tradeflow-Lite-MVP-
