"""Universal learning trajectory contract (versioned, validated, hashed).

A trajectory is one decision with everything needed to learn from it later.
The contract's central rule: ``model_input`` holds only what the actor could
see at decision time. Outcomes, attribution and scores live under
``verified_consequences`` and ``learning_evidence`` and may be used as labels,
never as inputs. ``validate`` rejects records that break this.
"""

from hashlib import sha256
import json
import re

SCHEMA = "GenesisLearningTrajectory/1.0"
PARTITIONS = ("train", "public_validation", "protected_test", "adversarial")
SECTIONS = {
    "environment": ("scenario_id", "family", "mechanisms", "template_lineage",
                    "world_version", "initial_state_hash", "mechanism_hash", "seed",
                    "partition", "domain_pack_version"),
    "model": ("base_model", "base_revision", "tokenizer_revision", "adapter_revision",
              "prompt_hash", "tool_schema_hash", "memory_version", "inference_settings"),
    "available_information": ("actor", "tenant_scope", "observation", "source_refs",
                              "as_of_tick", "missing", "permissions"),
    "decision": ("candidate_actions", "selected_action", "predictions", "confidence",
                 "memory_records_used", "budgets"),
    "verified_consequences": ("receipts", "direct_effects", "delayed_outcome",
                              "denied_operations", "censored", "attribution",
                              "utility", "safety"),
    "learning_evidence": ("diagnosis", "counterfactuals", "better_worse",
                          "corrective_action", "applicability", "counterexamples",
                          "evidence_quality"),
    "provenance": ("source_trace_hash", "verifier_version", "training_eligible",
                   "ineligible_reason", "data_permissions", "checkpoint_lineage"),
}
# Words that may only appear on the label side of a record.
HIDDEN_KEYS = frozenset({
    "shocks", "source_truth", "final_truth", "hidden", "oracle", "judge", "score",
    "utility", "paid_jobs", "synthetic_value_proxy", "delayed_outcome", "counterfactuals",
    "better_worse", "acceptable", "label", "future", "global_truth_state"})
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:+-]{0,119}\Z")


def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def content_hash(value) -> str:
    return sha256(canonical(value).encode("utf-8")).hexdigest()


def _keys(value):
    if isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _keys(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _keys(item)


def leaked_keys(model_input) -> list[str]:
    """Hidden-side field names present anywhere in a model-visible structure."""
    return sorted(set(_keys(model_input)) & HIDDEN_KEYS)


def validate(record: dict) -> dict:
    """Raise ValueError unless the record is a complete, leak-free trajectory."""
    if not isinstance(record, dict) or record.get("schema") != SCHEMA:
        raise ValueError("Not a " + SCHEMA + " record")
    extra = set(record) - set(SECTIONS) - {"schema", "trajectory_id", "checksum"}
    if extra:
        raise ValueError(f"Unknown trajectory sections: {sorted(extra)}")
    for section, fields in SECTIONS.items():
        body = record.get(section)
        if not isinstance(body, dict) or set(body) != set(fields):
            raise ValueError(f"Section {section} must hold exactly {sorted(fields)}")
    env, info, prov = record["environment"], record["available_information"], \
        record["provenance"]
    if env["partition"] not in PARTITIONS:
        raise ValueError("Unknown partition")
    for name in ("scenario_id", "family", "world_version", "template_lineage"):
        if not isinstance(env[name], str) or not _ID.fullmatch(env[name]):
            raise ValueError(f"Invalid environment.{name}")
    if not isinstance(env["mechanisms"], list) or not env["mechanisms"]:
        raise ValueError("A trajectory must name its causal mechanisms")
    leaks = leaked_keys(info["observation"]) + leaked_keys(record["decision"]["predictions"])
    if leaks:
        raise ValueError(f"Hidden information in model-visible input: {leaks}")
    if info["observation"].get("global_truth") is not False:
        raise ValueError("Observation must be an explicitly scoped role view")
    if type(prov["training_eligible"]) is not bool:
        raise ValueError("Training eligibility must be explicit")
    consequences = record["verified_consequences"]
    if prov["training_eligible"]:
        if env["partition"] != "train":
            raise ValueError("Only the train partition may be training-eligible")
        if consequences["censored"] or not consequences["receipts"]:
            raise ValueError("Censored or receipt-free outcomes cannot be trusted labels")
        if prov["ineligible_reason"] is not None:
            raise ValueError("An eligible record cannot carry an ineligibility reason")
    elif not prov["ineligible_reason"]:
        raise ValueError("An ineligible record must say why")
    body = {k: v for k, v in record.items() if k not in ("trajectory_id", "checksum")}
    digest = content_hash(body)
    if record.get("checksum") != digest or record.get("trajectory_id") != "TRJ-" + digest[:24]:
        raise ValueError("Trajectory checksum or identifier does not match its content")
    return record


def seal(record: dict) -> dict:
    """Attach the content-derived identifier and checksum, then validate."""
    body = {k: v for k, v in record.items() if k not in ("trajectory_id", "checksum")}
    body["schema"] = SCHEMA
    digest = content_hash(body)
    return validate({**body, "trajectory_id": "TRJ-" + digest[:24], "checksum": digest})


def write_jsonl(path, records) -> str:
    """Write records and return the file's content hash (the dataset identity)."""
    digest = sha256()
    with open(path, "w", encoding="utf-8") as handle:
        for record in records:
            line = canonical(record) + "\n"
            handle.write(line)
            digest.update(line.encode("utf-8"))
    return digest.hexdigest()


def read_jsonl(path) -> list[dict]:
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def file_hash(path) -> str:
    digest = sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()
