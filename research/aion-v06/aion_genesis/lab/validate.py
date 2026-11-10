"""Independent validation job for a finished run directory.

Trusts nothing in ``result.json`` or ``report.html``: it re-derives every number
from the raw ledger, checks the hash chain and artifact hashes, and can re-run
the whole experiment from the recorded config to confirm the logical digest.
"""

from hashlib import sha256
import json
from pathlib import Path

from ..runtime.contracts import canonical
from .hidden import FAMILIES
from .ledger import events, logical_digest, read_ledger, verify_chain
from .protocol import VARIANTS, VERDICTS, grader_source_hash
from .runner import run_experiment, summarize

VALIDATION_SCHEMA = "GenesisLabValidation/1.0"
ARTIFACTS = ("ledger.jsonl", "result.json", "report.html")


def file_hash(path: Path) -> str:
    return sha256(Path(path).read_bytes()).hexdigest()


def _differences(expected, actual, path="result") -> list[str]:
    if isinstance(expected, dict) and isinstance(actual, dict):
        found = []
        for key in sorted(set(expected) | set(actual)):
            if key not in expected or key not in actual:
                found.append(f"{path}.{key} is missing on one side")
            else:
                found += _differences(expected[key], actual[key], f"{path}.{key}")
            if len(found) >= 5:
                break
        return found
    return [] if canonical(expected) == canonical(actual) else [
        f"{path} does not match the value recomputed from the ledger"]


def _completeness(records: list[dict]) -> list[str]:
    start = events(records, "run_started")[0]
    config, problems = start["config"], []
    seen: dict = {}
    for event in events(records):
        if event.get("type") in ("decision", "episode"):
            key = (event["partition"], event["family"], event["variant"], event["seed"],
                   event["policy"])
            counts = seen.setdefault(key, [0, 0])
            counts[event["type"] == "episode"] += 1
    expected = 0
    for partition in start["partitions"]:
        part = config["partitions"][partition]
        for family in config["families"]:
            for variant in VARIANTS:
                for seed in range(part["start_seed"], part["start_seed"] + part["episodes"]):
                    for policy in config["policies"]:
                        expected += 1
                        got = seen.get((partition, family, variant, seed, policy))
                        if got != [FAMILIES[family].horizon, 1]:
                            problems.append(
                                f"missing or partial episode {partition}/{family}/"
                                f"{variant}/{seed}/{policy}")
                            if len(problems) >= 5:
                                return problems
    if len(seen) != expected:
        problems.append("ledger holds episodes outside the scheduled matched design")
    return problems


def validate_run(run_dir: str | Path, *, reproduce: bool = False) -> dict:
    run_dir, problems, checks = Path(run_dir), [], {}

    def check(name: str, found: list[str]) -> None:
        checks[name] = "ok" if not found else "failed"
        problems.extend(found)

    missing = [name for name in (*ARTIFACTS, "manifest.json")
               if not (run_dir / name).is_file()]
    if missing:
        return {"schema": VALIDATION_SCHEMA, "valid": False, "reproduced": None,
                "checks": {"artifacts_present": "failed"},
                "problems": [f"missing artifact {name}" for name in missing]}
    try:
        manifest = json.loads((run_dir / "manifest.json").read_text("utf-8"))
        reported = json.loads((run_dir / "result.json").read_text("utf-8"))
        records = read_ledger(run_dir / "ledger.jsonl")
        html = (run_dir / "report.html").read_text("utf-8")
    except (ValueError, OSError) as error:
        return {"schema": VALIDATION_SCHEMA, "valid": False, "reproduced": None,
                "checks": {"artifacts_readable": "failed"},
                "problems": [f"unreadable artifact: {type(error).__name__}"]}

    check("artifact_hashes", [
        f"{name} does not match its manifest hash" for name in ARTIFACTS
        if manifest.get("sha256", {}).get(name) != file_hash(run_dir / name)])
    chain = verify_chain(records)
    check("ledger_hash_chain", chain)
    recomputed = None
    if not chain:
        try:
            recomputed = summarize(records)
        except (ValueError, KeyError, TypeError) as error:
            check("ledger_recomputation", [f"ledger cannot be summarized: {error}"])
    if recomputed is not None:
        check("ledger_recomputation", _differences(recomputed, reported))
        end = events(records, "run_completed")[0]
        digest = logical_digest(records)
        check("logical_digest", [] if digest == end["logical_digest"] == reported.get(
            "logical_digest") else ["logical digest does not match the ledger rows"])
        check("matched_design_complete",
              _completeness(records) if end["status"] == "completed" else [])
        rows = [e for e in events(records, "decision")]
        invariants = []
        if recomputed["verdict"] not in VERDICTS:
            invariants.append("unknown verdict label")
        if end["status"] != "completed" and recomputed["verdict"] != "BLOCKED":
            invariants.append("an incomplete run must be BLOCKED")
        if any(row["model_calls"] for row in rows) or recomputed["labels"][
                "model_inference_calls"]:
            invariants.append("model calls reported in a run that configures no model")
        if any(part["gate"]["promoted"] or not part["gate"]["human_review_required"]
               for part in recomputed["partitions"].values()):
            invariants.append("a gate claims promotion without human review")
        if recomputed["not_measured"]["product_value"].get("status") != "not_measured":
            invariants.append("product value must stay not_measured for synthetic runs")
        check("research_only_invariants", invariants)
        start = events(records, "run_started")[0]
        check("grader_unchanged", [] if start["grader_source_hash"] == grader_source_hash()
              else ["grader code differs from the code that judged this run"])
        marker = f'data-verdict="{recomputed["verdict"]}"'
        check("report_integrity", [
            text for text, present in (
                ("report verdict label does not match the ledger", marker in html
                 and html.count("data-verdict=") == 1),
                ("report does not carry this run id", start["run_id"] in html),
                ("report does not carry the logical digest", digest in html),
            ) if not present])

    reproduced = None
    if reproduce and recomputed is not None and not problems:
        start = events(records, "run_started")[0]
        again, _ = run_experiment(start["config"], tuple(start["partitions"]))
        reproduced = again["logical_digest"] == recomputed["logical_digest"] and all(
            canonical(again["partitions"][p]["scorecard"]) == canonical(
                recomputed["partitions"][p]["scorecard"]) for p in start["partitions"])
        check("independent_reproduction", [] if reproduced else [
            "re-running the recorded config produced different logical outcomes"])
    return {
        "schema": VALIDATION_SCHEMA, "valid": not problems, "reproduced": reproduced,
        "checks": checks, "problems": problems,
        "run_id": reported.get("run", {}).get("run_id"),
        "logical_digest": recomputed["logical_digest"] if recomputed else None,
        "verdict": recomputed["verdict"] if recomputed else None,
        "note": "Validation confirms the report matches its ledger and replays "
                "identically. It does not make a synthetic result real-world evidence.",
    }
