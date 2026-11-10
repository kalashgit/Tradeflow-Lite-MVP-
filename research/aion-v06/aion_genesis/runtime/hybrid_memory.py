"""An experimental, bounded hierarchical memory candidate for Genesis.

A simple verified-outcome model supplies the default correction. A local
contextual estimate may only exert limited influence when *multiple* relevant
receipts support it. No business facts or counterfactual outcomes are invented.

This class is deliberately distinct from both frozen research candidate APIs:
additive_residual_v1 and contextual_residual_v12.
"""

from dataclasses import dataclass, field

from .contextual_memory import (
    ContextualEffectModel, MAX_AGE, MIN_SIMILARITY, _context, _keys, _similarity,
)
from .learning import EffectModel

MODEL_KIND = "hierarchical_contextual_residual_v12"
MIN_MATCHED_RECEIPTS = 2
MAX_CONTEXT_WEIGHT = 0.15


@dataclass(frozen=True)
class HybridEffectModel:
    general: EffectModel = field(default_factory=EffectModel)
    contextual: ContextualEffectModel = field(default_factory=ContextualEffectModel)

    def _support(self, keys, context, as_of):
        action = _keys(keys)
        features = _context(context)
        if type(as_of) is not int or as_of < 0:
            raise ValueError("Invalid decision timestamp")
        return sum(
            1 for row in self.contextual.records
            if tuple(row["keys"]) == action
            and 0 <= as_of - row["learned_at"] <= MAX_AGE
            and _similarity(features, row["context"]) >= MIN_SIMILARITY
        )

    def correction(self, keys, objective, context, as_of):
        """Retain general evidence unless the local evidence has matched twice."""
        base = self.general.correction(keys, objective)
        if self._support(keys, context, as_of) < MIN_MATCHED_RECEIPTS:
            return round(base, 6)
        local = self.contextual.correction(keys, objective, context, as_of)
        return round(base + MAX_CONTEXT_WEIGHT * (local - base), 6)

    def updated(self, keys, residuals, context, learned_at):
        return HybridEffectModel(
            general=self.general.updated(keys, residuals),
            contextual=self.contextual.updated(keys, residuals, context, learned_at),
        )

    def to_json(self):
        return {"kind": MODEL_KIND,
                "general": self.general.to_json(),
                "contextual": self.contextual.to_json()}

    @classmethod
    def from_json(cls, payload):
        if payload is None:
            return cls()
        if not isinstance(payload, dict) or set(payload) != {
                "kind", "general", "contextual"} or payload["kind"] != MODEL_KIND:
            raise ValueError("Unsupported hybrid memory model")
        return cls(
            general=EffectModel.from_json(payload["general"]),
            contextual=ContextualEffectModel.from_json(payload["contextual"]),
        )
