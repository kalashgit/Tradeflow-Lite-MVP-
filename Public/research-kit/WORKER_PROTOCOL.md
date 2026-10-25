# TradeFlow E01 research protocol

**Market:** Austin TX. **Trade:** Electrical. **Goal:** Evidence-backed commercial project records.

- Research only assigned sources/records. A shared atomic queue is NOT implemented in this kit; coordinate workers with exclusive source partitions or a single assignment sheet.
- Never invent source IDs, projects, coordinates, companies, contacts, or verification.
- Do not scrape sites contrary to their terms or bypass access controls. Review source reuse and redistribution permissions before resale.
- `project_signal` = documented activity, **not** demand for an electrician. `potential_opportunity` = some documented relevance to procurement, but unconfirmed. `verified_request` = explicit dated request for electrical services, evidenced by source.
- `record_id` must be stable, e.g. `austin-permit-<official-id>`. Use a source record ID when available. Never reuse an ID.
- `source_url` must be an HTTPS URL to original evidence. `evidence_status` should be `unreviewed`, `source_checked`, or `verified`. `verified` requires a human or reliably documented source check.
- Avoid personal residential addresses and private contact information. Use public commercial project locations when appropriate.
- Use ISO 8601 dates YYYY-MM-DD. Coordinates are decimal degrees, WGS84. Leave blank if unknown.
- Output CSV matching `opportunity-template.csv`. Quote CSV fields correctly; never change column names.
- Keep a separate rejection/audit log. Counts must distinguish signals, prospects, and verified requests.
- Do not claim any file has been uploaded to Drive unless the upload is confirmed.
