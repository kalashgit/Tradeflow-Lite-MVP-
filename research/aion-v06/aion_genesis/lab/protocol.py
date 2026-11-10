"""Public laboratory protocol: versions, the frozen config contract and hashes."""

from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path

from ..domains.dependency_dispatch import DependencyDispatchAdapter
from ..domains.electrical_runtime import ElectricalProcurementAdapter
from ..domains.equipment_maintenance import EquipmentMaintenanceAdapter
from ..domains.process_tuning import ProcessTuningAdapter
from ..runtime.contracts import ObservationV1, canonical

LAB_VERSION = "genesis-lab-1.0.0"
GRADER_VERSION = "genesis-referee-1.0.0"
VERDICTS = ("PASS", "FAIL", "INCONCLUSIVE", "BLOCKED")
VARIANTS = ("nominal", "shifted")
PARTITIONS = ("dev", "validation", "holdout")
POLICIES = ("no_action", "fixed_rule", "v09_strategist", "aion_v1_memory")
SAFETY_FAILURES = ("inadmissible_action", "invalid_evidence", "invalid_proposal",
                   "policy_error")
REVEALED_V09_SEEDS = range(8000, 8200)  # already inspected; never a fresh partition
DEFAULT_CONFIG = Path(__file__).with_name("configs") / "genesis_v1_minimal.json"
_PACKAGE = Path(__file__).resolve().parent.parent
# Everything that defines grading. A change here is a new protocol version.
_GRADER_FILES = ("lab/referee.py", "lab/scorecard.py", "lab/promotion.py",
                 "lab/hidden/base.py", "lab/hidden/worlds.py", "strategic_evaluator.py")


@dataclass(frozen=True)
class PublicStep:
    """All a policy ever receives about a decision point."""

    step: int
    as_of: int
    scope_id: str
    case_id: str
    observations: tuple[ObservationV1, ...]


def adapters() -> list:
    return [ElectricalProcurementAdapter(), EquipmentMaintenanceAdapter(),
            ProcessTuningAdapter(), DependencyDispatchAdapter()]


def sha256_text(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def grader_source_hash() -> str:
    digest = sha256()
    for name in _GRADER_FILES:
        digest.update(name.encode())
        digest.update((_PACKAGE / name).read_bytes())
    return digest.hexdigest()


def _integer(value, low: int, high: int, name: str) -> int:
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"Invalid {name}")
    return value


def validate_config(config: dict) -> dict:
    """Reject anything outside the bounded, prespecified experiment contract."""
    required = {"config_version", "families", "variants", "policies", "candidate",
                "baseline", "memory_off_control", "partitions", "budgets",
                "promotion_gate"}
    if not isinstance(config, dict) or set(config) != required:
        raise ValueError("Experiment config has missing or unknown sections")
    if not config["families"] or len(set(config["families"])) != len(config["families"]):
        raise ValueError("World families must be unique and non-empty")
    if list(config["variants"]) != list(VARIANTS):
        raise ValueError("Both the nominal and the shifted variant are required")
    policies = config["policies"]
    if len(set(policies)) != len(policies) or set(policies) - set(POLICIES):
        raise ValueError("Unknown policy")
    for role in ("candidate", "baseline", "memory_off_control"):
        if config[role] not in policies:
            raise ValueError(f"The {role} must be an evaluated policy")
    if "no_action" not in policies or config["candidate"] == config["baseline"]:
        raise ValueError("A no-action reference and a distinct baseline are required")
    seen: list[range] = [REVEALED_V09_SEEDS]
    if set(config["partitions"]) != set(PARTITIONS):
        raise ValueError("dev, validation and holdout partitions are required")
    for name in PARTITIONS:
        part = config["partitions"][name]
        if set(part) != {"start_seed", "episodes"}:
            raise ValueError("Invalid seed partition")
        start = _integer(part["start_seed"], 0, 900_000, "start seed")
        span = range(start, start + _integer(part["episodes"], 2, 2000, "episode count"))
        if any(span.start < other.stop and other.start < span.stop for other in seen):
            raise ValueError("Seed partitions must be disjoint from each other and "
                             "from the revealed v0.9 fixture")
        seen.append(span)
    budgets = config["budgets"]
    if set(budgets) != {"max_decisions", "max_model_calls", "max_wall_seconds",
                        "time_budget_ms", "compute_budget"}:
        raise ValueError("Invalid budget section")
    _integer(budgets["max_decisions"], 1, 2_000_000, "decision budget")
    _integer(budgets["max_wall_seconds"], 1, 7200, "wall-time budget")
    _integer(budgets["time_budget_ms"], 11, 600_000, "per-decision time budget")
    _integer(budgets["compute_budget"], 1, 1000, "compute budget")
    if budgets["max_model_calls"] != 0:
        raise ValueError("This lab version runs no model; the call budget must be 0")
    gate = config["promotion_gate"]
    if set(gate) != {"partition", "min_relative_harm_reduction_shifted",
                     "max_relative_nominal_utility_drop", "bootstrap_resamples"}:
        raise ValueError("Invalid promotion gate")
    if gate["partition"] != "holdout":
        raise ValueError("Promotion is decided on the protected holdout only")
    for key in ("min_relative_harm_reduction_shifted", "max_relative_nominal_utility_drop"):
        if isinstance(gate[key], bool) or not isinstance(gate[key], (int, float)) or not (
                0 < gate[key] < 1):
            raise ValueError("Gate thresholds must be fractions between 0 and 1")
    _integer(gate["bootstrap_resamples"], 100, 5000, "bootstrap resamples")
    return config


def load_config(path: str | Path | None = None) -> dict:
    return validate_config(json.loads(Path(path or DEFAULT_CONFIG).read_text("utf-8")))


def config_hash(config: dict) -> str:
    return sha256_text(canonical(config))


def protocol_hash(config: dict) -> str:
    """Identity of the judging rules: grader code, worlds, seeds and thresholds."""
    return sha256_text(canonical({
        "grader_version": GRADER_VERSION, "grader_source": grader_source_hash(),
        "families": config["families"], "variants": config["variants"],
        "partitions": config["partitions"], "promotion_gate": config["promotion_gate"],
        "baseline": config["baseline"],
    }))
