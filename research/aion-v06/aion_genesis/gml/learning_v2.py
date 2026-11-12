"""GML v2 opt-in learning diagnostics, targeted causal probes and generation ledger.

Extends Genesis GML-01 without modifying its frozen v1 protocol, historical
evaluator, release gates, existing policy or ASIL safety. All new probes run in
the fictional *training* world and are never candidate-facing tool actions.

Critical principle: a hidden transition can produce different real outcomes
from the same legal observation. Preserve both counterfactual outcomes instead
of deduplicating by visible prompt alone; label provenance stays on the
training/verification side, never within the model-visible input.
"""

from dataclasses import asdict, dataclass, replace
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from typing import Sequence

from ..eval_v2.causal_world import Shock, World
from . import laboratory
from .contracts import content_hash, leaked_keys


HEADS = ("job_paid", "denied", "delivered_within_4")
GENERATION_SCHEMA = "GenesisGenerationLedger/2"
PROBE_VERSION = "GenesisCausalProbe/2"
WAIT = {"tool": "wait", "job_id": "", "key": ""}


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _hash(value):
    return sha256(_canonical(value).encode()).hexdigest()


def _require_train(rows: Sequence[dict]):
    for row in rows:
        # Dataset records in v1 omit a partition field. Never infer that a
        # non-train case is safe merely because the partition field is absent.
        if (row.get("partition", "train") != "train"
                or not str(row.get("scenario_id", "")).startswith("GML-train-")):
            raise PermissionError("Only explicitly train-scoped evidence is allowed")
        if leaked_keys(row.get("input")):
            raise ValueError("Hidden simulator information in model-visible input")


def coverage_report(rows: Sequence[dict], *, min_per_class: int = 8) -> dict:
    """Explain which labels can/cannot support actual model training.

    Unknown/censored outcomes are **missing labels**, never negative labels.
    A one-class target cannot demonstrate learning its positive/negative
    distinction, no matter how small its training loss becomes.
    """
    if type(min_per_class) is not int or min_per_class < 1:
        raise ValueError("invalid_class_floor")
    _require_train(rows)
    heads, families, views = {}, {}, {}
    for head in HEADS:
        positive = negative = missing = 0
        for row in rows:
            label = row.get("label", {})
            if head not in label:
                missing += 1
                continue
            if type(label[head]) not in (bool, int, float) or label[head] not in (0, 1):
                raise ValueError("Expected verified binary label for " + head)
            positive += int(label[head] == 1)
            negative += int(label[head] == 0)
        if positive == 0 or negative == 0:
            state = "ONE_CLASS_OR_UNOBSERVED"
        elif min(positive, negative) < min_per_class:
            state = "UNDER_SAMPLED"
        else:
            state = "SUPPORTED_FOR_DEVELOPMENT"
        heads[head] = dict(positive=positive, negative=negative, missing=missing,
                           status=state, deficit_positive=max(0, min_per_class-positive),
                           deficit_negative=max(0, min_per_class-negative))
    for row in rows:
        f = row.get("family", "unclassified")
        families[f] = families.get(f, 0) + 1
        key = _hash([row.get("input"), row.get("action")])
        views.setdefault(key, set()).add(
            _hash({k: row.get("label", {}).get(k) for k in HEADS
                   if k in row.get("label", {})}))
    return {
        "schema": "GenesisLearningCoverage/2",
        "records": len(rows), "label_heads": heads, "families": families,
        "distinct_visible_decisions": len(views),
        "same_visible_decision_different_verified_outcomes":
            sum(len(outcomes) > 1 for outcomes in views.values()),
        "protected_holdout_used": False,
    }


