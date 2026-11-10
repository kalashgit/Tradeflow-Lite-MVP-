"""AION Genesis v1.0 typed, versioned runtime contracts.

Research-only. These records describe observations, owner goals, decision
requests, reviewable proposals, supplied outcomes and experiment runs. None of
them can execute an action: a proposal is always a draft awaiting a human and
the host product's own permissioned command system.
"""

from dataclasses import dataclass, fields
from hashlib import sha256
import json
import math
import re

from ..situation_engine import Observation

SCHEMA_VERSION = "1.0"
ENGINE_VERSION = "aion-genesis-runtime-1.0.0"

# Same identifier grammar as the v0.8 situation ledger, so existing event ids
# migrate without rewriting.
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}\Z")
GOAL = re.compile(r"[a-z][a-z0-9_]{0,49}\Z")

PENDING_HUMAN_REVIEW = "pending_human_review"
ABSTAINED = "abstained_no_action_proposed"
RESEARCH_MODE = "synthetic_research"
CAPABILITIES = frozenset({
    "deterministic_fast_path", "bounded_search", "model_advice", "outcome_memory",
    "contextual_outcome_memory", "hybrid_outcome_memory",
})
_LIMIT = 10**9


def canonical(value) -> str:
    """Deterministic JSON used for digests, storage and replay comparison."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value, length: int = 16) -> str:
    return sha256(canonical(value).encode("utf-8")).hexdigest()[:length]


def plain(value):
    """Normalise nested tuples/dataclass output into JSON-native containers."""
    return json.loads(canonical(value))


def _identifier(name: str, value) -> None:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise ValueError(f"Invalid {name}")


def _number(name: str, value, *, low: float = -_LIMIT, high: float = _LIMIT) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{name} is out of bounds")


def _tick(name: str, value) -> None:
    if type(value) is not int or not 0 <= value <= 10**12:
        raise ValueError(f"Invalid {name}")


def _effects(name: str, value) -> None:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a mapping")
    for key, number in value.items():
        if not isinstance(key, str) or not GOAL.fullmatch(key):
            raise ValueError(f"{name} uses an invalid objective name")
        _number(f"{name}.{key}", number)


class _Contract:
    """JSON round-trip shared by every versioned record."""

    SCHEMA = ""
    _TUPLES: tuple[str, ...] = ()

    def to_json(self) -> dict:
        body = {f.name: plain(getattr(self, f.name)) for f in fields(self)}
        body["schema"] = self.SCHEMA
        return body

    @classmethod
    def from_json(cls, payload):
        if not isinstance(payload, dict) or payload.get("schema") != cls.SCHEMA:
            raise ValueError(f"Expected a {cls.SCHEMA} record")
        names = {f.name for f in fields(cls)}
        unknown = set(payload) - names - {"schema"}
        if unknown:
            raise ValueError(f"Unknown {cls.SCHEMA} fields: {sorted(unknown)}")
        values = {k: v for k, v in payload.items() if k != "schema"}
        for name in cls._TUPLES:
            if isinstance(values.get(name), list):
                values[name] = tuple(values[name])
        return cls(**values)

    def digest(self) -> str:
        return digest(self.to_json())


@dataclass(frozen=True)
class ObservationV1(_Contract):
    """One typed, source-linked fact. ``value is None`` means explicitly unknown."""

    event_id: str
    tenant_id: str
    domain_id: str
    scope_id: str
    subject_id: str
    metric: str
    value: int | float | None
    source_revision: int
    observed_at: int
    provenance: str = "synthetic"
    visibility: str = "tenant"
    department: str = "general"
    corrects_event_id: str | None = None

    SCHEMA = "ObservationV1/1.0"

    def __post_init__(self):
        for name in ("event_id", "tenant_id", "domain_id", "scope_id",
                     "subject_id", "metric", "department"):
            _identifier(name, getattr(self, name))
        if self.value is not None:
            _number("value", self.value)
        _tick("source_revision", self.source_revision)
        _tick("observed_at", self.observed_at)
        if self.provenance != "synthetic":
            raise ValueError("v1.0 admits only explicitly labeled synthetic observations")
        if self.visibility not in ("tenant", "restricted"):
            raise ValueError("Invalid visibility")
        if self.corrects_event_id is not None:
            _identifier("corrects_event_id", self.corrects_event_id)
            if self.corrects_event_id == self.event_id:
                raise ValueError("An observation cannot correct itself")

    @property
    def fact_key(self) -> tuple[str, str, str, str, str]:
        return (self.tenant_id, self.domain_id, self.scope_id, self.subject_id, self.metric)

    @classmethod
    def from_legacy(cls, legacy: Observation, domain_id: str) -> "ObservationV1":
        """Compatible, non-destructive upgrade of a v0.8 observation."""
        return cls(
            event_id=legacy.event_id, tenant_id=legacy.tenant_id, domain_id=domain_id,
            scope_id=legacy.scope_id, subject_id=legacy.subject_id, metric=legacy.metric,
            value=legacy.value, source_revision=legacy.tick, observed_at=legacy.tick,
            provenance=legacy.provenance, department=legacy.department,
        )

    def to_legacy(self) -> Observation:
        """Downgrade for v0.8/v0.9 domain code; unknown or fractional facts cannot pass."""
        if type(self.value) is not int:
            raise ValueError("Only known integer facts map to the v0.8 observation schema")
        return Observation(
            tenant_id=self.tenant_id, event_id=self.event_id, tick=self.observed_at,
            scope_id=self.scope_id, subject_id=self.subject_id,
            department=self.department, metric=self.metric, value=self.value,
            provenance=self.provenance,
        )


@dataclass(frozen=True)
class GoalProfileV1(_Contract):
    """Explicit owner priorities. Hard constraints outrank every goal weight."""

    tenant_id: str
    domain_id: str
    goal_weights: dict
    hard_constraints: dict
    risk_tolerance: float
    decision_deadline: int | None
    owner_preference_version: int

    SCHEMA = "GoalProfileV1/1.0"

    def __post_init__(self):
        _identifier("tenant_id", self.tenant_id)
        _identifier("domain_id", self.domain_id)
        weights = self.goal_weights
        if not isinstance(weights, dict) or not weights:
            raise ValueError("Owner priorities must be explicit")
        for name, weight in weights.items():
            if not isinstance(name, str) or not GOAL.fullmatch(name):
                raise ValueError("Invalid owner objective")
            if type(weight) is not int or not 0 <= weight <= 5:
                raise ValueError("Goal weights must be integers 0–5")
        constraints = self.hard_constraints
        if not isinstance(constraints, dict) or set(constraints) - {
                "max_spend", "forbidden_choices"}:
            raise ValueError("Unsupported hard constraint")
        if "max_spend" not in constraints:
            raise ValueError("An explicit spending bound is required")
        _number("max_spend", constraints["max_spend"], low=0)
        forbidden = constraints.get("forbidden_choices", [])
        if not isinstance(forbidden, (list, tuple)) or len(forbidden) > 50:
            raise ValueError("Invalid forbidden choices")
        for item in forbidden:
            if not isinstance(item, str) or item.count("=") != 1 or not all(item.split("=")):
                raise ValueError("Forbidden choices are written as axis=choice")
        _number("risk_tolerance", self.risk_tolerance, low=0, high=1)
        if self.decision_deadline is not None:
            _tick("decision_deadline", self.decision_deadline)
        if type(self.owner_preference_version) is not int or self.owner_preference_version < 1:
            raise ValueError("Invalid owner preference version")

    @property
    def max_spend(self) -> float:
        return float(self.hard_constraints["max_spend"])

    @property
    def forbidden_choices(self) -> frozenset[tuple[str, str]]:
        return frozenset(tuple(item.split("=")) for item in
                         self.hard_constraints.get("forbidden_choices", []))

    @property
    def uncertainty_aversion(self) -> float:
        """Map 0–1 risk tolerance onto the v0.9 planner's 0–2 aversion scale."""
        return round(2 * (1 - self.risk_tolerance), 6)


