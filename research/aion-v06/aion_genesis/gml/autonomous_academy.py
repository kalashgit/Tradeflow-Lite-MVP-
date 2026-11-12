"""AION Genesis research-only self-directed Academy learning controller.

An *in-process*, bounded autonomous research cycle:
  measure weaknesses -> select training curricula -> simulate verified receipts
  -> fine-tune a world model -> compare to parent -> retain/reject -> repeat.

This is actual PyTorch parameter learning, NOT Qwen LoRA, policy improvement,
self-written executable code, or any authority over production actions.
Evaluation here is a separate *development* cohort repeatedly consulted by
the learner. It is **not** unseen holdout, independent confirmation or a
promotion gate. The original GML-01 public/protected tests are never read.

Every transition is synthetic, with no network calls or external effects.
The simulation oracle may label training examples; it cannot be queried
as a model-visible input. Safe, model-generated research requests cannot
modify the evaluator, authorize a business command, or expand the budgets.
"""

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import time

from . import academy, factory, laboratory
from .contracts import content_hash, file_hash, write_jsonl
from .learning_v2 import (
    GenerationLedger, collect_training_probes, combine_training_evidence,
    coverage_report,
)

SCHEMA = "GenesisAutonomousAcademy/3"
HEADS = ("job_paid", "denied", "delivered_within_4")
FAMILIES = tuple(academy.CAPABILITIES)
RESEARCH_ONLY = "dev_research_candidate_not_authorized_for_production"


@dataclass(frozen=True)
class AcademyBudget:
    """Host-owned bounds. Candidate models never supply these values."""
    rounds: int = 2
    batch_cases: int = 8
    seed_cases: int = 16
    check_cases: int = 40
    epochs_initial: int = 24
    epochs_step: int = 12
    max_total_scenarios: int = 48
    max_wall_seconds: int = 420
    max_training_steps: int = 300
    seed: int = 43
    min_brier_gain: float = 0.002
    max_head_regression: float = 0.02
    max_family_regression: float = 0.03

    def __post_init__(self):
        ints = ("rounds", "batch_cases", "seed_cases", "check_cases",
                "epochs_initial", "epochs_step", "max_total_scenarios",
                "max_wall_seconds", "max_training_steps", "seed")
        if any(type(getattr(self, k)) is not int for k in ints):
            raise ValueError("All autonomy budgets must be bounded integers")
        if not (1 <= self.rounds <= 5 and 2 <= self.batch_cases <= 32
                and 8 <= self.seed_cases <= 60 and 8 <= self.check_cases <= 80
                and 1 <= self.epochs_initial <= 100
                and 1 <= self.epochs_step <= 50
                and 1 <= self.max_total_scenarios <= 200
                and self.seed_cases + self.rounds * self.batch_cases
                    <= self.max_total_scenarios
                and 30 <= self.max_wall_seconds <= 1800
                and 1 <= self.max_training_steps <= 5000
                and 0 <= self.seed <= 10000000):
            raise ValueError("Research budget exceeds authorized limits")
        for key in ("min_brier_gain", "max_head_regression",
                    "max_family_regression"):
            value = getattr(self, key)
            if type(value) not in (float, int) or not math.isfinite(value) or value < 0:
                raise ValueError("Invalid acceptance criterion")


def _training_cases(count: int, *, start: int, family: str):
    cases = laboratory.scenarios("train", count, start=start, families=(family,))
    if any(x.partition != "train" or x.case.split != "dev" for x in cases):
        raise PermissionError("Academy can only create training cases")
    return cases


def _score(predictor, examples: list[dict]) -> dict:
    """Both ordinary and class-balanced Brier; grouped by capabilities.

    A flat all-negative classifier can look good on a 99% negative head.
    The balanced score requires error measurement on both verified classes.
    """
    if not examples:
        raise ValueError("Cannot evaluate an empty development cohort")
    from .training.world_model import HEADS as model_heads
    scores = predictor(examples)
    if tuple(model_heads) != HEADS:
        raise RuntimeError("World-model output heads changed")
    groups = {"all": list(range(len(examples)))}
    for family in FAMILIES:
        groups[family] = [i for i, e in enumerate(examples)
                          if e["family"] == family]
    result = {}
    for group, indices in groups.items():
        result[group] = {}
        for index, head in enumerate(HEADS):
            by_class = {0: [], 1: []}
            for i in indices:
                label = examples[i].get("label", {})
                if head not in label:
                    continue
                actual = label[head]
                if actual not in (0, 1):
                    raise ValueError("Unverified class label")
                p = float(scores[i][index])
                if not 0 <= p <= 1 or not math.isfinite(p):
                    raise ValueError("Invalid model prediction")
                by_class[int(actual)].append((p - int(actual)) ** 2)
            all_errors = by_class[0] + by_class[1]
            normal = sum(all_errors) / len(all_errors) if all_errors else None
            balanced = (sum(by_class[0]) / len(by_class[0]) +
                        sum(by_class[1]) / len(by_class[1])) / 2 if all(
                            by_class.values()) else None
            result[group][head] = {
                "n": len(all_errors), "positive": len(by_class[1]),
                "negative": len(by_class[0]),
                "brier": round(normal, 7) if normal is not None else None,
                "balanced_brier": round(balanced, 7)
                if balanced is not None else None,
            }
    return result


