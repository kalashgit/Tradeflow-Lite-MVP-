"""Authored fictional portfolios with disjoint PUBLIC dev and validation cases.

These are open-source fixtures, NOT an independently sealed holdout. All
budgets, priorities, and economics are invented research units.
"""

from .portfolio import Job, OwnerChange, PortfolioCase, ToolFault

DEV = (
    PortfolioCase(
        "SYN-PORT-D-CASH", "dev", 94100, 19, 480, 1, 1, (
            Job("JOB-A", 0, 9, 160, 90, 2, 620, 1, 2, 2, 200),
            Job("JOB-B", 0, 15, 300, 110, 2, 900, 2, 3, 3, 360),
            Job("JOB-C", 0, 7, 100, 70, 1, 270, 1, 1, 1, 140),
        )),
    PortfolioCase(
        "SYN-PORT-D-CREW", "dev", 94101, 20, 940, 1, 1, (
            Job("JOB-A", 0, 7, 160, 100, 3, 700, 1, 1, 2, 180),
            Job("JOB-B", 0, 10, 190, 90, 2, 520, 1, 2, 4, 220),
            Job("JOB-C", 1, 12, 200, 110, 2, 570, 2, 2, 3, 250),
        )),
    PortfolioCase(
        "SYN-PORT-D-OWNER-DRIFT", "dev", 94102, 24, 1120, 2, 1, (
            Job("JOB-A", 0, 10, 210, 110, 2, 640, 1, 2, 4, 250),
            Job("JOB-B", 1, 16, 230, 125, 2, 810, 2, 3, 1, 300),
            Job("JOB-C", 3, 17, 180, 95, 3, 750, 1, 2, 2, 220),
        ), changes=(OwnerChange(5, "JOB-B", 5, 2),)),
    PortfolioCase(
        "SYN-PORT-D-UNKNOWN-COMMIT", "dev", 94103, 18, 820, 1, 1, (
            Job("JOB-A", 0, 8, 210, 100, 2, 640, 1, 1, 4, 250),
            Job("JOB-B", 0, 13, 190, 95, 2, 600, 2, 2, 2, 250),
        ), faults=(ToolFault(0, "order_materials", "JOB-A", "after_commit"),)),
    PortfolioCase(
        "SYN-PORT-D-CASH-TRAP", "dev", 94105, 16, 550, 1, 1, (
            # Urgent low-margin job can tie up working capital. Delayed
            # payout prevents instant rescue; the smaller positive-margin
            # contract can unlock later progress if prioritized instead.
            Job("JOB-A", 0, 4, 300, 120, 2, 450, 1, 3, 5, 320),
            Job("JOB-B", 0, 9, 160, 70, 2, 700, 1, 0, 3, 180),
            Job("JOB-C", 0, 10, 150, 80, 2, 600, 1, 1, 2, 200),
        )),
    PortfolioCase(
        "SYN-PORT-D-APPROVAL", "dev", 94104, 17, 860, 1, 1, (
            Job("JOB-A", 0, 7, 400, 100, 2, 900, 1, 2, 5, 200),
            Job("JOB-B", 0, 12, 180, 90, 2, 530, 1, 2, 3, 240),
            Job("JOB-C", 2, 14, 100, 80, 1, 320, 1, 1, 2, 150, False),
        )),
)

VALIDATION = (
    PortfolioCase(
        "SYN-PORT-V-WORK-CAPACITY", "validation", 95200, 21, 780, 1, 1, (
            Job("JOB-A", 0, 9, 190, 105, 2, 650, 2, 2, 3, 245),
            Job("JOB-B", 1, 11, 160, 115, 3, 810, 1, 3, 5, 210),
            Job("JOB-C", 3, 16, 180, 80, 2, 560, 2, 1, 2, 230),
        )),
    PortfolioCase(
        "SYN-PORT-V-CASH-FLOW", "validation", 95201, 23, 560, 1, 1, (
            Job("JOB-A", 0, 10, 240, 115, 2, 740, 2, 3, 2, 290),
            Job("JOB-B", 0, 8, 140, 85, 2, 490, 1, 1, 4, 180),
            Job("JOB-C", 2, 18, 210, 100, 2, 630, 2, 3, 3, 250),
        )),
    PortfolioCase(
        "SYN-PORT-V-OWNER-RECOVERY", "validation", 95202, 25, 1200, 2, 1, (
            Job("JOB-A", 0, 10, 220, 110, 2, 680, 1, 2, 4, 270),
            Job("JOB-B", 0, 16, 200, 115, 2, 640, 2, 2, 1, 250),
            Job("JOB-C", 3, 19, 260, 120, 3, 1030, 2, 4, 2, 300),
        ), changes=(OwnerChange(5, "JOB-B", 5, 1),),
        faults=(ToolFault(0, "order_materials", "JOB-A", "before_commit"),)),
)


def load_suite(name):
    if name == "dev":
        return DEV
    if name == "validation":
        return VALIDATION
    raise PermissionError("Holdout cases require independent external custody")


def manifest(name):
    return {"schema": "GenesisPortfolioManifest/2.1",
            "suite": name, "cases": [
                {"id": c.case_id, "seed": c.seed,
                 "fingerprint": c.fingerprint(),
                 "projects": len(c.jobs), "horizon": c.horizon}
                for c in load_suite(name)],
            "protected_holdout": False, "fictional": True,
            "public_fixtures_not_sealed": True}
