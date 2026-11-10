"""Evolution with frozen evaluators and a never-optimized holdout split."""

from dataclasses import dataclass
import random

from .experiment import score
from .learner import Genome, mutate


@dataclass(frozen=True)
class EvolutionResult:
    baseline: Genome
    champion: Genome
    baseline_dev_mae: float
    champion_dev_mae: float
    baseline_holdout_mae: float
    champion_holdout_mae: float
    baseline_ood_mae: float
    champion_ood_mae: float
    history: list[dict]
    training_worlds: int
    holdout_worlds: int
    budget: int

    def as_dict(self):
        return {
            "baseline": self.baseline.as_dict(),
            "champion": self.champion.as_dict(),
            "baseline_dev_mae": round(self.baseline_dev_mae, 6),
            "champion_dev_mae": round(self.champion_dev_mae, 6),
            "baseline_holdout_mae": round(self.baseline_holdout_mae, 6),
            "champion_holdout_mae": round(self.champion_holdout_mae, 6),
            "baseline_ood_mae": round(self.baseline_ood_mae, 6),
            "champion_ood_mae": round(self.champion_ood_mae, 6),
            "holdout_improvement_percent": round(
                100 * (self.baseline_holdout_mae - self.champion_holdout_mae)
                / max(self.baseline_holdout_mae, 1e-12), 2
            ),
            "history": self.history,
            "protocol": {
                "training_worlds": self.training_worlds,
                "holdout_worlds": self.holdout_worlds,
                "interventions_per_world": self.budget,
                "unseen_test_interventions_per_world": 16 - self.budget,
                "selection_metric": "mean absolute error on unseen interventions",
                "holdout_used_for_selection": False,
                "ood_world_family": "cubic_shift (unmodeled 3-way interactions)",
                "ood_used_for_selection": False,
            },
            "claim": "Evolves algorithm configurations, not LLM parameters",
        }


def evolve(seed: int = 42, generations: int = 5, population_size: int = 8,
           training_worlds: int = 24, holdout_worlds: int = 24,
           budget: int = 12) -> EvolutionResult:
    if generations < 1 or population_size < 2:
        raise ValueError("Need at least one generation and two individuals")
    if training_worlds < 1 or holdout_worlds < 1:
        raise ValueError("Both data splits must be nonempty")
    rng = random.Random(seed)
    # Independent, deterministic seed spaces. Holdout scores are only computed
    # *after* selection, never consulted by the evolutionary search.
    dev_seeds = tuple(1_000_000 + seed * 100_000 + i for i in range(training_worlds))
    test_seeds = tuple(9_000_000 + seed * 100_000 + i for i in range(holdout_worlds))
    ood_seeds = tuple(17_000_000 + seed * 100_000 + i for i in range(holdout_worlds))
    baseline = Genome()
    candidate_scores: dict[Genome, float] = {}

    def dev_fitness(genome: Genome) -> float:
        if genome not in candidate_scores:
            candidate_scores[genome] = score(genome, dev_seeds, budget)
        return candidate_scores[genome]

    pool = {baseline}
    while len(pool) < min(population_size, 12):
        pool.add(mutate(rng.choice(tuple(sorted(pool, key=str))), rng))

    history = []
    for generation in range(generations):
        ranked = sorted(pool, key=lambda individual: (dev_fitness(individual), str(individual)))
        best = ranked[0]
        history.append({
            "generation": generation,
            "best_dev_mae": round(dev_fitness(best), 6),
            "best_genome": best.as_dict(),
            "evaluated_genomes_total": len(candidate_scores),
        })
        if generation == generations - 1:
            break
        elites = ranked[:max(2, len(ranked) // 3)]
        pool = set(elites)
        attempts = 0
        while len(pool) < min(population_size, 12) and attempts < 200:
            pool.add(mutate(rng.choice(elites), rng))
            attempts += 1
        # Avoid getting stuck when the elite neighborhood has too few variants.
        if len(pool) < min(population_size, 12):
            pool.update(ranked[:population_size])

    champion = min(candidate_scores, key=lambda individual:
                   (candidate_scores[individual], str(individual)))
    return EvolutionResult(
        baseline=baseline,
        champion=champion,
        baseline_dev_mae=dev_fitness(baseline),
        champion_dev_mae=dev_fitness(champion),
        baseline_holdout_mae=score(baseline, test_seeds, budget),
        champion_holdout_mae=score(champion, test_seeds, budget),
        baseline_ood_mae=score(baseline, ood_seeds, budget, "cubic_shift"),
        champion_ood_mae=score(champion, ood_seeds, budget, "cubic_shift"),
        history=history,
        training_worlds=training_worlds,
        holdout_worlds=holdout_worlds,
        budget=budget,
    )
