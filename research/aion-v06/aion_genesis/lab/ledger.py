"""Append-only, hash-chained experiment ledger (tamper-evident, not tamper-proof)."""

from hashlib import sha256
import json
from pathlib import Path

from ..runtime.contracts import canonical

GENESIS = "0" * 64
NON_LOGICAL = ("latency_ms",)  # measured wall time: recorded, never part of replay


class Ledger:
    def __init__(self):
        self.records: list[dict] = []
        self.head = GENESIS

    def append(self, event: dict) -> None:
        link = sha256((self.head + canonical(event)).encode("utf-8")).hexdigest()
        self.records.append({"seq": len(self.records), "prev": self.head, "hash": link,
                             "event": event})
        self.head = link

    def write(self, path: Path) -> None:
        with Path(path).open("w", encoding="utf-8") as handle:
            for record in self.records:
                handle.write(canonical(record) + "\n")


def read_ledger(path: Path) -> list[dict]:
    with Path(path).open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def verify_chain(records: list[dict]) -> list[str]:
    problems, head = [], GENESIS
    for position, record in enumerate(records):
        if not isinstance(record, dict) or set(record) != {"seq", "prev", "hash", "event"}:
            return problems + [f"ledger record {position} is malformed"]
        expected = sha256((head + canonical(record["event"])).encode("utf-8")).hexdigest()
        if record["seq"] != position or record["prev"] != head or record["hash"] != expected:
            return problems + [f"ledger hash chain breaks at record {position}"]
        head = expected
    return problems


def events(records: list[dict], kind: str | None = None) -> list[dict]:
    return [r["event"] for r in records if kind is None or r["event"].get("type") == kind]


def logical_rows(records: list[dict]) -> list[dict]:
    """Decision and episode outcomes without measured timing."""
    return [{k: v for k, v in event.items() if k not in NON_LOGICAL}
            for event in events(records) if event.get("type") in ("decision", "episode")]


def logical_digest(records: list[dict]) -> str:
    digest = sha256()
    for row in logical_rows(records):
        digest.update(canonical(row).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()
