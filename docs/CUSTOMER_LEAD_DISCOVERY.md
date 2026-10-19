# Customer and work discovery

This supersedes the earlier UI direction that searched for contractors as prospective TradeFlow users. The main discovery form now finds **customers/work for the user's contracting business**. Old contractor-company research and saved records remain intact and are labelled as legacy; they are not evidence of service demand.

Choose your trade/service area, then:

- **Service requests & bids** (default): public requests for relevant service work, procurement or subcontractor bids. Future published deadlines are labelled as such; availability must still be checked.
- **Projects & permits**: documented projects may create work, but are not presented as someone currently requesting a contractor.
- **Buyer & vendor relationships**: a relevant buyer publishes a maintenance/vendor route; this is not an open job.

`public/lead-demand-policy.js` is a pure shared policy module. Requests must occur on the discovered source page near the relevant trade; a linked About/Contact page cannot create demand. Main evidence drives geographic matching so unrelated service-area footer text cannot silently establish project location. Radius checks require a Census-matched address from demand evidence; an arbitrary contact-office address is not substituted.

Date handling supports ISO, US month/day/year and month-name dates with explicit years. Unknown dates remain unknown. Expired, withdrawn and conflicting deadlines fail qualification; imports recheck expiration because a stored pending result can become stale. Same-day closing times require local time/timezone confirmation. Educational content, employment ads, completed portfolios, collections, ordinary contractor advertising and generic "Looking for a plumber?" sales copy do not establish a buyer request. Public individual requests use the original request as the contact route rather than extracting personal phone/email details.

Accepted records use existing Opportunities and schema version 9, retaining source quotes, demand class/status, deadline and reviewer corrections. Source review does not automatically promote a signal to the existing `verified_request` category. No outreach, fake customer data, revenue claims, appointments or private-source access is added.

Validation: pure demand policy tests plus all existing tests and the actual app/browser fixture suite. Live-source acceptance is recorded separately from fixture tests; search may return no qualified current leads. Do not claim private homeowner coverage or guaranteed current jobs from a search index.

The first preview deployment passed unit/browser checks but its immediate HTML hash probe saw the previous version during propagation. Exact-asset verification now retries for a bounded period and still requires the deployed bytes to match the triggering commit; stale content is never accepted as success.

Live RFP regression: the University of Akron plumbing RFP published a questions deadline of October 16 and a proposal deadline of October 22, 2026. Those are separate milestones, not conflicting proposal dates. The parser now accepts immediately labelled response dates and skips inquiry milestones/table headings. PDF record headers support geographic context; pre-bid meeting or contact-office addresses are not silently used as project-radius locations. Generic permit guides and requirements cannot qualify merely by mentioning a building permit. The UI prioritizes qualified customer leads and groups rejected/unreadable sources under a separate expandable list.


## Source selection and response readiness

Search results are ranked before the batch is selected for enrichment. Shared rules prefer the requested trade, location and customer-need class, and lower expired, educational and mismatched-state snippets. Unknown snippets remain candidates; ties retain provider order. `searchRanking.stage` is `search_snippet_only`, never qualification or proof of current demand. Full source extraction, geographic constraints, deduplication and human review remain mandatory. Legacy company-prospect searches preserve their provider ordering.

The original discovered page can supply evidence-backed flags for explicit mandatory visits/pre-bid meetings, licensing, insurance, bonds, vendor registration and required response channels. Each flag retains the source URL, quotation and retrieval timestamp with `review_required` status. Optional/negative/conditional wording does not become a mandatory requirement. Contact-page terms cannot manufacture a project prerequisite. Flags are conservative aids, not a complete bid-compliance analysis: absent flags do not establish that no prerequisites exist, and TradeFlow does not assert eligibility, attendance, registration or a successful submission. Accepted records retain these flags in `demand_evidence.requirements` without changing the database schema or existing records. Older saved records remain readable.

The discovery review and Opportunity dossier expose these terms using existing components. Known state information is shown when a street address is unknown. Saved response deadlines are evaluated against the current date so a previously future deadline shows a local-time warning on its closing day. No time or timezone is inferred.
