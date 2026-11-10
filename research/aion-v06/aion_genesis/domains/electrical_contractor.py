"""TradeFlow specialization: small electrical contractors (roughly 5–20 staff).

These are test heuristics about possible operational bottlenecks, not legal
compliance rules, market statistics, or established causal relationships.
"""

from collections import defaultdict

from ..situation_engine import Hypothesis, Observation


class ElectricalContractorPack:
    name = "tradeflow_electrical_contractor_5_20"
    allowed_actions = frozenset({
        "review_schedule_dependencies", "review_permit_and_inspection",
        "review_cashflow_plan", "verify_supplier_eta", "check_crew_allocation",
    })

    def analyze(self, current: list[Observation]) -> list[Hypothesis]:
        groups: dict[str, dict[str, Observation]] = defaultdict(dict)
        for item in current:
            groups[item.scope_id][item.metric] = item
        findings = []
        for scope, facts in sorted(groups.items()):
            material = facts.get("supplier_eta_slip_days")
            crew = facts.get("crew_utilization_percent")
            permit = facts.get("permit_days_remaining")
            inspection = facts.get("inspection_due_days")
            overdue = facts.get("receivables_overdue_days")
            payroll = facts.get("payroll_due_days")

            combined_schedule = bool(
                material and crew and material.value >= 2 and crew.value >= 90
            )
            if combined_schedule:
                findings.append(Hypothesis(
                    scope_id=scope,
                    claim="Supplier slippage overlaps a heavily loaded crew; the job sequence may need revision.",
                    action="review_schedule_dependencies", severity=5,
                    evidence_ids=(material.event_id, crew.event_id),
                    dimensions=("schedule", "margin", "customer_reliability"),
                    alternative="Check whether the affected materials are on the critical path.",
                    uncertainty="A delivery slip and high load do not prove an actual schedule impact.",
                ))
            elif material and material.value >= 2:
                findings.append(Hypothesis(
                    scope_id=scope, claim="The supplier reports a material delay worth verifying.",
                    action="verify_supplier_eta", severity=3,
                    evidence_ids=(material.event_id,), dimensions=("schedule",),
                    alternative="Check warehouse stock or an equivalent approved supplier.",
                    uncertainty="The current job may have sufficient inventory despite the supplier slip.",
                ))
            elif crew and crew.value >= 95:
                findings.append(Hypothesis(
                    scope_id=scope, claim="Crew utilization is near capacity.",
                    action="check_crew_allocation", severity=3,
                    evidence_ids=(crew.event_id,), dimensions=("schedule", "staff_wellbeing"),
                    alternative="Review whether subcontractor or flexible work allocation is available.",
                    uncertainty="A utilization reading alone cannot establish a missed deadline.",
                ))

            if permit and inspection and permit.value <= 5 and inspection.value <= 7:
                findings.append(Hypothesis(
                    scope_id=scope,
                    claim="An approaching permit date overlaps a scheduled inspection milestone.",
                    action="review_permit_and_inspection", severity=4,
                    evidence_ids=(permit.event_id, inspection.event_id),
                    dimensions=("compliance", "schedule"),
                    alternative="Verify whether the dates concern the same authorization and scope.",
                    uncertainty="Local permit requirements are not modeled or determined by this heuristic.",
                ))
            if overdue and payroll and overdue.value >= 14 and payroll.value <= 7:
                findings.append(Hypothesis(
                    scope_id=scope,
                    claim="Outstanding receivables coincide with an upcoming payroll obligation.",
                    action="review_cashflow_plan", severity=4,
                    evidence_ids=(overdue.event_id, payroll.event_id),
                    dimensions=("cashflow", "staff_wellbeing"),
                    alternative="Verify cash reserves and invoice disputes before assuming a shortfall.",
                    uncertainty="An overdue invoice does not prove insufficient cash or a payroll risk.",
                ))
        return findings


DEMO_EVENTS = (
    # Different departments describe one job; time increases across revisions.
    Observation("DEMO-OWNER", "EVT-SUP-1", 1, "JOB-17", "SUPPLIER-3",
                "procurement", "supplier_eta_slip_days", 3),
    Observation("DEMO-OWNER", "EVT-CREW-1", 1, "JOB-17", "TEAM-2",
                "operations", "crew_utilization_percent", 96),
    Observation("DEMO-OWNER", "EVT-PERMIT-1", 1, "JOB-17", "PERMIT-17",
                "permits", "permit_days_remaining", 4),
    Observation("DEMO-OWNER", "EVT-INSP-1", 1, "JOB-17", "INSPECTION-17",
                "quality", "inspection_due_days", 6),
    Observation("DEMO-OWNER", "EVT-REC-1", 1, "JOB-17", "INVOICE-17",
                "finance", "receivables_overdue_days", 19),
    Observation("DEMO-OWNER", "EVT-PAY-1", 1, "JOB-17", "PAYROLL-CYCLE",
                "finance", "payroll_due_days", 5),
)
