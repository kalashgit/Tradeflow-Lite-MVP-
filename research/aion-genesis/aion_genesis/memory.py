"""Working, reviewed, and gated long-term memories. No live knowledge writes by default."""
from collections import deque, defaultdict
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import sqlite3
from .core import fingerprint, validate

class WorkingMemory:
    def __init__(self, limit=8):
        if not isinstance(limit, int) or not 1 <= limit <= 128:
            raise ValueError("invalid working-memory limit")
        self._items = deque(maxlen=limit)

    def push(self, observation):
        self._items.append(deepcopy(observation))

    def snapshot(self):
        return deepcopy(list(self._items))

    def __len__(self):
        return len(self._items)

class ReviewJournal:
    """Provisional episode evidence; recurrence never authorizes knowledge promotion."""
    def __init__(self, limit=256):
        if not isinstance(limit, int) or limit < 1:
            raise ValueError("invalid review capacity")
        self._items = deque(maxlen=limit)

    def add(self, world_id, variables, candidate, observation, contradictions):
        self._items.append({
            "world_id": world_id,
            "hypothesis": fingerprint(candidate, variables) if candidate is not None else None,
            "observation": deepcopy(observation),
            "contradictions": int(contradictions),
        })

    def recurring(self, minimum_worlds=2):
        grouped = defaultdict(list)
        for item in self._items:
            if item["hypothesis"] is not None:
                grouped[item["hypothesis"]].append(item)
        results = []
        for hypothesis, examples in grouped.items():
            distinct = len({x["world_id"] for x in examples})
            if distinct >= minimum_worlds:
                results.append({
                    "hypothesis": hypothesis,
                    "worlds": distinct,
                    "episodes": len(examples),
                    "contradictions": sum(int(x["contradictions"] > 0) for x in examples),
                    "status": "needs_independent_review",
                })
        return sorted(results, key=lambda x: (-x["worlds"], x["hypothesis"]))

    def counterexamples(self, limit=4):
        return deepcopy([x["observation"] for x in self._items if x["contradictions"] > 0][-limit:])

    def __len__(self):
        return len(self._items)

@dataclass(frozen=True)
class EvidenceCertificate:
    accuracy: float
    consistency: float
    independent_worlds: int
    independent_runs: int
    heldout_tests: int
    contradiction_count: int
    evidence_sha256: str

    def qualifies(self):
        return (
            self.accuracy >= 0.85
            and self.consistency >= 0.90
            and self.independent_worlds >= 3
            and self.independent_runs >= 3
            and self.heldout_tests >= 6
            and self.contradiction_count == 0
            and isinstance(self.evidence_sha256, str)
            and len(self.evidence_sha256) == 64
            and all(c in "0123456789abcdef" for c in self.evidence_sha256)
        )

class LongTermStore:
    """Opt-in SQLite demonstration. Application and CI use the closed default."""
    def __init__(self, path, enabled=False):
        self.path = str(path)
        self.enabled = bool(enabled)
        self.db = None
        if self.enabled:
            self.db = sqlite3.connect(self.path)
            self.db.execute("""CREATE TABLE IF NOT EXISTS knowledge(
                context TEXT NOT NULL,
                version INTEGER NOT NULL,
                mechanism TEXT NOT NULL,
                evidence_digest TEXT NOT NULL,
                status TEXT NOT NULL,
                recorded_at TEXT NOT NULL,
                PRIMARY KEY(context,version))""")
            self.db.commit()

    def promote(self, context, candidate, variables, evidence, independent_gate=False):
        if not self.enabled or not independent_gate:
            return {"accepted": False, "reason": "promotion-disabled"}
        if not isinstance(evidence, EvidenceCertificate) or not evidence.qualifies():
            return {"accepted": False, "reason": "evidence-gate-not-met"}
        if not isinstance(context, str) or not 1 <= len(context) <= 120:
            raise ValueError("invalid knowledge context")
        mechanism = json.dumps(validate(candidate, variables), sort_keys=True)
        old_version = self.db.execute("SELECT COALESCE(MAX(version),0) FROM knowledge WHERE context=?", (context,)).fetchone()[0]
        version = old_version + 1
        with self.db:
            self.db.execute("UPDATE knowledge SET status='superseded' WHERE context=? AND status='verified'", (context,))
            self.db.execute(
                "INSERT INTO knowledge VALUES(?,?,?,?,?,?)",
                (context, version, mechanism, evidence.evidence_sha256, "verified", datetime.now(timezone.utc).isoformat())
            )
        return {"accepted": True, "version": version}

    def dispute(self, context, independent_contradiction=False):
        if not self.enabled or not independent_contradiction:
            return {"changed": False}
        row = self.db.execute("SELECT version FROM knowledge WHERE context=? AND status='verified' ORDER BY version DESC LIMIT 1", (context,)).fetchone()
        if not row:
            return {"changed": False}
        with self.db:
            self.db.execute("UPDATE knowledge SET status='disputed' WHERE context=? AND version=?", (context, row[0]))
        return {"changed": True, "version": row[0]}

    def history(self, context):
        if not self.enabled:
            return []
        rows = self.db.execute("SELECT version,mechanism,evidence_digest,status FROM knowledge WHERE context=? ORDER BY version", (context,)).fetchall()
        return [{"version": row[0], "mechanism": json.loads(row[1]), "evidence_sha256": row[2], "status": row[3]} for row in rows]

    def close(self):
        if self.db is not None:
            self.db.close()
            self.db = None