def _failure_profile(score: dict, coverage: dict) -> dict:
    """Measure deficiencies; academy only receives bounded numeric hints."""
    family_losses = {}
    for family in FAMILIES:
        entries = list(score[family].values())
        usable = [e["balanced_brier"] if e["balanced_brier"] is not None
                  else e["brier"] for e in entries if e["n"] >= 4]
        # Lack of evidence should get exploration, not be treated as mastery.
        family_losses[family] = (sum(usable) / len(usable)) if usable else 1.0
    head_losses = {}
    for head, item in score["all"].items():
        gap = coverage["label_heads"][head]
        missing = gap["deficit_positive"] + gap["deficit_negative"]
        head_losses[head] = {
            "measured_balanced_brier": item["balanced_brier"],
            "train_class_deficit": missing,
            "priority": min(2.0, (item["balanced_brier"]
                                 if item["balanced_brier"] is not None else 1.0)
                            + missing / 16),
        }
    head_order = sorted(HEADS, key=lambda h: -head_losses[h]["priority"])
    return {"family_losses": family_losses, "head_losses": head_losses,
            "target_head": head_order[0]}


def _decision(parent: dict, candidate: dict, budget: AcademyBudget) -> dict:
    """Host-defined *development-only* noninferiority criteria.

    Research best-of-dev selection is NOT a safety verdict or release approval.
    A missing class automatically blocks selection; no 'success' by ignoring
    a rare class. Family regressions are tracked on observable groups.
    """
    deltas = {}
    for head in HEADS:
        prev = parent["all"][head]["balanced_brier"]
        new = candidate["all"][head]["balanced_brier"]
        if prev is None or new is None:
            return {"keep": False, "reason": "missing_class_support",
                    "head_deltas": {}, "research_only": True}
        deltas[head] = round(new - prev, 7)
    family_deltas = {}
    for family in FAMILIES:
        comparable = [
            candidate[family][head]["brier"] - parent[family][head]["brier"]
            for head in HEADS
            if parent[family][head]["brier"] is not None
            and candidate[family][head]["brier"] is not None]
        family_deltas[family] = (round(sum(comparable) / len(comparable), 7)
                                 if comparable else None)
    improvement = -sum(deltas.values()) / len(deltas)
    keep = (improvement >= budget.min_brier_gain
            and max(deltas.values()) <= budget.max_head_regression
            and all(d is None or d <= budget.max_family_regression
                    for d in family_deltas.values()))
    return {
        "keep": bool(keep),
        "reason": ("development_champion_candidate" if keep
                   else "insufficient_gain_or_regression"),
        "mean_balanced_brier_gain": round(improvement, 7),
        "head_deltas": deltas, "family_mean_brier_deltas": family_deltas,
        "research_only": True, "independent_evaluation": False,
    }


