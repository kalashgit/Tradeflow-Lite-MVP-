"""Simple portfolio controls: a meaningful safe baseline and no-action.

The expensive Claude candidate may later register a policy here, but must not
change the simulator, grading weights, or baseline implementations.
"""


class NoAction:
    name = "no_action"

    def choose(self, public):
        return {"tool": "wait", "job_id": "", "key": ""}

    def observe(self, call, response):
        pass


class RulePortfolio:
    """One deterministic, reviewable plan; no hidden world or future shocks."""

    def __init__(self, strategy):
        if strategy not in ("deadline_first", "cash_aware"):
            raise ValueError("Invalid reference strategy")
        self.name = strategy
        self._pending = None
        self._retry = None

    def _rank(self, job):
        if self.name == "deadline_first":
            return (job["deadline"], -job["priority"], job["job_id"])
        expenditure = job["material_cost"] + job["labor_cost"] * max(
            1, job["work_required"] - job["work_done"])
        net = job["payment"] - expenditure
        # Compare value/cost without floats; adequate for a cheap control.
        return (-net / max(1, expenditure), -job["priority"],
                job["deadline"], job["job_id"])

    def choose(self, public):
        if self._pending:
            return {"tool": "inspect_operation", "job_id": "",
                    "key": self._pending["key"]}
        if self._retry:
            replay, self._retry = self._retry, None
            return replay
        jobs = list(public["jobs"])
        # Finishing the paid work and verifying state has priority.
        ready_verify = sorted((j for j in jobs if
                               j["work_done"] >= j["work_required"] and
                               not j["verified"]), key=self._rank)
        if ready_verify:
            return {"tool": "verify_job", "job_id": ready_verify[0]["job_id"],
                    "key": ""}
        workable = sorted((
            j for j in jobs if j["materials"] == "ready" and
            j["work_done"] < j["work_required"] and j["crew_approved"] and
            j["labor_cost"] <= public["cash"]), key=self._rank)
        if workable and public["crew_available"] > 0:
            chosen = workable[0]
            return {"tool": "schedule_crew", "job_id": chosen["job_id"],
                    "key": f"crew:{chosen['job_id']}:{chosen['work_done'] + 1}"}
        candidates = sorted((
            j for j in jobs if j["materials"] == "unplaced" and
            j["material_cost"] <= public["cash"] and
            j["material_cost"] <= j["order_limit"] and
            j["crew_approved"]), key=self._rank)
        if candidates and public["supplier_slots_available"] > 0:
            chosen = candidates[0]
            # Preserve enough funds for the next immediate labor shift.
            if public["cash"] >= chosen["material_cost"] + chosen["labor_cost"]:
                return {"tool": "order_materials", "job_id": chosen["job_id"],
                        "key": "materials:" + chosen["job_id"]}
        return {"tool": "wait", "job_id": "", "key": ""}

    def observe(self, call, response):
        if response.get("status") == "timeout_unknown_commit" and (
                call["tool"] in ("order_materials", "schedule_crew")):
            self._pending = dict(call)
            return
        if call["tool"] == "inspect_operation" and self._pending:
            if response.get("status") == "not_found":
                self._retry = self._pending
            self._pending = None


BASELINES = {
    "no_action": NoAction,
    "deadline_first": lambda: RulePortfolio("deadline_first"),
    "cash_aware": lambda: RulePortfolio("cash_aware"),
}


def make_policy(name):
    if name not in BASELINES:
        raise ValueError("Unregistered portfolio policy")
    return BASELINES[name]()
