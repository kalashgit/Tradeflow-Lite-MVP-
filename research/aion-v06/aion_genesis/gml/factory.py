"""Experience and Dataset Factory: verified trajectories -> versioned datasets.

Every example is traceable to a sealed trajectory, deduplicated on its
model-visible input, checked against evaluation scenarios, and written as a
content-addressed dataset with a manifest. Failed and negative examples are
kept: an ineligible record is counted and excluded with its reason, and worse
alternatives survive as the rejected side of preference pairs.
"""

import json
from pathlib import Path
import random

from . import GML_VERSION, laboratory
from .contracts import content_hash, file_hash, leaked_keys, validate, write_jsonl
from .runtime import (PROMPT_VERSION, build_messages, numeric_summary, prompt_hash,
                      render_observation)

MIN_PREFERENCE_MARGIN = 100   # synthetic value units; smaller gaps are not "better"


def collect_decisions(scenarios, *, behaviour="uniform", seed=0) -> list[dict]:
    """Run the laboratory and return sealed decision trajectories."""
    rng = random.Random(seed)
    records = []
    for scenario in scenarios:
        outcomes = laboratory.strategy_outcomes(scenario)
        selected = rng.choice(laboratory.STRATEGIES) if behaviour == "uniform" else behaviour
        records.append(laboratory.decision_trajectory(
            scenario, selected, behaviour=behaviour, outcomes=outcomes))
    return records


def _example_base(record):
    observation = record["available_information"]["observation"]
    messages = build_messages(observation)
    return {
        "trajectory_id": record["trajectory_id"],
        "scenario_id": record["environment"]["scenario_id"],
        "family": record["environment"]["family"],
        "template_lineage": record["environment"]["template_lineage"],
        "initial_state_hash": record["environment"]["initial_state_hash"],
        "messages": messages, "input_hash": prompt_hash(messages),
        "text": render_observation(observation),
        "summary": [round(x, 6) for x in numeric_summary(observation)],
    }


def build_policy_datasets(records, *, forbidden_state_hashes=frozenset()) -> dict:
    """Supervised and preference examples from trusted trajectories only."""
    sft, preference, seen = [], [], set()
    report = {"trajectories": len(records), "excluded": {}, "duplicates_removed": 0}

    def exclude(reason):
        report["excluded"][reason] = report["excluded"].get(reason, 0) + 1

    for record in records:
        validate(record)
        provenance, env = record["provenance"], record["environment"]
        if not provenance["training_eligible"]:
            exclude(provenance["ineligible_reason"])
            continue
        if env["initial_state_hash"] in forbidden_state_hashes:
            exclude("contaminated_with_evaluation_scenario")
            continue
        base = _example_base(record)
        if leaked_keys(base["messages"]):
            exclude("hidden_key_in_prompt")
            continue
        if base["input_hash"] in seen:
            report["duplicates_removed"] += 1
            continue
        seen.add(base["input_hash"])
        evidence = record["learning_evidence"]
        counter = evidence["counterfactuals"]
        sft.append({**base, "example_id": "SFT-" + base["input_hash"][:20],
                    "target": evidence["corrective_action"],
                    "selected_by_behaviour": record["decision"]["selected_action"],
                    "evidence": {k: counter[k]["value"] for k in sorted(counter)}})
        for better, worse in evidence["better_worse"]:
            margin = counter[better]["value"] - counter[worse]["value"]
            if margin >= MIN_PREFERENCE_MARGIN and counter[better]["denied"] <= \
                    counter[worse]["denied"]:
                preference.append({
                    **base, "example_id": f"PREF-{base['input_hash'][:16]}-{better}-{worse}",
                    "chosen": better, "rejected": worse, "margin": margin,
                    "evidence": {"chosen": counter[better], "rejected": counter[worse]}})
    report.update(sft_examples=len(sft), preference_pairs=len(preference))
    return {"sft": sft, "preference": preference, "report": report}


def collect_transitions(scenarios, *, behaviours=laboratory.STRATEGIES[:3]) -> list[dict]:
    rows = []
    for scenario in scenarios:
        for behaviour in behaviours:
            rows.extend(laboratory.transition_records(scenario, behaviour))
    return rows


def build_transition_dataset(rows) -> dict:
    """Deduplicated step examples; censored labels are masked, not relabelled."""
    seen, kept, report = set(), [], {"rows": len(rows), "duplicates_removed": 0,
                                     "censored_job_outcomes_masked": 0, "leaky_dropped": 0}
    for row in rows:
        if leaked_keys(row["input"]):
            report["leaky_dropped"] += 1
            continue
        key = content_hash([row["input"], row["action"]])
        if key in seen:
            report["duplicates_removed"] += 1
            continue
        seen.add(key)
        label = dict(row["label"])
        if row["censored"] and "job_paid" in label:
            del label["job_paid"]          # unknown, not a verified failure
            report["censored_job_outcomes_masked"] += 1
        kept.append({"example_id": "TRN-" + key[:20], "scenario_id": row["scenario_id"],
                     "family": row["family"], "template_lineage": row["template_lineage"],
                     "action": row["action"], "input": row["input"], "label": label,
                     "source_ref": row["source_ref"]})
    report["examples"] = len(kept)
    return {"examples": kept, "report": report}


def write_dataset(root, kind: str, examples: list[dict], *, partition: str,
                  report: dict, parents=()) -> dict:
    """Content-addressed dataset directory with an immutable manifest."""
    root = Path(root)
    staging = root / f".{kind}.staging.jsonl"
    root.mkdir(parents=True, exist_ok=True)
    digest = write_jsonl(staging, examples)
    folder = root / f"{kind}-{digest[:16]}"
    folder.mkdir(exist_ok=True)
    staging.replace(folder / "data.jsonl")
    manifest = {
        "schema": "GenesisDatasetManifest/1", "dataset_id": f"{kind}-{digest[:16]}",
        "kind": kind, "sha256": digest, "examples": len(examples),
        "partition": partition, "prompt_version": PROMPT_VERSION,
        "gml_version": GML_VERSION, "world_version": laboratory.WORLD_VERSION,
        "families": sorted({e["family"] for e in examples}),
        "template_lineages": sorted({e["template_lineage"] for e in examples}),
        "scenario_ids_hash": content_hash(sorted({e["scenario_id"] for e in examples})),
        "parents": list(parents), "report": report,
        "data_permissions": "synthetic_public_research",
    }
    (folder / "manifest.json").write_text(json.dumps(manifest, sort_keys=True, indent=1))
    return {**manifest, "path": str(folder)}


def load_dataset(folder) -> tuple[dict, list[dict]]:
    """Load and verify a dataset against its manifest hash."""
    folder = Path(folder)
    manifest = json.loads((folder / "manifest.json").read_text())
    if file_hash(folder / "data.jsonl") != manifest["sha256"]:
        raise ValueError("Dataset content does not match its manifest hash")
    with open(folder / "data.jsonl", encoding="utf-8") as handle:
        return manifest, [json.loads(line) for line in handle if line.strip()]
