"""AION v0.8: domain-neutral, evidence-linked situation intelligence scaffold.

No LLM, production connectivity, actions, or autonomous learning is implied.
Domain packs may propose hypotheses but cannot bypass evidence verification.
"""

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import re
import sqlite3
from typing import Protocol


_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}\Z")
_GOAL = re.compile(r"[a-z][a-z0-9_]{0,49}\Z")


@dataclass(frozen=True)
class Observation:
    tenant_id: str
    event_id: str
    tick: int
    scope_id: str
    subject_id: str
    department: str
    metric: str
    value: int
    provenance: str = "synthetic"

    def __post_init__(self):
        for field in ("tenant_id", "event_id", "scope_id", "subject_id",
                      "department", "metric"):
            if not _IDENTIFIER.fullmatch(getattr(self, field)):
                raise ValueError(f"Invalid {field}")
        if type(self.tick) is not int or not 0 <= self.tick <= 10**12:
            raise ValueError("Invalid observation timestamp")
        if type(self.value) is not int or not -(10**9) <= self.value <= 10**9:
            raise ValueError("Invalid observation value")
        if self.provenance != "synthetic":
            raise ValueError("v0.8 has no admitted source of real business data")


@dataclass(frozen=True)
class Hypothesis:
    scope_id: str
    claim: str
    action: str
    severity: int  # heuristic priority, not a probability
    evidence_ids: tuple[str, ...]
    dimensions: tuple[str, ...]
    alternative: str
    uncertainty: str


class DomainPack(Protocol):
    name: str
    allowed_actions: frozenset[str]

    def analyze(self, current: list[Observation]) -> list[Hypothesis]: ...


def _hypothesis_id(domain: str, hypothesis: Hypothesis) -> str:
    ingredients = [domain, hypothesis.scope_id, hypothesis.action,
                   sorted(set(hypothesis.evidence_ids))]
    return "SIT-" + sha256(json.dumps(ingredients).encode()).hexdigest()[:16]


