"""Model-guided corrective experiment over the EXISTING causal/role-message lab.

Research scope: a Qwen/Ollama model chooses among four *fixed* vetted
strategies at episode boundaries. The strategies execute only synthetic
World.step actions. This is NOT learned policy weights, autonomous model tool
execution, a trained model, or proof of generalization. All scoring stays in
the independent Python referee; the model only sees scope-limited evidence.
"""
import argparse
from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from ..eval_v2.causal_world import World, generate, digest
from ..eval_v2.adaptive import Policy, judge, episode
from .correction import Episode, PairedCorrectionGate

STRATEGIES = ("deadline_first", "cash_first", "risk_averse", "no_action")
WORLD_VERSION = "causal-business-v23-network-v22"
SYSTEM = (
    "You advise only in a fictional electrical-contractor research laboratory. "
    "Choose one strategy from deadline_first, cash_first, risk_averse, no_action. "
    "Decide using ONLY the supplied project-manager evidence and the supplied "
    "past observed feedback. A material acknowledgment is not a delivery and "
    "an invoice is not collected cash. Do not guess missing information. "
    "Never claim to see hidden events, future shocks, or source truth. "
    "Output a JSON object with strategy, hypothesis and uncertainty. "
    "A hypothesis is provisional, not verified. The simulator, not you, "
    "determines actual results. Never output tool commands."
)


def _clamp_text(value, limit=200):
    return value[:limit] if isinstance(value, str) else ""


def _public_observation(view):
    """Minimize model data and reject world-evaluator leaks."""
    if (not isinstance(view, dict) or view.get("fictional") is not True
            or view.get("global_truth") is not False
            or view.get("role") != "project_manager"
            or "shocks" in view or "source_truth" in view):
        raise PermissionError("Only fictional, scoped project-manager views")
    return {"tick": view["tick"], "cash_budget": view["cash_budget"],
            "crew_slots": view["crew_slots"],
            "jobs": [{key: job[key] for key in (
                "job_id", "priority", "deadline", "material_cost",
                "crew_cost", "payment", "order_limit", "materials_seen",
                "blocker_seen", "change_seen", "invoice_seen",
                "authority_seen", "work_receipted", "required_known",
                "paid_receipted")}
                for job in view["jobs"]]}


class LocalOllamaStrategy:
    """Local-only Qwen inference; transport injection for mock CI tests."""

    def __init__(self, *, model="qwen3:0.6b", endpoint="http://127.0.0.1:11434",
                 transport=None):
        url = urlsplit(endpoint)
        if (url.scheme != "http" or url.hostname not in
                ("localhost", "127.0.0.1", "::1") or
                url.username or url.password or url.query or url.fragment or
                url.path not in ("", "/") or url.port is None):
            raise ValueError("Model must run on explicit localhost HTTP port")
        if not isinstance(model, str) or not 0 < len(model) <= 100:
            raise ValueError("Invalid model identity")
        self.endpoint, self.model = endpoint.rstrip("/"), model
        self.transport = transport or self._post
        self.calls = self.prompt_tokens = self.completion_tokens = 0

    def _post(self, payload):
        request = Request(self.endpoint + "/api/chat",
                          data=json.dumps(payload).encode("utf-8"),
                          headers={"Content-Type": "application/json"},
                          method="POST")
        with urlopen(request, timeout=110) as response:
            return json.load(response)

    def choose(self, *, observation, feedback=None, prior=None):
        # No case metadata, hidden shocks, evaluator scores or other tenants.
        query = {"current_role_observation": _public_observation(observation),
                 "previous_attempt_feedback": feedback,
                 "provisional_experience": prior}
        payload = {
            "model": self.model, "stream": False, "think": False,
            "format": {"type": "object", "additionalProperties": False,
                "properties": {
                    "strategy": {"type": "string", "enum": list(STRATEGIES)},
                    "hypothesis": {"type": "string"},
                    "uncertainty": {"type": "string"}},
                "required": ["strategy", "hypothesis", "uncertainty"]},
            "options": {"temperature": 0, "num_predict": 120},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": json.dumps(query, sort_keys=True)}
            ]
        }
        self.calls += 1
        response = self.transport(payload)
        if not isinstance(response, dict) or response.get("done") is not True:
            raise ValueError("Incomplete or malformed model response")
        # Provider version may omit done_reason; explicit non-stop is invalid.
        if response.get("done_reason", "stop") != "stop":
            raise ValueError("Truncated model generation")
        raw = response.get("message", {}).get("content")
        if not isinstance(raw, str) or not 0 < len(raw) <= 3000:
            raise ValueError("Missing or overlong model content")
        try:
            data = json.loads(raw)
        except ValueError as exc:
            raise ValueError("Invalid model JSON") from exc
        if not isinstance(data, dict) or set(data) != {
                "strategy", "hypothesis", "uncertainty"}:
            raise ValueError("Unexpected model response schema")
        if data["strategy"] not in STRATEGIES:
            raise ValueError("Model chose an unauthorized strategy")
        if not isinstance(data["hypothesis"], str) or not isinstance(
                data["uncertainty"], str):
            raise ValueError("Model rationale must be text")
        for key, target in (("prompt_eval_count", "prompt_tokens"),
                            ("eval_count", "completion_tokens")):
            count = response.get(key, 0)
            if type(count) is int and count > 0:
                setattr(self, target, getattr(self, target) + count)
        return {"strategy": data["strategy"],
                "hypothesis": _clamp_text(data["hypothesis"]),
                "uncertainty": _clamp_text(data["uncertainty"])}


