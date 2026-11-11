"""Independent Evaluation Authority: sealed partitions, statistics, verdicts.

HIDDEN SIDE. Only this module mints the token that generates non-train
scenarios. Training and runtime code never import it. It scores candidates it
did not build, against preregistered criteria, and it is the only issuer of a
verdict the model registry will accept. In-process separation only: this is
not an externally custodied holdout.
"""

from hashlib import sha256
import json
from pathlib import Path
import random

from . import laboratory
from .contracts import content_hash

ISSUER = "gml-evaluation-authority"
AUTHORITY_VERSION = "gml-authority/1.0"
PROTOCOL = Path(__file__).with_name("gml_protocol_v1.json")


def load_protocol(path=None) -> dict:
    protocol = json.loads(Path(path or PROTOCOL).read_text())
    if protocol.get("schema") != "GenesisGmlProtocol/1":
        raise ValueError("Unknown GML protocol")
    return protocol


def _token():
    return laboratory.AuthorityToken(laboratory.AuthorityToken)


def sealed_scenarios(partition: str, protocol: dict, limit=None) -> list:
    spec = protocol["partitions"][partition]
    count = spec["count"] if limit is None else min(limit, spec["count"])
    return laboratory.scenarios(partition, count, start=spec["start"], token=_token())


def state_hashes(scenarios) -> set[str]:
    """Initial-state hashes of evaluation scenarios, for contamination checks."""
    from dataclasses import asdict
    return {content_hash(asdict(s.case)["jobs"]) for s in scenarios}


def contamination(dataset_examples: list[dict], scenarios) -> dict:
    """Hard blocker if any training example shares a state or id with a test."""
    states = state_hashes(scenarios)
    ids = {s.scenario_id for s in scenarios}
    seeds = {str(s.case.seed) for s in scenarios}
    hits = [e["example_id"] for e in dataset_examples
            if e.get("initial_state_hash") in states or e.get("scenario_id") in ids
            or any(seed in e.get("scenario_id", "") for seed in ())]
    return {"checked_examples": len(dataset_examples), "evaluation_scenarios": len(ids),
            "contaminated": len(hits), "examples": hits[:5], "seeds_checked": len(seeds)}


# ----------------------------------------------------------------- statistics
def bootstrap_ci(deltas: list[float], label: str, resamples=2000):
    if len(deltas) < 2:
        return None
    rng = random.Random(int(sha256(label.encode()).hexdigest()[:12], 16))
    means = sorted(sum(rng.choices(deltas, k=len(deltas))) / len(deltas)
                   for _ in range(resamples))
    return [round(means[int(0.025 * (resamples - 1))], 4),
            round(means[int(round(0.975 * (resamples - 1)))], 4)]


def calibration(pairs: list[tuple[float, int]], bins=10) -> dict:
    if not pairs:
        return {"n": 0, "brier": None, "log_loss": None, "ece": None}
    from math import log
    brier = sum((p - y) ** 2 for p, y in pairs) / len(pairs)
    clip = lambda p: min(1 - 1e-6, max(1e-6, p))  # noqa: E731
    loss = -sum(y * log(clip(p)) + (1 - y) * log(1 - clip(p)) for p, y in pairs) / len(pairs)
    ece = 0.0
    for index in range(bins):
        group = [(p, y) for p, y in pairs if index / bins <= p < (index + 1) / bins
                 or (index == bins - 1 and p == 1.0)]
        if group:
            ece += len(group) / len(pairs) * abs(
                sum(p for p, _ in group) / len(group) - sum(y for _, y in group) / len(group))
    return {"n": len(pairs), "brier": round(brier, 5), "log_loss": round(loss, 5),
            "ece": round(ece, 5), "base_rate": round(sum(y for _, y in pairs) / len(pairs), 4)}


