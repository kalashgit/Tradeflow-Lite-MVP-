"""Checkpoint registry: lineage, accept/reject, and rollback. Nothing is deleted."""

import json
from pathlib import Path

STATES = ("candidate", "accepted", "rejected")


class ModelRegistry:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "registry.json"
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {
            "schema": "GenesisModelRegistry/1", "entries": [], "current": {}}

    def _save(self):
        self.path.write_text(json.dumps(self.state, sort_keys=True, indent=1))

    def register(self, *, model_id: str, family: str, path: str, lineage: dict) -> dict:
        if any(e["model_id"] == model_id for e in self.state["entries"]):
            raise ValueError("Model id already registered (ids are immutable)")
        entry = {"model_id": model_id, "family": family, "path": str(path),
                 "state": "candidate", "lineage": lineage, "verdicts": [],
                 "parent": self.state["current"].get(family)}
        self.state["entries"].append(entry)
        self._save()
        return entry

    def entry(self, model_id: str) -> dict:
        return next(e for e in self.state["entries"] if e["model_id"] == model_id)

    def decide(self, model_id: str, verdict: dict, *, decided_by: str) -> dict:
        """Record an evaluation verdict. Only an authority verdict can accept."""
        entry = self.entry(model_id)
        if verdict.get("issued_by") != "gml-evaluation-authority" or not decided_by:
            raise PermissionError("Only the evaluation authority's verdict can be recorded")
        accepted = verdict.get("verdict") == "PASS"
        entry["state"] = "accepted" if accepted else "rejected"
        entry["verdicts"].append({**verdict, "decided_by": decided_by})
        if accepted:
            self.state["current"][entry["family"]] = model_id
        self._save()
        return entry

    def current(self, family: str):
        return self.state["current"].get(family)

    def rollback(self, family: str) -> str | None:
        """Return to the accepted parent of the current model; history is kept."""
        current = self.current(family)
        if current is None:
            return None
        parent = self.entry(current)["parent"]
        if parent is None:
            self.state["current"].pop(family)
        else:
            self.state["current"][family] = parent
        self._save()
        return parent