def _probe_record(scenario, *, case, tick: int, job_id: str,
                  probe_name: str, label_kind: str) -> dict:
    """Independently replay one synthetic intervention and verify its effect."""
    world = World(case)
    while world.tick < tick:
        world.step(WAIT)
    view = world.public_view("project_manager", tenant=scenario.tenant)
    input_row = laboratory.step_view(view, job_id, set(), 0)
    action = {"tool": "order_material", "job_id": job_id,
              "key": "gml-v2:" + probe_name}
    result = world.step(action)
    status = result["result"]["status"]
    label = {"denied": int(status in laboratory.DENIED)}
    if label_kind == "delivery":
        if status != "committed":
            raise ValueError("delivery probe requires a committed order")
        # The label is whether the actual inventory was delivered within
        # four ticks of this attempt, not whether a delayed message arrived.
        # If the world ends sooner, mask the label (unknown / censored).
        horizon_tick = tick + 4
        if horizon_tick < case.horizon:
            while world.tick < horizon_tick:
                world.step(WAIT)
            world.public_view("project_manager", tenant=scenario.tenant)
            label["delivered_within_4"] = int(world.jobs[job_id]["material"] == "ready")
    elif status not in ("committed", "authority_revoked", "approval_denied"):
        raise ValueError("unexpected permission probe outcome: " + status)
    if leaked_keys(input_row):
        raise AssertionError("probe leaked hidden simulator data")
    evidence = {
        "schema": PROBE_VERSION, "scenario_id": scenario.scenario_id,
        "partition": "train", "family": scenario.case.family,
        "template_lineage": scenario.template_lineage,
        "mechanism": probe_name, "status": status,
        "input_hash": _hash([input_row, "order_material"]),
        "case_hash": case.fingerprint(),
    }
    # The model's input never contains mechanism/status/case fingerprint;
    # verification metadata remains on the dataset/auditor side.
    return {
        "example_id": "PROBE-" + _hash([evidence, label])[:24],
        "scenario_id": "GML-train-probe-" + str(scenario.index) + "-" + probe_name,
        "partition": "train", "family": scenario.case.family,
        "template_lineage": scenario.template_lineage,
        "action": "order_material", "input": input_row, "label": label,
        "source_ref": _hash(evidence)[:24], "verification": evidence,
        "censored": "delivered_within_4" not in label and label_kind == "delivery",
    }


def collect_training_probes(scenarios: Sequence, *, max_cases: int = 16) -> list[dict]:
    """Balanced, evidence-labelled mock outcomes from developer-owned worlds.

    **Never** used on protected, public validation or adversarial partitions.
    A training-only permission revocation intervention supplies missing
    negative examples. A delayed supplier shock supplies separate delivery
    labels, without using world truth in the candidate's features.
    """
    if type(max_cases) is not int or not 1 <= max_cases <= 256:
        raise ValueError("invalid_probe_budget")
    records = []
    for scenario in list(scenarios)[:max_cases]:
        if scenario.partition != "train" or scenario.case.split != "dev":
            raise PermissionError("counterfactual probes are train-only")
        case = scenario.case
        if case.family != "working_capital":
            # Mechanism shifts are explicit; do not silently modify other
            # baseline families with existing shocks.
            continue
        if case.horizon <= 9:
            raise ValueError("world horizon cannot resolve intended outcomes")
        job = case.jobs[0].name
        # Compare the exact same proposed order, once with and once without
        # a hidden permission revocation at tick 3. Status comes from World.step.
        revoked = replace(case, shocks=(*case.shocks,
                                         Shock(3, job, "permission_revoke", 1)))
        for suffix, experiment in (("permission_control", case),
                                   ("permission_revoked", revoked)):
            records.append(_probe_record(
                scenario, case=experiment, tick=3, job_id=job,
                probe_name=suffix, label_kind="permission"))
        # A supplier delay at tick 2 changes the future of an order placed at
        # tick 0. The initial observation is the same for both arms.
        late = replace(case, shocks=(*case.shocks,
                                      Shock(2, job, "supplier_delay", 6)))
        for suffix, experiment in (("delivery_control", case),
                                   ("delivery_delayed", late)):
            records.append(_probe_record(
                scenario, case=experiment, tick=0, job_id=job,
                probe_name=suffix, label_kind="delivery"))
    return records


def combine_training_evidence(baseline: Sequence[dict],
                              probes: Sequence[dict]) -> list[dict]:
    """Keep genuine opposite outcomes for identical observations.

    Previous GML-01 data factory intentionally deduped by visible state/action,
    removing one arm of hidden-mechanism comparisons. The new pathway dedupes
    only *identical source+label evidence* and preserves outcome conflicts.
    """
    rows = list(baseline) + list(probes)
    _require_train(rows)
    seen, kept = set(), []
    for row in rows:
        key = _hash([row.get("source_ref"), row.get("input"),
                     row.get("action"), row.get("label")])
        if key not in seen:
            seen.add(key)
            kept.append(dict(row))
    return kept