# -------------------------------------------------------------- world model
def heuristic_probability(example: dict, head: str, rates: dict) -> float:
    """Hand-written non-learned baseline (the full-funding rule of thumb)."""
    view, job = example["input"], example["input"].get("job")
    if head == "job_paid" and job is not None:
        remaining = max(0, job["required_known"] - job["work_receipted"])
        spend = job["material_cost"] if example["action"] == "order_material" else 0
        funded = view["cash_budget"] - spend - job["crew_cost"] * remaining \
            - view["other_open_commitments"] >= 0
        return 0.9 if funded or job["paid_receipted"] else 0.35
    if head == "denied" and job is not None and job["authority_seen"] == "revoked":
        return 0.9
    return rates[head]


def evaluate_world_model(predict, examples: list[dict], rates: dict, *, untrained=None,
                         members=None) -> dict:
    """Score a predictor against constant, heuristic and untrained baselines."""
    from .training.world_model import HEADS
    learned = predict(examples)
    blank = untrained(examples) if untrained else None
    report = {}
    for index, head in enumerate(HEADS):
        rows = [(i, e) for i, e in enumerate(examples) if head in e["label"]]
        if not rows:
            report[head] = {"n": 0}
            continue
        truth = [int(e["label"][head]) for _, e in rows]
        entry = {
            "learned": calibration([(float(learned[i][index]), y)
                                    for (i, _), y in zip(rows, truth)]),
            "constant": calibration([(rates[head], y) for y in truth]),
            "heuristic": calibration([(heuristic_probability(e, head, rates), y)
                                      for (_, e), y in zip(rows, truth)])}
        if blank is not None:
            entry["untrained"] = calibration([(float(blank[i][index]), y)
                                              for (i, _), y in zip(rows, truth)])
        report[head] = entry
    if members:
        import torch
        stack = torch.stack([m(examples) for m in members])
        report["mean_ensemble_disagreement"] = round(stack.std(0).mean().item(), 5)
    return report


def intervention_sensitivity(predict, pairs: list[dict]) -> dict:
    """Does the model rank matched counterfactual branches like the simulator?"""
    agree = decided = 0
    for pair in pairs:
        first, second = pair["arms"]
        truth = first["job_paid"] - second["job_paid"]
        if truth == 0:
            continue
        rows = [{"input": arm["input"], "action": "order_material", "label": {}}
                for arm in (first, second)]
        p = predict(rows)
        decided += 1
        agree += (float(p[0][0]) - float(p[1][0])) * truth > 0
    return {"pairs": len(pairs), "pairs_with_different_outcomes": decided,
            "model_ranked_correctly": agree,
            "accuracy": round(agree / decided, 4) if decided else None}


# ------------------------------------------------------------------- policy
def evaluate_policies(arms: dict, scenarios, *, label: str) -> dict:
    """Run each arm on each scenario; outcomes come from the laboratory only.

    ``arms`` maps a name to ``choose(observation, outcomes_for_trials)``. The
    second argument is passed only so a declared counterfactual-trials arm can
    receive measured trial results; every other arm must ignore it.
    """
    rows = []
    for scenario in scenarios:
        outcomes = laboratory.strategy_outcomes(scenario)
        good = laboratory.acceptable(outcomes)
        best = outcomes[good[0]]["value"]
        observation = laboratory.initial_observation(scenario)
        row = {"scenario_id": scenario.scenario_id, "family": scenario.case.family,
               "template_lineage": scenario.template_lineage, "acceptable": good,
               "arms": {}}
        for name, choose in arms.items():
            picked = choose(observation, outcomes)
            if picked not in laboratory.STRATEGIES:
                picked, invalid = "no_action", True
            else:
                invalid = False
            result = outcomes[picked]
            row["arms"][name] = {
                "choice": picked, "success": int(picked in good), "invalid": invalid,
                "regret": best - result["value"], "paid_jobs": result["paid_jobs"],
                "possible_jobs": result["possible_jobs"], "denied": result["denied"],
                "inactive": int(picked == "no_action" and "no_action" not in good)}
        rows.append(row)
    summary = {}
    for name in arms:
        items = [r["arms"][name] for r in rows]
        summary[name] = {
            "cases": len(items), "successes": sum(i["success"] for i in items),
            "success_rate": round(sum(i["success"] for i in items) / len(items), 4),
            "mean_regret": round(sum(i["regret"] for i in items) / len(items), 2),
            "paid_jobs": sum(i["paid_jobs"] for i in items),
            "possible_jobs": sum(i["possible_jobs"] for i in items),
            "denied_actions": sum(i["denied"] for i in items),
            "missed_opportunity_by_inaction": sum(i["inactive"] for i in items),
            "invalid_outputs": sum(i["invalid"] for i in items),
            "choices": {s: sum(i["choice"] == s for i in items)
                        for s in laboratory.STRATEGIES}}
    return {"label": label, "summary": summary, "cases": rows}