@dataclass(frozen=True)
class DecisionRequestV1(_Contract):
    request_id: str
    case_id: str
    tenant_id: str
    domain_id: str
    scope_id: str
    as_of: int
    observation_refs: tuple[str, ...] = ()
    goal_profile_ref: int | None = None
    available_capabilities: tuple[str, ...] = ("deterministic_fast_path", "bounded_search")
    time_budget_ms: int = 2000
    model_call_budget: int = 0
    compute_budget: int = 256
    research_mode: str = RESEARCH_MODE
    requested_option: str | None = None

    SCHEMA = "DecisionRequestV1/1.0"
    _TUPLES = ("observation_refs", "available_capabilities")

    def __post_init__(self):
        for name in ("request_id", "case_id", "tenant_id", "domain_id", "scope_id"):
            _identifier(name, getattr(self, name))
        _tick("as_of", self.as_of)
        object.__setattr__(self, "observation_refs", tuple(self.observation_refs))
        object.__setattr__(self, "available_capabilities",
                           tuple(self.available_capabilities))
        if len(self.observation_refs) > 200 or len(set(self.observation_refs)) != len(
                self.observation_refs):
            raise ValueError("Observation references must be unique and bounded")
        for ref in self.observation_refs:
            _identifier("observation reference", ref)
        capabilities = set(self.available_capabilities)
        if not capabilities or capabilities - CAPABILITIES:
            # There is deliberately no "execute" capability to request.
            raise ValueError("Unknown or unauthorized runtime capability")
        if not capabilities & {"deterministic_fast_path", "bounded_search"}:
            raise ValueError("A reasoning route is required")
        if self.goal_profile_ref is not None and (
                type(self.goal_profile_ref) is not int or self.goal_profile_ref < 1):
            raise ValueError("Invalid goal profile reference")
        if type(self.time_budget_ms) is not int or not 1 <= self.time_budget_ms <= 600_000:
            raise ValueError("Invalid time budget")
        if type(self.model_call_budget) is not int or not 0 <= self.model_call_budget <= 20:
            raise ValueError("Invalid model call budget")
        if type(self.compute_budget) is not int or not 1 <= self.compute_budget <= 1000:
            raise ValueError("Invalid compute budget")
        if self.research_mode != RESEARCH_MODE:
            raise ValueError("v1.0 runs only in synthetic research mode")
        if self.requested_option is not None and (
                not isinstance(self.requested_option, str)
                or not 1 <= len(self.requested_option) <= 200):
            raise ValueError("Invalid requested option")