def training_focus(coverage: dict, *, batch_budget: int = 24) -> list[dict]:
    """Deterministic train-only research proposals, not auto-approved changes."""
    if type(batch_budget) is not int or not 1 <= batch_budget <= 500:
        raise ValueError("invalid_learning_budget")
    heads = coverage["label_heads"]
    plans = []
    for head, info in heads.items():
        if info["status"] == "SUPPORTED_FOR_DEVELOPMENT":
            continue
        deficit = info["deficit_positive"] + info["deficit_negative"]
        if head == "denied":
            mechanism = "paired_permission_revocation"
        elif head == "delivered_within_4":
            mechanism = "paired_supplier_delivery_delay"
        else:
            mechanism = "broaden_dev_causal_families_with_receipt_labels"
        plans.append({
            "target": head, "mechanism": mechanism,
            "missing_positive": info["deficit_positive"],
            "missing_negative": info["deficit_negative"],
            "proposed_case_budget": min(batch_budget, max(1, deficit)),
            "expected_measurement": "fresh development-only class support and "
                                    "paired Brier vs unchanged baseline",
            "protection": "no protected-holdout access, no automatic policy promotion",
        })
    return sorted(plans, key=lambda p: (-(p["missing_positive"] +
                                        p["missing_negative"]), p["target"]))