def compare(result: dict, first: str, second: str) -> dict:
    deltas = [r["arms"][first]["success"] - r["arms"][second]["success"]
              for r in result["cases"]]
    return {"first": first, "second": second, "cases": len(deltas),
            "success_rate_delta": round(sum(deltas) / len(deltas), 4),
            "ci95": bootstrap_ci(deltas, f"{result['label']}/{first}/{second}"),
            "better": sum(d > 0 for d in deltas), "worse": sum(d < 0 for d in deltas),
            "denied_delta": result["summary"][first]["denied_actions"]
            - result["summary"][second]["denied_actions"]}


def policy_verdict(protected: dict, public: dict, protocol: dict, *, candidate: str,
                   base: str, contamination_report: dict, training_verified: bool,
                   reused_protected_test=False, real_model=True,
                   constant="constant_risk_averse") -> dict:
    """PASS / FAIL / INCONCLUSIVE against the preregistered criteria."""
    criteria = protocol["criteria"]
    main = compare(protected, candidate, base)
    retention = compare(public, candidate, base)
    blockers = []
    if contamination_report["contaminated"]:
        blockers.append("training data contaminated with evaluation scenarios")
    if not training_verified:
        blockers.append("adapter training was not verified (no changed, reloadable weights)")
    if main["denied_delta"] > criteria["policy_max_denied_increase"]:
        blockers.append("more denied actions than the frozen base")
    if retention["success_rate_delta"] < -criteria["policy_max_public_validation_success_drop"]:
        blockers.append("degraded on previously learned task families")
    gain, ci = main["success_rate_delta"], main["ci95"]
    powered = main["cases"] >= criteria["policy_min_cases_for_power"]
    versus_constant = compare(protected, candidate, constant)
    choices = protected["summary"][candidate]["choices"]
    if blockers:
        verdict = "FAIL"
    elif not real_model:
        verdict = "INCONCLUSIVE"   # a pipeline fixture proves mechanics, not learning
        blockers.append("fixture model: mechanics only, not evidence of learning")
    elif reused_protected_test:
        verdict = "INCONCLUSIVE"
    elif ci is not None and gain >= criteria["policy_min_success_gain_vs_base"] and ci[0] > 0:
        verdict = "PASS"
    elif ci is None or (not powered and ci[0] <= 0 <= ci[1]):
        verdict = "INCONCLUSIVE"
    elif ci[0] <= 0 <= ci[1] and gain > 0:
        verdict = "INCONCLUSIVE"
    else:
        verdict = "FAIL"
    return {"issued_by": ISSUER, "authority_version": AUTHORITY_VERSION,
            "verdict": verdict, "candidate": candidate, "base": base,
            "protected_test": main, "retention_public_validation": retention,
            "blockers": blockers, "reused_protected_test": reused_protected_test,
            "versus_best_constant_policy": versus_constant,
            "adds_value_over_constant_policy": bool(
                versus_constant["ci95"] and versus_constant["ci95"][0] > 0),
            "always_same_choice": max(choices.values()) == sum(choices.values()),
            "threshold": criteria["policy_min_success_gain_vs_base"],
            "human_approval_required": True, "auto_promoted": False}


def record_exposure(state_path, partition: str, protocol: dict, subject: str) -> bool:
    """Log that a sealed partition was scored. Returns True if it was seen before."""
    path = Path(state_path)
    state = json.loads(path.read_text()) if path.exists() else {"exposures": []}
    key = content_hash([partition, protocol["partitions"][partition], subject.split(":")[0]])
    seen = any(e["key"] == key for e in state["exposures"])
    state["exposures"].append({"key": key, "partition": partition, "subject": subject})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, sort_keys=True, indent=1))
    return seen
