"""Opt-in, domain-neutral contextual outcome memory for Genesis research.

This candidate only learns *residual predictions* after verified outcomes.
It does not turn observations into facts, infer counterfactual actions, or
train model weights. The v1 additive memory and laboratory grader stay frozen.
"""

from dataclasses import dataclass
from math import isfinite

KIND = "contextual_residual_v12"
MAX_RECORDS = 128
MAX_CONTEXT = 64
MAX_AGE = 32
MIN_SIMILARITY = 0.82
PRIOR_WEIGHT = 2.0
MAX_RESIDUAL = 20.0


def _bounded_number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError(f"Invalid {name}")
    if abs(value) > 10**9:
        raise ValueError(f"Out-of-range {name}")
    return round(float(value), 6)


def _context(items):
    if not isinstance(items, (tuple, list)) or len(items) > MAX_CONTEXT:
        raise ValueError("Invalid contextual features")
    pairs = []
    for item in items:
        if not isinstance(item, (tuple, list)) or len(item) != 2:
            raise ValueError("Invalid contextual feature")
        key, value = item
        if not isinstance(key, str) or not 1 <= len(key) <= 220:
            raise ValueError("Invalid contextual feature name")
        pairs.append((key, _bounded_number(value, key)))
    if len(set(k for k, _ in pairs)) != len(pairs):
        raise ValueError("Duplicate contextual feature")
    return tuple(sorted(pairs))


def _keys(items):
    if not isinstance(items, (tuple, list)) or not items or len(items) > 20:
        raise ValueError("Invalid decision keys")
    if not all(isinstance(key, str) and 1 <= len(key) <= 200 for key in items):
        raise ValueError("Invalid decision key")
    if len(set(items)) != len(items):
        raise ValueError("Duplicate decision key")
    return tuple(sorted(items))


def public_context(observations):
    """Snapshot a bounded set of CURRENT, usable, public numeric facts."""
    values = {}
    for item in observations:
        if item.value is None:
            continue
        key = f"{item.subject_id}:{item.metric}"
        values[key] = _bounded_number(item.value, key)
    return _context(sorted(values.items())[:MAX_CONTEXT])


def _similarity(left, right):
    """Conservative proximity: one sharply changed relevant feature blocks reuse."""
    a, b = dict(left), dict(right)
    shared = a.keys() & b.keys()
    if not shared:
        return 0.0
    coverage = len(shared) / len(a.keys() | b.keys())
    local = min(1.0 - abs(a[key] - b[key]) / max(1.0, abs(a[key]), abs(b[key]))
                for key in shared)
    return max(0.0, coverage * local)


@dataclass(frozen=True)
class ContextualEffectModel:
    """Immutable bounded receipt-backed residual history; no hidden-world access."""

    records: tuple[dict, ...] = ()

    def correction(self, keys, objective, context, as_of):
        action = _keys(keys)
        features = _context(context)
        if type(as_of) is not int or as_of < 0:
            raise ValueError("Invalid decision timestamp")
        weighted_residual = weight_sum = 0.0
        for row in self.records:
            if tuple(row["keys"]) != action or objective not in row["residuals"]:
                continue
            age = as_of - row["learned_at"]
            if not 0 <= age <= MAX_AGE:
                continue  # future outcomes or stale evidence cannot affect this decision
            similarity = _similarity(features, row["context"])
            if similarity < MIN_SIMILARITY:
                continue
            weight = similarity * (0.95 ** age)
            weight_sum += weight
            weighted_residual += weight * row["residuals"][objective]
        if not weight_sum:
            return 0.0
        return round(max(-MAX_RESIDUAL, min(MAX_RESIDUAL,
                        weighted_residual / (PRIOR_WEIGHT + weight_sum))), 6)

    def updated(self, keys, residuals, context, learned_at):
        action = _keys(keys)
        features = _context(context)
        if type(learned_at) is not int or not 0 <= learned_at <= 10**12:
            raise ValueError("Invalid observation timestamp")
        if not isinstance(residuals, dict) or not residuals:
            return self
        clean = {}
        for name, value in sorted(residuals.items()):
            if not isinstance(name, str) or not name:
                raise ValueError("Invalid objective")
            clean[name] = max(-MAX_RESIDUAL, min(MAX_RESIDUAL,
                                               _bounded_number(value, name)))
        row = {"keys": list(action), "context": [list(p) for p in features],
               "residuals": clean, "learned_at": learned_at}
        return ContextualEffectModel((*self.records, row)[-MAX_RECORDS:])

    def to_json(self):
        return {"kind": KIND, "records": list(self.records)}

    @classmethod
    def from_json(cls, payload):
        if payload is None:
            return cls()
        if not isinstance(payload, dict) or set(payload) != {"kind", "records"} or payload["kind"] != KIND:
            raise ValueError("Unsupported contextual model")
        rows = payload["records"]
        if not isinstance(rows, list) or len(rows) > MAX_RECORDS:
            raise ValueError("Invalid contextual model size")
        clean = cls()
        for row in rows:
            if not isinstance(row, dict) or set(row) != {"keys", "context", "residuals", "learned_at"}:
                raise ValueError("Malformed contextual model record")
            clean = clean.updated(row["keys"], row["residuals"], row["context"], row["learned_at"])
        return clean
