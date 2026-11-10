"""Versioned fitness tests with development/holdout separation."""

from dataclasses import dataclass
from statistics import mean

from .learner import Genome, estimate, predict, select_interventions
from .world import ALL_ACTIONS, HiddenWorld


@dataclass(frozen=True)
class Trial:
    world_seed: int
    prediction_mae: float
    discoveries: int
    training_count: int
    unseen_count: int


def run_trial(genome: Genome, world_seed: int, budget: int = 12,
              world_family: str = "pairwise") -> Trial:
    world = HiddenWorld(world_seed, family=world_family)
    selected = select_interventions(genome, budget=budget, seed=world_seed + 15_703)
    observations = [world.observe(action) for action in selected]
    hypothesis = estimate(observations, genome)
    unseen = [action for action in ALL_ACTIONS if action not in selected]
    errors = [abs(predict(hypothesis, action, genome) - world.observe(action).outcome)
              for action in unseen]
    return Trial(
        world_seed=world_seed,
        prediction_mae=mean(errors),
        discoveries=sum(err < 0.25 for err in errors),
        training_count=len(observations),
        unseen_count=len(unseen),
    )


def score(genome: Genome, seeds: tuple[int, ...], budget: int = 12,
          world_family: str = "pairwise") -> float:
    return mean(run_trial(genome, seed, budget, world_family).prediction_mae
                for seed in seeds)
