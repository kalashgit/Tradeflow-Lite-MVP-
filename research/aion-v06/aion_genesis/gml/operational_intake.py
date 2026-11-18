"""Genesys operational failures -> Academy remediation queue (research only).

Reads ``GenesysOperationalFailure/1`` records written by
``scripts/run-genesys-operational-benchmark.cjs`` (TradeFlow repository root),
checks their integrity, and groups them into remediation proposals for the
Academy. A failure is evidence about a weakness, never a training label: the
evaluation instruction it came from must not be reused as a training example,
so each proposal asks for NEW development cases that exercise the same
capability. Nothing here trains a model, edits the benchmark or its expected
outcomes, or touches TradeFlow records.
"""

import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path

SCHEMA = "GenesysOperationalFailure/1"
QUEUE_SCHEMA = "GenesysAcademyRemediationQueue/1"
CAPABILITY = {
    "direct": "map a plain instruction to the right registered command",
    "multi_application": "split one instruction into several registered commands",
    "unfamiliar_language": "understand slang, paraphrase and other languages",
    "ambiguity": "ask instead of guessing when the target is unclear",
    "missing_information": "ask for a missing date, method or outcome",
    "conflicting_evidence": "defer to records when the owner's claim disagrees",
    "repeated_action": "avoid duplicate work when an instruction repeats",
    "unauthorized": "refuse actions TradeFlow cannot or must not perform",
    "read_only": "answer lookups without writing",
}
SEVERITY = {"unsafe_write": 3, "model_output_invalid": 2}


def _canonical(value) -> str:
    # Matches commands.canonical in public/command-registry.js for JSON data.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def validate(record: dict) -> dict:
    if not isinstance(record, dict) or record.get("schema") != SCHEMA:
        raise ValueError("not a " + SCHEMA + " record")
    if record.get("trainingEligible") is not False:
        raise ValueError("an evaluation failure can never be a training label")
    body = {k: v for k, v in record.items() if k != "id"}
    expected = "GOF-" + sha256(_canonical(body).encode("utf-8")).hexdigest()[:20]
    if record.get("id") != expected:
        raise ValueError("failure record id does not match its content")
    for field in ("caseId", "category", "failureClass", "casesHash", "mode"):
        if not isinstance(record.get(field), str) or not record[field]:
            raise ValueError("missing " + field)
    return record


def load(path) -> list[dict]:
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    return [validate(json.loads(line)) for line in lines if line.strip()]


def build_queue(failures: list[dict]) -> dict:
    groups = defaultdict(list)
    for failure in failures:
        groups[(failure["category"], failure["failureClass"])].append(failure)
    proposals = []
    for (category, failure_class), items in groups.items():
        severity = SEVERITY.get(failure_class, 1)
        models = sorted({(f.get("model") or {}).get("id") or "none" for f in items})
        proposals.append({
            "target_capability": CAPABILITY.get(category, category),
            "category": category,
            "failure_class": failure_class,
            "severity": severity,
            "evidence_failure_ids": sorted(f["id"] for f in items),
            "evaluation_case_ids": sorted({f["caseId"] for f in items}),
            "observed_with_models": models,
            "hypothesis": f"the interpreter fails '{category}' instructions as '{failure_class}'",
            "requested_work": "write NEW development instructions for this capability; "
                              "do not copy, paraphrase or train on the listed evaluation cases",
            "verification_method": "genesys_operational_benchmark_persisted_state",
            "evaluation_cases_reusable_for_training": False,
        })
    proposals.sort(key=lambda p: (-p["severity"], -len(p["evidence_failure_ids"]),
                                  p["category"], p["failure_class"]))
    hashes = sorted({f["casesHash"] for f in failures})
    return {"schema": QUEUE_SCHEMA, "failures": len(failures), "cases_hashes": hashes,
            "proposals": proposals, "training_labels_created": 0,
            "note": "remediation requests only; Academy training data must come from new "
                    "development cases, never from evaluation failures"}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--failures", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    queue = build_queue(load(args.failures))
    Path(args.out).write_text(json.dumps(queue, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"failures": queue["failures"], "proposals": len(queue["proposals"]),
                      "top": [p["category"] + "/" + p["failure_class"] for p in queue["proposals"][:5]]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
