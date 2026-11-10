"""Version 0.2: detect a changing causal rule and test candidate recoveries.

This is a controlled, deterministic-protocol simulator, not an online AGI.
The evaluator alone knows the shifted triple; candidate learners only see
interventions and measured outcomes.
"""

from dataclasses import dataclass
from itertools import combinations
from statistics import mean
from statistics import median
import random

from .learner import features, solve
from .world import ALL_ACTIONS, HiddenWorld, Observation


TRIPLES = tuple(combinations(range(4), 3))


def model_features(action: tuple[int, ...], triple: tuple[int, ...] | None) -> list[float]:
    vector = features(action, "pairwise")
    if triple is not None:
        vector.append(float(action[triple[0]] * action[triple[1]] * action[triple[2]]))
    return vector


def fit(observations: list[Observation], triple: tuple[int, ...] | None) -> list[float]:
    """Ridge fit. Candidate has no access to the world's true mechanisms."""
    dimension = len(model_features(ALL_ACTIONS[0], triple))
    lhs = [[0.0] * dimension for _ in range(dimension)]
    rhs = [0.0] * dimension
    for item in observations:
        phi = model_features(item.action, triple)
        for i in range(dimension):
            rhs[i] += phi[i] * item.outcome
            for j in range(dimension):
                lhs[i][j] += phi[i] * phi[j]
    for i in range(dimension):
        lhs[i][i] += 1e-5
    return solve(lhs, rhs)


def predict(weights: list[float], action: tuple[int, ...],
            triple: tuple[int, ...] | None) -> float:
    return sum(a * b for a, b in zip(weights, model_features(action, triple)))


class ShiftingWorld:
    """Evaluator-owned world; shift location remains hidden from the learner."""

    def __init__(self, seed: int, shift_step: int | None, noise: float = 0.05):
        self._base = HiddenWorld(seed)
        self._shift_step = shift_step
        self._triple = TRIPLES[seed % len(TRIPLES)]
        self._rng = random.Random(seed + 931)
        self._noise = noise

    def truth(self, action: tuple[int, ...], step: int) -> float:
        outcome = self._base.observe(action).outcome
        if self._shift_step is not None and step >= self._shift_step:
            outcome += 7 * action[self._triple[0]] * action[self._triple[1]] * action[self._triple[2]]
        return outcome

    def observe(self, action: tuple[int, ...], step: int) -> Observation:
        return Observation(action, self.truth(action, step) + self._rng.gauss(0, self._noise))


class RecoveryController:
    """Records surprises; tries richer hypotheses; promotes only after validation."""

    def __init__(self, calibration: list[Observation], adaptive: bool,
                 surprise_threshold: float = 2.0):
        self.adaptive = adaptive
        self.triple: tuple[int, ...] | None = None
        self.weights = fit(calibration, None)
        self.threshold = surprise_threshold
        self.detection_step: int | None = None
        self.promotion_step: int | None = None
        self.investigating = False
        self.completed = False
        self.samples: list[Observation] = []
        self.validation_mae: dict[str, float] | None = None

    def prediction(self, action: tuple[int, ...]) -> float:
        return predict(self.weights, action, self.triple)

    def observe(self, observation: Observation, step: int):
        surprise = abs(self.prediction(observation.action) - observation.outcome)
        if not self.completed and not self.investigating and surprise > self.threshold:
            self.investigating = True
            self.detection_step = step
        if not self.investigating:
            return
        self.samples.append(observation)
        if len(self.samples) < 32:
            return

        # Locked protocol: first 16 post-alert observations train candidates;
        # the next 16 validate them. The evaluator does not disclose its secret.
        training = self.samples[:16]
        validation = self.samples[16:32]
        candidate_triples = (None,) + TRIPLES if self.adaptive else (None,)
        validations = {}
        for candidate in candidate_triples:
            weights = fit(training, candidate)
            mae = mean(abs(predict(weights, o.action, candidate) - o.outcome)
                       for o in validation)
            name = "pairwise" if candidate is None else "cubic_" + "".join(map(str, candidate))
            validations[name] = mae

        winner_name = min(validations, key=lambda key: (validations[key], key))
        baseline_mae = validations["pairwise"]
        best_triple = next((t for t in TRIPLES
                            if winner_name == "cubic_" + "".join(map(str, t))), None)
        # An actual promotion needs an independently validated gain over the
        # old hypothesis; the new representation does not promote itself.
        if (self.adaptive and best_triple is not None and
                validations[winner_name] < baseline_mae - 0.2 and
                validations[winner_name] < 0.4):
            self.triple = best_triple
            self.promotion_step = step
        self.weights = fit(self.samples, self.triple)
        self.validation_mae = {name: round(value, 6) for name, value in validations.items()}
        self.completed = True
        self.investigating = False


def recovery_time(errors: list[float], shift_step: int, threshold: float = 0.25,
                  sustain: int = 5) -> int | None:
    for start in range(shift_step, len(errors) - sustain + 1):
        if all(error < threshold for error in errors[start:start + sustain]):
            return start - shift_step
    return None


