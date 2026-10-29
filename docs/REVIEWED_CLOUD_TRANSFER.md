# Reviewed local-to-cloud transfer

Settings → Backup & restore → Review cloud transfer uses the existing account session, shared record catalogue, tenant API and durable queue. It does not introduce another database or automatic synchronization.

## Approval and execution

1. Sign in as a provisioned owner and select an owned business.
2. Explicitly enable mapping if device records use the `local-business` scope. Other business scopes cannot be reassigned.
3. Prepare a read-only review against actual remote records. Unsupported types, invalid identifiers, missing relationships, cycles, differing remote payloads and oversized records block transfer.
4. Download the integrity-checked local backup and confirm it was saved securely.
5. Confirm the reviewed transfer. A fresh owner session and unchanged local snapshot are required before atomically staging the receipt and operations.
6. Send only approved operations, parents before dependants. The API revalidates membership, relationships, revision and financial permissions. Confirm each result by reading it back.

Unresolved work stays in the existing command journal. A new review can resume equivalent operations without duplicate writes. A remote difference is never silently overwritten. Local business records remain unchanged, including their original scope; no ongoing sync or download is enabled.

## Limits

A review supports at most 200 business records, with a 30,000-byte maximum per record. Settings, command journals, local audit and Library files are excluded. Larger datasets, cyclic relationships and manual merge conflicts require further implementation. This feature copies recorded financial information; it does not issue invoices, settle payments or contact customers.

## Evidence

Local full suite: 290 passed, zero failures. Nine focused transfer tests cover approval, saved backup, owner/identity changes, concurrent edits, atomic rollback, dependencies, replay, size/cycle rejection and multiple-business selection. Chromium exercised the actual Settings UI and IndexedDB at 390×844 and 1280×900 with explicitly synthetic authenticated API fixtures. It verified download/approval gates, ordered persistence, repeat submission, expired-session denial and local-record preservation. Existing browser recovery and offline reload checks also passed.

These fixtures are not evidence of a real customer upload or cross-device consistency. No business membership or customer upload was performed during development. Physical iPhone/Safari acceptance and an owner-approved real transfer remain outstanding.
