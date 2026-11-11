"""Genesis Academy: capability taxonomy, scenario proposals and a bounded,
transparent active-learning curriculum.

The curriculum is a simple bandit over causal mechanism families. It prefers
families where the current model is most uncertain, keeps exploring, and is
held to diversity quotas. It can only draw from the training pool: it cannot
see, choose or generate evaluation scenarios.
"""

from dataclasses import asdict, dataclass
from math import log, sqrt

from . import laboratory

CAPABILITIES = {
    "supplier_shock": "plan around late material deliveries",
    "field_blocker": "recover from on-site blockers",
    "scope_approval": "handle scope changes that need owner approval",
    "working_capital": "sequence work under tight cash",
}
MIN_SHARE, MAX_SHARE = 0.10, 0.50


@dataclass(frozen=True)
class ScenarioProposal:
    target_capability: str
    family: str
    pool_index: int
    current_uncertainty: float
    hypothesis: str
    causal_mechanism: list
    allowed_interventions: list
    expected_information_gain: float
    difficulty: int
    novelty: float
    verification_method: str
    estimated_simulation_cost: int

    def to_json(self) -> dict:
        return asdict(self)


def validate_scenario(scenario) -> tuple[bool, str]:
    """Independent validity check before a scenario may enter the academy."""
    case = scenario.case
    if scenario.partition != "train":
        return False, "not_a_training_scenario"
    if not 2 <= len(case.jobs) <= 5 or case.initial_cash < 0:
        return False, "transition_invariant_violated"
    first, second = laboratory.strategy_outcomes(scenario), \
        laboratory.strategy_outcomes(scenario)
    if first != second:
        return False, "non_deterministic_replay"
    if max(row["paid_jobs"] for row in first.values()) == 0:
        return False, "impossible_no_strategy_can_succeed"   # not a model failure
    if first["no_action"]["paid_jobs"] or first["no_action"]["cash_change"]:
        return False, "reward_without_action"
    return True, "valid"


class Curriculum:
    """Uncertainty-seeking family bandit with exploration and diversity quotas."""

    def __init__(self, families=tuple(CAPABILITIES), *, pool_start=1000, pool_size=600,
                 exploration=0.5, adaptive=True):
        self.families, self.adaptive = tuple(families), adaptive
        self.exploration, self.pool_start, self.pool_size = exploration, pool_start, pool_size
        self.cursor = {f: 0 for f in self.families}
        self.counts = {f: 0 for f in self.families}
        self.uncertainty = {f: 1.0 for f in self.families}
        self.lineages: dict[str, int] = {}
        self.rejected: list[dict] = []
        self.proposals: list[dict] = []
        self.round = 0

    def update(self, uncertainty: dict) -> None:
        """Feed back measured, development-only uncertainty per family."""
        for family, value in uncertainty.items():
            if family in self.uncertainty and value is not None:
                self.uncertainty[family] = float(value)

    def _allocation(self, batch: int) -> dict:
        if not self.adaptive:
            share = {f: 1 / len(self.families) for f in self.families}
        else:
            total = sum(self.counts.values()) + 1
            score = {f: self.uncertainty[f] + self.exploration * sqrt(
                log(total + 1) / (self.counts[f] + 1)) for f in self.families}
            norm = sum(score.values()) or 1.0
            share = {f: min(MAX_SHARE, max(MIN_SHARE, score[f] / norm))
                     for f in self.families}
            norm = sum(share.values())
            share = {f: v / norm for f, v in share.items()}
        counts = {f: int(share[f] * batch) for f in self.families}
        for family in sorted(self.families, key=lambda f: -share[f]):
            if sum(counts.values()) >= batch:
                break
            counts[family] += 1
        return counts

    def next_batch(self, batch: int) -> list:
        """Validated, never-repeated training scenarios for the next round."""
        chosen = []
        for family, wanted in self._allocation(batch).items():
            taken = 0
            while taken < wanted and self.cursor[family] < self.pool_size:
                index = self.pool_start + self.cursor[family]
                self.cursor[family] += 1
                scenario = laboratory.scenarios("train", 1, start=index,
                                                families=(family,))[0]
                ok, reason = validate_scenario(scenario)
                if not ok:
                    self.rejected.append({"scenario_id": scenario.scenario_id,
                                          "family": family, "reason": reason})
                    continue
                lineage = scenario.template_lineage
                seen = self.lineages.get(lineage, 0)
                self.lineages[lineage] = seen + 1
                self.proposals.append(ScenarioProposal(
                    target_capability=CAPABILITIES[family], family=family,
                    pool_index=index,
                    current_uncertainty=round(self.uncertainty[family], 5),
                    hypothesis="the current world model mispredicts outcomes in "
                               + family + " scenarios",
                    causal_mechanism=scenario.mechanisms,
                    allowed_interventions=["fixed_strategy_rollouts", "random_order_actions"],
                    expected_information_gain=round(
                        self.uncertainty[family] / (1 + seen), 5),
                    difficulty=scenario.case.difficulty, novelty=round(1 / (1 + seen), 4),
                    verification_method="simulator_receipts_and_end_of_episode_truth",
                    estimated_simulation_cost=scenario.case.horizon * 3).to_json())
                chosen.append(scenario)
                taken += 1
            self.counts[family] += taken
        self.round += 1
        return chosen

    def coverage(self) -> dict:
        total = sum(self.counts.values()) or 1
        return {"scenarios": sum(self.counts.values()),
                "family_share": {f: round(c / total, 4) for f, c in self.counts.items()},
                "distinct_template_lineages": len(self.lineages),
                "rejected_invalid": len(self.rejected)}