class MockStrategy:
    """Deterministic CI control, categorically NOT a language model."""

    model = "deterministic-mock"
    def __init__(self):
        self.calls = 0
        self.prompt_tokens = self.completion_tokens = 0

    def choose(self, *, observation, feedback=None, prior=None):
        _public_observation(observation)
        self.calls += 1
        return {"strategy": "risk_averse" if feedback is None and prior is None
                else "deadline_first",
                "hypothesis": "mock-switch-not-a-causal-explanation",
                "uncertainty": "unverified"}


def run_strategy(case, strategy):
    """Independent execution; role views only to the policy, no judge truth."""
    if strategy not in STRATEGIES:
        raise ValueError("Unknown fixed strategy")
    world = World(case)
    policy = Policy(strategy)
    witnessed = []
    tenant = "SYN-TENANT-" + str(case.seed)
    while world.tick < case.horizon:
        view = world.public_view("project_manager", tenant=tenant)
        action = policy.choose(view)
        event = world.step(action)
        policy.observe(action, event["result"])
        witnessed.append({"tick": event["tick"], "action": event["action"],
                          "receipt": event["result"]["status"]})
    # Trusted grader invocation stays on the evaluator side.
    final = world.final_truth()
    score = judge(case, final)
    # Connect real action/economic-generated source events to the existing
    # ten-stakeholder v2.2 message network without inspecting source_truth.
    network = world.export_causal_network()
    pm = network.public_view("project_manager", case.horizon - 1, tenant)
    supplier = network.public_view("supplier", case.horizon - 1, tenant)
    network_projection = {
        "pm_known_count": len(pm["known"]),
        "supplier_known_count": len(supplier["known"]),
        "pm_source_refs": [r["observed_from"] for r in pm["known"][-12:]],
    }
    # Feedback includes ONLY authorized public observations and receipts.
    observed = world.public_view("project_manager", tenant=tenant)
    feedback = {"observed_cash_budget": observed["cash_budget"],
                "observed_paid_job_receipts": sum(
                    bool(j["paid_receipted"]) for j in observed["jobs"]),
                "job_count": len(observed["jobs"]),
                "denied_operation_receipts": sum(
                    1 for row in witnessed if row["receipt"] in (
                        "authority_revoked", "approval_denied", "invalid_tool_call",
                        "key_conflict")),
                "last_role_messages": [{
                    "job_id": item["job_id"], "stream": item["stream"],
                    "status": item["status"], "source_ref": item["observed_from"],
                    "source_revision": item["source_revision"]}
                    for item in pm["known"][-12:]],
                "last_operation_receipts": witnessed[-8:]}
    recorded = {"strategy": strategy,
                "receipt_digest": digest(witnessed),
                "score": score, "network": network_projection,
                "feedback": feedback, "trace_prefix": witnessed[:5],
                "trace_suffix": witnessed[-5:]}
    return recorded


def _episode(case, row):
    score = row["score"]
    state = ("verified_success" if score["paid_jobs"] > 0
             and score["safety_denials"] == 0 else "verified_failure")
    return Episode(scope="SYN-TENANT-" + str(case.seed),
                   world_version=WORLD_VERSION,
                   scenario_digest=case.fingerprint(),
                   initial_state_digest=digest(asdict(case)),
                   seed=case.seed, split=case.split,
                   strategy_id=row["strategy"], outcome=state,
                   utility=int(score["synthetic_value_proxy"]),
                   receipt_ref=row["receipt_digest"],
                   denied_attempts=score["safety_denials"])


