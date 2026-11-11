"""Paired corrective replay research contract, NOT a model trainer or grader.

Independent evaluator supplies episode results and causal attribution evidence.
This cannot itself prove a lesson: a candidate cannot certify its own feedback.
"""
from dataclasses import dataclass
import re

_TOKEN = re.compile(r"[A-Za-z0-9_.:/-]{1,160}\Z")
_STATES = frozenset({"verified_success", "verified_failure", "censored_pending", "unknown"})
_SPLITS = frozenset({"dev", "validation", "holdout"})


def _token(value):
    return isinstance(value, str) and bool(_TOKEN.fullmatch(value))


@dataclass(frozen=True)
class Episode:
    scope: str
    world_version: str
    scenario_digest: str
    initial_state_digest: str
    seed: int
    split: str
    strategy_id: str
    outcome: str
    utility: int
    receipt_ref: str
    denied_attempts: int = 0
    unauthorized_writes: int = 0

    def __post_init__(self):
        if not all(_token(x) for x in (self.scope, self.world_version,
                                      self.scenario_digest, self.initial_state_digest,
                                      self.strategy_id, self.receipt_ref)):
            raise ValueError("Missing scoped replay provenance")
        if self.split not in _SPLITS or self.outcome not in _STATES:
            raise ValueError("Invalid split or verification state")
        if (type(self.seed) is not int or self.seed < 0
                or type(self.utility) is not int
                or type(self.denied_attempts) is not int or self.denied_attempts < 0
                or type(self.unauthorized_writes) is not int
                or self.unauthorized_writes < 0):
            raise ValueError("Invalid replay measurement")


@dataclass(frozen=True)
class CorrectionAssessment:
    comparable: bool
    recovered: bool
    utility_delta: int | None
    safe: bool
    eligible_for_causal_review: bool
    reason: str
    scope: str
    world_version: str
    revised_strategy: str


class PairedCorrectionGate:
    """Reject incomparable, censored, unsafe and non-corrective comparisons.

    This gate is only meaningful when each episode and receipt come from an
    independent evaluator rather than the candidate's self-generated claims.
    """

    @staticmethod
    def compare(before: Episode, after: Episode) -> CorrectionAssessment:
        baseline = (before.scope, before.world_version, before.scenario_digest,
                    before.initial_state_digest, before.seed, before.split)
        replay = (after.scope, after.world_version, after.scenario_digest,
                  after.initial_state_digest, after.seed, after.split)
        if baseline != replay:
            raise ValueError("Corrective replay must reset the exact same world")
        if before.receipt_ref == after.receipt_ref:
            raise ValueError("Distinct replays require independent receipt references")
        safe = (before.unauthorized_writes == 0 and after.unauthorized_writes == 0
                and after.denied_attempts <= before.denied_attempts)
        if (before.outcome not in ("verified_success", "verified_failure")
                or after.outcome not in ("verified_success", "verified_failure")):
            return CorrectionAssessment(False, False, None, safe, False,
                                        "outcome_not_verified", before.scope,
                                        before.world_version, after.strategy_id)
        delta = after.utility - before.utility
        recovered = (before.outcome == "verified_failure"
                     and after.outcome == "verified_success" and delta > 0)
        if not safe:
            reason = "safety_regression"
        elif before.strategy_id == after.strategy_id:
            reason = "no_strategy_change"
        elif not recovered:
            reason = "recovery_not_demonstrated"
        elif before.split != "dev":
            reason = "evaluation_split_not_training"
        else:
            reason = "candidate_for_independent_causal_review"
        eligible = (reason == "candidate_for_independent_causal_review")
        return CorrectionAssessment(True, recovered, delta, safe, eligible,
                                    reason, before.scope, before.world_version,
                                    after.strategy_id)


@dataclass(frozen=True)
class StrategyLesson:
    scope: str
    world_version: str
    strategy_id: str
    required_context: tuple[tuple[str, str], ...]
    causal_evidence_ref: str
    source_receipt_ref: str


class ConditionalLessonStore:
    """Development-only candidate memory; external reviewer must attest evidence.

    A source-reference string is NOT itself independent verification. This class
    never grants authority and MUST NOT be used as a production trust boundary.
    """

    def __init__(self, scope: str):
        if not _token(scope):
            raise ValueError("Invalid scope")
        self.scope = scope
        self._lessons: list[StrategyLesson] = []

    def admit(self, assessment: CorrectionAssessment, *, causal_evidence_ref: str,
              source_receipt_ref: str,
              required_context: tuple[tuple[str, str], ...]) -> StrategyLesson:
        if assessment.scope != self.scope:
            raise PermissionError("Cross-scope lesson")
        if not assessment.eligible_for_causal_review:
            raise ValueError("Failed or unchecked correction cannot teach memory")
        if (not _token(causal_evidence_ref) or not _token(source_receipt_ref)
                or causal_evidence_ref == source_receipt_ref):
            raise ValueError("Separate causal evidence required")
        if (not required_context or any(
                len(pair) != 2 or not all(_token(v) for v in pair)
                for pair in required_context)):
            raise ValueError("Explicit context boundary required")
        lesson = StrategyLesson(self.scope, assessment.world_version,
                                assessment.revised_strategy,
                                tuple(sorted(required_context)),
                                causal_evidence_ref, source_receipt_ref)
        if lesson in self._lessons:
            raise ValueError("Duplicate admitted lesson")
        self._lessons.append(lesson)
        return lesson

    def retrieve(self, *, scope: str, world_version: str,
                 verified_context: dict[str, str], regime_shift: bool = False
                 ) -> tuple[StrategyLesson, ...]:
        if scope != self.scope:
            raise PermissionError("Cross-scope memory retrieval")
        if regime_shift:
            return ()
        return tuple(l for l in self._lessons
                     if l.world_version == world_version
                     and all(verified_context.get(k) == v
                             for k, v in l.required_context))
