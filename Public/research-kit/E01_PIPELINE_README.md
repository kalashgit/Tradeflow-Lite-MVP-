# TradeFlow E01 — Schema and release protocol v1

**Pilot:** Austin, Texas electrical contracting. This kit contains blank templates, not verified leads.

## Worker inputs
W01 permits; W02 commercial construction; W03 tenders; W04 facilities/property management; W05 general contractors. Each worker writes a separate `E01_W0X_SUBMISSION_v001.csv` using `E01_WORKER_SUBMISSION_TEMPLATE.csv`. Never write to another worker file. Include original URLs, source dates, descriptions and verification notes.

## Worker 06 QC
Read all worker submissions and original sources. Deduplicate by (source URL, source record ID), and by project identity/location when IDs are absent. Record rejected/duplicate/pending cases separately using `E01_REJECTIONS_TEMPLATE.csv`. Preserve original worker IDs in the audit files. Do not approve rows without traceable source evidence.

## Approval and export
Produce versioned `E01_MASTER_APPROVED_v001.csv` with only approved rows and exact master template headers. Approval means evidence-backed authenticity and accurate classification; it does NOT mean verified demand. `verified_request` requires explicit evidence of active service solicitation. Export the same 19-column order as `E01_TRADEFLOW_IMPORT_v001.csv` for TradeFlow, with approved rows only. Never fabricate records.

## Field notes
`record_id`: globally stable unique ID, e.g. `E01-W02-000001`. `source_record_id`: original permit/bid/project identifier, blank if none. `opportunity_type`: verified_request | potential_opportunity | project_signal | business_prospect. `evidence_status`: verified | unreviewed | needs_review. `status`: initial workflow status New. Dates: ISO YYYY-MM-DD or ISO timestamp. `latitude` and `longitude`: decimal WGS84, both blank if unavailable. `contact_url`: business website/contact page only when appropriate. `source_url`: direct HTTPS original source. `evidence_notes`: concise justification; quote no protected personal information.

## Import compatibility
The bundled TradeFlow app accepts CSV (not GeoJSON yet), max 5 MB and 5,000 data rows per import. It checks IDs and source keys, and saves records in browser IndexedDB. Import does not synchronize across devices. A valid import is not proof of a live lead. CSV values are escaped when exported.

## Drive folders
01 Worker Submissions; 02 Source Evidence; 03 Verification & Rejections; 04 Approved Master; 05 TradeFlow Imports; 06 Archived Versions. Worker 06 alone publishes new approved versions. Keep old versions and rejection logs.
