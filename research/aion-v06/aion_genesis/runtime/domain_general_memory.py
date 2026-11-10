"""Genesis v1.2.4: preserve global learning and restrict local transfer by scope.

The proven v1.2.3 retrieval fix is reused without altering its frozen policy.
The v1 additive general model learns across all scopes of a single tenant and
domain; contextual receipts are isolated by scope and only compared when an
adapter explicitly declares relevant PUBLIC features. Stored state is versioned.
"""

from dataclasses import dataclass, field

from .contextual_memory import MAX_RECORDS
from .learning import EffectModel
from .relevant_memory import RelevantEffectModel, _schema

KIND = "domain_general_relevant_residual_v124"
MAX_SCOPES = 32


def _scope(scope_id):
    if not isinstance(scope_id, str) or not 1 <= len(scope_id) <= 100:
        raise ValueError("Invalid contextual memory scope")
    return scope_id


@dataclass(frozen=True)
class DomainGeneralRelevantEffectModel:
    general: EffectModel = field(default_factory=EffectModel)
    scopes: dict = field(default_factory=dict)
    schema: dict | None = None
    last_learned_at: int = 0

    def _local(self, scope_id):
        scope_id = _scope(scope_id)
        return RelevantEffectModel(
            general=self.general,
            records=self.scopes.get(scope_id, ()),
            schema=self.schema)

    def evidence(self, keys, objective, context, as_of, scope_id):
        if type(as_of) is not int or not 0 <= as_of <= 10**12:
            raise ValueError("Invalid proposal timestamp")
        if as_of < self.last_learned_at:
            raise ValueError("Backdated proposal cannot use future domain memory")
        report = self._local(scope_id).evidence(keys, objective, context, as_of)
        report["memory_scope"] = scope_id
        report["general_scope"] = "tenant_and_domain"
        return report

    def correction(self, keys, objective, context, as_of, scope_id):
        return self.evidence(keys, objective, context, as_of, scope_id)["correction"]

    def updated(self, keys, residuals, context, learned_at, receipt_ref, scope_id):
        scope_id = _scope(scope_id)
        if type(learned_at) is not int or not 0 <= learned_at <= 10**12:
            raise ValueError("Invalid verified outcome timestamp")
        if learned_at < self.last_learned_at:
            raise ValueError("Nonmonotonic outcome chronology")
        if not residuals:
            return self
        updated_local = self._local(scope_id).updated(
            keys, residuals, context, learned_at, receipt_ref)
        # Reinsert an active scope at the end so eviction is deterministic.
        scopes = {name: records for name, records in self.scopes.items()
                  if name != scope_id}
        scopes[scope_id] = updated_local.records
        while len(scopes) > MAX_SCOPES:
            del scopes[next(iter(scopes))]
        return DomainGeneralRelevantEffectModel(
            general=updated_local.general, scopes=scopes, schema=self.schema,
            last_learned_at=learned_at)

    def to_json(self):
        return {"kind": KIND, "general": self.general.to_json(),
                "last_learned_at": self.last_learned_at,
                "scopes": {name: list(rows)
                           for name, rows in sorted(self.scopes.items())}}

    @classmethod
    def from_json(cls, payload, schema=None):
        features = _schema(schema)
        if payload is None:
            return cls(schema=features)
        if not isinstance(payload, dict) or set(payload) != {
                "kind", "general", "scopes", "last_learned_at"} or payload["kind"] != KIND:
            raise ValueError("Unsupported v1.2.4 domain memory format")
        timestamp = payload["last_learned_at"]
        if type(timestamp) is not int or not 0 <= timestamp <= 10**12:
            raise ValueError("Invalid persisted learning timestamp")
        scopes = payload["scopes"]
        if not isinstance(scopes, dict) or len(scopes) > MAX_SCOPES:
            raise ValueError("Invalid persisted scope count")
        general = EffectModel.from_json(payload["general"])
        cleaned = {}
        for name, records in sorted(scopes.items()):
            _scope(name)
            if not isinstance(records, list) or len(records) > MAX_RECORDS:
                raise ValueError("Invalid persisted scope receipt history")
            local = RelevantEffectModel.from_json(
                {"kind": "relevant_context_residual_v123",
                 "general": general.to_json(), "records": records}, features)
            if any(row["learned_at"] > timestamp for row in local.records):
                raise ValueError("Scope history is later than general memory")
            cleaned[name] = local.records
        return cls(general=general, scopes=cleaned,
                   schema=features, last_learned_at=timestamp)
