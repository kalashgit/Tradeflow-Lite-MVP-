"""Versioned, decision-relevant outcome memory research candidate.

A domain adapter may declare *public* resource/target feature semantics. The
core uses those declared features to recognise comparable verified experiences,
instead of insisting every unrelated observation be equal. This model does not
infer counterfactuals, hidden truths, or the universally correct action.

The additive v1 general model stays as a fallback. Contextual influence must
come from at least two recent, similar and sign-consistent prediction surprises.
"""

from dataclasses import dataclass, field
from math import isfinite

from .contextual_memory import MAX_RECORDS, MAX_AGE, _bounded_number, _context, _keys
from .learning import EffectModel

KIND = "relevant_context_residual_v123"
MIN_SIMILARITY = 0.52
MIN_SUPPORT = 2
MAX_NEIGHBORS = 4
MAX_LOCAL_DELTA = 1.5
MIN_RESIDUAL = 0.15


def _schema(raw):
    """An explicitly reviewed domain feature contract, not inferred causality."""
    if raw is None:
        return None
    if not isinstance(raw, dict) or set(raw) != {
            "target_axes", "target_metrics", "global_keys"}:
        raise ValueError("Invalid memory relevance schema")
    axes = raw["target_axes"]
    if not isinstance(axes, (list, tuple)) or not axes or len(axes) > 8:
        raise ValueError("Invalid target axes")
    if len(set(axes)) != len(axes) or not all(
            isinstance(v, str) and v for v in axes):
        raise ValueError("Invalid target axes")
    for name in ("target_metrics", "global_keys"):
        values = raw[name]
        if not isinstance(values, dict) or len(values) > 32:
            raise ValueError("Invalid relevance features")
        for key, scale in values.items():
            if not isinstance(key, str) or not 1 <= len(key) <= 220:
                raise ValueError("Invalid relevance feature key")
            if isinstance(scale, bool) or not isinstance(scale, (int, float)) or (
                    not isfinite(scale)) or not 0 < scale <= 10**9:
                raise ValueError("Invalid relevance scale")
    return {
        "target_axes": tuple(axes),
        "target_metrics": dict(sorted(raw["target_metrics"].items())),
        "global_keys": dict(sorted(raw["global_keys"].items())),
    }


def relevant_features(keys, context, schema):
    """Map target subjects to *roles*, not fixed unit IDs.

    E.g. first=unit_b with unit_b wear 80 is comparable to first=unit_a
    with unit_a wear 83. Other units' unrelated changing wear cannot
    veto the match. Crew capacity and scarce kits remain explicit.
    """
    if schema is None:
        return ()
    action, values = dict(part.split("=", 1) for part in _keys(keys)), dict(_context(context))
    result = {}
    for key, scale in schema["global_keys"].items():
        if key in values:
            result["global:" + key] = (values[key], scale)
    count = 0
    for axis in schema["target_axes"]:
        subject = action.get(axis)
        if subject is None or subject == "none":
            continue
        count += 1
        for metric, scale in schema["target_metrics"].items():
            key = f"{subject}:{metric}"
            if key in values:
                result[f"target_{count}:{metric}"] = (values[key], scale)
    return tuple(sorted((key, value, float(scale))
                        for key, (value, scale) in result.items()))


def similarity(left, right):
    a = {key: (value, scale) for key, value, scale in left}
    b = {key: (value, scale) for key, value, scale in right}
    common = a.keys() & b.keys()
    if len(common) < 2:
        return 0.0
    coverage = len(common) / len(a.keys() | b.keys())
    if coverage < 0.75:
        return 0.0
    # Hard reject a qualitative resource change: a scarce kit has appeared,
    # or staffing has moved by more than its declared relevant scale.
    for key in common:
        current, scale = a[key]
        old, _ = b[key]
        if key.startswith("global:") and abs(current - old) >= scale:
            return 0.0
    closeness = sum(
        1.0 - min(1.0, abs(a[key][0] - b[key][0]) / a[key][1])
        for key in common) / len(common)
    return round(closeness * coverage, 6)


