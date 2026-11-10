"""V0.3: save a validated *experiment policy* and test cross-family transfer.

Both policies can represent the hidden rule; the experiment asks which one
discovers it using fewer interventions. This is bounded meta-learning over two
human-specified candidate experiment policies, not autonomous algorithm design.
"""

from dataclasses import dataclass
from itertools import combinations
import hashlib
import json
from pathlib import Path
import random
import sqlite3
from statistics import mean, median

from .recovery import fit, predict
from .world import ALL_ACTIONS, HiddenWorld, Observation


CONJUNCTIONS = tuple(combinations(range(4), 3)) + ((0, 1, 2, 3),)
POLICIES = ("full_factorial", "toggle_contrast")
ANCHOR = (1, 1, 1, 1)
TOGGLES = tuple(tuple(0 if j == i else 1 for j in range(4)) for i in range(4))


class NovelRuleWorld:
    """An evaluator-owned shift. Learners receive only Observation objects."""

    def __init__(self, seed: int, order: int = 3, noise: float = 0.05,
                 mechanism: str = "conjunction"):
        if order not in (3, 4):
            raise ValueError("Only 3-way and 4-way research tasks are defined")
        if mechanism not in ("conjunction", "xor"):
            raise ValueError("Unsupported causal mechanism")
        self._base = HiddenWorld(seed)
        self._mechanism = mechanism
        subsets = tuple(s for s in CONJUNCTIONS if len(s) == order)
        self._hidden_conjunction = subsets[seed % len(subsets)]
        self._rng = random.Random(seed + 7119)
        self._noise = noise

    def true_value(self, action: tuple[int, ...], shifted: bool = True) -> float:
        y = self._base.observe(action).outcome
        if shifted:
            if self._mechanism == "conjunction":
                active = all(action[i] == 1 for i in self._hidden_conjunction)
            else:
                active = sum(action[i] for i in self._hidden_conjunction) % 2 == 1
            y += 7.0 * int(active)
        return y

    def sample(self, action: tuple[int, ...], shifted: bool = True) -> Observation:
        return Observation(action, self.true_value(action, shifted) +
                           self._rng.gauss(0, self._noise))

    def verify(self, recovered: tuple[int, ...] | None) -> bool:
        return self._mechanism == "conjunction" and recovered == self._hidden_conjunction

    def external_mae(self, base_weights: list[float],
                     recovered: tuple[int, ...] | None, amplitude: float) -> float:
        return mean(abs(predict(base_weights, a, None) +
                        (amplitude if recovered is not None and
                         all(a[i] for i in recovered) else 0.0) -
                        self.true_value(a)) for a in ALL_ACTIONS)


def calibrate(world: NovelRuleWorld) -> list[float]:
    calibration = [world.sample(a, shifted=False) for a in ALL_ACTIONS]
    return fit(calibration, None)


def residuals(world: NovelRuleWorld, base: list[float], actions: list[tuple[int, ...]]) -> list[Observation]:
    return [Observation(a, world.sample(a).outcome - predict(base, a, None)) for a in actions]


def estimate_amplitude(data: list[Observation], term: tuple[int, ...]) -> float:
    active = [o.outcome for o in data if all(o.action[i] == 1 for i in term)]
    return mean(active) if active else 0.0


def score_delta(data: list[Observation], term: tuple[int, ...], amplitude: float) -> float:
    return mean(abs(o.outcome - amplitude * int(all(o.action[i] for i in term))) for o in data)


@dataclass(frozen=True)
class TransferTrial:
    seed: int
    order: int
    policy: str
    observed_interventions: int
    recovered: tuple[int, ...] | None
    correct_rule: bool
    final_mae: float
    validation_mae: float
    promoted: bool

    def as_dict(self):
        return {
            "seed": self.seed, "order": self.order, "policy": self.policy,
            "observed_interventions": self.observed_interventions,
            "recovered": list(self.recovered) if self.recovered is not None else None,
            "correct_rule": self.correct_rule,
            "final_mae": round(self.final_mae, 6),
            "validation_mae": round(self.validation_mae, 6),
            "promoted": self.promoted,
        }


