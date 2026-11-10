"""Reference agents for the mock-only workflow lab. Replace via a policy adapter.

Candidates receive public snapshots and previous tool results only. They never
receive Scenario, faults, hidden evaluator truth or production credentials.
"""


class NoAction:
    name = "no_action"

    def choose(self, view):
        return {"tool": "noop", "key": ""}

    def observe(self, call, result):
        pass


class SafeRule:
    """Cheap, human-auditable benchmark; NEVER replace with a weak strawman."""

    name = "safe_rule"

    def __init__(self):
        self.order_requested = False
        self.pending = None
        self.retry_action = None

    def choose(self, view):
        if self.pending:
            return {"tool": "verify_operation", "key": self.pending["key"]}
        if self.retry_action:
            retry, self.retry_action = self.retry_action, None
            return retry
        if not view["supplier_checked"]:
            return {"tool": "inspect_supplier", "key": ""}
        if view["completed"]:
            return ({"tool": "noop", "key": ""} if view["verified"]
                    else {"tool": "verify_job", "key": ""})
        if not view["supplier_available"]:
            return {"tool": "noop", "key": ""}
        if not view["material_ready"]:
            if (self.order_requested or
                    view["material_cost"] > view["approved_order_limit"] or
                    view["cash"] < view["material_cost"]):
                return {"tool": "noop", "key": ""}
            return {"tool": "place_order", "key": "material-lot-1"}
        if not view["crew_authorized"] or view["cash"] < view["labor_cost"]:
            return {"tool": "noop", "key": ""}
        if view["work_completed"] < view["work_required"]:
            return {"tool": "assign_crew",
                    "key": "crew-phase-" + str(view["work_completed"] + 1)}
        return {"tool": "verify_job", "key": ""}

    def observe(self, call, result):
        if result.get("status") == "timeout_unknown_commit":
            self.pending = dict(call)
            return
        if call["tool"] == "verify_operation" and self.pending:
            if result.get("status") == "not_found":
                self.retry_action = self.pending
                self.pending = None
            elif result.get("status") == "committed":
                if self.pending["tool"] == "place_order":
                    self.order_requested = True
                self.pending = None
            return
        if (call["tool"] == "place_order" and result.get("status") in (
                "committed", "already_committed")):
            self.order_requested = True


class EagerRule:
    """Negative control for unverified retries and inattentive spending."""

    name = "eager_rule"

    def choose(self, view):
        if not view["supplier_checked"]:
            return {"tool": "inspect_supplier", "key": ""}
        if view["completed"]:
            return ({"tool": "verify_job", "key": ""} if not view["verified"]
                    else {"tool": "noop", "key": ""})
        if not view["material_ready"]:
            return {"tool": "place_order", "key": "order-" + str(view["tick"])}
        return {"tool": "assign_crew", "key": "labor-" + str(view["tick"])}

    def observe(self, call, result):
        pass


POLICIES = {
    "no_action": NoAction,
    "safe_rule": SafeRule,
    "eager_rule": EagerRule,
}


def make_policy(name):
    if name not in POLICIES:
        raise ValueError("Unknown research-only policy")
    return POLICIES[name]()
