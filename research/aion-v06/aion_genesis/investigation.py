"""Observe, hypothesize, test, and revise without inspecting hidden rules."""

from .learner import Genome, estimate, predict, select_interventions
from .world import ALL_ACTIONS, HiddenWorld


def investigate(world_seed: int = 7, genome: Genome | None = None,
                budget: int = 12) -> dict:
    genome = genome or Genome(basis="pairwise", exploration="information", regularization=1e-6)
    world = HiddenWorld(world_seed)
    actions = select_interventions(genome, budget, world_seed + 15_703)
    held_out = [action for action in ALL_ACTIONS if action not in actions]
    # Held-out actions never enter the learner's data, at any step.
    trace = []
    for count in sorted(set((min(4, budget), min(8, budget), budget))):
        observations = [world.observe(action) for action in actions[:count]]
        weights = estimate(observations, genome)
        errors = [abs(predict(weights, action, genome) - world.observe(action).outcome)
                  for action in held_out]
        trace.append({
            "observations_seen": count,
            "heldout_mae": round(sum(errors) / len(errors), 6),
            "hypothesis_coefficients": [round(v, 4) for v in weights],
        })
    return {
        "world_seed": world_seed,
        "genome": genome.as_dict(),
        "hypothesis_updates": trace,
        "evaluation": "same never-observed interventions after each update",
        "claim": "A fitted hypothesis changes after additional causal observations",
    }