@dataclass(frozen=True)
class DecisionProposalV1(_Contract):
    """A reviewable draft or an explicit abstention. Never an executed action."""

    proposal_id: str
    request_id: str
    case_id: str
    tenant_id: str
    domain_id: str
    scope_id: str
    as_of: int
    route: str
    candidate_options: tuple
    selected_option: dict | None
    expected_effects: dict
    uncertainty: dict
    constraints_checked: tuple
    evidence_refs: tuple
    alternatives: tuple
    abstention_reason: str | None
    approval_state: str
    trace_id: str
    known_unknowns: tuple = ()
    goal_profile_version: int | None = None
    memory: dict | None = None
    model: dict | None = None
    budgets: dict | None = None
    engine_version: str = ENGINE_VERSION
    domain_version: str = ""
    research_mode: str = RESEARCH_MODE
    external_actions: int = 0
    effects_are_estimates_not_observed_results: bool = True

    SCHEMA = "DecisionProposalV1/1.0"
    _TUPLES = ("candidate_options", "constraints_checked", "evidence_refs",
               "alternatives", "known_unknowns")

    def __post_init__(self):
        for name in self._TUPLES:
            object.__setattr__(self, name, tuple(getattr(self, name)))
        if self.external_actions != 0:
            raise ValueError("The runtime has no authority to act")
        if self.selected_option is None:
            if self.approval_state != ABSTAINED or not self.abstention_reason:
                raise ValueError("An abstention needs an explicit reason")
        elif self.approval_state != PENDING_HUMAN_REVIEW or self.abstention_reason:
            raise ValueError("A proposal must await human review")
        _effects("expected_effects", self.expected_effects)
        _effects("uncertainty", self.uncertainty)

    @property
    def abstained(self) -> bool:
        return self.selected_option is None


@dataclass(frozen=True)
class OutcomeRecordV1(_Contract):
    """A supplied receipt of what happened. The runtime never invents one."""

    outcome_id: str
    proposal_id: str
    tenant_id: str
    domain_id: str
    chosen_action_ref: str
    observed_effects: dict
    receipt_ref: str
    evidence_ref: str
    observation_time: int
    verified: bool
    uncertainty: dict | None = None
    source: str = "synthetic_simulator"

    SCHEMA = "OutcomeRecordV1/1.0"

    def __post_init__(self):
        for name in ("outcome_id", "proposal_id", "tenant_id", "domain_id",
                     "receipt_ref", "evidence_ref"):
            _identifier(name, getattr(self, name))
        if not isinstance(self.chosen_action_ref, str) or not 1 <= len(
                self.chosen_action_ref) <= 200:
            raise ValueError("Invalid chosen action reference")
        _effects("observed_effects", self.observed_effects)
        if self.uncertainty is not None:
            _effects("uncertainty", self.uncertainty)
        _tick("observation_time", self.observation_time)
        if type(self.verified) is not bool:
            raise ValueError("verified must be explicit")
        if self.source != "synthetic_simulator":
            raise ValueError("v1.0 admits only explicitly labeled synthetic outcomes")


@dataclass(frozen=True)
class ExperimentRunV1(_Contract):
    """Immutable description of one laboratory run and its independent verdict."""

    run_id: str
    source_commit: str
    candidate_version: str
    baseline_version: str
    domain_version: dict
    world_family: tuple
    seed_partition: dict
    grader_version: str
    model_identity: str
    memory_mode: str
    budgets: dict
    metrics: dict
    failure_classes: dict
    artifact_hashes: dict
    verdict: str

    SCHEMA = "ExperimentRunV1/1.0"
    _TUPLES = ("world_family",)

    def __post_init__(self):
        object.__setattr__(self, "world_family", tuple(self.world_family))
        if self.verdict not in ("PASS", "FAIL", "INCONCLUSIVE", "BLOCKED"):
            raise ValueError("Unknown experiment verdict")
