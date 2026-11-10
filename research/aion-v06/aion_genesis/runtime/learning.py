"""Provisional effect estimates learned from supplied, verified outcomes.

This is deliberately small: an additive correction per declared decision
component (``axis=choice``) and objective, fitted to prediction residuals.
It stores hypotheses about effect sizes, never business facts, and it is not
model-weight training. A correction only ever comes from an outcome the host
(or the synthetic referee) supplied for an action that was actually taken.
"""

from dataclasses import dataclass, field

MODEL_KIND = "additive_residual_v1"
PRIOR_STRENGTH = 1.0  # pseudo-observations that shrink a young estimate to zero
_BOUND = 10**6


def effect_keys(decisions) -> tuple[str, ...]:
    return tuple(f"{axis}={choice}" for axis, choice in decisions)


@dataclass(frozen=True)
class EffectModel:
    # {"axis=choice": {"objective": [observations, estimate]}}
    entries: dict = field(default_factory=dict)

    def _entry(self, key: str, objective: str) -> tuple[int, float]:
        count, estimate = self.entries.get(key, {}).get(objective, (0, 0.0))
        return count, estimate

    def correction(self, keys: tuple[str, ...], objective: str) -> float:
        """Shrunken adjustment added to a domain pack's raw estimate."""
        total = 0.0
        for key in keys:
            count, estimate = self._entry(key, objective)
            total += estimate * count / (count + PRIOR_STRENGTH)
        return total

    def updated(self, keys: tuple[str, ...], residuals: dict[str, float]) -> "EffectModel":
        """Return a new model; ``residuals`` are observed minus RAW pack estimates."""
        if not keys:
            return self
        entries = {key: dict(values) for key, values in self.entries.items()}
        for objective, residual in residuals.items():
            fitted = sum(self._entry(key, objective)[1] for key in keys)
            innovation = residual - fitted
            for key in keys:
                count, estimate = self._entry(key, objective)
                count += 1
                estimate += innovation / (len(keys) * count)
                estimate = max(-_BOUND, min(_BOUND, estimate))
                entries.setdefault(key, {})[objective] = [count, round(estimate, 9)]
        return EffectModel(entries)

    def to_json(self) -> dict:
        return {"kind": MODEL_KIND, "prior_strength": PRIOR_STRENGTH,
                "entries": {key: {objective: list(value)
                                  for objective, value in sorted(values.items())}
                            for key, values in sorted(self.entries.items())}}

    @classmethod
    def from_json(cls, payload: dict | None) -> "EffectModel":
        if payload is None:
            return cls()
        if payload.get("kind") != MODEL_KIND:
            raise ValueError("Unsupported effect model")
        return cls({key: {objective: (int(v[0]), float(v[1]))
                          for objective, v in values.items()}
                    for key, values in payload["entries"].items()})
