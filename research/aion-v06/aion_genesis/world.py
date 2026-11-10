"""Small hidden-rule causal environments; only observations reach learners."""

from dataclasses import dataclass
from itertools import combinations, product
import random


DIMENSIONS = 4
PAIRS = tuple(combinations(range(DIMENSIONS), 2))
ALL_ACTIONS = tuple(product((0, 1), repeat=DIMENSIONS))


@dataclass(frozen=True)
class Observation:
    action: tuple[int, ...]
    outcome: float


class HiddenWorld:
    """Ground truth is deliberately private to the world/evaluator layer.

    This is a separation of concerns, not a process-level security boundary.
    """

    def __init__(self, seed: int, family: str = "pairwise"):
        if family not in ("pairwise", "cubic_shift"):
            raise ValueError("Unknown world family")
        self._family = family
        rng = random.Random(seed)
        self._bias = rng.randint(-3, 3)
        self._linear = tuple(rng.choice((-3, -2, -1, 1, 2, 3)) for _ in range(DIMENSIONS))
        self._interactions = tuple(
            rng.choice((-4, -3, -2, -1, 1, 2, 3, 4)) if rng.random() < 0.65 else 0
            for _ in PAIRS
        )
        if not any(self._interactions):
            self._interactions = (3,) + self._interactions[1:]

    def observe(self, action: tuple[int, ...]) -> Observation:
        if len(action) != DIMENSIONS or any(v not in (0, 1) for v in action):
            raise ValueError("Expected four binary intervention settings")
        outcome = self._bias + sum(w * x for w, x in zip(self._linear, action))
        outcome += sum(w * action[i] * action[j] for w, (i, j) in zip(self._interactions, PAIRS))
        # A distribution-shift challenge with a causal term that neither
        # candidate hypothesis family can represent exactly.
        if self._family == "cubic_shift":
            outcome += 7 * action[0] * action[1] * action[2]
        return Observation(action=action, outcome=float(outcome))
