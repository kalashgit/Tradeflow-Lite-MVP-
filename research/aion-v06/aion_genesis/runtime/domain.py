"""The single invocation interface every domain pack implements.

A domain adapter translates current, usable observations into a typed case and
exposes a bounded v0.9 ``DecisionDomain``. It supplies *estimates* only: it has
no access to outcomes, and nothing in ``aion_genesis.runtime`` or
``aion_genesis.domains`` may import the laboratory's hidden worlds or referee.
"""

from dataclasses import dataclass
from typing import Mapping, Protocol, Sequence

from ..strategic_planner import DecisionDomain
from .contracts import ObservationV1


@dataclass(frozen=True)
class CaseBuild:
    """``facts is None`` when blocking evidence is missing; never guessed."""

    facts: object | None
    missing: tuple[str, ...] = ()   # blocking: the case cannot be assessed
    unknowns: tuple[str, ...] = ()  # non-blocking: options needing them are excluded


class DomainAdapter(Protocol):
    domain_id: str
    version: str
    objectives: tuple[str, ...]
    default_freshness_ticks: int
    freshness_ticks: Mapping[str, int]
    decision_domain: DecisionDomain

    def build_case(self, observations: Sequence[ObservationV1], tenant_id: str,
                   scope_id: str) -> CaseBuild: ...

    def fixed_rule(self, facts: object) -> tuple[tuple[str, str], ...]: ...


def freshness_limit(adapter: DomainAdapter, metric: str) -> int:
    return adapter.freshness_ticks.get(metric, adapter.default_freshness_ticks)
