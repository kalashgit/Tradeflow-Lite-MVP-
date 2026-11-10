"""Deterministic synthetic whole-business information-network scenario factory.

A scenario contains judge-only business truth and a routed, role-scoped stream.
A candidate only receives public_view(role, tick); it must never be handed the
scenario, delivery schedule, future events or audit truth. These fixtures and
generation rules are PUBLIC and are NOT a secured holdout.

Design based on the TradeFlow owner/office/PM/field/finance workflow contracts.
No real customer records, genuine business actions, credentials or secrets.
"""

from dataclasses import dataclass, asdict
from hashlib import sha256
import json
import random

SCHEMA = "GenesisBusinessNetworkFactory/2.2"
ROLES = (
    "owner", "office", "project_manager", "dispatcher", "foreman",
    "technician", "supplier", "inspector", "finance", "customer",
)
WORKFLOWS = (
    "quote_to_job", "materials_and_supplier", "dispatch_and_field",
    "field_to_change_order", "inspection_and_permit",
    "milestone_to_invoice", "invoice_to_collection",
)
DISRUPTIONS = (
    "nominal", "supplier_shortage", "offline_field_blocker",
    "scope_change", "permit_rejection", "invoice_dispute",
    "late_payment", "stale_revision", "approval_revoked",
    "contradictory_field_report", "lost_acknowledgment",
    "priority_conflict",
)
SPLITS = {"dev": 620000, "validation": 720000}
# A workflow-aware graph: messages need explicit destinations, not a company-
# wide omniscient broadcast. Owner and PM are still not exempt from routing.
STAGES = (
    (0, "customer", ("office",), "opportunity", "received", "quote_to_job"),
    (1, "office", ("owner",), "quote", "prepared", "quote_to_job"),
    (2, "owner", ("office", "project_manager"), "quote", "approved", "quote_to_job"),
    (3, "office", ("inspector", "project_manager"), "permit", "submitted", "inspection_and_permit"),
    (4, "project_manager", ("dispatcher", "foreman"), "plan", "released", "dispatch_and_field"),
    (5, "dispatcher", ("foreman", "technician"), "assignment", "sent", "dispatch_and_field"),
    (6, "technician", ("foreman",), "field", "observed", "dispatch_and_field"),
    (7, "foreman", ("project_manager",), "materials", "requested", "materials_and_supplier"),
    (8, "project_manager", ("supplier", "office"), "purchase", "requested", "materials_and_supplier"),
    (9, "supplier", ("project_manager", "office"), "purchase", "acknowledged", "materials_and_supplier"),
    (10, "supplier", ("foreman", "project_manager"), "delivery", "confirmed", "materials_and_supplier"),
    (11, "technician", ("foreman", "project_manager"), "work", "reported_complete", "dispatch_and_field"),
    (12, "inspector", ("project_manager", "foreman"), "inspection", "verified", "inspection_and_permit"),
    (13, "project_manager", ("finance", "office"), "invoice_readiness", "verified", "milestone_to_invoice"),
    (14, "finance", ("customer", "owner"), "invoice", "issued", "milestone_to_invoice"),
    (15, "customer", ("finance",), "payment", "received", "invoice_to_collection"),
    (16, "finance", ("owner", "office"), "collection", "reconciled", "invoice_to_collection"),
)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value):
    return sha256(canonical(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Event:
    event_id: str
    tenant: str
    job_id: str
    stream: str
    revision: int
    actor: str
    occurred_at: int
    status: str
    workflow: str
    amount: int
    source_ref: str

    def __post_init__(self):
        if self.actor not in ROLES or self.workflow not in WORKFLOWS:
            raise ValueError("Invalid synthetic event actor or workflow")
        if self.revision < 1 or self.occurred_at < 0 or self.amount < 0:
            raise ValueError("Invalid synthetic event revision/clock/amount")
        if not self.tenant or not self.job_id or not self.event_id or not self.source_ref:
            raise ValueError("Incomplete event provenance")


@dataclass(frozen=True)
class Envelope:
    event_id: str
    recipient: str
    delivered_at: int | None
    channel: str  # event_bus, field_queue, supplier_portal, office_message

    def __post_init__(self):
        if self.recipient not in ROLES:
            raise ValueError("Invalid routed stakeholder")
        if self.delivered_at is not None and self.delivered_at < 0:
            raise ValueError("Invalid delivery clock")


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    tenant: str
    split: str
    seed: int
    disruption: str
    events: tuple[Event, ...]
    envelopes: tuple[Envelope, ...]
    job_ids: tuple[str, ...]
    horizon: int
    revoked_role: str | None = None
    revoked_at: int | None = None

    def __post_init__(self):
        if self.split not in SPLITS or self.disruption not in DISRUPTIONS:
            raise ValueError("Invalid public research scenario split/disruption")
        if not self.scenario_id.startswith("SYN-NET-") or not self.tenant.startswith("SYN-TENANT-"):
            raise ValueError("Business network permits fictional tenants only")
        if not 2 <= len(self.job_ids) <= 8 or len(set(self.job_ids)) != len(self.job_ids):
            raise ValueError("Expected distinct fictional jobs")
        if not 18 <= self.horizon <= 120:
            raise ValueError("Invalid scenario horizon")
        ids = set()
        stream_rev = {}
        for event in self.events:
            if event.tenant != self.tenant or event.job_id not in self.job_ids:
                raise ValueError("Cross-tenant or unknown-job source event")
            if event.event_id in ids:
                raise ValueError("Duplicate source event")
            ids.add(event.event_id)
            key = (event.job_id, event.stream)
            last = stream_rev.get(key, 0)
            if event.revision != last + 1:
                raise ValueError("Source revisions must advance monotonically")
            stream_rev[key] = event.revision
            if event.occurred_at >= self.horizon:
                raise ValueError("Source event beyond horizon")
        seen = set()
        for envelope in self.envelopes:
            key = (envelope.event_id, envelope.recipient)
            if envelope.event_id not in ids or key in seen:
                raise ValueError("Unverifiable or duplicate stakeholder delivery")
            seen.add(key)
        if self.revoked_role is None and self.revoked_at is not None:
            raise ValueError("Revocation time without subject")
        if self.revoked_role is not None and (
            self.revoked_role not in ROLES or self.revoked_at is None or
            not 0 <= self.revoked_at < self.horizon):
            raise ValueError("Invalid synthetic revocation")

    def fingerprint(self):
        return digest(asdict(self))

    def _truth(self, tick: int):
        current = {}
        for event in self.events:
            if event.occurred_at <= tick:
                key = (event.job_id, event.stream)
                if key not in current or current[key].revision < event.revision:
                    current[key] = event
        return current

    def source_truth(self, tick: int):
        """JUDGE ONLY. The evaluated agent never receives this method's result."""
        if not 0 <= tick < self.horizon:
            raise ValueError("Time outside synthetic simulation")
        return [
            {"tenant": e.tenant, "job_id": e.job_id, "stream": e.stream,
             "revision": e.revision, "status": e.status, "actor": e.actor,
             "source_ref": e.source_ref, "amount": e.amount}
            for e in sorted(self._truth(tick).values(),
                            key=lambda x: (x.job_id, x.stream))
        ]

    def public_view(self, role: str, tick: int, tenant: str):
        """Role/tenant scoped and delivery-limited evidence; NO hidden truth."""
        if role not in ROLES or tenant != self.tenant:
            raise PermissionError("Incorrect tenant or unknown stakeholder")
        if not 0 <= tick < self.horizon:
            raise ValueError("Time outside synthetic simulation")
        if role == self.revoked_role and tick >= self.revoked_at:
            raise PermissionError("Role access revoked at this snapshot")
        visible = {}
        traffic = 0
        event_index = {event.event_id: event for event in self.events}
        for envelope in self.envelopes:
            if envelope.recipient != role or envelope.delivered_at is None:
                continue
            event = event_index[envelope.event_id]
            if event.occurred_at > tick or envelope.delivered_at > tick:
                continue
            traffic += 1
            key = (event.job_id, event.stream)
            if key not in visible or visible[key].revision < event.revision:
                visible[key] = event
        latest = [
            {"job_id": event.job_id, "stream": event.stream,
             "source_revision": event.revision, "status": event.status,
             "actor": event.actor, "observed_from": event.source_ref,
             "occurred_at": event.occurred_at, "amount": event.amount,
             "workflow": event.workflow}
            for event in sorted(visible.values(),
                                key=lambda x: (x.job_id, x.stream))
        ]
        return {"schema": "GenesisBusinessNetworkPublicView/2.2",
                "fictional": True, "tenant": self.tenant, "role": role,
                "as_of": tick, "known": latest,
                "received_messages": traffic,
                "known_information_not_complete": True,
                "hidden_truth_available": False}

    def diagnostic(self, tick: int):
        """Independent observability, never a candidate scoring/feedback API."""
        ground = self._truth(tick)
        results = {}
        for role in ROLES:
            if role == self.revoked_role and tick >= self.revoked_at:
                results[role] = {"revoked": True, "known_streams": 0}
                continue
            snap = self.public_view(role, tick, self.tenant)
            known = {(r["job_id"], r["stream"]): r["source_revision"]
                     for r in snap["known"]}
            # A stakeholder is eligible only for streams explicitly routed to
            # them. A message not yet delivered is still an unresolved gap.
            indexed = {e.event_id: e for e in self.events}
            eligible = {(indexed[m.event_id].job_id, indexed[m.event_id].stream)
                        for m in self.envelopes if m.recipient == role and
                        indexed[m.event_id].occurred_at <= tick}
            missing = sum(key not in known for key in eligible)
            stale = sum(key in known and known[key] < ground[key].revision
                        for key in eligible if key in ground)
            results[role] = {"revoked": False, "eligible_streams": len(eligible),
                             "known_streams": len(known), "missing": missing,
                             "stale": stale,
                             "received_messages": snap["received_messages"]}
        return results


def generate(split: str, index: int, *, base_seed: int | None = None,
             jobs: int | None = None, disruption: str | None = None):
    if split not in SPLITS:
        raise PermissionError("No protected holdout generator in development")
    if type(index) is not int or index < 0 or index > 100000:
        raise ValueError("Invalid generator scenario index")
    if base_seed is not None and (type(base_seed) is not int or
                                  not 0 <= base_seed <= 2_000_000_000):
        raise ValueError("Invalid synthetic seed")
    seed = (SPLITS[split] if base_seed is None else base_seed) + index
    rng = random.Random(seed)
    variant = disruption if disruption is not None else DISRUPTIONS[index % len(DISRUPTIONS)]
    if variant not in DISRUPTIONS:
        raise ValueError("Unknown predeclared disruption")
    size = jobs if jobs is not None else 2 + rng.randrange(5)
    if type(size) is not int or not 2 <= size <= 8:
        raise ValueError("Invalid job count")
    tenant = f"SYN-TENANT-{seed % 99991:05d}"
    all_events, envelopes, identifiers = [], [], []
    by_stream = {}
    counter = 0
    # Stable per-scenario role/flow constraints; no outside source access.
    channels = ("event_bus", "field_queue", "supplier_portal", "office_message")

    def publish(job, tick, actor, recipients, stream, status, workflow, amount=0,
                delay=None, dropped=()):
        nonlocal counter
        counter += 1
        key = (job, stream)
        revision = by_stream.get(key, 0) + 1
        by_stream[key] = revision
        event_id = f"{tenant}-EV-{counter:05d}"
        source_ref = digest((seed, event_id, job, stream, status))[:24]
        event = Event(event_id, tenant, job, stream, revision, actor, tick,
                      status, workflow, amount, "SIM-EVIDENCE-" + source_ref)
        all_events.append(event)
        for role in sorted(set((*recipients, actor))):
            span = rng.randrange(4) if delay is None else delay
            if variant == "offline_field_blocker" and role in ("project_manager", "foreman"):
                if stream in ("field", "blocker"):
                    span += 7
            if variant == "late_payment" and stream in ("payment", "collection"):
                span += 8
            if variant == "lost_acknowledgment" and status == "acknowledged":
                if role != actor:
                    span = None
            if variant == "stale_revision" and stream == "field" and revision == 1:
                span += 9
            if role in dropped:
                span = None
            delivered = None if span is None else tick + span
            envelopes.append(Envelope(event_id, role, delivered,
                                      channels[(counter + ROLES.index(role)) % 4]))

    for j in range(size):
        job = f"JOB-{seed}-{j + 1}"
        identifiers.append(job)
        cost = 100 + rng.randrange(300)
        base = (j % 3) * 2
        for offset, actor, recipients, stream, status, workflow in STAGES:
            tick = base + offset
            if variant == "supplier_shortage" and stream == "delivery":
                tick += 5
            if variant == "invoice_dispute" and stream in ("payment", "collection"):
                tick += 4
            amount = cost if stream in ("purchase", "delivery") else (
                cost * 3 if stream in ("invoice", "payment", "collection") else 0)
            publish(job, tick, actor, recipients, stream, status, workflow, amount)
        if variant in ("offline_field_blocker", "contradictory_field_report"):
            publish(job, base + 7, "technician", ("foreman",),
                    "blocker", "observed", "dispatch_and_field")
            publish(job, base + 8, "foreman", ("project_manager",),
                    "blocker", "escalated", "dispatch_and_field")
        if variant == "contradictory_field_report":
            publish(job, base + 8, "technician", ("foreman", "project_manager"),
                    "field", "needs_reinspection", "dispatch_and_field")
        if variant == "supplier_shortage":
            publish(job, base + 10, "supplier", ("project_manager", "office"),
                    "purchase", "backordered", "materials_and_supplier")
        if variant == "scope_change":
            publish(job, base + 9, "foreman", ("project_manager",),
                    "change", "requested", "field_to_change_order")
            publish(job, base + 10, "project_manager", ("owner", "customer"),
                    "change", "awaiting_approval", "field_to_change_order")
            publish(job, base + 11, "owner", ("project_manager", "office"),
                    "change", "approved", "field_to_change_order")
        if variant == "permit_rejection":
            publish(job, base + 12, "inspector", ("project_manager", "foreman"),
                    "inspection", "rejected", "inspection_and_permit")
            publish(job, base + 13, "project_manager", ("inspector", "foreman"),
                    "inspection", "remediation_requested", "inspection_and_permit")
            publish(job, base + 15, "inspector", ("project_manager", "foreman"),
                    "inspection", "verified", "inspection_and_permit")
        if variant == "invoice_dispute":
            publish(job, base + 15, "customer", ("finance", "office"),
                    "invoice", "disputed", "invoice_to_collection")
        if variant == "approval_revoked":
            publish(job, base + 6, "owner", ("office", "project_manager"),
                    "quote", "revoked", "quote_to_job")
        if variant == "priority_conflict":
            publish(job, base + 9, "owner", ("project_manager", "dispatcher"),
                    "plan", "reprioritized", "dispatch_and_field")
    horizon = 2 * size + 32
    # Short interleaving with per-job logical clock ordering; source revisions
    # are assigned in publication order. Timeline order need not equal arrival.
    return Scenario(f"SYN-NET-{split.upper()}-{seed}", tenant, split, seed, variant,
                    tuple(all_events), tuple(envelopes), tuple(identifiers), horizon)


def generate_batch(split: str, count: int = 120, *, base_seed: int | None = None):
    if split not in SPLITS:
        raise PermissionError("No developer access to protected holdout generation")
    if type(count) is not int or not 1 <= count <= 1024:
        raise ValueError("Unsafe or invalid scenario batch")
    return tuple(generate(split, i, base_seed=base_seed) for i in range(count))
