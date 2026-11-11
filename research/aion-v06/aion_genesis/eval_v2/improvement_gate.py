"""Non-executable improvement proposals from independently replayed research.

This module never modifies source, prompts, weights, external tools or stored
policy state. It cannot promote a model or access a protected holdout. Claude
may use a proposal as an evidence-linked draft engineering ticket only.
"""

from dataclasses import dataclass, asdict
from hashlib import sha256
import json
import re

TYPES = frozenset(("belief_state_estimator", "planning_objective",
                   "outcome_memory_hypothesis", "workflow_recovery",
                   "information_routing"))
_SHA = re.compile(r"^[0-9a-f]{40}$")
_CASE = re.compile(r"^SYN-CAUSAL-DEV-[A-Za-z0-9_-]{10,150}$")


def _hash(x):
    return sha256(json.dumps(x, sort_keys=True,
                             separators=(",", ":")).encode()).hexdigest()


@dataclass(frozen=True)
class ImprovementHypothesis:
    baseline_sha: str
    proposed_kind: str
    development_cases: tuple[str, ...]
    receipt_refs: tuple[str, ...]
    explanation: str
    predicted_diagnostic: str
    falsifying_condition: str
    fallback: str

    def __post_init__(self):
        if not _SHA.fullmatch(self.baseline_sha) or self.proposed_kind not in TYPES:
            raise ValueError("Pin proposal to exact commit and a restricted strategy area")
        if (not 1 <= len(self.development_cases) <= 30 or
                not all(isinstance(x, str) and _CASE.fullmatch(x)
                        for x in self.development_cases)):
            raise ValueError("Only synthetic development evidence can motivate changes")
        if not 1 <= len(self.receipt_refs) <= 50 or not all(
                isinstance(x, str) and x.startswith(("SYN-", "PROP-", "TRACE-"))
                and len(x) <= 120 for x in self.receipt_refs):
            raise ValueError("A candidate change needs source-linked research receipts")
        for value in (self.explanation, self.predicted_diagnostic,
                      self.falsifying_condition, self.fallback):
            if not isinstance(value, str) or not 12 <= len(value) <= 1000:
                raise ValueError("A falsifiable, bounded change proposal is required")


def prepare_draft(hypothesis, *, replay_ok=False, independent_review=False):
    if not isinstance(hypothesis, ImprovementHypothesis):
        raise ValueError("Invalid typed improvement hypothesis")
    body = {
        "schema": "GenesisRestrictedImprovementDraft/2.4",
        "hypothesis": asdict(hypothesis),
        "original_benchmark_immutable": True,
        "allowed_change_family": hypothesis.proposed_kind,
        "simulation_only": True,
        "verified_development_replay": bool(replay_ok),
        "claim_of_independent_review": bool(independent_review),
        "status": "DRAFT_NOT_AUTHORIZED",
        "apply_automatically": False,
        "write_production": False,
        "promotion_eligible": False,
        "missing_gates": [
            "isolated_candidate_implementation_and_new_SHA",
            "independent_safety_regressions",
            "untouched_control_comparison",
            "externally_custodied_holdout",
            "actual_human_scientific_and_security_review",
            "separate_manual_release_authorization",
        ],
    }
    body["digest"] = _hash(body)
    return body


def apply_improvement(*args, **kwargs):
    raise PermissionError("Improvement drafts cannot mutate model/code/production")


def promote_candidate(*args, **kwargs):
    raise PermissionError("Real independent gates and explicit release are required")
