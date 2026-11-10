"""Scorecard computed only from raw ledger rows (never from a policy's claims).

Every rate carries its numerator and denominator; every unavailable metric is
an explicit ``not_measured`` record rather than a number.
"""

from collections import defaultdict
from hashlib import sha256
from math import sqrt
import random
from statistics import mean, stdev

from .protocol import SAFETY_FAILURES, VARIANTS

Z95 = 1.959964


def not_measured(reason: str) -> dict:
    return {"status": "not_measured", "reason": reason}


def mean_ci(values: list[float]) -> dict:
    if not values:
        return {"value": None, "ci95": None, "n": 0, "method": "normal_approximation"}
    centre = mean(values)
    half = Z95 * stdev(values) / sqrt(len(values)) if len(values) > 1 else None
    return {"value": round(centre, 6),
            "ci95": None if half is None else [round(centre - half, 6), round(centre + half, 6)],
            "n": len(values), "method": "normal_approximation"}


def proportion(numerator: int, denominator: int) -> dict:
    record = {"numerator": numerator, "denominator": denominator, "rate": None,
              "ci95": None, "method": "wilson"}
    if denominator:
        rate = numerator / denominator
        spread = Z95 * sqrt(rate * (1 - rate) / denominator + Z95 ** 2 / (4 * denominator ** 2))
        scale = 1 + Z95 ** 2 / denominator
        centre = rate + Z95 ** 2 / (2 * denominator)
        record["rate"] = round(rate, 6)
        record["ci95"] = [round(max(0.0, (centre - spread) / scale), 6),
                          round(min(1.0, (centre + spread) / scale), 6)]
    return record


def cluster_bootstrap(pairs: list[tuple[float, float]], resamples: int, label: str):
    """95% percentile interval of sum(num)/sum(den), resampling whole episodes."""
    if len(pairs) < 2 or not sum(den for _, den in pairs):
        return None
    rng = random.Random(int(sha256(label.encode()).hexdigest()[:12], 16))
    size, estimates = len(pairs), []
    for _ in range(resamples):
        draw = rng.choices(pairs, k=size)
        den = sum(d for _, d in draw)
        if den:
            estimates.append(sum(n for n, _ in draw) / den)
    estimates.sort()
    low = estimates[int(0.025 * (len(estimates) - 1))]
    high = estimates[int(round(0.975 * (len(estimates) - 1)))]
    return [round(low, 6), round(high, 6)]


class _Index:
    def __init__(self, rows: list[dict], partition: str):
        self.decisions = defaultdict(lambda: defaultdict(list))  # (fam,var,pol) -> seed -> rows
        self.episodes = defaultdict(dict)                        # (fam,var,pol) -> seed -> row
        for row in rows:
            if row.get("partition") != partition:
                continue
            key = (row["family"], row["variant"], row["policy"])
            if row["type"] == "decision":
                self.decisions[key][row["seed"]].append(row)
            elif row["type"] == "episode":
                self.episodes[key][row["seed"]] = row
        for by_seed in self.decisions.values():
            for steps in by_seed.values():
                steps.sort(key=lambda r: r["step"])

    def flat(self, key) -> list[dict]:
        return [row for seed in sorted(self.decisions[key]) for row in self.decisions[key][seed]]