def probe(world: NovelRuleWorld, policy: str, seed: int, order: int) -> TransferTrial:
    if policy not in POLICIES:
        raise ValueError("Unknown experiment policy")
    base = calibrate(world)
    if policy == "full_factorial":
        actions = list(ALL_ACTIONS)
        random.Random(seed + 119).shuffle(actions)
        train_actions, val_actions = actions, actions
    else:
        # Contrast experiment: first observe all variables active, then turn
        # off one variable at a time. Source experience must validate this
        # policy *before* it is eligible for transfer.
        train_actions = [ANCHOR, *TOGGLES]
        # Counterexamples: singletons are held out from hypothesis generation.
        # They help reject a tempting conjunction explanation for XOR worlds.
        singletons = [tuple(int(i == j) for j in range(4)) for i in range(4)]
        val_actions = [*reversed(TOGGLES), ANCHOR, *singletons]

    train = residuals(world, base, train_actions)
    validation = residuals(world, base, val_actions)
    candidates = []

    if policy == "toggle_contrast":
        measured = {o.action: o.outcome for o in train}
        anchor = measured[ANCHOR]
        # Infer a set of causally necessary variables from the observed
        # contrast; it does not look up the evaluator's hidden conjunction.
        term = tuple(i for i, action in enumerate(TOGGLES)
                     if anchor - measured[action] > 3.0)
        if term in CONJUNCTIONS:
            candidates.append(term)
    else:
        candidates.extend(CONJUNCTIONS)

    ranked = []
    for term in candidates:
        amplitude = estimate_amplitude(train, term)
        heldout_mae = score_delta(validation, term, amplitude)
        ranked.append((heldout_mae, term, amplitude))
    ranked.sort()
    baseline_validation = mean(abs(o.outcome) for o in validation)
    selected = ranked[0] if ranked else None
    promoted = bool(selected and selected[0] < 0.4 and
                    selected[0] < baseline_validation - 0.3)
    recovered = selected[1] if promoted else None
    amplitude = selected[2] if promoted else 0.0
    return TransferTrial(
        seed=seed, order=order, policy=policy,
        observed_interventions=len(train_actions) + len(val_actions),
        recovered=recovered, correct_rule=world.verify(recovered),
        final_mae=world.external_mae(base, recovered, amplitude),
        validation_mae=selected[0] if selected else baseline_validation,
        promoted=promoted,
    )