def _fine_tune(parent: dict, examples: list[dict], *, epochs: int,
               seed: int, deadline: float, max_steps: int):
    """Continue training from actual parent weights, without modifying them."""
    import torch
    from .training import world_model as wm
    torch.manual_seed(seed)
    if not examples:
        raise ValueError("Cannot learn without verified training data")
    x, y, mask = wm.tensors(examples)
    old_model = parent["model"]
    model = wm.WorldModel(parent["lineage"]["inputs"],
                          parent["lineage"]["config"]["hidden"])
    model.load_state_dict(old_model.state_dict())
    original = torch.cat([p.detach().flatten().clone()
                          for p in old_model.parameters()])
    # Keep the **parent's** feature normalization for weight compatibility.
    xs = (x - parent["mean"]) / parent["std"]
    model.train()
    optimizer = torch.optim.AdamW(model.parameters(), lr=7e-4,
                                  weight_decay=1e-4)
    loss_fn = torch.nn.BCEWithLogitsLoss(reduction="none")
    batch_size = 128
    generator = torch.Generator().manual_seed(seed)
    losses, steps = [], 0
    started = time.monotonic()
    for epoch in range(epochs):
        indices = torch.randperm(len(xs), generator=generator)
        total = 0.0
        for start in range(0, len(xs), batch_size):
            if time.monotonic() >= deadline:
                raise TimeoutError("academy_wall_budget_exhausted")
            if steps >= max_steps:
                raise RuntimeError("academy_training_step_limit")
            subset = indices[start:start + batch_size]
            loss = (loss_fn(model(xs[subset]), y[subset]) *
                    mask[subset]).sum() / mask[subset].sum().clamp_min(1)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            steps += 1
            total += float(loss.detach()) * len(subset)
        losses.append(round(total / len(xs), 6))
    final = torch.cat([p.detach().flatten()
                       for p in model.parameters()])
    model.eval()
    lineage = {
        **parent["lineage"],
        "kind": "world_model_autonomous_fine_tune",
        "config": dict(parent["lineage"]["config"]),
        "training_parent_checkpoint_sha": parent.get("checkpoint_sha"),
        "training_step_count": steps,
        "epochs": epochs, "seed": seed,
        "parameter_delta_l2": round(float((final - original).norm()), 7),
        "train_seconds": round(time.monotonic() - started, 3),
    }
    return {
        "model": model, "initial": old_model, "mean": parent["mean"],
        "std": parent["std"], "lineage": lineage, "losses": losses,
    }, steps


def _persist_model(out: Path, fitted: dict):
    from .training import world_model as wm
    wm.save(out, fitted)
    loaded = wm.load(out)
    loaded["checkpoint_sha"] = file_hash(out / "model.pt")
    return loaded