@dataclass(frozen=True)
class RecoveryReport:
    seed: int
    shift_step: int | None
    learned_rule: str | None
    baseline_final_mae: float
    adaptive_final_mae: float
    detection_delay: int | None
    recovery_steps: int | None
    false_alarm: bool
    detection_step: int | None
    promotion_step: int | None
    correct_rule: bool | None
    validation_mae: dict[str, float] | None
    timeline: list[dict]

    def as_dict(self):
        return {
            "seed": self.seed,
            "shift_step": self.shift_step,
            "learned_rule": self.learned_rule,
            "baseline_final_mae": round(self.baseline_final_mae, 6),
            "adaptive_final_mae": round(self.adaptive_final_mae, 6),
            "detection_delay": self.detection_delay,
            "recovery_steps": self.recovery_steps,
            "false_alarm": self.false_alarm,
            "detection_step": self.detection_step,
            "promotion_step": self.promotion_step,
            "correct_rule": self.correct_rule,
            "validation_mae": self.validation_mae,
            "timeline": self.timeline,
            "protocol": {
                "calibration_interventions": 16,
                "investigation_train_interventions": 16,
                "investigation_validation_interventions": 16,
                "same_observations_for_both_learners": True,
                "metric": "noise-free evaluator MAE across all 16 interventions",
                "candidate_families": ["pairwise"] +
                    ["cubic_" + "".join(map(str, t)) for t in TRIPLES],
                "evaluation_truth_accessible_to_learner": False,
            },
            "limitations": [
                "Tiny fixed vocabulary of candidate model classes; no new algorithms invented",
                "Periodic complete intervention coverage; not arbitrary online stimuli",
                "Synthetic low-noise world; not a demonstration of real-world adaptation",
            ],
        }


def run_recovery(seed: int = 42, shift_step: int | None = 24,
                 steps: int = 100, noise: float = 0.05) -> RecoveryReport:
    if shift_step is not None and not 0 < shift_step < steps - 40:
        raise ValueError("Shift must leave enough post-change observations")
    world = ShiftingWorld(seed=seed, shift_step=shift_step, noise=noise)
    calibration = [world.observe(a, -1) for a in ALL_ACTIONS]
    baseline = RecoveryController(calibration, adaptive=False)
    adaptive = RecoveryController(calibration, adaptive=True)
    order = list(ALL_ACTIONS)
    random.Random(seed + 381).shuffle(order)
    timeline = []
    baseline_errors, adaptive_errors = [], []

    for step in range(steps):
        action = order[step % len(order)]
        observation = world.observe(action, step)
        baseline.observe(observation, step)
        adaptive.observe(observation, step)
        baseline_error = mean(abs(baseline.prediction(a) - world.truth(a, step))
                              for a in ALL_ACTIONS)
        adaptive_error = mean(abs(adaptive.prediction(a) - world.truth(a, step))
                              for a in ALL_ACTIONS)
        baseline_errors.append(baseline_error)
        adaptive_errors.append(adaptive_error)
        timeline.append({
            "step": step,
            "baseline_mae": round(baseline_error, 6),
            "adaptive_mae": round(adaptive_error, 6),
            "phase": "shifted" if shift_step is not None and step >= shift_step else "stable",
        })

    detected = adaptive.detection_step
    return RecoveryReport(
        seed=seed,
        shift_step=shift_step,
        learned_rule=("cubic_" + "".join(map(str, adaptive.triple)))
        if adaptive.triple else None,
        baseline_final_mae=baseline_errors[-1],
        adaptive_final_mae=adaptive_errors[-1],
        detection_delay=(detected - shift_step)
        if detected is not None and shift_step is not None else None,
        recovery_steps=recovery_time(adaptive_errors, shift_step)
        if shift_step is not None else None,
        false_alarm=detected is not None and shift_step is None,
        detection_step=detected,
        promotion_step=adaptive.promotion_step,
        correct_rule=(adaptive.triple == TRIPLES[seed % len(TRIPLES)])
        if shift_step is not None else None,
        validation_mae=adaptive.validation_mae,
        timeline=timeline,
    )


def run_sweep(start_seed: int = 0, worlds: int = 50) -> dict:
    """Evaluate recovery across a prespecified cohort and stable controls."""
    if not 1 <= worlds <= 1000:
        raise ValueError("World count must be between 1 and 1000")
    shifted = [run_recovery(seed=s) for s in range(start_seed, start_seed + worlds)]
    stable = [run_recovery(seed=s, shift_step=None)
              for s in range(start_seed, start_seed + worlds)]
    detected = [r for r in shifted if r.detection_delay is not None]
    recovered = [r for r in shifted if r.recovery_steps is not None]
    return {
        "worlds_shifted": worlds,
        "worlds_stable_controls": worlds,
        "detection_rate": round(len(detected) / worlds, 4),
        "recovery_rate": round(len(recovered) / worlds, 4),
        "correct_causal_family_rate": round(sum(r.correct_rule is True for r in shifted) / worlds, 4),
        "stable_false_alarm_rate": round(sum(r.false_alarm for r in stable) / worlds, 4),
        "median_detection_delay": median(r.detection_delay for r in detected) if detected else None,
        "median_recovery_steps": median(r.recovery_steps for r in recovered) if recovered else None,
        "mean_baseline_final_mae": round(mean(r.baseline_final_mae for r in shifted), 6),
        "mean_adaptive_final_mae": round(mean(r.adaptive_final_mae for r in shifted), 6),
        "protocol": {
            "shift_step": 24,
            "total_steps": 100,
            "noise_std": 0.05,
            "shift_magnitude": 7,
            "fixed_candidate_vocabulary": True,
            "pre_registered_seed_range": [start_seed, start_seed + worlds - 1],
        },
    }
