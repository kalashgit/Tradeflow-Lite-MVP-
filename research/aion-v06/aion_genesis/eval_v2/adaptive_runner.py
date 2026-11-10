"""Reproducible *development-only* adaptive research tournament.

The training curriculum uses scored development episodes and can choose
hypothesis-focused harder/repair cases. Evaluation then freezes its selected
fixed-policy mapping and runs a separate public-validation cohort once.
No LLM judge is allowed to change the independent numeric scorer.
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from statistics import mean
from time import perf_counter

from ..lab.ledger import Ledger, read_ledger, verify_chain
from .adaptive import (
    Curriculum, OutcomeBandit, Policy, contrast, critic_packet, episode,
)
from .causal_world import FAMILIES, SPLITS, generate

SCHEMA = "GenesisAdaptiveCausalTournament/2.3"
OPTIONS = OutcomeBandit.OPTIONS
ARTIFACTS = ("result.json", "ledger.jsonl", "review.md", "critic-packets.json")


def _hash(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def _summarize(scores):
    if not scores:
        raise ValueError("Empty synthetic result cohort")
    return {
        "episodes": len(scores),
        "verified_paid_jobs": sum(s["paid_jobs"] for s in scores),
        "possible_jobs": sum(s["possible_jobs"] for s in scores),
        "invoice_verifications": sum(s["verified_invoices"] for s in scores),
        "safety_denials": sum(s["safety_denials"] for s in scores),
        "mean_cash_change": round(mean(s["cash_change"] for s in scores), 4),
        "mean_synthetic_value_proxy": round(mean(
            s["synthetic_value_proxy"] for s in scores), 4),
        "hypothetical_missed_opportunity_total": sum(
            s["missed_opportunity_proxy"] for s in scores),
    }


def run_training(train_count=24, validation_count=18):
    if type(train_count) is not int or not 6 <= train_count <= 96:
        raise ValueError("Training budget must be 6–96 dev scenarios")
    if type(validation_count) is not int or not 6 <= validation_count <= 96:
        raise ValueError("Validation budget must be 6–96 public scenarios")
    ledger = Ledger()
    ledger.append({
        "type": "training_started", "schema": SCHEMA,
        "train_count": train_count, "validation_count": validation_count,
        "development_seed_start": SPLITS["dev"],
        "public_validation_seed_start": SPLITS["validation"],
        "sealed_holdout": False, "model_calls": 0,
    })
    curriculum, learner = Curriculum(), OutcomeBandit()
    lessons, dev_scores = [], []
    critic_examples, intervention_examples = [], []
    for index in range(train_count):
        assigned = curriculum.next_lesson()
        case = generate("dev", index, family=assigned.family,
                        difficulty=assigned.difficulty, novelty=assigned.novelty)
        # Evaluate every fixed safe comparator on exactly the same public
        # developmental scenario. Only the policy selector is learned.
        outcomes = {name: episode(case, name) for name in OPTIONS}
        before_choice = learner.choose(case.family)
        candidate = outcomes[before_choice]
        fixed_reference = outcomes["deadline_first"]
        strongest = max(OPTIONS, key=lambda x: outcomes[x][
            "synthetic_value_proxy"])
        lesson_score = curriculum.admit_feedback(
            assigned, case, before_choice, "deadline_first")
        learner.learn_from_paired_dev(case)
        lesson_score.update({
            "selection_before_learning": before_choice,
            "selection_after_learning": learner.choose(case.family),
            "best_fixed_policy_for_this_dev_case": strongest,
            "scenario_hash": case.fingerprint(),
            "candidate_paid": candidate["paid_jobs"],
            "fixed_reference_paid": fixed_reference["paid_jobs"],
        })
        lessons.append(lesson_score)
        dev_scores.append(candidate)
        ledger.append({"type": "training_lesson", "lesson": lesson_score,
                       "paired_dev_scores": outcomes})
        if len(critic_examples) < 3 and index % 5 == 0:
            score, trace = episode(case, before_choice, review=True)
            critic_examples.append(critic_packet(case, score, trace))
        if len(intervention_examples) < 5 and case.shocks:
            # Controlled synthetic ablation is not causal proof beyond this
            # model. It tests an explicit difference, not an LLM explanation.
            first = case.shocks[0]
            intervention_examples.append(
                contrast(case, before_choice, first.kind))
    frozen = {family: learner.choose(family) for family in FAMILIES}
    ledger.append({"type": "policy_selection_frozen",
                   "mapping": frozen,
                   "training_lessons": train_count,
                   "validation_results_used_for_selection": False})
    # Public validation IDs are disjoint. Never update either learner or
    # curriculum using these outcomes.
    comparisons = []
    for i in range(validation_count):
        family = FAMILIES[i % len(FAMILIES)]
        case = generate("validation", i, family=family,
                        difficulty=1 + (i // len(FAMILIES)) % 5,
                        novelty=min(5, i // len(FAMILIES)))
        outcomes = {name: episode(case, name) for name in (
            "no_action", *OPTIONS)}
        chosen = frozen[family]
        comparison = {
            "case_id": case.case_id, "case_hash": case.fingerprint(),
            "family": family, "chosen_pre_validation": chosen,
            "selected": outcomes[chosen],
            "deadline_first": outcomes["deadline_first"],
            "cash_first": outcomes["cash_first"],
            "risk_averse": outcomes["risk_averse"],
            "no_action": outcomes["no_action"],
        }
        comparisons.append(comparison)
        ledger.append({"type": "public_validation_case", "comparison": comparison})
    match = [row["selected"] for row in comparisons]
    fixed = [row["deadline_first"] for row in comparisons]
    safe_delta = sum(s["safety_denials"] for s in match) - sum(
        s["safety_denials"] for s in fixed)
    results = {
        "schema": SCHEMA,
        "research_only": True,
        "development_cases": train_count,
        "public_validation_cases": validation_count,
        "validation_used_for_learning": False,
        "strategy_map_frozen_before_validation": frozen,
        "training_levels_final": dict(curriculum.levels),
        "training_episodes": lessons,
        "learned_bandit_snapshot": learner.snapshot(),
        "public_validation": comparisons,
        "paired_synthetic_interventions": intervention_examples,
        "summary": {
            "development_selected": _summarize(dev_scores),
            "public_validation_selected": _summarize(match),
            "public_validation_deadline_first": _summarize(fixed),
            "public_validation_no_action": _summarize(
                [row["no_action"] for row in comparisons]),
            "selected_paid_job_delta_vs_deadline_first": (
                sum(s["paid_jobs"] for s in match) -
                sum(s["paid_jobs"] for s in fixed)),
            "selected_safety_denial_delta_vs_deadline_first": safe_delta,
        },
        "learning_mechanism": "empirical_per_family_policy_selector_only",
        "llm_critic_used_to_score_or_promote": False,
        "machine_learning_model_trained": False,
        "candidate_code_modified": False,
        "model_inference_calls": 0,
        "production_actions": 0,
        "real_world_effectiveness_proven": False,
        "secured_holdout_evaluated": False,
        "promotion": "blocked_pending_external_review",
        "limitations": [
            "Public fictional business cases, not independent secured holdouts.",
            "Only three fixed rule strategies; no Genesis LLM inference or trained model.",
            "Adaptive curriculum is driven by synthetic dev scores and can overfit.",
            "A generated shock ablation is valid only in this simplified causal world.",
            "An LLM review packet is read-only; critic opinions cannot edit outcome truth.",
            "Public validation is not a release gate; human calibration is pending.",
        ],
    }
    ledger.append({"type": "tournament_completed",
                   "result_hash": sha256(json.dumps(
                       results, sort_keys=True, separators=(",", ":")).encode()
                       ).hexdigest()})
    results["ledger_hash"] = ledger.head
    return results, ledger, critic_examples


def render(report):
    s = report["summary"]
    lines = [
        "# Adaptive causal-curriculum laboratory v2.3",
        "",
        f"Development lessons: {report['development_cases']}",
        f"Public validation cases: {report['public_validation_cases']}",
        "",
        "| Policy | Paid jobs | Safety denials | Mean fictional cash change |",
        "|---|---:|---:|---:|",
    ]
    for key, name in [
            ("public_validation_selected", "Development-trained selector"),
            ("public_validation_deadline_first", "Fixed deadline-first"),
            ("public_validation_no_action", "No action")]:
        x = s[key]
        lines.append(f"| {name} | {x['verified_paid_jobs']}/"
                     f"{x['possible_jobs']} | {x['safety_denials']} | "
                     f"{x['mean_cash_change']:+.2f} |")
    lines += [
        "", "### Role of automated learning", "",
        "The only adaptation here is an empirical choice between pre-registered "
        "rule policies based on development outcomes. The curriculum selects "
        "remedial, harder and diverse scenarios. No LLM/Genesis weights "
        "or source files are rewritten automatically.",
        "", "### Independent judge boundary", "",
        "The numeric referee deterministically scores paid/verified outcomes, "
        "cash, missed opportunity and safety denials. The optional read-only "
        "LLM critic packet has no authority to edit scores or approve a release.",
        "", "### Scientific limits", "",
        "Public validation is not a sealed holdout, a single-family synthetic "
        "ablation is not real-world causation, and none of the reported figures "
        "establish commercial, generalization or safety gains.", "",
    ]
    return "\n".join(lines)


def write_run(out, train=24, validation=18):
    target = Path(out)
    if target.exists() and any(target.iterdir()):
        raise FileExistsError("Never overwrite an existing research run")
    target.mkdir(parents=True, exist_ok=True)
    start = perf_counter()
    result, ledger, critics = run_training(train, validation)
    (target / "result.json").write_text(json.dumps(
        result, indent=2, sort_keys=True) + "\n")
    ledger.write(target / "ledger.jsonl")
    (target / "review.md").write_text(render(result))
    (target / "critic-packets.json").write_text(json.dumps(
        critics, indent=2, sort_keys=True) + "\n")
    (target / "timing.json").write_text(json.dumps({
        "observed_seconds": round(perf_counter()-start, 5),
        "runtime_environment_dependent": True, "excluded_from_exact_replay": True,
    }, indent=2) + "\n")
    (target / "manifest.json").write_text(json.dumps({
        "schema": "GenesisAdaptiveResearchManifest/2.3",
        "sha256": {name: _hash(target / name) for name in ARTIFACTS},
        "protected_holdout": False, "release_eligible": False,
    }, indent=2, sort_keys=True) + "\n")
    return result


def verify_run(path):
    target = Path(path)
    m = json.loads((target / "manifest.json").read_text())
    if m.get("protected_holdout") or m.get("release_eligible") or (
            set(m.get("sha256", {})) != set(ARTIFACTS)):
        raise ValueError("Invalid research evidence manifest")
    for name, value in m["sha256"].items():
        if _hash(target / name) != value:
            raise ValueError("Synthetic research artifact tampering")
    result = json.loads((target / "result.json").read_text())
    records = read_ledger(target / "ledger.jsonl")
    if verify_chain(records):
        raise ValueError("Ledger hash chain mismatch")
    expected, replayed, critics = run_training(
        result["development_cases"], result["public_validation_cases"])
    if result != expected or replayed.records != records:
        raise ValueError("Curriculum/learner replay failed")
    if (target / "review.md").read_text() != render(expected):
        raise ValueError("Review not grounded in scorecard")
    if json.loads((target / "critic-packets.json").read_text()) != critics:
        raise ValueError("LLM critic packets tampered")
    return {
        "valid": True, "deterministically_reproduced": True,
        "development": result["development_cases"],
        "public_validation": result["public_validation_cases"],
        "heldout_evaluated": False, "real_world_actions": 0,
        "release_eligible": False,
    }


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    commands = p.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--out", required=True)
    run.add_argument("--train", type=int, default=24)
    run.add_argument("--validation", type=int, default=18)
    v = commands.add_parser("verify")
    v.add_argument("--out", required=True)
    a = p.parse_args(argv)
    if a.command == "run":
        print(render(write_run(a.out, a.train, a.validation)))
    else:
        print(json.dumps(verify_run(a.out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
