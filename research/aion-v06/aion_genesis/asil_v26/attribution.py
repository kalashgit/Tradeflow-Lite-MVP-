"""Append-only action evidence distinct from terminal job goals.

Terminal payment is a goal-level observation, NOT a per-action causal effect.
Only separately supported direct action effects are exportable as trusted
strategy evidence. All pending or unobserved cases remain unlearned.
"""

from hashlib import sha256
import json
import re

STATES = frozenset({"verified_success", "verified_failure",
                    "censored_pending", "unknown"})
_OPAQUE = re.compile(r"[A-Za-z0-9_.:/-]{1,160}\Z")


def _hash(previous, event):
    data = json.dumps({"previous": previous, "event": event},
                      sort_keys=True, separators=(",", ":"))
    return sha256(data.encode("utf-8")).hexdigest()


class OutcomeAttributionLedger:
    """A per-scope monotonic evidence log; never learns from payment alone."""

    def __init__(self, scope: str):
        if not _OPAQUE.fullmatch(scope):
            raise ValueError("Invalid attribution scope")
        self.scope = scope
        self._actions: dict[str, dict] = {}
        self.events: list[dict] = []
        self.head = "0" * 64

    def _append(self, event):
        self.head = _hash(self.head, event)
        self.events.append({**event, "chain_hash": self.head})

    def expect(self, *, scope: str, decision_id: str, subject: str, action: str,
               intervention_ref: str, tick: int):
        if scope != self.scope:
            raise PermissionError("Cross-scope intervention rejected")
        if (not all(_OPAQUE.fullmatch(value) for value in
                    (decision_id, subject, action, intervention_ref))
                or type(tick) is not int or tick < 0):
            raise ValueError("Invalid intervention evidence")
        if decision_id in self._actions:
            raise ValueError("Duplicate action decision")
        record = {"scope": self.scope, "decision_id": decision_id,
                  "subject": subject, "action": action,
                  "intervention_ref": intervention_ref, "tick": tick,
                  "state": "unknown", "goal_payment": None,
                  "action_effect_ref": None, "classification_set": False}
        self._actions[decision_id] = record
        self._append({"type": "intervention", **record})

    def settle(self, decision_id: str, *, scope: str, state: str, evidence_ref: str,
               independently_verified: bool = False,
               goal_payment: bool | None = None):
        if scope != self.scope:
            raise PermissionError("Cross-scope outcome rejected")
        if decision_id not in self._actions:
            raise KeyError("Unknown action decision")
        if state not in STATES or not _OPAQUE.fullmatch(evidence_ref):
            raise ValueError("Invalid outcome evidence")
        if goal_payment is not None and type(goal_payment) is not bool:
            raise ValueError("Payment observation must be boolean or unknown")
        record = self._actions[decision_id]
        if record["classification_set"]:
            raise ValueError("Action already classified; do not overwrite evidence")
        if state.startswith("verified_") and not independently_verified:
            raise ValueError("Terminal job outcome is not action-level causal proof")
        if state.startswith("verified_") and evidence_ref == record["intervention_ref"]:
            raise ValueError("An operation receipt cannot prove its own business effect")
        record["state"] = state
        record["classification_set"] = True
        record["goal_payment"] = goal_payment
        if state.startswith("verified_"):
            record["action_effect_ref"] = evidence_ref
        self._append({"type": "outcome", "decision_id": decision_id,
                      "state": state, "evidence_ref": evidence_ref,
                      "independently_verified": independently_verified,
                      "goal_payment": goal_payment})

    def trusted_records(self) -> list[dict]:
        return [dict(record) for record in self._actions.values()
                if record["state"] in ("verified_success", "verified_failure")
                and record["action_effect_ref"] is not None]

    def pending_records(self) -> list[dict]:
        return [dict(record) for record in self._actions.values()
                if record["state"] in ("unknown", "censored_pending")]

    def snapshot(self) -> dict:
        return {"schema": "AsilOutcomeAttribution/2.6-research", "scope": self.scope,
                "head": self.head, "events": [dict(event) for event in self.events]}

    @staticmethod
    def verify(snapshot: dict) -> bool:
        head = "0" * 64
        for item in snapshot["events"]:
            event = {k: v for k, v in item.items() if k != "chain_hash"}
            head = _hash(head, event)
            if head != item["chain_hash"]:
                return False
        return head == snapshot["head"]