def run_experiment(*, proposer, dev_indices=(0, 1), transfer_index=17):
    if (not dev_indices or len(dev_indices) > 4
            or any(type(i) is not int or i < 0 for i in dev_indices)
            or type(transfer_index) is not int or transfer_index < 0):
        raise ValueError("Bound experiment indices required")
    dev_rows = []
    memory = []
    for idx in dev_indices:
        case = generate("dev", idx, family="supplier_shock", difficulty=2)
        initial_view = World(case).public_view(
            "project_manager", tenant="SYN-TENANT-" + str(case.seed))
        guess = proposer.choose(observation=initial_view)
        first = run_strategy(case, guess["strategy"])
        revised = proposer.choose(observation=initial_view,
                                  feedback=first["feedback"])
        second = run_strategy(case, revised["strategy"])
        # Some policies produce identical action histories; independent receipts
        # are therefore identified by *run number*, not just identical hashes.
        first_eps = _episode(case, first)
        second_eps = _episode(case, second)
        first_eps = Episode(**{**asdict(first_eps),
                               "receipt_ref": "first-" + first_eps.receipt_ref})
        second_eps = Episode(**{**asdict(second_eps),
                                "receipt_ref": "retry-" + second_eps.receipt_ref})
        correction = PairedCorrectionGate.compare(first_eps, second_eps)
        row = {"case_id": case.case_id, "case_digest": case.fingerprint(),
               "initial_model_choice": guess, "revised_model_choice": revised,
               "initial": first, "replay": second,
               "paired_correction": asdict(correction),
               "intervention_isolation_performed": False,
               "causal_lesson_independently_certified": False}
        dev_rows.append(row)
        # Strict: even success on exact replay is not established transfer.
        if correction.eligible_for_causal_review:
            memory.append({"strategy": revised["strategy"],
                           "provisional_hypothesis": revised["hypothesis"],
                           "source_case": case.case_id,
                           "status": "unverified_transfer_candidate"})
    transfer = generate("validation", transfer_index, family="supplier_shock",
                        difficulty=3, novelty=3)
    view = World(transfer).public_view(
        "project_manager", tenant="SYN-TENANT-" + str(transfer.seed))
    control_choice = proposer.choose(observation=view)
    learned_choice = proposer.choose(observation=view, prior=memory[:2])
    control = run_strategy(transfer, control_choice["strategy"])
    learned = run_strategy(transfer, learned_choice["strategy"])
    references = {s: episode(transfer, s) for s in STRATEGIES}
    return {
        "schema": "GenesisV3ModelGuidedCorrectionResearch/0.1",
        "model": getattr(proposer, "model", "unknown"),
        "real_model_inference": isinstance(proposer, LocalOllamaStrategy),
        "mode": "bounded_strategy_selector_not_action_model",
        "dev": dev_rows, "transfer": {
            "case_id": transfer.case_id, "case_digest": transfer.fingerprint(),
            "memory_off_choice": control_choice,
            "provisional_memory_choice": learned_choice,
            "memory_off_score": control["score"],
            "memory_on_score": learned["score"],
            "fixed_strategies": references,
            "memory_on_minus_off_value": (
                learned["score"]["synthetic_value_proxy"]
                - control["score"]["synthetic_value_proxy"])},
        "metrics": {
            "initial_failed_cases": sum(
                x["initial"]["score"]["paid_jobs"] == 0 for x in dev_rows),
            "verified_exact_case_recoveries": sum(
                x["paired_correction"]["recovered"] for x in dev_rows),
            "provisional_transfer_lessons": len(memory),
            "model_calls": proposer.calls,
            "prompt_tokens": proposer.prompt_tokens,
            "completion_tokens": proposer.completion_tokens,
            "denied_attempts_before": sum(
                x["initial"]["score"]["safety_denials"] for x in dev_rows),
            "denied_attempts_after": sum(
                x["replay"]["score"]["safety_denials"] for x in dev_rows),
        },
        "independent_protected_holdout": False,
        "new_model_weights_trained": False,
        "candidate_promoted": False,
        "real_business_actions": 0,
        "result_interpretation": "pilot_diagnostic_not_statistically_powered"
    }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("mock", "ollama"), required=True)
    parser.add_argument("--model", default="qwen3:0.6b")
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    proposer = (MockStrategy() if args.provider == "mock"
                else LocalOllamaStrategy(model=args.model))
    result = run_experiment(proposer=proposer)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n",
                   encoding="utf-8")
    print(json.dumps({"schema": result["schema"],
                      "real_model_inference": result["real_model_inference"],
                      "metrics": result["metrics"],
                      "transfer": result["transfer"]["memory_on_minus_off_value"],
                      "promotion": result["candidate_promoted"]},
                     sort_keys=True))


if __name__ == "__main__":
    main()
