"""AION Genesis v1.0 unified runtime — the public, domain-neutral API.

    observe → situation → investigate → proposal (pending human review) → outcome

Nothing here can execute an action or read a laboratory's hidden outcomes.
"""

from .contracts import (
    ABSTAINED, CAPABILITIES, ENGINE_VERSION, PENDING_HUMAN_REVIEW, RESEARCH_MODE,
    SCHEMA_VERSION, DecisionProposalV1, DecisionRequestV1, ExperimentRunV1,
    GoalProfileV1, ObservationV1, OutcomeRecordV1, canonical, digest,
)
from .domain import CaseBuild, DomainAdapter
from .engine import AionRuntime, ModelBinding, replay
from .learning import EffectModel
from .contextual_memory import ContextualEffectModel
from .hybrid_memory import HybridEffectModel
from .relevant_memory import RelevantEffectModel
from .store import RuntimeStore

__all__ = [
    "ABSTAINED", "CAPABILITIES", "ENGINE_VERSION", "PENDING_HUMAN_REVIEW",
    "RESEARCH_MODE", "SCHEMA_VERSION", "AionRuntime", "CaseBuild",
    "DecisionProposalV1", "DecisionRequestV1", "DomainAdapter", "EffectModel",
    "ContextualEffectModel", "HybridEffectModel", "RelevantEffectModel",
    "ExperimentRunV1", "GoalProfileV1", "ModelBinding", "ObservationV1",
    "OutcomeRecordV1", "RuntimeStore", "canonical", "digest", "replay",
]
