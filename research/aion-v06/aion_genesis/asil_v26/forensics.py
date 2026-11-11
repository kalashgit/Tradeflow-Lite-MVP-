"""Read-only forensic replay of the ALREADY INSPECTED v2.5 novel cohort.

This is explicitly diagnosis, not a new validation set or a promotional test.
It observes exactly what a policy saw, what it proposed, and what the mock
executor actually returned. The candidate never sees hidden world shocks.
"""

from collections import Counter
from hashlib import sha256
import json
from pathlib import Path

from ..asil import IntuitionMemory, RouterConfig
from ..eval_v2.asil_policy import AsilCausalPolicy, TransitionModel
from ..eval_v2.asil_runner import cohort, load_protocol
from ..eval_v2.causal_world import World

REFERENCE = Path(__file__).resolve().parents[2] / "reports" / "asil_v25"
DENIALS = frozenset({"authority_revoked", "approval_denied", "key_conflict",
                     "invalid_tool_call"})


def trace_known_v25_denials(reference: Path = REFERENCE):
    protocol = load_protocol()
    config = RouterConfig(**protocol["router_config"])
    result = json.loads((reference / "result.json").read_text())
    payload = json.loads((reference / "memory.json").read_text())
    memory = IntuitionMemory.from_json(payload, config)
    if memory.digest() != result["candidate"]["memory_digest"]:
        raise ValueError("Reference memory does not match the frozen candidate")
    memory.frozen = True
    model = TransitionModel.from_json(result["candidate"]["transition_model"])
    model.frozen = True
    cases = cohort(protocol["cohorts"]["novel"])
    denied, routes = [], Counter()
    for index, case in enumerate(cases):
        policy = AsilCausalPolicy(case, mode="adaptive", memory=memory, model=model,
                                  config=config, episode_index=60)
        world = World(case)
        try:
            while world.tick < case.horizon:
                public = world.public_view("project_manager", tenant=policy.tenant)
                action = policy.choose(public)
                response = world.step(action)["result"]
                policy.observe(action, response)
                if response["status"] in DENIALS:
                    job = next(j for j in public["jobs"]
                               if j["job_id"] == action["job_id"])
                    route = policy.decisions[-1]["route"]
                    routes[route] += 1
                    denied.append({
                        "case_id": case.case_id, "case_fingerprint": case.fingerprint(),
                        "tick": public["tick"], "action": action["tool"],
                        "status": response["status"], "route": route,
                        "public_authority_status": job["authority_seen"],
                    })
        finally:
            policy.close()
    return {"schema": "AsilV25InspectedDenialTrace/1", "evidence_tier":
            "diagnostic_replay_inspected_v25_cases_not_fresh_validation",
            "cohort_size": len(cases), "denied": denied,
            "route_denials": dict(sorted(routes.items())),
            "trace_sha256": sha256(json.dumps(denied, sort_keys=True).encode()).hexdigest(),
            "promotion_authorized": False}


if __name__ == "__main__":
    print(json.dumps(trace_known_v25_denials(), indent=2, sort_keys=True))