def _policy_metrics(index: _Index, family, variant, policy, reference) -> dict:
    key, base = (family, variant, policy), (family, variant, reference)
    episodes, decisions = index.episodes[key], index.flat(key)
    values = [episodes[s]["episode_value"] for s in sorted(episodes)]
    deltas = [episodes[s]["episode_value"] - index.episodes[base][s]["episode_value"]
              for s in sorted(episodes) if s in index.episodes[base]]
    judged = [r for r in decisions if r["harmful"] is not None]
    failures: dict[str, int] = defaultdict(int)
    routes: dict[str, int] = defaultdict(int)
    for row in decisions:
        routes[row["route"]] += 1
        for name in row["failure_classes"]:
            failures[name] += 1
    errors = [r["prediction_abs_error"] for r in decisions
              if r["prediction_abs_error"] is not None]
    grounded = [r for r in decisions if r["evidence_valid"] is not None]
    regrets = [r["regret"] for r in decisions if r["regret"] is not None]
    worst = sorted(deltas)[:max(1, len(deltas) // 10)] if deltas else []
    return {
        "episodes": len(episodes), "decisions": len(decisions),
        "mean_episode_utility": mean_ci(values),
        "harmful_choice": proportion(sum(r["harmful"] for r in judged), len(judged))
        if judged else not_measured("no per-decision counterfactual in a sequential world"),
        "episode_worse_than_no_action": proportion(sum(d < 0 for d in deltas), len(deltas)),
        "mean_decision_regret_to_hindsight_oracle":
            {"value": round(mean(regrets), 6), "n": len(regrets)} if regrets
            else not_measured("per-decision hindsight oracle undefined in a sequential world"),
        "mean_episode_regret_to_hindsight_oracle": mean_ci(
            [episodes[s]["episode_regret"] for s in sorted(episodes)]),
        "worst_decile_mean_delta_vs_no_action":
            round(mean(worst), 6) if worst else None,
        "abstentions": proportion(sum(r["abstained"] for r in decisions), len(decisions)),
        "safety_failures": sum(failures[name] for name in SAFETY_FAILURES),
        "failure_classes": dict(sorted(failures.items())),
        "routes": dict(sorted(routes.items())),
        "evidence_valid": proportion(sum(r["evidence_valid"] for r in grounded),
                                     len(grounded)),
        "mean_abs_prediction_error":
            {"value": round(mean(errors), 6), "n": len(errors)} if errors
            else not_measured("policy issued no effect predictions"),
        "model_calls": sum(r["model_calls"] for r in decisions),
    }


def _harm_pairs(index: _Index, families, variant, first, second):
    """Per-episode (harm difference, judged decisions) for a paired comparison."""
    pairs, counts = [], [0, 0, 0]
    for family in families:
        left, right = index.decisions[(family, variant, first)], index.decisions[
            (family, variant, second)]
        for seed in sorted(set(left) & set(right)):
            a = [r["harmful"] for r in left[seed] if r["harmful"] is not None]
            b = [r["harmful"] for r in right[seed] if r["harmful"] is not None]
            if a and len(a) == len(b):
                pairs.append((sum(a) - sum(b), len(a)))
                counts[0] += sum(a)
                counts[1] += sum(b)
                counts[2] += len(a)
    return pairs, counts


def _compare(index: _Index, families, variant, first, second, resamples, label) -> dict:
    deltas = []
    for family in families:
        left, right = index.episodes[(family, variant, first)], index.episodes[
            (family, variant, second)]
        deltas += [left[s]["episode_value"] - right[s]["episode_value"]
                   for s in sorted(set(left) & set(right))]
    record = {"first": first, "second": second, "paired_episodes": len(deltas)}
    if len(families) == 1:
        record["paired_mean_episode_utility_delta"] = mean_ci(deltas)
    else:
        record["paired_mean_episode_utility_delta"] = not_measured(
            "utility scales differ between world families; see per-family rows")
    pairs, (harm_first, harm_second, judged) = _harm_pairs(
        index, families, variant, first, second)
    if not judged:
        record["harmful_choice_rate_delta"] = not_measured(
            "no per-decision counterfactual in these worlds")
        return record
    rate_first, rate_second = harm_first / judged, harm_second / judged
    record["harmful_choice_rate_delta"] = {
        "first": proportion(harm_first, judged), "second": proportion(harm_second, judged),
        "value": round(rate_first - rate_second, 6),
        "ci95": cluster_bootstrap(pairs, resamples, label),
        "method": "episode_cluster_bootstrap", "resamples": resamples,
        "relative_reduction": None if rate_second == 0
        else round((rate_second - rate_first) / rate_second, 6),
    }
    return record


def _learning_curve(index: _Index, family, variant, memory_on, memory_off) -> list[dict]:
    left, right = index.decisions[(family, variant, memory_on)], index.decisions[
        (family, variant, memory_off)]
    by_step: dict[int, list[float]] = defaultdict(list)
    for seed in sorted(set(left) & set(right)):
        for a, b in zip(left[seed], right[seed]):
            by_step[a["step"]].append(a["realized_value"] - b["realized_value"])
    return [{"step": step, "mean_utility_delta": round(mean(values), 6), "n": len(values)}
            for step, values in sorted(by_step.items())]


def build_scorecard(rows: list[dict], config: dict, partition: str) -> dict:
    """Decision quality, learning gain and reliability for one seed partition."""
    index = _Index(rows, partition)
    families, policies = config["families"], config["policies"]
    candidate, baseline = config["candidate"], config["baseline"]
    control = config["memory_off_control"]
    resamples = config["promotion_gate"]["bootstrap_resamples"]
    judged_families = [f for f in families if any(
        r["harmful"] is not None for r in index.flat((f, VARIANTS[0], "no_action")))]

    def comparisons(first, second, tag):
        return {
            **{family: {variant: _compare(
                index, [family], variant, first, second, resamples,
                f"{partition}/{tag}/{family}/{variant}") for variant in VARIANTS}
               for family in families},
            "pooled": {variant: _compare(
                index, judged_families, variant, first, second, resamples,
                f"{partition}/{tag}/pooled/{variant}") for variant in VARIANTS},
        }

    return {
        "partition": partition,
        "seeds": config["partitions"][partition],
        "evidence_tier": "synthetic_simulation",
        "families_with_per_decision_counterfactuals": judged_families,
        "decision_quality": {family: {variant: {
            policy: _policy_metrics(index, family, variant, policy, "no_action")
            for policy in policies} for variant in VARIANTS} for family in families},
        "comparisons": {
            "candidate_vs_baseline": comparisons(candidate, baseline, "candidate_vs_baseline"),
            "candidate_vs_no_action": comparisons(candidate, "no_action",
                                                  "candidate_vs_no_action"),
        },
        "learning_gain": {
            "memory_on": candidate, "memory_off": control,
            "paired": comparisons(candidate, control, "memory_on_vs_off"),
            "by_step": {family: {variant: _learning_curve(
                index, family, variant, candidate, control) for variant in VARIANTS}
                for family in families},
            "forgetting": not_measured("no forgetting study in this lab version"),
            "stale_memory_counterexamples": not_measured(
                "misleading-memory negative control belongs to Work Package 3"),
            "calibration": not_measured("policies issue point estimates, not probabilities"),
        },
    }
