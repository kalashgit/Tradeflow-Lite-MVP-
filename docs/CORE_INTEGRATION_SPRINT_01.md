# TradeFlow — Core Integration Sprint 01

State: **In progress**, preview branch only. This document does not certify a public commercial release.

## Product objective
Connect the TradeFlow business graph and introduce Suppliers as a first-class local record:
Customers ↔ Opportunities ↔ Quotations ↔ Jobs ↔ Tasks/Calendar ↔ Invoice/Payment/Finance;
Suppliers ↔ Supply orders ↔ Business address / Customer / Job / custom destination ↔ optional Opportunity.

The local-first app remains usable without Cloudflare AI or external credentials.
Interactive 2D map tiles still require internet and licensed map providers. Live road and shipping
routing, automatic lead scraping, stock tracking, carrier tracking, and autonomous AI execution are NOT implemented.

## Implemented in preview v0.9.29
- Add IndexedDB v8 collections: suppliers, supplyOrders, commandLog. Upgrade is additive (DB name stays tradeflow-lite-v1).
- Export backup format version 8; accept and safely migrate earlier backup schemas.
- Dedicated Suppliers screen accessible through More and Opportunities. Edit suppliers and record supply orders; optionally link an order to an Opportunity.
- A supply order can reference the business profile, customer, job, or custom delivery address.
- Supply connections draw geographic, geodesically interpolated neon lines on MapLibre only where both ends have actual saved coordinates.
- Supplier markers have distinct warehouse icons. Manually selected map points can be linked to an existing supplier.
- Status-aware route colors distinguish an organizational order stage. These are geographical links, NOT road paths, travel ETAs, shipping estimates, carrier scans or verified delivery routes.
- Provider-independent Core Integration module exposes strict position parsing, relationship audit, deterministic command planning, a multi-store IndexedDB action log and geographical supply connections.
- Existing accepted-quotation → job action invokes the shared command engine with an idempotent conversion key.
- Unit/regression tests cover supplier/order validation, required linked records, geodesic world coordinates, duplicate quote conversion, backup versioning, service-worker cache and app wiring.

## Not implemented yet (remaining Sprint 01)
- Shared event-driven handling for every customer/quotation/job/invoice/payment change.
- Typed command schemas and business invariants for the entire full customer-to-payment workflow.
- Cross-module data change notifications, event replay and revision/conflict tracking.
- Backward-compatible migrations for older locally saved record relations beyond additive v8.
- Complete local-first offline end-to-end transaction and restore tests on real iPhone devices.
- Auditable, exportable owner-facing action history and undo mechanisms.
- Supplier procurement payments, stock/order item lines, verified delivery status, automatic geocoding, route optimization or third-party sync.
- Actual BYOC provider adapters and AI decision/action permissions.

## Release constraints
- Never claim supplier lines are road routes, actual transportation legs, or live shipment movements.
- Never count a supply order, quote, or purchase plan as paid/received revenue.
- Supplier coordinate matching requires saved coordinates; an address string alone is not evidence of correct geolocation.
- Old personal device data must be backed up before upgrading. Data remains browser-origin scoped.
- TradeFlow production stays unchanged unless the owner separately approves promoting the preview.
- Before charging US customers for invoicing, make currency, tax rules, compliance and payment receipts market-appropriate.

## Immediate next sequence
1. Inspect on iPhone: add supplier → save map position → create linked order → show neon connection; run backup/restore.
2. Complete business record graph and relationship audit for quotes, jobs, tasks, invoice and payments.
3. Move all relevant mutations to safe idempotent commands and event-triggered workflows.
4. Implement the full accepted quote → job → scheduled task → invoice → payment reconciliation test.
5. Add user review/undo controls and lightweight contextual AI command integration.
6. Refine pages one at a time after shared functional acceptance.

**This sprint is a foundation release, not a claim that the entire Command OS is ready to sell.**
