# TradeFlow secure business API — implementation gate (2026-10-29)

This is Phase 2 source groundwork, **not** an activated login, production account system, or sync release.

## Existing application preserved
The original browser IndexedDB app, Notifications, Customer/Job/Revenue screens, voice flows and existing /api/ai/* preview routes remain unchanged. The new /api/v1/* read-only routes are separate. Never confuse the AI preview access code with user authentication.

## Identity configuration (no secrets or identifiers committed)
Configure an actual OpenID Connect provider before enabling:
- `TF_OIDC_ISSUER`: exact HTTPS issuer `iss` string (no discovery from incoming tokens).
- `TF_OIDC_AUDIENCE`: exact intended API audience.
- `TF_OIDC_JWKS_URL`: trusted HTTPS JWKS endpoint under the issuer's own URL prefix; requires matching RSA RS256 signing keys.
- `TF_DB`: Cloudflare D1 database binding, after migration `migrations/0001_tenant_foundation.sql` applied to that database.

The API verifies JWT signature, expiration, issuer, audience, issued-at, subject and explicit active business membership. It never accepts a supplied user ID, business role or user-provided JWKS. Missing configuration returns HTTP 503. Missing token returns 401; absent membership returns 403. No routes exist for sign-up, changing membership, creating records or bulk synchronization.

**Operator action required:** select and configure an identity provider and controlled account bootstrap. A verified identity still cannot read records until an independently provisioned membership exists. Do not create a default owner solely because someone signs in. Use a controlled, audited bootstrap process after domain/business ownership verification.

## API source contract
- `GET /api/v1/me`: businesses the verified subject is an active member of (scoped SQL).
- `GET /api/v1/businesses/{businessId}/records/{customers|jobs|quotes|invoices}/{recordId}`: read one record from `tenant_records` by business, type and ID, after membership authorization.
- Unknown /api/v1 paths: 404; any non-GET: 405.
- JSON responses set no-store, nosniff and Vary: Authorization.

Do not attach the IndexedDB screens to this API until migrations, verified login UX, secure onboarding,  backup/recovery, and revision/conflict behaviors have all passed acceptance. Existing local data are not migrated automatically.

## Test/rollout gates
- `node --test tests/*.test.cjs` must pass on Node 22 in GitHub Actions.
- Confirm deployment in GitHub Actions on the exact commit; do not assume a GitHub commit means assets deployed.
- Add actual trusted identity-provider discovery constraints, token rotation/revocation policy, secure browser session design (prefer a server-controlled HttpOnly SameSite cookie/token exchange rather than storing long-lived bearer tokens in localStorage), rate limiting and monitoring before production use.
- Verify Cloudflare D1 provisioning, migrations, durable backup/restore and audited membership bootstrap separately.
- Pen-test cross-tenant access, IDOR, malformed token and replay/expiry flows. Measure contractor user acceptance.
- No pain points retired solely for API source-level code.
