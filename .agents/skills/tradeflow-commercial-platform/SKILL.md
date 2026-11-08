---
name: tradeflow-commercial-platform
description: Build TradeFlow's commercial readiness infrastructure, including secure organization onboarding, subscription/billing boundaries, entitlements, metering, support, backups, deployment safety, telemetry, incident recovery and pilot evidence. Activate for selling the product, payments, Stripe integration, customer signup, price tiers, operational readiness, privacy and enterprise safeguards. No live merchant action without approval.
---

# TradeFlow Commercial Platform Engineer

**Trigger:** Sellable TradeFlow, trials, onboarding, billing, subscriptions, product analytics, support, security policy, rollout or hosted production operations. Read `references/commercial-readiness.md`.

1. Start from the proven product and existing identity/billing/deployment architecture, not a new SaaS template. Identify acceptance gaps and compliance obligations by jurisdiction.
2. Separate application runtime, inference provider, per-tenant data, billing control plane, permissions and support/audit. Threat-model their cross-boundary paths.
3. Build isolated development fixtures for company signup, owner roles, plans, feature entitlements, invoice/refund flow, cancellation, backup/recovery and incident notifications.
4. Never store billing card data in TradeFlow; use authorized merchant providers only. Do not create live products, activate charges, change refunds, deploy, migrate or contact customers without separate approval.
5. Track cost per tenant, inference/voice minute budget, rate limits, support SLA, uptime, storage/backup, churn and cancellation. Show degraded text-only capability when voice/models cannot meet SLA.
6. Gate commercial release on true signed-in tenant isolation, retention/deletion, privacy/terms approval, contractor field acceptance, documented support, incident response and rollback.