class GenerationLedger:
    """Append-only, hash-chained, transactional history of learning generations.

    Records can be audited, not promoted by a model. A string claiming the
    evaluator is authoritative is NOT an authentication mechanism.
    This laboratory intentionally offers no automatic promotion API.
    """

    def __init__(self, path: str | Path):
        self.path = str(path)
        with self._db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS generation_events (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                event_hash TEXT NOT NULL UNIQUE,
                previous_hash TEXT NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT NOT NULL
            )""")

    def _db(self):
        db = sqlite3.connect(self.path, isolation_level=None, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        return db

    def append(self, kind: str, payload: dict) -> str:
        if kind not in ("generation", "evaluation", "review", "rejection", "experiment"):
            raise ValueError("Unknown immutable learning event")
        if type(payload) is not dict:
            raise ValueError("A structured event is required")
        text = _canonical(payload)
        with self._db() as db:
            try:
                db.execute("BEGIN IMMEDIATE")
                previous = db.execute(
                    "SELECT event_hash FROM generation_events ORDER BY seq DESC LIMIT 1"
                ).fetchone()
                prev_hash = previous[0] if previous else "GENESIS"
                digest = _hash({"kind": kind, "payload": payload, "previous": prev_hash})
                db.execute(
                    "INSERT INTO generation_events(event_hash,previous_hash,kind,payload)"
                    " VALUES (?,?,?,?)", (digest, prev_hash, kind, text))
                db.execute("COMMIT")
                return digest
            except BaseException:
                db.execute("ROLLBACK")
                raise

    def events(self) -> list[dict]:
        with self._db() as db:
            return [dict(row) for row in db.execute(
                "SELECT seq,event_hash,previous_hash,kind,payload "
                "FROM generation_events ORDER BY seq")]

    def verify(self) -> dict:
        previous = "GENESIS"
        count = 0
        for row in self.events():
            try:
                payload = json.loads(row["payload"])
            except (ValueError, TypeError) as error:
                raise ValueError("Corrupted generation event JSON") from error
            if (row["previous_hash"] != previous or row["event_hash"] != _hash({
                "kind": row["kind"], "payload": payload, "previous": previous})):
                raise ValueError("Generation event chain corrupted at " + str(row["seq"]))
            count += 1
            previous = row["event_hash"]
        return {"events": count, "head_hash": previous, "valid": True}

    def register_generation(self, *, parent: str | None, source_sha: str,
                            model_sha: str, dataset_sha: str,
                            memory_sha: str, curriculum_sha: str,
                            architecture_sha: str, note: str = "") -> str:
        for value in (source_sha, model_sha, dataset_sha, memory_sha,
                      curriculum_sha, architecture_sha):
            if type(value) is not str or len(value) < 12:
                raise ValueError("Reproducible generation requires immutable hashes")
        ancestors = {json.loads(e["payload"])["generation_id"]
                     for e in self.events() if e["kind"] == "generation"}
        if parent is not None and parent not in ancestors:
            raise ValueError("Unknown parent generation")
        payload = dict(parent=parent, source_sha=source_sha, model_sha=model_sha,
                       dataset_sha=dataset_sha, memory_sha=memory_sha,
                       curriculum_sha=curriculum_sha,
                       architecture_sha=architecture_sha, note=note,
                       status="candidate_research_only")
        generation_id = "GEN-" + _hash(payload)[:20]
        if generation_id in ancestors:
            raise ValueError("Duplicate generation")
        self.append("generation", {**payload, "generation_id": generation_id})
        return generation_id

    def record_evaluation(self, *, generation_id: str, cohort_sha: str,
                          evaluator_sha: str, metrics: dict, split: str) -> str:
        if split not in ("development", "public_validation", "protected_test"):
            raise ValueError("Invalid independent evaluation split")
        ids = {json.loads(e["payload"])["generation_id"]
               for e in self.events() if e["kind"] == "generation"}
        if generation_id not in ids:
            raise ValueError("Unknown generation")
        for key in ("task_success_rate", "utility", "denied_actions",
                    "compute_units", "negative_transfer_rate"):
            if key not in metrics or type(metrics[key]) not in (float, int):
                raise ValueError("Incomplete numeric evaluation scorecard")
        if not (0 <= metrics["task_success_rate"] <= 1
                and 0 <= metrics["negative_transfer_rate"] <= 1
                and metrics["denied_actions"] >= 0
                and metrics["compute_units"] >= 0):
            raise ValueError("Invalid metrics")
        if not cohort_sha or not evaluator_sha:
            raise ValueError("Independent cohort and evaluator identities are required")
        return self.append("evaluation", {
            "generation_id": generation_id, "cohort_sha": cohort_sha,
            "evaluator_sha": evaluator_sha, "split": split, "metrics": metrics,
            "attestation": "untrusted_local_research_record_not_release_approval",
        })

    def compare(self, parent: str, candidate: str, *, cohort_sha: str,
                evaluator_sha: str, split: str = "development") -> dict:
        """Require exactly matched evaluation identities; never mix cohorts."""
        found = {}
        for item in self.events():
            if item["kind"] != "evaluation":
                continue
            e = json.loads(item["payload"])
            if (e["generation_id"] in (parent, candidate)
                    and e["cohort_sha"] == cohort_sha
                    and e["evaluator_sha"] == evaluator_sha
                    and e["split"] == split):
                if e["generation_id"] in found:
                    raise ValueError("Ambiguous duplicate evaluation for a generation")
                found[e["generation_id"]] = e["metrics"]
        if set(found) != {parent, candidate} or parent == candidate:
            raise ValueError("Matched parent/candidate evaluations required")
        first, second = found[parent], found[candidate]
        return {
            "parent": parent, "candidate": candidate, "split": split,
            "cohort_sha": cohort_sha, "evaluator_sha": evaluator_sha,
            "delta_success": round(second["task_success_rate"] -
                                   first["task_success_rate"], 6),
            "delta_utility": round(second["utility"] - first["utility"], 6),
            "delta_denied": second["denied_actions"] - first["denied_actions"],
            "delta_compute": second["compute_units"] - first["compute_units"],
            "delta_negative_transfer": round(second["negative_transfer_rate"] -
                                             first["negative_transfer_rate"], 6),
            "research_only": True, "automatic_promotion": False,
        }


def development_probe_report(scenarios, baseline_rows, *, max_cases=16,
                             min_per_class=8) -> dict:
    """Reusable diagnostics for an opt-in Academy generation.

    Returns a report + training rows so the existing world model can be
    trained separately. It does not evaluate or silently change a checkpoint.
    """
    before = coverage_report(baseline_rows, min_per_class=min_per_class)
    probes = collect_training_probes(scenarios, max_cases=max_cases)
    combined = combine_training_evidence(baseline_rows, probes)
    after = coverage_report(combined, min_per_class=min_per_class)
    return {
        "schema": "GenesisLearningDiagnostics/2",
        "before": before, "after": after, "probes": len(probes),
        "training_rows": combined, "targeted_plans": training_focus(after),
        "warning": "training-label coverage is not predictive accuracy or new-model success",
        "evaluation_allowed": "fresh development-only; no protected holdout retuning",
    }
