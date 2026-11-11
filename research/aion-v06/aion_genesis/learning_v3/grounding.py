"""Read-only epistemic checks for Genesis v3 research.

A fact labelled host_verified MUST originate from a trusted external evidence
adapter. Constructing it here does not authenticate anything. Candidate models
cannot treat self-generated hypotheses or scenario predictions as verified facts.
"""
from dataclasses import dataclass
import re

_TOKEN = re.compile(r"[A-Za-z0-9_.:/-]{1,160}\Z")
_TRUST = frozenset({"host_verified", "reported", "inferred"})


def _token(value):
    return isinstance(value, str) and bool(_TOKEN.fullmatch(value))


@dataclass(frozen=True)
class EvidenceFact:
    scope: str
    topic: str
    value: str
    source_ref: str
    revision: int
    observed_tick: int
    expires_tick: int
    trust: str = "reported"

    def __post_init__(self):
        if not all(_token(v) for v in (self.scope, self.topic, self.value, self.source_ref)):
            raise ValueError("Evidence requires bounded opaque identifiers")
        if self.trust not in _TRUST:
            raise ValueError("Unknown evidence trust class")
        if (type(self.revision) is not int or self.revision < 1
                or type(self.observed_tick) is not int or self.observed_tick < 0
                or type(self.expires_tick) is not int
                or self.expires_tick < self.observed_tick):
            raise ValueError("Invalid revision or time bounds")


@dataclass(frozen=True)
class KnowledgeAssessment:
    state: str  # supported, unverified, conflicted, stale, unknown
    value: str | None
    source_refs: tuple[str, ...]
    revision: int | None


class EvidenceGate:
    """An advisory read gate; not a security, source-authentication or action gate.

    Latest revisions win; disagreement in the same revision is not hidden.
    An explicit authoritative revision may invalidate earlier observations.
    """

    def __init__(self, scope: str):
        if not _token(scope):
            raise ValueError("Invalid scope")
        self.scope = scope
        self._facts: list[EvidenceFact] = []
        self._refs: set[str] = set()

    def observe(self, fact: EvidenceFact):
        if fact.scope != self.scope:
            raise PermissionError("Cross-scope evidence")
        if fact.source_ref in self._refs:
            raise ValueError("Duplicate source reference")
        self._refs.add(fact.source_ref)
        self._facts.append(fact)

    def assess(self, topic: str, as_of_tick: int,
               *, authoritative_revision: int | None = None) -> KnowledgeAssessment:
        if not _token(topic) or type(as_of_tick) is not int or as_of_tick < 0:
            raise ValueError("Invalid query")
        if authoritative_revision is not None and (
                type(authoritative_revision) is not int or authoritative_revision < 1):
            raise ValueError("Invalid authoritative revision")
        observed = [f for f in self._facts if f.topic == topic
                    and f.observed_tick <= as_of_tick]
        if not observed:
            return KnowledgeAssessment("unknown", None, (), None)
        revision = max(f.revision for f in observed)
        latest = [f for f in observed if f.revision == revision]
        refs = tuple(sorted(f.source_ref for f in latest))
        if len({f.value for f in latest}) != 1:
            return KnowledgeAssessment("conflicted", None, refs, revision)
        if (any(as_of_tick > f.expires_tick for f in latest)
                or (authoritative_revision is not None
                    and authoritative_revision > revision)):
            return KnowledgeAssessment("stale", None, refs, revision)
        if not any(f.trust == "host_verified" for f in latest):
            return KnowledgeAssessment("unverified", None, refs, revision)
        return KnowledgeAssessment("supported", latest[0].value, refs, revision)
