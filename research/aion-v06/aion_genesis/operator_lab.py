"""AION Operator Lab: a synthetic, auditable business-watch research prototype.

This is a rule-based baseline, NOT a working autonomous business intelligence.
It has no TradeFlow tenant access, communications, network side effects, or
production action executor. Every action remains a simulated work order.
"""

import argparse
from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from pathlib import Path
import sqlite3


KINDS = frozenset({
    "permit_days_left", "material_slip_days", "crew_utilization_pct",
    "invoice_overdue_days",
})
ACTIONS = frozenset({
    "review_permit", "contact_supplier", "rebalance_schedule",
    "prepare_invoice_followup", "review_dependency_plan",
})
PRIORITIES = {"critical": 0, "high": 1, "normal": 2}


@dataclass(frozen=True)
class Signal:
    event_id: str
    tick: int
    project_id: str
    kind: str
    value: int

    def __post_init__(self):
        if (not self.event_id or len(self.event_id) > 100 or
                not self.project_id or len(self.project_id) > 100 or
                self.kind not in KINDS or type(self.tick) is not int or self.tick < 0 or
                type(self.value) is not int or not -365 <= self.value <= 10000):
            raise ValueError("Invalid or unbounded synthetic business signal")


@dataclass(frozen=True)
class Finding:
    recommendation_id: str
    project_id: str
    action: str
    priority: str
    evidence_ids: tuple[str, ...]
    explanation: str
    caveat: str = "Heuristic only; verify in actual records before acting."


def _finding(project: str, action: str, priority: str,
             evidence: tuple[str, ...], explanation: str) -> Finding:
    if action not in ACTIONS or priority not in PRIORITIES:
        raise ValueError("Action outside review-only allowlist")
    identifiers = tuple(sorted(set(evidence)))
    if not identifiers:
        raise ValueError("Every recommendation requires source evidence")
    digest = sha256(json.dumps([project, action, identifiers]).encode()).hexdigest()[:14]
    return Finding("AION-" + digest, project, action, priority, identifiers, explanation)


def detect_findings(events: list[Signal], max_cards: int | None = 3) -> tuple[list[Finding], int]:
    """Baseline detector: explainable thresholds plus a two-signal interaction.

    Cards are selected by priority, never by an LLM's unsupported confidence.
    The total count remains visible so the cap doesn't hide pending problems.
    """
    if max_cards is not None and not 1 <= max_cards <= 20:
        raise ValueError("Invalid attention budget")
    by_project: dict[str, list[Signal]] = {}
    for event in events:
        by_project.setdefault(event.project_id, []).append(event)
    findings: list[Finding] = []
    for project, observed in sorted(by_project.items()):
        # Only the latest measurement of each kind is current; earlier evidence
        # remains stored for audit but cannot itself create a fresh recommendation.
        latest: dict[str, Signal] = {}
        for event in sorted(observed, key=lambda e: (e.tick, e.event_id)):
            latest[event.kind] = event
        permit = latest.get("permit_days_left")
        material = latest.get("material_slip_days")
        crew = latest.get("crew_utilization_pct")
        invoice = latest.get("invoice_overdue_days")
        combined = bool(material and crew and material.value >= 2 and crew.value >= 95)
        if combined:
            findings.append(_finding(
                project, "review_dependency_plan", "critical",
                (material.event_id, crew.event_id),
                "A material slip and high crew utilization overlap; review the dependency plan.",
            ))
        if permit and permit.value <= 3:
            findings.append(_finding(
                project, "review_permit", "critical" if permit.value <= 0 else "high",
                (permit.event_id,),
                "Permit validity requires immediate review before scheduling dependent work.",
            ))
        if material and material.value >= 2 and not combined:
            findings.append(_finding(
                project, "contact_supplier", "high", (material.event_id,),
                "A reported supplier slip may affect project timing; verify the delivery.",
            ))
        if crew and crew.value >= 95 and not combined:
            findings.append(_finding(
                project, "rebalance_schedule", "high", (crew.event_id,),
                "Reported crew utilization leaves little scheduling capacity.",
            ))
        if invoice and invoice.value >= 14:
            findings.append(_finding(
                project, "prepare_invoice_followup", "normal", (invoice.event_id,),
                "An overdue invoice may warrant a reviewed follow-up draft.",
            ))
    findings.sort(key=lambda f: (PRIORITIES[f.priority], f.project_id, f.action))
    if max_cards is None:
        return findings, 0
    return findings[:max_cards], max(0, len(findings) - max_cards)


