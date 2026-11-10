"""Independent referee. HIDDEN SIDE: holds the world, applies and grades choices.

The referee validates every proposal against its own record of what was
published, applies the safe no-action reference whenever a proposal is
missing, abstained or invalid, and hands the policy nothing but the realized
outcome of the applied action. Scores, counterfactuals and oracle values stay
in the ledger rows it returns to the runner.
"""

from time import perf_counter

from ..runtime.contracts import PENDING_HUMAN_REVIEW, DecisionProposalV1, OutcomeRecordV1
from .protocol import GRADER_VERSION  # noqa: F401  (part of the grading identity)


def utility(effects: dict, weights: dict) -> float:
    """Realized owner utility: goal-weighted effects, no uncertainty discount."""
    return sum(weights.get(name, 0) * effects.get(name, 0.0) for name in weights)


def hindsight_oracle(world) -> float:
    """Best total utility reachable knowing every hidden shock in advance."""
    memo: dict = {}

    def best(state, step: int) -> float:
        if step == world.horizon:
            return 0.0
        key = (step, state)
        if key not in memo:
            memo[key] = max(
                utility(effects, world.weights) + best(following, step + 1)
                for effects, following in (world.transition(state, step, decisions)
                                           for decisions in world.admissible(state, step)))
        return memo[key]

    return best(world.initial_state(), 0)


def _judge(answer, world, step, admissible, published) -> tuple:
    """Typed validation. Returns (decisions to apply, selected card, failures)."""
    baseline = world.baseline_decisions
    if answer is None:
        return baseline, None, []
    if (not isinstance(answer, DecisionProposalV1) or answer.tenant_id != world.tenant_id
            or answer.domain_id != world.domain_id or answer.case_id != step.case_id
            or answer.external_actions != 0):
        return baseline, None, ["invalid_proposal"]
    if answer.abstained:
        return baseline, None, ["abstained"]
    card, failures = answer.selected_option, []
    try:
        decisions = tuple((str(axis), str(choice)) for axis, choice in card["decisions"])
    except (KeyError, TypeError, ValueError):
        return baseline, None, ["invalid_proposal"]
    if answer.approval_state != PENDING_HUMAN_REVIEW:
        failures.append("invalid_proposal")
    if decisions not in admissible:
        failures.append("inadmissible_action")
    grounded = bool(answer.evidence_refs)
    for ref in answer.evidence_refs:
        source = published.get(ref.get("event_id")) if isinstance(ref, dict) else None
        grounded = grounded and source is not None and (
            source.scope_id == step.scope_id and source.value is not None
            and source.source_revision == ref.get("source_revision"))
    if not grounded:
        failures.append("invalid_evidence")
    return (baseline if failures else decisions), card, failures


def _identifier(answer, decisions) -> str:
    wanted = [list(pair) for pair in decisions]
    for card in getattr(answer, "candidate_options", ()):
        if card.get("decisions") == wanted:
            return card["identifier"]
    return "|".join(choice for _, choice in decisions)


def run_episode(world, policy, partition: str, oracle_value: float,
                clock=perf_counter) -> tuple[list[dict], dict]:
    weights, baseline = world.weights, world.baseline_decisions
    tag = {"partition": partition, "family": world.family, "variant": world.variant,
           "seed": world.seed, "policy": policy.name}
    rows, total, current = [], 0.0, {}
    state = world.initial_state()
    errors = []
    try:
        policy.begin(world.tenant_id, world.domain_id, world.goal_profile())
    except Exception as error:  # an unusable candidate is recorded, not hidden
        errors.append(type(error).__name__)
    try:
        for step_index in range(world.horizon):
            step = world.public_step(state, step_index)
            for item in step.observations:  # the referee's own view of what is current
                held = current.get(item.fact_key)
                if held is None or item.source_revision > held.source_revision:
                    current[item.fact_key] = item
            published = {item.event_id: item for item in current.values()}
            admissible = world.admissible(state, step_index)
            answer, failures = None, []
            started = clock()
            if errors:
                failures.append("policy_error")
            else:
                try:
                    answer = policy.decide(step)
                except Exception as error:
                    errors.append(type(error).__name__)
                    failures.append("policy_error")
            latency_ms = (clock() - started) * 1000
            applied, card, judged = _judge(answer, world, step, admissible, published)
            failures += judged
            effects, following = world.transition(state, step_index, applied)
            value = utility(effects, weights)
            no_action = oracle = regret = harmful = None
            if not world.sequential:
                no_action = utility(world.transition(state, step_index, baseline)[0], weights)
                oracle = max(utility(world.transition(state, step_index, option)[0], weights)
                             for option in admissible)
                regret, harmful = max(0.0, oracle - value), value < no_action
                if harmful:
                    failures.append("harmful_choice")
            predicted = error = None
            if card is not None and not judged:
                expected = card["expected_effects"]
                predicted = utility(expected, weights)
                error = sum(abs(effects[name] - expected[name]) for name in expected) / max(
                    1, len(expected))
            proposal = answer if isinstance(answer, DecisionProposalV1) else None
            if proposal is not None and not errors:
                try:
                    policy.learn(OutcomeRecordV1(
                        outcome_id="OUT-" + step.case_id, proposal_id=proposal.proposal_id,
                        tenant_id=world.tenant_id, domain_id=world.domain_id,
                        chosen_action_ref=_identifier(proposal, applied),
                        observed_effects={k: round(v, 6) for k, v in effects.items()},
                        receipt_ref="SIM-RECEIPT-" + step.case_id,
                        evidence_ref="SIM-" + step.case_id,
                        observation_time=step.as_of + 1, verified=True))
                except Exception as error_:
                    errors.append(type(error_).__name__)
                    failures.append("policy_error")
            memory = proposal.memory if proposal is not None else None
            rows.append({
                "type": "decision", **tag, "step": step_index, "case_id": step.case_id,
                "route": proposal.route if proposal is not None else "none",
                "selected": card["identifier"] if card is not None else None,
                "applied": _identifier(proposal, applied),
                "abstained": "abstained" in failures,
                "abstention_reason": proposal.abstention_reason if proposal else None,
                "failure_classes": sorted(set(failures)),
                "realized_value": round(value, 6),
                "no_action_value": None if no_action is None else round(no_action, 6),
                "oracle_value": None if oracle is None else round(oracle, 6),
                "regret": None if regret is None else round(regret, 6),
                "harmful": harmful,
                "predicted_value": None if predicted is None else round(predicted, 6),
                "prediction_abs_error": None if error is None else round(error, 6),
                "candidates": len(proposal.candidate_options) if proposal else 0,
                "evidence_refs": len(proposal.evidence_refs) if proposal else 0,
                "evidence_valid": None if proposal is None or proposal.abstained
                else "invalid_evidence" not in failures,
                "known_unknowns": len(proposal.known_unknowns) if proposal else 0,
                "memory_version": memory["effect_model_version"] if memory else None,
                "model_calls": proposal.model["calls"] if proposal and proposal.model else 0,
                "proposal_id": proposal.proposal_id if proposal else None,
                "latency_ms": round(latency_ms, 3),
            })
            total += value
            state = following
    finally:
        try:
            policy.close()
        except Exception:
            pass
    episode = {
        "type": "episode", **tag, "decisions": len(rows),
        "episode_value": round(total, 6),
        "oracle_episode_value": round(oracle_value, 6),
        "episode_regret": round(max(0.0, oracle_value - total), 6),
        "error_types": sorted(set(errors)),
    }
    return rows, episode