class SituationStore:
    """Tenant-scoped append-only observations and owner-goal preferences."""

    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS situation_events (
                tenant_id TEXT NOT NULL, event_id TEXT NOT NULL,
                tick INTEGER NOT NULL, scope_id TEXT NOT NULL,
                subject_id TEXT NOT NULL, department TEXT NOT NULL,
                metric TEXT NOT NULL, value INTEGER NOT NULL,
                provenance TEXT NOT NULL,
                PRIMARY KEY (tenant_id, event_id)
            );
            CREATE TABLE IF NOT EXISTS situation_goals (
                tenant_id TEXT NOT NULL, dimension TEXT NOT NULL,
                weight INTEGER NOT NULL, PRIMARY KEY (tenant_id, dimension)
            );
            CREATE TABLE IF NOT EXISTS situation_hypotheses (
                tenant_id TEXT NOT NULL, hypothesis_id TEXT NOT NULL,
                body TEXT NOT NULL, state TEXT NOT NULL,
                PRIMARY KEY (tenant_id, hypothesis_id)
            );
            CREATE TABLE IF NOT EXISTS situation_reviews (
                tenant_id TEXT NOT NULL, hypothesis_id TEXT NOT NULL,
                reviewer TEXT NOT NULL, decision TEXT NOT NULL,
                reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (tenant_id, hypothesis_id),
                FOREIGN KEY(tenant_id, hypothesis_id) REFERENCES
                    situation_hypotheses(tenant_id, hypothesis_id)
            );
        """)

    def close(self):
        self.db.close()

    def observe(self, observation: Observation) -> bool:
        data = tuple(asdict(observation).values())
        with self.db:
            cursor = self.db.execute(
                "INSERT OR IGNORE INTO situation_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", data,
            )
        if cursor.rowcount == 0:
            row = self.db.execute(
                "SELECT tick, scope_id, subject_id, department, metric, value, provenance "
                "FROM situation_events WHERE tenant_id = ? AND event_id = ?",
                (observation.tenant_id, observation.event_id),
            ).fetchone()
            if row != data[2:]:
                raise ValueError("Conflicting duplicate observation")
        return cursor.rowcount == 1

    def set_goal(self, tenant_id: str, dimension: str, weight: int):
        if not _IDENTIFIER.fullmatch(tenant_id) or not _GOAL.fullmatch(dimension):
            raise ValueError("Invalid tenant or owner objective")
        if type(weight) is not int or not 0 <= weight <= 5:
            raise ValueError("Goal weights must be 0–5")
        with self.db:
            self.db.execute(
                "INSERT INTO situation_goals VALUES (?, ?, ?) "
                "ON CONFLICT(tenant_id, dimension) DO UPDATE SET weight=excluded.weight",
                (tenant_id, dimension, weight),
            )

    def _goals(self, tenant_id: str) -> dict[str, int]:
        return dict(self.db.execute(
            "SELECT dimension, weight FROM situation_goals WHERE tenant_id = ?", (tenant_id,),
        ).fetchall())

    def current(self, tenant_id: str) -> list[Observation]:
        if not _IDENTIFIER.fullmatch(tenant_id):
            raise ValueError("Invalid tenant")
        rows = self.db.execute(
            "SELECT tenant_id, event_id, tick, scope_id, subject_id, department, metric, "
            "value, provenance FROM situation_events WHERE tenant_id = ? "
            "ORDER BY tick, event_id", (tenant_id,),
        ).fetchall()
        # New observations replace older readings of the SAME subject/metric,
        # not observations about other departments on the same project.
        latest: dict[tuple[str, str, str], Observation] = {}
        for row in rows:
            observation = Observation(*row)
            latest[(observation.scope_id, observation.subject_id, observation.metric)] = observation
        return sorted(latest.values(), key=lambda e: (e.scope_id, e.department, e.metric))

    def investigate(self, tenant_id: str, pack: DomainPack,
                    attention_budget: int = 3) -> dict:
        if not 1 <= attention_budget <= 10:
            raise ValueError("Invalid briefing attention budget")
        observed = self.current(tenant_id)
        candidates = pack.analyze(list(observed))
        if len(candidates) > 100:
            raise ValueError("Too many proposed investigations for one briefing")
        valid_ids = {event.event_id: event for event in observed}
        goals = self._goals(tenant_id)
        cards = []
        for idea in candidates:
            if not isinstance(idea, Hypothesis):
                raise ValueError("Domain pack produced an unsupported proposal")
            if idea.action not in pack.allowed_actions or not 1 <= idea.severity <= 5:
                raise ValueError("Domain pack proposed an unauthorized action or severity")
            if not idea.claim or not idea.alternative or not idea.uncertainty:
                raise ValueError("Evidence briefing needs claim, alternative and uncertainty")
            if (len(idea.claim) > 500 or len(idea.alternative) > 300 or
                    len(idea.uncertainty) > 300):
                raise ValueError("Proposed explanation exceeds review bounds")
            if not idea.evidence_ids or len(set(idea.evidence_ids)) != len(idea.evidence_ids):
                raise ValueError("Hypothesis requires unique evidence")
            if len(idea.evidence_ids) > 10:
                raise ValueError("Too many evidence citations in one review card")
            evidence = []
            for event_id in idea.evidence_ids:
                source = valid_ids.get(event_id)
                if source is None or source.scope_id != idea.scope_id:
                    raise ValueError("Hypothesis cites missing, stale, or cross-scope evidence")
                evidence.append(source)
            if not idea.dimensions or any(not _GOAL.fullmatch(x) for x in idea.dimensions):
                raise ValueError("Invalid owner-goal dimensions")
            departments = sorted({e.department for e in evidence})
            goal_alignment = sum(goals.get(d, 0) for d in set(idea.dimensions))
            score = idea.severity * 10 + goal_alignment + max(0, len(departments) - 1) * 2
            card = {
                "id": _hypothesis_id(pack.name, idea), "scope_id": idea.scope_id,
                "claim": idea.claim, "proposed_action": idea.action,
                "evidence": [asdict(e) for e in evidence],
                "affected_departments": departments, "owner_dimensions": list(idea.dimensions),
                "alternative_to_check": idea.alternative, "uncertainty": idea.uncertainty,
                "priority_score_heuristic": score, "owner_goal_alignment": goal_alignment,
                "not_a_verified_causal_effect": True,
                "status": "requires_human_review",
            }
            cards.append(card)
        cards.sort(key=lambda x: (-x["priority_score_heuristic"], x["scope_id"], x["id"]))
        active_ids = {x["id"] for x in cards}
        with self.db:
            for card in cards:
                self.db.execute(
                    "INSERT OR IGNORE INTO situation_hypotheses VALUES (?, ?, ?, 'proposed')",
                    (tenant_id, card["id"], json.dumps(card, sort_keys=True)),
                )
            for (old_id,) in self.db.execute(
                "SELECT hypothesis_id FROM situation_hypotheses WHERE tenant_id = ? "
                "AND state IN ('proposed', 'approved')", (tenant_id,),
            ).fetchall():
                if old_id not in active_ids:
                    self.db.execute(
                        "UPDATE situation_hypotheses SET state = 'superseded' "
                        "WHERE tenant_id = ? AND hypothesis_id = ?",
                        (tenant_id, old_id),
                    )
        for card in cards:
            state = self.db.execute(
                "SELECT state FROM situation_hypotheses "
                "WHERE tenant_id = ? AND hypothesis_id = ?",
                (tenant_id, card["id"]),
            ).fetchone()
            card["status"] = state[0] if state else "unavailable"
        graph = {}
        for event in observed:
            node = graph.setdefault(event.scope_id, {"departments": set(), "subjects": set()})
            node["departments"].add(event.department)
            node["subjects"].add(event.subject_id)
        return {
            "engine": "AION Situation Engine v0.8",
            "domain_pack": pack.name, "tenant_id": tenant_id,
            "research_mode": "synthetic_only_rule_based",
            "current_facts": len(observed),
            "situation_map": {scope: {
                "departments": sorted(data["departments"]),
                "subjects": sorted(data["subjects"]),
            } for scope, data in sorted(graph.items())},
            "owner_goals": goals,
            "briefing": cards[:attention_budget],
            "additional_findings_in_ledger": max(0, len(cards) - attention_budget),
            "all_findings_are_evidence_linked": True,
            "executed_actions": 0,
            "model_learning_established": False,
        }

    def review(self, tenant_id: str, pack: DomainPack, hypothesis_id: str,
               reviewer: str, approve: bool) -> bool:
        """Record a simulated human review; no execution permission is granted."""
        if not reviewer.strip() or len(reviewer) > 100:
            raise ValueError("A named synthetic reviewer is required")
        # Refresh facts before accepting the review; a stale proposal must not
        # become approved after newer evidence invalidated it.
        self.investigate(tenant_id, pack)
        state = "approved" if approve else "rejected"
        with self.db:
            cursor = self.db.execute(
                "UPDATE situation_hypotheses SET state = ? WHERE "
                "tenant_id = ? AND hypothesis_id = ? AND state = 'proposed'",
                (state, tenant_id, hypothesis_id),
            )
            if cursor.rowcount:
                self.db.execute(
                    "INSERT INTO situation_reviews(tenant_id, hypothesis_id, reviewer, decision) "
                    "VALUES (?, ?, ?, ?)",
                    (tenant_id, hypothesis_id, reviewer, state),
                )
        return cursor.rowcount == 1
