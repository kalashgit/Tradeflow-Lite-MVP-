"""Explicit, inspectable causal hypotheses and experimental-design strategies."""

from dataclasses import dataclass
import math
import random

from .world import ALL_ACTIONS, DIMENSIONS, PAIRS, Observation


REGULARIZATIONS = (1e-6, 0.01, 0.1)


@dataclass(frozen=True)
class Genome:
    """An evolvable *algorithm configuration*, not neural-network weights."""

    basis: str = "linear"
    exploration: str = "random"
    regularization: float = 0.01

    def __post_init__(self):
        if self.basis not in ("linear", "pairwise"):
            raise ValueError("Unknown hypothesis family")
        if self.exploration not in ("random", "information"):
            raise ValueError("Unknown experimental design")
        if self.regularization not in REGULARIZATIONS:
            raise ValueError("Unknown regularization")

    def as_dict(self):
        return {
            "basis": self.basis,
            "exploration": self.exploration,
            "regularization": self.regularization,
        }


def features(action: tuple[int, ...], basis: str) -> list[float]:
    result = [1.0] + [float(v) for v in action]
    if basis == "pairwise":
        result.extend(float(action[i] * action[j]) for i, j in PAIRS)
    return result


def solve(matrix: list[list[float]], vector: list[float]) -> list[float]:
    """Gaussian elimination with pivoting, sufficient for this tiny testbed."""
    n = len(vector)
    a = [row[:] + [vector[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        a[col], a[pivot] = a[pivot], a[col]
        value = a[col][col]
        if abs(value) < 1e-12:
            raise ArithmeticError("Singular design matrix")
        for c in range(col, n + 1):
            a[col][c] /= value
        for r in range(n):
            if r == col:
                continue
            factor = a[r][col]
            for c in range(col, n + 1):
                a[r][c] -= factor * a[col][c]
    return [a[i][-1] for i in range(n)]


def estimate(observations: list[Observation], genome: Genome) -> list[float]:
    dimension = len(features(ALL_ACTIONS[0], genome.basis))
    normal = [[0.0] * dimension for _ in range(dimension)]
    rhs = [0.0] * dimension
    for item in observations:
        phi = features(item.action, genome.basis)
        for i in range(dimension):
            rhs[i] += phi[i] * item.outcome
            for j in range(dimension):
                normal[i][j] += phi[i] * phi[j]
    for i in range(dimension):
        normal[i][i] += genome.regularization
    return solve(normal, rhs)


def predict(weights: list[float], action: tuple[int, ...], genome: Genome) -> float:
    return sum(a * b for a, b in zip(weights, features(action, genome.basis)))


def select_interventions(genome: Genome, budget: int, seed: int) -> list[tuple[int, ...]]:
    if not 1 <= budget < len(ALL_ACTIONS):
        raise ValueError("Budget must leave at least one unseen intervention")
    rng = random.Random(seed)
    if genome.exploration == "random":
        return rng.sample(list(ALL_ACTIONS), budget)

    # Greedy Bayesian D-optimal-style design: choose the next intervention that
    # most reduces uncertainty in the *specified hypothesis family*.
    # Does not use outcomes or the hidden rules.
    dimension = len(features(ALL_ACTIONS[0], genome.basis))
    inverse = [[(1.0 / 0.25 if i == j else 0.0) for j in range(dimension)]
               for i in range(dimension)]
    remaining = list(ALL_ACTIONS)
    rng.shuffle(remaining)
    chosen = []
    for _ in range(budget):
        winner = None
        winner_score = -math.inf
        winner_projection = None
        for action in remaining:
            phi = features(action, genome.basis)
            projection = [sum(inverse[i][j] * phi[j] for j in range(dimension))
                          for i in range(dimension)]
            score = sum(phi[i] * projection[i] for i in range(dimension))
            if score > winner_score + 1e-10:
                winner, winner_score, winner_projection = action, score, projection
        assert winner is not None and winner_projection is not None
        denom = 1.0 + winner_score
        for i in range(dimension):
            for j in range(dimension):
                inverse[i][j] -= winner_projection[i] * winner_projection[j] / denom
        chosen.append(winner)
        remaining.remove(winner)
    return chosen


def mutate(genome: Genome, rng: random.Random) -> Genome:
    field = rng.choice(("basis", "exploration", "regularization"))
    options = {
        "basis": ("linear", "pairwise"),
        "exploration": ("random", "information"),
        "regularization": REGULARIZATIONS,
    }[field]
    changes = [v for v in options if v != getattr(genome, field)]
    values = genome.as_dict()
    values[field] = rng.choice(changes)
    return Genome(**values)
