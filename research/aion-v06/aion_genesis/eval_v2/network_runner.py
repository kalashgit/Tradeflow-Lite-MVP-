"""Fast, reproducible, judge-only business-network scenario generation report.

This does not score a Genesis candidate. It independently checks synthetic
scenario integrity and measures scenario/role/family information-flow coverage.
It does NOT execute or inspect a protected holdout.
"""

import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
from statistics import mean
from time import perf_counter

from ..lab.ledger import Ledger, read_ledger, verify_chain
from .network_factory import (
    SCHEMA, DISRUPTIONS, ROLES, SPLITS, WORKFLOWS,
    canonical, generate_batch,
)

RUN_SCHEMA = "GenesisBusinessNetworkFactoryRun/2.2"
ARTIFACTS = ("result.json", "ledger.jsonl", "review.md")


def _filehash(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def execute(split: str, count: int):
    if split not in SPLITS:
        raise PermissionError("Release holdout cannot be generated locally")
    t0 = perf_counter()
    cases = generate_batch(split, count)
    ledger = Ledger()
    ledger.append({"type": "factory_started", "schema": RUN_SCHEMA,
                   "split": split, "count": count,
                   "version": SCHEMA,
                   "seed_start": SPLITS[split]})
    workflow_counts, role_counts, disruption_counts = (
        Counter(), Counter(), Counter())
    source_total = delivery_total = undelivered = 0
    stale_total = missing_total = 0
    max_state_lag = 0
    digests = []
    for case in cases:
        disruption_counts[case.disruption] += 1
        digests.append(case.fingerprint())
        for event in case.events:
            workflow_counts[event.workflow] += 1
            ledger.append({"type": "source_event", "case_id": case.scenario_id,
                           "event": event.__dict__})
            source_total += 1
        for delivery in case.envelopes:
            role_counts[delivery.recipient] += 1
            if delivery.delivered_at is None:
                undelivered += 1
            ledger.append({"type": "routed_delivery",
                           "case_id": case.scenario_id,
                           "envelope": delivery.__dict__})
            delivery_total += 1
        # Early, mid-handoff and near-end snapshots test missing and stale
        # information, not correctness of an AI response.
        for tick in (3, 11, case.horizon - 1):
            report = case.diagnostic(tick)
            for role, info in report.items():
                stale_total += info.get("stale", 0)
                missing_total += info.get("missing", 0)
                max_state_lag = max(max_state_lag, info.get("stale", 0))
            ledger.append({"type": "information_flow_audit",
                           "case_id": case.scenario_id,
                           "as_of": tick, "audit": report})
    ledger.append({"type": "factory_complete",
                   "scenario_digests": digests})
    elapsed = max(1e-9, perf_counter() - t0)
    result = {
        "schema": RUN_SCHEMA,
        "generator": SCHEMA,
        "split": split, "batch_size": len(cases),
        "seed_start": SPLITS[split],
        "seed_end": SPLITS[split] + count - 1,
        "scenario_digests": digests,
        "different_scenarios": len(set(digests)),
        "disruption_coverage": dict(sorted(disruption_counts.items())),
        "workflow_coverage": dict(sorted(workflow_counts.items())),
        "stakeholder_receipt_coverage": dict(sorted(role_counts.items())),
        "source_events": source_total,
        "routed_deliveries": delivery_total,
        "undelivered": undelivered,
        "audited_missing_streams": missing_total,
        "audited_stale_streams": stale_total,
        "max_stale_streams_in_a_role_snapshot": max_state_lag,
        "source_ledger_hash": ledger.head,
        "protected_holdout_evaluated": False,
        "real_business_records_used": False,
        "human_review_obtained": False,
        "policy_decision_improvement_proven": False,
        "synthetic_only": True,
        "promotion": "not_authorized",
        "caution": [
            "All source scenarios and generator rules are public in the repository.",
            "This checks scenario generation and stakeholder information flow, NOT Genesis policy quality.",
            "Missing/delayed/contradictory information is not equivalent to misinformation accepted by an agent.",
            "No actual customer, worker, vendor, inspector, payment system or business state is connected.",
            "This release contains no securely independent protected holdout.",
        ],
    }
    timing = {
        "generated_scenarios_per_second": round(count / elapsed, 3),
        "elapsed_seconds": round(elapsed, 6),
        "timing_not_used_for_replay": True,
        "environment_dependent": True,
    }
    return result, ledger, timing


def render(result, timing=None):
    lines = ["# Genesis Business Network Scenario Factory v2.2", "",
             f"**Split:** {result['split']} (public synthetic, not a holdout)",
             f"**Generated cases:** {result['batch_size']}",
             f"**Disruption families:** {len(result['disruption_coverage'])}",
             f"**Stakeholder roles:** {len(result['stakeholder_receipt_coverage'])}",
             f"**Source events:** {result['source_events']}",
             f"**Routed messages:** {result['routed_deliveries']}",
             f"**Undelivered messages:** {result['undelivered']}",
             f"**Audited stale streams:** {result['audited_stale_streams']}",
             "", "## Disruptions", ""]
    for kind, n in result["disruption_coverage"].items():
        lines.append(f"- {kind}: {n} cases")
    lines += ["", "## Stakeholder receipts", ""]
    for role, n in result["stakeholder_receipt_coverage"].items():
        lines.append(f"- {role}: {n}")
    lines += ["", "## Interpretation", "",
              "This lab measures fixture coverage and event propagation, "
              "**not** improved Genesis decisions. A role sees only explicitly "
              "delivered, permitted revisions; an acknowledgment, approval, "
              "execution, verification and payment are distinct source events.",
              "", "All entities, money and timings are fictional. No "
              "release or deployment is authorized.", ""]
    return "\n".join(lines)


def write_run(split, count, path):
    out = Path(path)
    if out.exists() and any(out.iterdir()):
        raise FileExistsError("Synthetic evidence is append-only; choose a fresh directory")
    out.mkdir(parents=True, exist_ok=True)
    result, ledger, timing = execute(split, count)
    (out / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    ledger.write(out / "ledger.jsonl")
    (out / "review.md").write_text(render(result), encoding="utf-8")
    (out / "timing.json").write_text(
        json.dumps(timing, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps({
        "schema": "GenesisBusinessNetworkArtifactManifest/2.2",
        "sha256": {name: _filehash(out / name) for name in ARTIFACTS},
        "holdout": False, "real_data": False,
    }, sort_keys=True, indent=2) + "\n")
    return result, timing


def verify_run(path):
    root = Path(path)
    manifest = json.loads((root / "manifest.json").read_text("utf-8"))
    if manifest.get("holdout") or manifest.get("real_data"):
        raise ValueError("Unexpected synthetic laboratory custody")
    if set(manifest.get("sha256", {})) != set(ARTIFACTS):
        raise ValueError("Missing artifact hashes")
    for name, expected in manifest["sha256"].items():
        if _filehash(root / name) != expected:
            raise ValueError("Factory artifact hash mismatch")
    result = json.loads((root / "result.json").read_text("utf-8"))
    records = read_ledger(root / "ledger.jsonl")
    if verify_chain(records):
        raise ValueError("Business event ledger hash chain mismatch")
    replay, ledger, _ = execute(result["split"], result["batch_size"])
    if result != replay or ledger.records != records:
        raise ValueError("Generated business network did not replay exactly")
    if (root / "review.md").read_text("utf-8") != render(result):
        raise ValueError("Human-readable network coverage report was changed")
    return {"schema": "GenesisBusinessNetworkReplay/2.2",
            "valid": True, "reproduced": True,
            "source_events": result["source_events"],
            "routed_deliveries": result["routed_deliveries"],
            "scenario_count": result["batch_size"],
            "heldout_examined": False, "real_business_actions": 0}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    commands = p.add_subparsers(dest="command", required=True)
    r = commands.add_parser("run")
    r.add_argument("--split", choices=("dev", "validation"), required=True)
    r.add_argument("--count", type=int, default=120)
    r.add_argument("--out", required=True)
    v = commands.add_parser("verify")
    v.add_argument("--out", required=True)
    args = p.parse_args(argv)
    if args.command == "run":
        result, timing = write_run(args.split, args.count, args.out)
        print(render(result))
        print(json.dumps(timing, sort_keys=True))
    else:
        print(json.dumps(verify_run(args.out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
