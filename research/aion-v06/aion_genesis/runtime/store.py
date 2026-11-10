"""Durable tenant/domain-scoped history for the v1.0 runtime.

The store shares one SQLite database with the v0.8 ``SituationStore`` instead
of introducing a second evidence database. v0.8 tables are left untouched;
``import_legacy`` copies their rows forward without rewriting them. Every read
takes an explicit tenant and never joins across tenants.
"""

import json

from ..situation_engine import Observation, SituationStore
from .contracts import (
    DecisionProposalV1, GoalProfileV1, IDENTIFIER, ObservationV1, OutcomeRecordV1,
    canonical,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS runtime_events_v1 (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, domain_id TEXT NOT NULL, event_id TEXT NOT NULL,
    scope_id TEXT NOT NULL, subject_id TEXT NOT NULL, metric TEXT NOT NULL,
    source_revision INTEGER NOT NULL, state TEXT NOT NULL,
    superseded_by TEXT, body TEXT NOT NULL,
    UNIQUE (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS runtime_events_v1_fact ON runtime_events_v1
    (tenant_id, domain_id, scope_id, subject_id, metric, state);
CREATE TABLE IF NOT EXISTS runtime_goal_profiles_v1 (
    tenant_id TEXT NOT NULL, domain_id TEXT NOT NULL, version INTEGER NOT NULL,
    body TEXT NOT NULL, PRIMARY KEY (tenant_id, domain_id, version)
);
CREATE TABLE IF NOT EXISTS runtime_proposals_v1 (
    tenant_id TEXT NOT NULL, proposal_id TEXT NOT NULL, request_id TEXT NOT NULL,
    request_body TEXT NOT NULL, body TEXT NOT NULL,
    PRIMARY KEY (tenant_id, proposal_id), UNIQUE (tenant_id, request_id)
);
CREATE TABLE IF NOT EXISTS runtime_outcomes_v1 (
    tenant_id TEXT NOT NULL, outcome_id TEXT NOT NULL, proposal_id TEXT NOT NULL,
    learned INTEGER NOT NULL, body TEXT NOT NULL,
    PRIMARY KEY (tenant_id, outcome_id), UNIQUE (tenant_id, proposal_id)
);
CREATE TABLE IF NOT EXISTS runtime_effect_models_v1 (
    tenant_id TEXT NOT NULL, domain_id TEXT NOT NULL, version INTEGER NOT NULL,
    parent_version INTEGER, state TEXT NOT NULL, provenance TEXT NOT NULL,
    body TEXT NOT NULL, PRIMARY KEY (tenant_id, domain_id, version)
);
CREATE TABLE IF NOT EXISTS runtime_effect_active_v1 (
    tenant_id TEXT NOT NULL, domain_id TEXT NOT NULL, version INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, domain_id)
);
CREATE TABLE IF NOT EXISTS runtime_trace_v1 (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL,
    kind TEXT NOT NULL, body TEXT NOT NULL, result TEXT NOT NULL
);
"""

ACCEPTED = "accepted"
DUPLICATE = "duplicate"
SUPERSEDED_PRIOR = "superseded_prior"
REJECTED_STALE_REVISION = "rejected_stale_revision"


def _tenant(tenant_id: str) -> None:
    if not isinstance(tenant_id, str) or not IDENTIFIER.fullmatch(tenant_id):
        raise ValueError("Invalid tenant")


class RuntimeStore:
    def __init__(self, path: str = ":memory:"):
        self.legacy = SituationStore(path)
        self.db = self.legacy.db
        self.db.executescript(_SCHEMA)

    def close(self) -> None:
        self.legacy.close()

    # ----------------------------------------------------------- observations
    def observe(self, observation: ObservationV1) -> str:
        """Append one fact; resolve duplicates, corrections and late revisions."""
        body = canonical(observation.to_json())
        tenant, domain, scope, subject, metric = observation.fact_key
        with self.db:
            existing = self.db.execute(
                "SELECT body FROM runtime_events_v1 WHERE tenant_id = ? AND event_id = ?",
                (tenant, observation.event_id)).fetchone()
            if existing is not None:
                if existing[0] != body:
                    raise ValueError("Conflicting duplicate observation")
                return DUPLICATE
            current = self.db.execute(
                "SELECT event_id, source_revision FROM runtime_events_v1 WHERE tenant_id = ? "
                "AND domain_id = ? AND scope_id = ? AND subject_id = ? AND metric = ? "
                "AND state = 'current'", (tenant, domain, scope, subject, metric)).fetchone()
            if observation.corrects_event_id is not None and (
                    current is None or current[0] != observation.corrects_event_id):
                raise ValueError("A correction must name the current reading of the same fact")
            state, result = "current", ACCEPTED
            if current is not None:
                if observation.source_revision == current[1]:
                    raise ValueError("Conflicting observation at an existing source revision")
                if observation.source_revision < current[1]:
                    # A late, out-of-order reading stays in history but can
                    # never displace newer evidence.
                    state = result = REJECTED_STALE_REVISION
                else:
                    self.db.execute(
                        "UPDATE runtime_events_v1 SET state = 'superseded', superseded_by = ? "
                        "WHERE tenant_id = ? AND event_id = ?",
                        (observation.event_id, tenant, current[0]))
                    result = SUPERSEDED_PRIOR
            self.db.execute(
                "INSERT INTO runtime_events_v1 (tenant_id, domain_id, event_id, scope_id, "
                "subject_id, metric, source_revision, state, superseded_by, body) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
                (tenant, domain, observation.event_id, scope, subject, metric,
                 observation.source_revision, state, body))
        return result

    def current(self, tenant_id: str, domain_id: str,
                scope_id: str | None = None) -> list[ObservationV1]:
        _tenant(tenant_id)
        query = ("SELECT body FROM runtime_events_v1 WHERE tenant_id = ? AND domain_id = ? "
                 "AND state = 'current'")
        args: list = [tenant_id, domain_id]
        if scope_id is not None:
            query += " AND scope_id = ?"
            args.append(scope_id)
        rows = self.db.execute(query + " ORDER BY scope_id, subject_id, metric", args)
        return [ObservationV1.from_json(json.loads(row[0])) for row in rows.fetchall()]

    def history(self, tenant_id: str, domain_id: str, scope_id: str,
                subject_id: str, metric: str) -> list[dict]:
        """Complete lineage of one fact, including superseded and rejected readings."""
        _tenant(tenant_id)
        rows = self.db.execute(
            "SELECT event_id, source_revision, state, superseded_by, body FROM "
            "runtime_events_v1 WHERE tenant_id = ? AND domain_id = ? AND scope_id = ? "
            "AND subject_id = ? AND metric = ? ORDER BY seq",
            (tenant_id, domain_id, scope_id, subject_id, metric)).fetchall()
        return [{"event_id": r[0], "source_revision": r[1], "state": r[2],
                 "superseded_by": r[3], "observation": json.loads(r[4])} for r in rows]

    def event_state(self, tenant_id: str, event_id: str) -> str | None:
        _tenant(tenant_id)
        row = self.db.execute(
            "SELECT state FROM runtime_events_v1 WHERE tenant_id = ? AND event_id = ?",
            (tenant_id, event_id)).fetchone()
        return row[0] if row else None

    def import_legacy(self, tenant_id: str, domain_id: str) -> int:
        """Copy a tenant's v0.8 observations forward; idempotent, non-destructive."""
        _tenant(tenant_id)
        rows = self.db.execute(
            "SELECT tenant_id, event_id, tick, scope_id, subject_id, department, metric, "
            "value, provenance FROM situation_events WHERE tenant_id = ? "
            "ORDER BY tick, event_id", (tenant_id,)).fetchall()
        imported = 0
        for row in rows:
            upgraded = ObservationV1.from_legacy(Observation(*row), domain_id)
            imported += self.observe(upgraded) in (ACCEPTED, SUPERSEDED_PRIOR)
        return imported

    # ------------------------------------------------------------------ goals
    def put_goal_profile(self, profile: GoalProfileV1) -> bool:
        body = canonical(profile.to_json())
        latest = self.goal_profile(profile.tenant_id, profile.domain_id)
        with self.db:
            if latest is not None and profile.owner_preference_version <= \
                    latest.owner_preference_version:
                stored = self.db.execute(
                    "SELECT body FROM runtime_goal_profiles_v1 WHERE tenant_id = ? AND "
                    "domain_id = ? AND version = ?",
                    (profile.tenant_id, profile.domain_id,
                     profile.owner_preference_version)).fetchone()
                if stored is not None and stored[0] == body:
                    return False
                raise ValueError("Owner preference versions must increase")
            self.db.execute("INSERT INTO runtime_goal_profiles_v1 VALUES (?, ?, ?, ?)",
                            (profile.tenant_id, profile.domain_id,
                             profile.owner_preference_version, body))
        return True

    def goal_profile(self, tenant_id: str, domain_id: str,
                     version: int | None = None) -> GoalProfileV1 | None:
        _tenant(tenant_id)
        if version is None:
            row = self.db.execute(
                "SELECT body FROM runtime_goal_profiles_v1 WHERE tenant_id = ? AND "
                "domain_id = ? ORDER BY version DESC LIMIT 1", (tenant_id, domain_id)).fetchone()
        else:
            row = self.db.execute(
                "SELECT body FROM runtime_goal_profiles_v1 WHERE tenant_id = ? AND "
                "domain_id = ? AND version = ?", (tenant_id, domain_id, version)).fetchone()
        return GoalProfileV1.from_json(json.loads(row[0])) if row else None

    # -------------------------------------------------------------- proposals
    def save_proposal(self, request_body: str, proposal: DecisionProposalV1) -> None:
        with self.db:
            self.db.execute(
                "INSERT INTO runtime_proposals_v1 VALUES (?, ?, ?, ?, ?)",
                (proposal.tenant_id, proposal.proposal_id, proposal.request_id,
                 request_body, canonical(proposal.to_json())))

    def proposal(self, tenant_id: str, proposal_id: str) -> DecisionProposalV1 | None:
        _tenant(tenant_id)
        row = self.db.execute(
            "SELECT body FROM runtime_proposals_v1 WHERE tenant_id = ? AND proposal_id = ?",
            (tenant_id, proposal_id)).fetchone()
        return DecisionProposalV1.from_json(json.loads(row[0])) if row else None

    def proposal_for_request(self, tenant_id: str, request_id: str
                             ) -> tuple[str, DecisionProposalV1] | None:
        _tenant(tenant_id)
        row = self.db.execute(
            "SELECT request_body, body FROM runtime_proposals_v1 WHERE tenant_id = ? AND "
            "request_id = ?", (tenant_id, request_id)).fetchone()
        if row is None:
            return None
        return row[0], DecisionProposalV1.from_json(json.loads(row[1]))

    # --------------------------------------------------------------- outcomes
    def save_outcome(self, outcome: OutcomeRecordV1, learned: bool) -> None:
        with self.db:
            self.db.execute("INSERT INTO runtime_outcomes_v1 VALUES (?, ?, ?, ?, ?)",
                            (outcome.tenant_id, outcome.outcome_id, outcome.proposal_id,
                             int(learned), canonical(outcome.to_json())))

    def outcome(self, tenant_id: str, outcome_id: str) -> OutcomeRecordV1 | None:
        _tenant(tenant_id)
        row = self.db.execute(
            "SELECT body FROM runtime_outcomes_v1 WHERE tenant_id = ? AND outcome_id = ?",
            (tenant_id, outcome_id)).fetchone()
        return OutcomeRecordV1.from_json(json.loads(row[0])) if row else None

    def outcome_for_proposal(self, tenant_id: str, proposal_id: str) -> OutcomeRecordV1 | None:
        _tenant(tenant_id)
        row = self.db.execute(
            "SELECT body FROM runtime_outcomes_v1 WHERE tenant_id = ? AND proposal_id = ?",
            (tenant_id, proposal_id)).fetchone()
        return OutcomeRecordV1.from_json(json.loads(row[0])) if row else None

    # ---------------------------------------------------------- effect models
    def active_effect_model(self, tenant_id: str, domain_id: str) -> dict | None:
        _tenant(tenant_id)
        row = self.db.execute(
            "SELECT m.version, m.state, m.body FROM runtime_effect_active_v1 a JOIN "
            "runtime_effect_models_v1 m ON m.tenant_id = a.tenant_id AND "
            "m.domain_id = a.domain_id AND m.version = a.version "
            "WHERE a.tenant_id = ? AND a.domain_id = ?", (tenant_id, domain_id)).fetchone()
        if row is None:
            return None
        return {"version": row[0], "state": row[1], "body": json.loads(row[2])}

    def effect_model_versions(self, tenant_id: str, domain_id: str) -> list[dict]:
        _tenant(tenant_id)
        rows = self.db.execute(
            "SELECT version, parent_version, state, provenance FROM runtime_effect_models_v1 "
            "WHERE tenant_id = ? AND domain_id = ? ORDER BY version",
            (tenant_id, domain_id)).fetchall()
        return [{"version": r[0], "parent_version": r[1], "state": r[2],
                 "provenance": json.loads(r[3])} for r in rows]

    def append_effect_model(self, tenant_id: str, domain_id: str, body: dict,
                            provenance: dict) -> int:
        """Add a new provisional version derived from the active one."""
        active = self.active_effect_model(tenant_id, domain_id)
        with self.db:
            latest = self.db.execute(
                "SELECT COALESCE(MAX(version), 0) FROM runtime_effect_models_v1 "
                "WHERE tenant_id = ? AND domain_id = ?", (tenant_id, domain_id)).fetchone()[0]
            version = latest + 1
            self.db.execute(
                "INSERT INTO runtime_effect_models_v1 VALUES (?, ?, ?, ?, 'provisional', ?, ?)",
                (tenant_id, domain_id, version, active["version"] if active else None,
                 canonical(provenance), canonical(body)))
            self._activate(tenant_id, domain_id, version)
        return version

    def _activate(self, tenant_id: str, domain_id: str, version: int) -> None:
        self.db.execute(
            "INSERT INTO runtime_effect_active_v1 VALUES (?, ?, ?) ON CONFLICT(tenant_id, "
            "domain_id) DO UPDATE SET version = excluded.version",
            (tenant_id, domain_id, version))

    def mark_effect_model(self, tenant_id: str, domain_id: str, version: int,
                          state: str) -> bool:
        with self.db:
            cursor = self.db.execute(
                "UPDATE runtime_effect_models_v1 SET state = ? WHERE tenant_id = ? AND "
                "domain_id = ? AND version = ?", (state, tenant_id, domain_id, version))
        return cursor.rowcount == 1

    def rollback_effect_model(self, tenant_id: str, domain_id: str, version: int) -> bool:
        """Re-activate an earlier version; later ones are kept but marked rolled back."""
        with self.db:
            target = self.db.execute(
                "SELECT state FROM runtime_effect_models_v1 WHERE tenant_id = ? AND "
                "domain_id = ? AND version = ?", (tenant_id, domain_id, version)).fetchone()
            if target is None or target[0] == "rolled_back":
                return False
            self.db.execute(
                "UPDATE runtime_effect_models_v1 SET state = 'rolled_back' WHERE "
                "tenant_id = ? AND domain_id = ? AND version > ?",
                (tenant_id, domain_id, version))
            self._activate(tenant_id, domain_id, version)
        return True

    # ------------------------------------------------------------------ trace
    def append_trace(self, tenant_id: str, kind: str, body: dict, result: str) -> None:
        with self.db:
            self.db.execute(
                "INSERT INTO runtime_trace_v1 (tenant_id, kind, body, result) "
                "VALUES (?, ?, ?, ?)", (tenant_id, kind, canonical(body), result))

    def trace(self, tenant_id: str) -> list[dict]:
        _tenant(tenant_id)
        rows = self.db.execute(
            "SELECT kind, body, result FROM runtime_trace_v1 WHERE tenant_id = ? ORDER BY seq",
            (tenant_id,)).fetchall()
        return [{"kind": r[0], "body": json.loads(r[1]), "result": r[2]} for r in rows]
