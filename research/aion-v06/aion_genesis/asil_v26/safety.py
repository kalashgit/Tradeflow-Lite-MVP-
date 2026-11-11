"""Independent research gates for decisions based on possibly stale experience.

These objects DO NOT grant permissions. ``AuthorityEvidence`` must be supplied
by a separate, trusted authorization/receipt port and checked again atomically
by the real command executor. In particular a model's own opinion, a familiar
strategy, or absence of a revocation message is not authority evidence.

The objects are intentionally not wired into the v2.5 policy: the old
preregistered candidate and its test cohorts remain immutable reference data.
"""

from dataclasses import dataclass
import re

_SCOPE = re.compile(r"[A-Za-z0-9_.:-]{1,80}\Z")
_REF = re.compile(r"[A-Za-z0-9_.:/-]{1,160}\Z")
_KINDS = frozenset({
    "denied_action", "surprise", "contradiction", "approval_delay",
    "vendor_anomaly", "unexpected_transition", "evidence_delay",
})
_CRITICAL = frozenset({"denied_action", "unexpected_transition", "contradiction"})


@dataclass(frozen=True)
class RegimeEvent:
    scope: str
    kind: str
    event_tick: int
    observed_tick: int
    source_ref: str

    def __post_init__(self):
        if not _SCOPE.fullmatch(self.scope) or self.kind not in _KINDS:
            raise ValueError("Unknown regime event scope or kind")
        if (type(self.event_tick) is not int or type(self.observed_tick) is not int
                or self.event_tick < 0 or self.observed_tick < self.event_tick):
            raise ValueError("Regime evidence has an invalid timestamp")
        if not _REF.fullmatch(self.source_ref):
            raise ValueError("Regime evidence requires an opaque source reference")


@dataclass(frozen=True)
class RegimeAssessment:
    state: str
    reasons: tuple[str, ...]
    source_refs: tuple[str, ...]


class RegimeShiftDetector:
    """A bounded signal detector reading only timestamped permitted evidence.

    No unobserved simulator shocks, tenant data, or future events are accepted.
    Critical observed signals veto the fast path; two weaker independent
    signals (or observed evidence that arrived unusually late) suspect a shift.
    """

    def __init__(self, scope: str, *, window_ticks: int = 5, lag_limit: int = 2):
        if not _SCOPE.fullmatch(scope) or window_ticks < 1 or lag_limit < 0:
            raise ValueError("Invalid detector configuration")
        self.scope, self.window_ticks, self.lag_limit = scope, window_ticks, lag_limit
        self._events: list[RegimeEvent] = []
        self._seen: set[str] = set()

    def observe(self, event: RegimeEvent):
        if event.scope != self.scope:
            raise PermissionError("Cross-scope regime evidence rejected")
        if event.source_ref in self._seen:
            raise ValueError("Repeated regime evidence reference")
        self._seen.add(event.source_ref)
        self._events.append(event)

    def assess(self, as_of_tick: int) -> RegimeAssessment:
        if type(as_of_tick) is not int or as_of_tick < 0:
            raise ValueError("Invalid assessment timestamp")
        recent = [e for e in self._events
                  if e.observed_tick <= as_of_tick
                  and as_of_tick - e.observed_tick <= self.window_ticks]
        kinds = {e.kind for e in recent}
        delayed = any(e.observed_tick - e.event_tick > self.lag_limit for e in recent)
        critical = kinds.intersection(_CRITICAL)
        if critical:
            state = "shift"
        elif len(kinds) >= 2 or delayed:
            state = "suspected"
        else:
            state = "normal"
        reasons = sorted(kinds)
        if delayed:
            reasons.append("late_evidence")
        return RegimeAssessment(state, tuple(reasons),
                                tuple(sorted(e.source_ref for e in recent)))


@dataclass(frozen=True)
class ActionIntent:
    scope: str
    actor: str
    subject: str
    capability: str
    tick: int
    revision: int
    cash_available: int
    cash_needed: int
    crew_available: int
    crew_needed: int
    route: str

    def __post_init__(self):
        if (not all(_SCOPE.fullmatch(s) for s in
                    (self.scope, self.actor, self.subject, self.capability))
                or self.route not in ("fast", "deep", "reflex")):
            raise ValueError("Invalid bounded action intent")
        for value in (self.tick, self.revision, self.cash_available,
                      self.cash_needed, self.crew_available, self.crew_needed):
            if type(value) is not int or value < 0:
                raise ValueError("Invalid intent resource or revision")


@dataclass(frozen=True)
class AuthorityEvidence:
    """Opaque, scoped result from a trusted authorization port, NOT a token.

    The caller must authenticate the port and execute under the same revision.
    A grant is meaningful only within the current tick and exact scope/actor/
    subject/capability. Constructing this object confers no real permission.
    """

    scope: str
    actor: str
    subject: str
    capability: str
    revision: int
    checked_tick: int
    state: str
    source_ref: str

    def __post_init__(self):
        if self.state not in ("granted", "denied", "unknown"):
            raise ValueError("Invalid authority state")
        if (not all(_SCOPE.fullmatch(s) for s in
                    (self.scope, self.actor, self.subject, self.capability))
                or not _REF.fullmatch(self.source_ref)
                or type(self.revision) is not int or self.revision < 0
                or type(self.checked_tick) is not int or self.checked_tick < 0):
            raise ValueError("Invalid authority evidence")


@dataclass(frozen=True)
class GuardDecision:
    admissible: bool
    reason: str
    requires_atomic_recheck: bool = True


class RiskGovernor:
    """Fail-closed precommit review. This is NOT an executable permission grant.

    The transactionally enforced command registry still performs final checks.
    An ambiguous prior commit cannot be retried, and even deep reasoning cannot
    override missing or stale authorization or insufficient capacity.
    """

    def assess(self, intent: ActionIntent, authority: AuthorityEvidence | None,
               regime: RegimeAssessment | None, *, commit_state: str = "clear") -> GuardDecision:
        if commit_state != "clear":
            return GuardDecision(False, "prior_commit_requires_receipt_reconciliation")
        if authority is None:
            return GuardDecision(False, "authoritative_grant_missing")
        if (authority.scope, authority.actor, authority.subject, authority.capability) != (
                intent.scope, intent.actor, intent.subject, intent.capability):
            return GuardDecision(False, "authority_scope_mismatch")
        if authority.state != "granted":
            return GuardDecision(False, "authority_not_granted")
        if authority.checked_tick != intent.tick or authority.revision != intent.revision:
            return GuardDecision(False, "authority_stale_or_changed")
        if intent.cash_needed > intent.cash_available:
            return GuardDecision(False, "insufficient_cash")
        if intent.crew_needed > intent.crew_available:
            return GuardDecision(False, "insufficient_crew_capacity")
        if regime is not None and regime.state != "normal" and intent.route == "fast":
            return GuardDecision(False, "shift_requires_deep_review")
        return GuardDecision(True, "eligible_for_atomic_authorization_recheck")