@dataclass(frozen=True)
class RelevantEffectModel:
    general: EffectModel = field(default_factory=EffectModel)
    records: tuple[dict, ...] = ()
    schema: dict | None = None

    def evidence(self, keys, objective, context, as_of):
        """Typed evidence accounting returned before any predicted correction."""
        action = _keys(keys)
        current = relevant_features(action, context, self.schema)
        base = round(self.general.correction(action, objective), 6)
        report = {
            "general": base, "local_delta": 0.0, "correction": base,
            "reason": "no_declared_relevance" if self.schema is None else "insufficient_support",
            "matched_receipts": 0, "receipt_refs": [],
            "context_keys": [row[0] for row in current],
        }
        if type(as_of) is not int or as_of < 0:
            raise ValueError("Invalid decision timestamp")
        if len(current) < 2 or not any(
                key.split("=", 1)[1] != "none" for key in action):
            report["reason"] = "missing_action_context"
            return report
        candidates = []
        for row in self.records:
            if objective not in row["innovations"]:
                continue
            age = as_of - row["learned_at"]
            if not 0 <= age <= MAX_AGE:
                continue
            shared = len(set(action) & set(row["keys"]))
            if shared == 0:
                continue
            # Compare the conditions relevant to the action originally taken,
            # not its irrelevant unrelated observations.
            score = similarity(current, relevant_features(
                row["keys"], row["context"], self.schema))
            if score < MIN_SIMILARITY:
                continue
            candidates.append((score * (0.97 ** age) * shared / len(action), row))
        candidates.sort(key=lambda r: (-r[0], r[1]["learned_at"], r[1]["receipt_ref"]))
        nearest = candidates[:MAX_NEIGHBORS]
        report["matched_receipts"] = len(nearest)
        report["receipt_refs"] = [row["receipt_ref"] for _, row in nearest]
        if len(nearest) < MIN_SUPPORT:
            return report
        innovations = [row["innovations"][objective] for _, row in nearest]
        if min(abs(value) for value in innovations) < MIN_RESIDUAL or not (
                all(value > 0 for value in innovations) or
                all(value < 0 for value in innovations)):
            report["reason"] = "conflicting_or_tiny_evidence"
            return report
        total = sum(weight for weight, _ in nearest)
        weighted = sum(weight * row["innovations"][objective]
                       for weight, row in nearest) / total
        # Deliberately small, shrunk, confidence-limited interpolation.
        delta = max(-MAX_LOCAL_DELTA, min(
            MAX_LOCAL_DELTA, weighted * min(0.25, 0.08 * len(nearest))))
        report["local_delta"] = round(delta, 6)
        report["correction"] = round(base + delta, 6)
        report["reason"] = "verified_relevant_recall"
        return report

    def correction(self, keys, objective, context, as_of):
        return self.evidence(keys, objective, context, as_of)["correction"]

    def updated(self, keys, residuals, context, learned_at, receipt_ref=""):
        action = _keys(keys)
        facts = _context(context)
        if type(learned_at) is not int or not 0 <= learned_at <= 10**12:
            raise ValueError("Invalid observation timestamp")
        if not isinstance(receipt_ref, str) or len(receipt_ref) > 220:
            raise ValueError("Invalid receipt ref")
        if not isinstance(residuals, dict) or not residuals:
            return self
        clean = {key: _bounded_number(value, key) for key, value in residuals.items()}
        innovations = {key: round(max(-20, min(
            20, value - self.general.correction(action, key))), 6)
                       for key, value in sorted(clean.items())}
        row = {"keys": list(action), "context": [list(p) for p in facts],
               "innovations": innovations, "learned_at": learned_at,
               "receipt_ref": receipt_ref}
        return RelevantEffectModel(
            general=self.general.updated(action, clean),
            records=(*self.records, row)[-MAX_RECORDS:],
            schema=self.schema,
        )

    def to_json(self):
        return {"kind": KIND, "general": self.general.to_json(),
                "records": list(self.records)}

    @classmethod
    def from_json(cls, payload, schema=None):
        features = _schema(schema)
        if payload is None:
            return cls(schema=features)
        if not isinstance(payload, dict) or set(payload) != {
                "kind", "general", "records"} or payload["kind"] != KIND:
            raise ValueError("Unsupported relevance memory payload")
        rows = payload["records"]
        if not isinstance(rows, list) or len(rows) > MAX_RECORDS:
            raise ValueError("Invalid relevance memory size")
        clean = []
        for row in rows:
            if not isinstance(row, dict) or set(row) != {
                    "keys", "context", "innovations", "learned_at", "receipt_ref"}:
                raise ValueError("Invalid relevance receipt record")
            action = _keys(row["keys"])
            context = _context(row["context"])
            innovations = row["innovations"]
            if not isinstance(innovations, dict) or not innovations:
                raise ValueError("Invalid receipt innovations")
            safe = {key: _bounded_number(v, key) for key, v in innovations.items()}
            if type(row["learned_at"]) is not int or not 0 <= row["learned_at"] <= 10**12:
                raise ValueError("Invalid historical timestamp")
            receipt = row["receipt_ref"]
            if not isinstance(receipt, str) or len(receipt) > 220:
                raise ValueError("Invalid receipt reference")
            clean.append({"keys": list(action), "context": [list(p) for p in context],
                          "innovations": safe, "learned_at": row["learned_at"],
                          "receipt_ref": receipt})
        return cls(general=EffectModel.from_json(payload["general"]),
                   records=tuple(clean), schema=features)