def execute(out, budget: AcademyBudget = AcademyBudget()) -> dict:
    """One bounded autonomous Academy experiment; no per-generation prompts.

    The host passes fixed budgets before the run. Genesis autonomously picks
    training scenarios and skills, trains/rejects candidate weights, and stops.
    It is intentionally not scheduled and never self-merges/deploys.
    """
    if not isinstance(budget, AcademyBudget):
        raise TypeError("host-owned AcademyBudget required")
    from .training import world_model as wm
    root = Path(out)
    root.mkdir(parents=True, exist_ok=True)
    config = asdict(budget)
    config_hash = content_hash([SCHEMA, config])
    complete = root / "result.json"
    if complete.exists():
        result = json.loads(complete.read_text())
        if result.get("config_hash") != config_hash:
            raise ValueError("Output already contains a different experiment")
        GenerationLedger(root / "generations.sqlite3").verify()
        return result
    # Fail closed after partial completion. A future task may add checkpoint
    # resumption, but silently restarting an interrupted run can misattribute
    # generations or disclose inconsistent results.
    if (root / "generations.sqlite3").exists():
        raise RuntimeError("Incomplete generation ledger; use a fresh output directory")
    started = time.monotonic()
    deadline = started + budget.max_wall_seconds
    source_sha = file_hash(__file__)
    architecture_sha = file_hash(wm.__file__)
    ledger = GenerationLedger(root / "generations.sqlite3")
    check = laboratory.scenarios(
        "train", budget.check_cases, start=3700, families=FAMILIES)
    dev_check = combine_training_evidence(
        factory.build_transition_dataset(
            factory.collect_transitions(check))["examples"],
        collect_training_probes(check, max_cases=budget.check_cases))
    check_hash = content_hash([(s.scenario_id, s.case.fingerprint()) for s in check])
    training_cases = _training_cases(budget.seed_cases, start=1400,
                                      family="working_capital")
    train_rows = factory.build_transition_dataset(
        factory.collect_transitions(training_cases))["examples"]
    train_rows = combine_training_evidence(
        train_rows, collect_training_probes(training_cases,
                                            max_cases=budget.seed_cases))
    dataset_dir = root / "datasets"
    dataset_dir.mkdir(exist_ok=True)
    first_hash = write_jsonl(dataset_dir / "generation-0.jsonl", train_rows)
    initial_spec = wm.WorldModelConfig(
        hidden=32, epochs=budget.epochs_initial, seed=budget.seed, batch=128)
    fitted = wm.train(train_rows, initial_spec, dataset_id="self-directed-g0",
                      dataset_sha256=first_hash)
    champion = _persist_model(root / "models" / "generation-0", fitted)
    generation = ledger.register_generation(
        parent=None, source_sha=source_sha,
        model_sha=champion["checkpoint_sha"],
        dataset_sha=first_hash, memory_sha=content_hash("none"),
        curriculum_sha=content_hash(["seed", budget.seed_cases]),
        architecture_sha=architecture_sha,
        note="independent training-world baseline; no protected test")
    prediction = lambda model, rows: wm.predict(model, rows)
    champ_score = _score(lambda rows: prediction(champion, rows), dev_check)
    champion_id = generation
    ledger.append("evaluation", {
        "generation_id": generation, "kind": "baseline",
        "cohort_sha": check_hash, "dev_only": True,
        "score": champ_score["all"],
    })
    budget_events, skills, active_scenarios = [], [], budget.seed_cases
    curriculum = academy.Curriculum(
        families=FAMILIES, pool_start=1800, pool_size=560,
        exploration=0.3, adaptive=True)
    training_steps = budget.epochs_initial * math.ceil(len(train_rows) / 128)
    training_attempts = 0
    for generation_number in range(1, budget.rounds + 1):
        if time.monotonic() >= deadline:
            budget_events.append({"cycle": generation_number,
                                  "stop": "wall_clock_budget"})
            break
        if active_scenarios + budget.batch_cases > budget.max_total_scenarios:
            budget_events.append({"cycle": generation_number,
                                  "stop": "scenario_budget"})
            break
        coverage = coverage_report(train_rows)
        weaknesses = _failure_profile(champ_score, coverage)
        curriculum.update(weaknesses["family_losses"])
        selected = curriculum.next_batch(budget.batch_cases)
        if not selected:
            budget_events.append({"cycle": generation_number,
                                  "stop": "scenario_pool_exhausted"})
            break
        if (active_scenarios + len(selected) > budget.max_total_scenarios
                or time.monotonic() >= deadline):
            budget_events.append({"cycle": generation_number,
                                  "stop": "scenario_or_time_budget"})
            break
        active_scenarios += len(selected)
        extra = factory.build_transition_dataset(
            factory.collect_transitions(selected))["examples"]
        counterexamples = collect_training_probes(
            selected, max_cases=len(selected))
        proposed_rows = combine_training_evidence(
            train_rows, extra + counterexamples)
        expected_steps = budget.epochs_step * math.ceil(len(proposed_rows) / 128)
        if training_steps + expected_steps > budget.max_training_steps:
            budget_events.append({"cycle": generation_number,
                                  "stop": "training_steps_budget"})
            break
        dataset_sha = write_jsonl(
            dataset_dir / f"generation-{generation_number}.jsonl",
            proposed_rows)
        fitted, steps = _fine_tune(
            champion, proposed_rows, epochs=budget.epochs_step,
            seed=budget.seed + generation_number, deadline=deadline,
            max_steps=budget.max_training_steps - training_steps)
        training_steps += steps
        training_attempts += 1
        candidate = _persist_model(root / "models" /
                                   f"generation-{generation_number}", fitted)
        new_id = ledger.register_generation(
            parent=champion_id, source_sha=source_sha,
            model_sha=candidate["checkpoint_sha"],
            dataset_sha=dataset_sha, memory_sha=content_hash("none"),
            curriculum_sha=content_hash({
                "selection": [s.scenario_id for s in selected],
                "focus": weaknesses["target_head"],
                "family_losses": weaknesses["family_losses"],
                "curriculum_version": "gml-academy-v1",
            }),
            architecture_sha=architecture_sha,
            note="self-directed research candidate only")
        candidate_score = _score(
            lambda rows: prediction(candidate, rows), dev_check)
        decision = _decision(champ_score, candidate_score, budget)
        skills.append({
            "schema": "GenesisSkillHypothesis/1",
            "skill_id": "skill-predict-" + weaknesses["target_head"] + "-g" +
                        str(generation_number),
            "target": weaknesses["target_head"],
            "kind": "learned_prediction_capability",
            "candidate_generation": new_id,
            "evidence": decision,
            "state": ("provisional_dev_improvement"
                      if decision["keep"] else "rejected_in_development"),
            "executable_business_skill": False,
            "production_authority": False,
        })
        ledger.append("evaluation", {
            "generation_id": new_id, "parent": champion_id,
            "cohort_sha": check_hash, "dev_only": True,
            "metrics": candidate_score["all"], "decision": decision,
            "evidence_heads": list(HEADS),
            "no_protected_test": True,
        })
        ledger.append("experiment", {
            "cycle": generation_number, "generation_id": new_id,
            "target": weaknesses["target_head"],
            "selected_training_scenarios": [s.scenario_id for s in selected],
            "added_verified_counterfactuals": len(counterexamples),
            "verified_rows": len(proposed_rows), "steps": steps,
            "candidate_sha": candidate["checkpoint_sha"],
            "precommitted_dev_gate": {
                "min_brier_gain": budget.min_brier_gain,
                "max_head_regression": budget.max_head_regression,
                "max_family_regression": budget.max_family_regression,
            },
        })
        if decision["keep"]:
            ledger.append("review", {
                "generation_id": new_id, "status": RESEARCH_ONLY,
                "reason": "better_on_reused_development_check_only",
                "not_an_authoritative_promotion": True,
            })
            champion = candidate
            champion_id = new_id
            champ_score = candidate_score
            # Retain genuine evidence regardless of whether the new version
            # wins, but never use the *development evaluator* as a label.
            train_rows = proposed_rows
        else:
            ledger.append("rejection", {
                "generation_id": new_id, "status": "development_candidate_rejected",
                "reason": decision["reason"],
                "champion_unchanged": champion_id,
            })
            train_rows = proposed_rows
        budget_events.append({
            "cycle": generation_number, "candidate": new_id,
            "champion_after": champion_id,
            "target": weaknesses["target_head"],
            "selected_families": [s.case.family for s in selected],
            "verified_new_probes": len(counterexamples),
            "decision": decision,
            "development_measurements": {
                "champion": champ_score["all"],
                "candidate": candidate_score["all"],
            },
        })
    integrity = ledger.verify()
    result = {
        "schema": SCHEMA, "config_hash": config_hash,
        "source_sha": source_sha, "budget": config,
        "status": "COMPLETE_BOUNDED_RESEARCH_ONLY",
        "initial_generation": generation,
        "research_champion": champion_id,
        "research_champion_checkpoint_sha": champion["checkpoint_sha"],
        "development_cohort_sha": check_hash,
        "development_cases": budget.check_cases,
        "learning_cycles_attempted": training_attempts,
        "simulated_training_scenarios": active_scenarios,
        "training_gradient_steps_approx": training_steps,
        "elapsed_seconds": round(time.monotonic() - started, 2),
        "stop_reason": (budget_events[-1].get("stop", "max_research_cycles")
                        if budget_events else "no_cycle"),
        "cycles": budget_events, "skill_hypotheses": skills,
        "curriculum_coverage": curriculum.coverage(),
        "initial_source_training_cohort": "train / development only",
        "model_family": "PyTorch world-model",
        "qwen_weights_modified": False,
        "external_holdout_used": False,
        "automatic_research_iteration": True,
        "automatic_production_promotion": False,
        "external_actions_executed": False,
        "ledger": integrity,
    }
    # Record only the valid final report; incomplete runs cannot be silently
    # marked completed. A future stage adds transactional resume.
    temp = root / "result.tmp"
    temp.write_text(json.dumps(result, sort_keys=True, indent=2))
    os.replace(temp, complete)
    return result


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--rounds", type=int, default=2)
    p.add_argument("--batch-cases", type=int, default=8)
    p.add_argument("--seed-cases", type=int, default=16)
    p.add_argument("--check-cases", type=int, default=40)
    p.add_argument("--initial-epochs", type=int, default=24)
    p.add_argument("--step-epochs", type=int, default=12)
    p.add_argument("--max-training-steps", type=int, default=300)
    p.add_argument("--max-wall-seconds", type=int, default=420)
    args = p.parse_args()
    budget = AcademyBudget(
        rounds=args.rounds, batch_cases=args.batch_cases,
        seed_cases=args.seed_cases, check_cases=args.check_cases,
        epochs_initial=args.initial_epochs, epochs_step=args.step_epochs,
        max_total_scenarios=args.seed_cases + args.rounds * args.batch_cases,
        max_training_steps=args.max_training_steps,
        max_wall_seconds=args.max_wall_seconds)
    result = execute(args.out, budget)
    print(json.dumps({
        "schema": result["schema"], "status": result["status"],
        "cycles": result["cycles"],
        "research_champion": result["research_champion"],
        "skill_hypotheses": result["skill_hypotheses"],
        "budget_events": result["stop_reason"],
        "elapsed_seconds": result["elapsed_seconds"],
        "external_holdout_used": False,
        "automatic_production_promotion": False,
    }, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