class PrincipleMemory:
    """Validated strategy records with provenance. Not secure/tamper-proof."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.execute("""CREATE TABLE IF NOT EXISTS principles (
            key TEXT PRIMARY KEY,
            policy TEXT NOT NULL,
            evidence_json TEXT NOT NULL,
            checksum TEXT NOT NULL,
            created_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        self.connection.commit()

    def close(self):
        self.connection.close()

    def save_validated(self, key: str, policy: str, evidence: dict):
        if policy not in POLICIES:
            raise ValueError("Policy outside the approved candidate set")
        if not evidence.get("gate_passed", False):
            raise ValueError("Cannot save an unvalidated principle")
        payload = json.dumps(evidence, sort_keys=True)
        digest = hashlib.sha256((policy + "\n" + payload).encode()).hexdigest()
        existing = self.connection.execute(
            "SELECT checksum FROM principles WHERE key=?", (key,)
        ).fetchone()
        if existing is not None:
            if existing[0] == digest:
                return  # Strictly idempotent re-run.
            raise ValueError("Refusing to overwrite a previously promoted principle")
        # An existing item is never silently overwritten or promoted again.
        with self.connection:
            self.connection.execute(
                "INSERT INTO principles(key,policy,evidence_json,checksum) VALUES (?,?,?,?)",
                (key, policy, payload, digest),
            )

    def retrieve(self, key: str) -> dict | None:
        row = self.connection.execute(
            "SELECT policy,evidence_json,checksum FROM principles WHERE key=?", (key,)
        ).fetchone()
        if row is None:
            return None
        policy, payload, checksum = row
        if hashlib.sha256((policy + "\n" + payload).encode()).hexdigest() != checksum:
            raise ValueError("Stored principle checksum mismatch")
        return {"policy": policy, "evidence": json.loads(payload)}


def learn_source_principle(start_seed: int = 0, worlds: int = 16) -> dict:
    """Select the best experiment policy on source-only 3-way worlds."""
    if worlds < 4:
        raise ValueError("At least four source worlds required")
    experiments = {policy: [probe(NovelRuleWorld(seed, order=3), policy, seed, 3)
                            for seed in range(start_seed, start_seed + worlds)]
                   for policy in POLICIES}
    summaries = {}
    for policy, trials in experiments.items():
        summaries[policy] = {
            "success_rate": sum(t.correct_rule and t.promoted and t.final_mae < 0.25
                                for t in trials) / worlds,
            "mean_interventions": mean(t.observed_interventions for t in trials),
            "mean_final_mae": mean(t.final_mae for t in trials),
        }
    eligible = [p for p in POLICIES if summaries[p]["success_rate"] >= 0.95]
    winner = min(eligible, key=lambda p: (summaries[p]["mean_interventions"], p)) if eligible else None
    evidence = {
        "source_family": "3-variable conjunction shifts",
        "source_seed_range": [start_seed, start_seed + worlds - 1],
        "candidate_policies": summaries,
        "gate_passed": winner is not None,
        "generalization_hypothesis": "A validated contrast probe can reveal necessary variables in an unseen conjunction",
        "algorithm_generation": "Human-designed candidate experiment policies, automatically selected",
    }
    return {"policy": winner, "evidence": evidence}


def run_transfer(memory_path: Path, source_start: int = 0, source_worlds: int = 16,
                 target_start: int = 100, target_worlds: int = 40,
                 negative_control_worlds: int = 20) -> dict:
    if not 1 <= target_worlds <= 1000:
        raise ValueError("Invalid target cohort size")
    if set(range(source_start, source_start + source_worlds)) & set(
        range(target_start, target_start + target_worlds)
    ):
        raise ValueError("Source and transfer seeds must be disjoint")
    learned = learn_source_principle(start_seed=source_start, worlds=source_worlds)
    if learned["policy"] is None:
        raise RuntimeError("No source experiment policy passed promotion gate")
    memory = PrincipleMemory(memory_path)
    try:
        memory.save_validated("conjunction_shift_probe", learned["policy"], learned["evidence"])
        recalled = memory.retrieve("conjunction_shift_probe")
    finally:
        memory.close()
    assert recalled is not None
    # The source-derived policy is frozen; target trials do not modify memory.
    warm = [probe(NovelRuleWorld(s, order=4), recalled["policy"], s, 4)
            for s in range(target_start, target_start + target_worlds)]
    cold = [probe(NovelRuleWorld(s, order=4), "full_factorial", s, 4)
            for s in range(target_start, target_start + target_worlds)]
    negative = [probe(NovelRuleWorld(s, order=3, mechanism="xor"),
                      recalled["policy"], s, 3)
                for s in range(target_start + target_worlds + 100,
                               target_start + target_worlds + 100 + negative_control_worlds)]

    def summary(trials):
        return {
            "success_rate": round(mean(t.correct_rule and t.final_mae < 0.25 for t in trials), 4),
            "median_interventions": median(t.observed_interventions for t in trials),
            "mean_final_mae": round(mean(t.final_mae for t in trials), 6),
        }

    return {
        "version": "0.3.0",
        "learned_principle": recalled,
        "source_evidence": learned["evidence"],
        "target_family": "previously unseen 4-variable conjunction shifts",
        "target_seed_range": [target_start, target_start + target_worlds - 1],
        "memory_guided": summary(warm),
        "cold_general_search": summary(cold),
        "negative_control": {
            "family": "unseen 3-variable XOR rule (not a conjunction)",
            "worlds": len(negative),
            "correct_abstention_rate": round(mean(not t.promoted for t in negative), 4)
            if negative else None,
            "purpose": "Can the transferred policy reject a misleading familiar explanation?",
        },
        "target_trials": [{"seed": w.seed, "memory_guided": w.as_dict(),
                           "cold": c.as_dict()} for w, c in zip(warm, cold)],
        "protocol": {
            "source_and_target_disjoint": True,
            "selection_uses_only_source_worlds": True,
            "target_family_not_seen_during_selection": True,
            "both_policies_have_access_to_same_hypothesis_language": True,
            "policies_choose_different_interventions": True,
            "test_makes_no_llm_calls": True,
        },
        "limitations": [
            "A fixed four-variable binary environment with conjunctive shifts",
            "Two hand-designed policies; policy selection is learned, not the algorithms themselves",
            "The holdout changes interaction order but not the underlying Boolean semantics",
            "XOR negative controls test rejection, not successful recovery from XOR",
            "The source-derived policy is validated and stored, but no model weights are trained",
        ],
    }