class OperatorLedger:
    """SQLite persistence survives process restarts; no background process implied."""

    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY, tick INTEGER NOT NULL,
                project_id TEXT NOT NULL, kind TEXT NOT NULL, value INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS proposals (
                recommendation_id TEXT PRIMARY KEY,
                body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
                reviewer TEXT, reviewed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS simulated_executions (
                recommendation_id TEXT PRIMARY KEY,
                result TEXT NOT NULL,
                FOREIGN KEY(recommendation_id) REFERENCES proposals(recommendation_id)
            );
        """)

    def close(self):
        self.db.close()

    def ingest(self, event: Signal) -> bool:
        with self.db:
            cursor = self.db.execute(
                "INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?)",
                (event.event_id, event.tick, event.project_id, event.kind, event.value),
            )
        if cursor.rowcount == 0:
            original = self.db.execute(
                "SELECT tick, project_id, kind, value FROM events WHERE event_id = ?",
                (event.event_id,),
            ).fetchone()
            if original != (event.tick, event.project_id, event.kind, event.value):
                raise ValueError("Conflicting duplicate event ID")
        return cursor.rowcount == 1

    def watch(self, max_cards: int = 3) -> dict:
        if not 1 <= max_cards <= 20:
            raise ValueError("Invalid owner attention budget")
        rows = self.db.execute(
            "SELECT event_id, tick, project_id, kind, value FROM events ORDER BY tick, event_id"
        ).fetchall()
        events = [Signal(*row) for row in rows]
        current, _ = detect_findings(events, max_cards=None)
        visible = current[:max_cards]
        overflow = max(0, len(current) - max_cards)
        inserted = 0
        with self.db:
            for finding in current:
                cursor = self.db.execute(
                    "INSERT OR IGNORE INTO proposals(recommendation_id, body) VALUES (?, ?)",
                    (finding.recommendation_id, json.dumps(asdict(finding))),
                )
                inserted += cursor.rowcount
            active_ids = {f.recommendation_id for f in current}
            for (existing_id,) in self.db.execute(
                "SELECT recommendation_id FROM proposals WHERE state IN ('pending', 'approved')"
            ).fetchall():
                if existing_id not in active_ids:
                    # Stale recommendations are never left executable just
                    # because the owner's phone or the worker was offline.
                    self.db.execute(
                        "UPDATE proposals SET state = 'superseded' WHERE recommendation_id = ?",
                        (existing_id,),
                    )
        return {
            "engine": "AION Operator Lab 0.7 rule baseline",
            "mode": "synthetic_only", "observed_events": len(events),
            "new_proposals": inserted, "attention_cards": len(visible),
            "additional_findings_not_presented": overflow,
            "pending": [dict(asdict(f), state="pending") for f in visible
                        if self._proposal_state(f.recommendation_id) == "pending"],
            "no_external_actions": True, "not_a_background_service": True,
        }

    def _proposal_state(self, recommendation_id: str) -> str | None:
        row = self.db.execute(
            "SELECT state FROM proposals WHERE recommendation_id = ?",
            (recommendation_id,),
        ).fetchone()
        return row[0] if row else None

    def inbox(self, state: str = "pending") -> list[dict]:
        if state not in {"pending", "approved", "rejected", "executed_simulated", "superseded"}:
            raise ValueError("Unsupported queue status")
        rows = self.db.execute(
            "SELECT body, state, reviewer FROM proposals WHERE state = ?",
            (state,),
        ).fetchall()
        cards = [{**json.loads(body), "state": row_state, "reviewer": reviewer}
                 for body, row_state, reviewer in rows]
        cards.sort(key=lambda x: (PRIORITIES[x["priority"]], x["project_id"], x["action"]))
        return cards

    def decide(self, recommendation_id: str, approve: bool, reviewer: str) -> bool:
        if not reviewer.strip() or len(reviewer) > 100:
            raise ValueError("Named human reviewer required")
        # Refresh the evidence before allowing a human to approve a now-stale card.
        self.watch()
        target = "approved" if approve else "rejected"
        with self.db:
            cursor = self.db.execute(
                "UPDATE proposals SET state = ?, reviewer = ?, reviewed_at = CURRENT_TIMESTAMP "
                "WHERE recommendation_id = ? AND state = 'pending'",
                (target, reviewer, recommendation_id),
            )
        return cursor.rowcount == 1

    def execute_simulated(self, recommendation_id: str) -> bool:
        """Advance an approved card only in the simulated ledger, not TradeFlow."""
        # An approval is not a blank cheque after the underlying facts change.
        self.watch()
        with self.db:
            cursor = self.db.execute(
                "UPDATE proposals SET state = 'executed_simulated' "
                "WHERE recommendation_id = ? AND state = 'approved'",
                (recommendation_id,),
            )
            if cursor.rowcount:
                self.db.execute(
                    "INSERT INTO simulated_executions VALUES (?, ?)",
                    (recommendation_id, "SIMULATION_ONLY_NO_EXTERNAL_SIDE_EFFECT"),
                )
        return cursor.rowcount == 1


DEMO_EVENTS = (
    Signal("SYN-E1", 0, "SYN-PROJECT-1", "material_slip_days", 3),
    Signal("SYN-E2", 0, "SYN-PROJECT-1", "crew_utilization_pct", 97),
    Signal("SYN-E3", 0, "SYN-PROJECT-2", "permit_days_left", 2),
    Signal("SYN-E4", 0, "SYN-PROJECT-3", "invoice_overdue_days", 18),
)


def main():
    parser = argparse.ArgumentParser(description="AION synthetic operator approval lab")
    parser.add_argument("command", choices=("seed", "watch", "inbox", "approve", "reject", "execute"))
    parser.add_argument("--db", required=True)
    parser.add_argument("--id", default=None)
    parser.add_argument("--reviewer", default=None)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    if args.command in {"approve", "reject", "execute"} and not args.id:
        parser.error("--id is required for proposal operations")
    if args.command in {"approve", "reject"} and not args.reviewer:
        parser.error("--reviewer is required for human decisions")
    ledger = OperatorLedger(args.db)
    try:
        if args.command == "seed":
            result = {"new_events": sum(ledger.ingest(e) for e in DEMO_EVENTS)}
        elif args.command == "watch":
            result = ledger.watch()
        elif args.command == "inbox":
            result = {"pending": ledger.inbox()}
        elif args.command in ("approve", "reject"):
            result = {"changed": ledger.decide(args.id, args.command == "approve", args.reviewer)}
        else:
            result = {"executed_simulated": ledger.execute_simulated(args.id)}
    finally:
        ledger.close()
    encoded = json.dumps(result, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n", encoding="utf-8")
    print(encoded)


if __name__ == "__main__":
    main()
