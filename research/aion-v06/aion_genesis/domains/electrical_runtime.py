"""v1.0 runtime adapter for the existing synthetic TradeFlow procurement pack.

Reuses the v0.9 ``ElectricalStrategyPack`` and the v0.8→v0.9
``case_from_situation`` bridge unchanged. All costs/effects remain fictional.
"""

from ..runtime.domain import CaseBuild
from .electrical_strategy import ElectricalStrategyPack, case_from_situation


class ElectricalProcurementAdapter:
    domain_id = "tradeflow_electrical_procurement"
    version = "1.0.0+strategy-pack-0.9"
    objectives = ("schedule", "margin", "crew_productivity", "customer_trust")
    default_freshness_ticks = 50
    freshness_ticks: dict[str, int] = {}
    decision_domain = ElectricalStrategyPack()
    _REQUIRED = (
        "supplier_eta_slip_days", "affected_work_days", "crew_idle_hours",
        "ready_work_hours", "customer_notice_context",
        "qualified_substitute_available", "expedite_available",
    )

    def build_case(self, observations, tenant_id, scope_id) -> CaseBuild:
        present = {item.metric for item in observations}
        missing = tuple(metric for metric in self._REQUIRED if metric not in present)
        if missing:
            return CaseBuild(None, missing=missing)
        legacy = [item.to_legacy() for item in observations]
        return CaseBuild(case_from_situation(legacy, tenant_id, scope_id))

    def fixed_rule(self, facts):
        """Declared fixed heuristic: expedite when possible, keep crews busy, warn on long slips."""
        return (
            ("supply", "expedite" if facts.expedite_available else "wait"),
            ("crew", "reassign_to_ready_work" if facts.alternate_work_hours > 0 else "hold"),
            ("customer", "prepare_notice" if facts.supplier_delay_days >= 3 else "quiet"),
        )
