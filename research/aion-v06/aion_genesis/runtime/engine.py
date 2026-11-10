"""AION Genesis v1.0 unified runtime: observe → situation → investigate → proposal → outcome.

One portable core serves every domain adapter. It reuses the v0.8 evidence
ledger database and the frozen v0.9 ``StrategicPlanner`` for bounded search.
It cannot act: every result is a ``pending_human_review`` draft or an explicit
abstention, and there is no code path that calls a host command.
"""

from dataclasses import dataclass, replace
import json
from math import isfinite, prod
from time import perf_counter
from typing import Iterable

from ..strategic_planner import Choice, Goals, StrategicPlanner, _value
from .contracts import (
    ABSTAINED, PENDING_HUMAN_REVIEW, DecisionProposalV1, DecisionRequestV1,
    GoalProfileV1, ObservationV1, OutcomeRecordV1, canonical, digest, plain,
)
from .domain import DomainAdapter, freshness_limit
from .learning import EffectModel, effect_keys
from .contextual_memory import ContextualEffectModel, public_context
from .hybrid_memory import HybridEffectModel
from .relevant_memory import RelevantEffectModel
from .domain_general_memory import DomainGeneralRelevantEffectModel
from .store import DUPLICATE, RuntimeStore

FAST_PATH_MS = 10          # a request this urgent skips bounded search
MAX_MODEL_ATTEMPTS = 2     # one bounded retry after an invalid model reply
_MAX_REPLY = 4000


@dataclass(frozen=True)
class ModelBinding:
    """A pluggable chat model (any object with ``complete(messages) -> str``)."""

    adapter: object
    identity: str
    is_mock: bool


def _contextual_store_key(domain_id: str, scope_id: str) -> str:
    """Keep experimental contextual corrections isolated by domain and scope."""
    return f"{domain_id}::contextual_v12::{scope_id}"


def _hybrid_store_key(domain_id: str, scope_id: str) -> str:
    """Independent provisional state for the second prospective candidate."""
    return f"{domain_id}::hybrid_v12::{scope_id}"


def _relevant_store_key(domain_id: str, scope_id: str) -> str:
    """Keep relevance-memory history separate from older research models."""
    return f"{domain_id}::relevant_v123::{scope_id}"


def _domain_general_store_key(domain_id: str) -> str:
    """One tenant/domain model, with independently gated scope histories."""
    return f"{domain_id}::relevant_v124::domain"


class _Abstain(Exception):
    def __init__(self, reason: str, known_unknowns=(), constraints=(), version=None):
        super().__init__(reason)
        self.reason = reason
        self.known_unknowns = tuple(known_unknowns)
        self.constraints = tuple(constraints)
        self.version = version


class _BoundedDomain:
    """Applies hard constraints and provisional memory around a domain pack."""

    def __init__(self, base, model: EffectModel | ContextualEffectModel | HybridEffectModel | RelevantEffectModel | DomainGeneralRelevantEffectModel | None,
                 forbidden, context=(), as_of=0, scope_id=None):
        self.name = base.name
        self.axes = base.axes
        self.baseline_decisions = base.baseline_decisions
        self._base, self._model, self._forbidden = base, model, forbidden
        self._context, self._as_of, self._scope_id = context, as_of, scope_id
        self.raw: dict[str, Choice] = {}
        self.adjusted: dict[str, Choice] = {}
        self.assessments = self.excluded_forbidden = self.excluded_prerequisite = 0

    def assess(self, facts, decisions):
        self.assessments += 1
        if any(pair in self._forbidden for pair in decisions):
            self.excluded_forbidden += 1
            return None
        choice = self._base.assess(facts, decisions)
        if choice is None:
            self.excluded_prerequisite += 1
            return None
        if not isinstance(choice, Choice):
            raise ValueError("Domain pack returned an unsupported option")
        self.raw[choice.identifier] = choice
        if self._model is not None:
            keys = effect_keys(decisions)
            choice = replace(choice, expected_effects={
                name: round(value + (
                    self._model.correction(keys, name, self._context, self._as_of,
                                           self._scope_id)
                    if isinstance(self._model, DomainGeneralRelevantEffectModel)
                    else self._model.correction(keys, name, self._context, self._as_of)
                    if isinstance(self._model, (ContextualEffectModel, HybridEffectModel, RelevantEffectModel))
                    else self._model.correction(keys, name)), 6)
                for name, value in choice.expected_effects.items()})
        self.adjusted[choice.identifier] = choice
        return choice


def _check_choice(choice: Choice, decisions, evidence_ids: set[str], goals: Goals) -> None:
    """The v0.9 planner's safety checks, for the fast path that bypasses it."""
    if choice.decisions != decisions or not choice.requires_human_approval:
        raise ValueError("Unsafe or inconsistent option")
    if not choice.evidence_ids or not set(choice.evidence_ids) <= evidence_ids:
        raise ValueError("Ungrounded decision evidence")
    if not choice.explanation or not choice.uncertainty_note:
        raise ValueError("Missing decision explanation or uncertainty")
    numbers = [choice.estimated_spend, *choice.expected_effects.values(),
               *choice.uncertainty.values()]
    if any(not isfinite(n) for n in numbers) or choice.estimated_spend < 0 or any(
            v < 0 for v in choice.uncertainty.values()):
        raise ValueError("Non-finite or unsupported option estimate")
    if set(choice.expected_effects) - goals.weights.keys():
        raise ValueError("Domain option uses an unregistered owner objective")


def _parse_advice(raw, allowed: list[str]) -> str | None:
    """Fail closed: anything but one exact, allowed option id is ignored."""
    if not isinstance(raw, str) or len(raw) > _MAX_REPLY:
        return None
    try:
        reply = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(reply, dict) or set(reply) - {"selected", "rationale"}:
        return None
    rationale = reply.get("rationale", "")
    if not isinstance(rationale, str) or len(rationale) > 300:
        return None
    selected = reply.get("selected")
    return selected if isinstance(selected, str) and selected in allowed else None


class AionRuntime:
    def __init__(self, store: RuntimeStore, adapters: Iterable[DomainAdapter],
                 model: ModelBinding | None = None, clock=perf_counter):
        self.store = store
        self.adapters = {adapter.domain_id: adapter for adapter in adapters}
        self.model = model
        self.clock = clock

    def _adapter(self, domain_id: str) -> DomainAdapter:
        adapter = self.adapters.get(domain_id)
        if adapter is None:
            raise ValueError("Unregistered domain")
        return adapter

    # ---------------------------------------------------------------- observe
    def observe(self, observation: ObservationV1) -> str:
        self._adapter(observation.domain_id)
        result = self.store.observe(observation)
        if result != DUPLICATE:
            self.store.append_trace(observation.tenant_id, "observation",
                                    observation.to_json(), result)
        return result

    def set_goal_profile(self, profile: GoalProfileV1) -> bool:
        adapter = self._adapter(profile.domain_id)
        if set(profile.goal_weights) != set(adapter.objectives):
            raise ValueError("A goal profile must weight exactly the domain's objectives")
        changed = self.store.put_goal_profile(profile)
        if changed:
            self.store.append_trace(profile.tenant_id, "goal_profile", profile.to_json(),
                                    str(profile.owner_preference_version))
        return changed

    # -------------------------------------------------------------- situation
    def _partition(self, adapter, tenant_id, scope_id, as_of):
        usable, unknowns = [], []
        for item in self.store.current(tenant_id, adapter.domain_id, scope_id):
            label = f"{item.metric}@{item.subject_id}"
            if item.visibility != "tenant":
                unknowns.append("restricted:" + label)
            elif item.observed_at > as_of:
                unknowns.append("not_yet_valid:" + label)
            elif as_of - item.observed_at > freshness_limit(adapter, item.metric):
                unknowns.append("stale:" + label)
            elif item.value is None:
                unknowns.append("unknown:" + label)
            else:
                usable.append(item)
        return usable, unknowns

    def situation(self, tenant_id: str, domain_id: str, scope_id: str, as_of: int) -> dict:
        """Current usable facts and explicit known unknowns for one scope."""
        adapter = self._adapter(domain_id)
        usable, unknowns = self._partition(adapter, tenant_id, scope_id, as_of)
        profile = self.store.goal_profile(tenant_id, domain_id)
        return {
            "tenant_id": tenant_id, "domain_id": domain_id, "scope_id": scope_id,
            "as_of": as_of, "usable_facts": [item.to_json() for item in usable],
            "known_unknowns": unknowns,
            "goal_profile_version": profile.owner_preference_version if profile else None,
            "assumptions_promoted_to_facts": 0,
        }

    # ------------------------------------------------------------ investigate
    def investigate(self, request: DecisionRequestV1) -> DecisionProposalV1:
        adapter = self._adapter(request.domain_id)
        request_body = canonical(request.to_json())
        prior = self.store.proposal_for_request(request.tenant_id, request.request_id)
        if prior is not None:
            if prior[0] != request_body:
                raise ValueError("Request id reused with different content")
            return prior[1]
        try:
            draft = self._investigate(adapter, request, self.clock())
        except _Abstain as stop:
            draft = {
                "route": "abstained", "candidate_options": (), "selected_option": None,
                "expected_effects": {}, "uncertainty": {},
                "constraints_checked": stop.constraints, "evidence_refs": (),
                "alternatives": (), "abstention_reason": stop.reason,
                "approval_state": ABSTAINED, "known_unknowns": stop.known_unknowns,
                "goal_profile_version": stop.version, "memory": None, "model": None,
                "budgets": {"time_budget_ms": request.time_budget_ms,
                            "compute_budget": request.compute_budget,
                            "model_call_budget": request.model_call_budget},
                "state_digest": digest([stop.reason, list(stop.known_unknowns)]),
            }
        state_digest = draft.pop("state_digest")
        body = plain({
            **draft, "request_id": request.request_id, "case_id": request.case_id,
            "tenant_id": request.tenant_id, "domain_id": request.domain_id,
            "scope_id": request.scope_id, "as_of": request.as_of,
            "domain_version": adapter.version,
        })
        proposal = DecisionProposalV1(
            proposal_id="PROP-" + digest([request_body, body]),
            trace_id="TRACE-" + digest([request_body, state_digest]), **body)
        self.store.save_proposal(request_body, proposal)
        self.store.append_trace(request.tenant_id, "request", request.to_json(),
                                proposal.proposal_id)
        return proposal

    def _investigate(self, adapter, request: DecisionRequestV1, started: float) -> dict:
        tenant, domain_id = request.tenant_id, request.domain_id
        capabilities = set(request.available_capabilities)
        profile = self.store.goal_profile(tenant, domain_id)
        if profile is None:
            raise _Abstain("missing_goal_profile")
        version = profile.owner_preference_version
        if request.goal_profile_ref is not None and request.goal_profile_ref != version:
            raise _Abstain("goal_profile_reference_superseded", version=version)
        if set(profile.goal_weights) != set(adapter.objectives):
            raise _Abstain("missing_goal_weights", version=version)
        if profile.decision_deadline is not None and request.as_of > profile.decision_deadline:
            raise _Abstain("decision_deadline_passed", version=version)

        usable, unknowns = self._partition(adapter, tenant, request.scope_id, request.as_of)
        if request.observation_refs:
            by_id = {item.event_id: item for item in usable}
            if any(ref not in by_id for ref in request.observation_refs):
                # Superseded, stale, unknown, out-of-scope and other tenants'
                # events are indistinguishable here by design.
                raise _Abstain("observation_reference_unavailable", unknowns, version=version)
            usable = [by_id[ref] for ref in sorted(request.observation_refs)]
        try:
            build = adapter.build_case(usable, tenant, request.scope_id)
        except ValueError as error:
            raise _Abstain("domain_contract_violation:" + str(error)[:120], unknowns,
                           version=version) from None
        unknowns = [*unknowns, *("missing:" + m for m in build.missing),
                    *("unknown:" + u for u in build.unknowns)]
        unknowns = sorted(set(unknowns))
        if build.facts is None:
            raise _Abstain("insufficient_evidence", unknowns, version=version)

        base = adapter.decision_domain
        if prod(len(axis.choices) for axis in base.axes) > request.compute_budget:
            raise _Abstain("compute_budget_exhausted", unknowns, version=version)
        evidence = {item.event_id: item for item in usable}
        memory = {"mode": "off", "effect_model_version": None, "state": None}
        model = None
        context = ()
        memory_modes = capabilities & {
            "outcome_memory", "contextual_outcome_memory", "hybrid_outcome_memory",
            "relevant_outcome_memory", "domain_relevant_memory"}
        if len(memory_modes) > 1:
            raise _Abstain("conflicting_memory_modes", unknowns, version=version)
        if "domain_relevant_memory" in capabilities:
            context = public_context(usable)
            key = _domain_general_store_key(domain_id)
            active = self.store.active_effect_model(tenant, key)
            memory = {"mode": "domain_relevant",
                      "effect_model_version": active and active["version"],
                      "state": active and active["state"],
                      "context": [list(pair) for pair in context]}
            model = DomainGeneralRelevantEffectModel.from_json(
                active["body"] if active else None,
                schema=getattr(adapter, "memory_relevance_schema", None))
        elif "relevant_outcome_memory" in capabilities:
            context = public_context(usable)
            key = _relevant_store_key(domain_id, request.scope_id)
            active = self.store.active_effect_model(tenant, key)
            memory = {"mode": "relevant",
                      "effect_model_version": active and active["version"],
                      "state": active and active["state"],
                      "context": [list(pair) for pair in context]}
            model = RelevantEffectModel.from_json(
                active["body"] if active else None,
                schema=getattr(adapter, "memory_relevance_schema", None))
        elif "hybrid_outcome_memory" in capabilities:
            context = public_context(usable)
            key = _hybrid_store_key(domain_id, request.scope_id)
            active = self.store.active_effect_model(tenant, key)
            memory = {"mode": "hybrid",
                      "effect_model_version": active and active["version"],
                      "state": active and active["state"],
                      "context": [list(pair) for pair in context]}
            model = HybridEffectModel.from_json(active["body"]) if active else None
        elif "contextual_outcome_memory" in capabilities:
            context = public_context(usable)
            key = _contextual_store_key(domain_id, request.scope_id)
            active = self.store.active_effect_model(tenant, key)
            memory = {"mode": "contextual",
                      "effect_model_version": active and active["version"],
                      "state": active and active["state"],
                      "context": [list(pair) for pair in context]}
            model = ContextualEffectModel.from_json(active["body"]) if active else None
        elif "outcome_memory" in capabilities:
            active = self.store.active_effect_model(tenant, domain_id)
            memory = {"mode": "on", "effect_model_version": active and active["version"],
                      "state": active and active["state"]}
            model = EffectModel.from_json(active["body"]) if active else None
        bounded = _BoundedDomain(base, model, profile.forbidden_choices,
                                 context=context, as_of=request.as_of,
                                 scope_id=request.scope_id)
        goals = Goals(weights=dict(profile.goal_weights), max_spend=profile.max_spend,
                      uncertainty_aversion=profile.uncertainty_aversion)
        urgent = request.time_budget_ms <= FAST_PATH_MS or (
            profile.decision_deadline is not None
            and profile.decision_deadline == request.as_of)
        try:
            if "bounded_search" in capabilities and not (
                    urgent and "deterministic_fast_path" in capabilities):
                plan = StrategicPlanner().enumerate_and_rank(
                    bounded, build.facts, set(evidence), goals, show_top=10)
                ranked = [plan["selected"]["identifier"],
                          *(card["identifier"] for card in plan["alternatives"])]
                route = "bounded_search"
            else:
                ranked = self._fast_path(adapter, bounded, build.facts, set(evidence), goals)
                route = "deterministic_fast_path"
        except ValueError as error:
            raise _Abstain("domain_contract_violation:" + str(error)[:120], unknowns,
                           version=version) from None
        if (self.clock() - started) * 1000 > request.time_budget_ms:
            raise _Abstain("time_budget_exhausted", unknowns, version=version)

        advice = {"identity": "none", "is_mock": False, "calls": 0, "status": "not_requested"}
        if "model_advice" in capabilities and route == "bounded_search":
            advice, advised = self._advise(request, started, goals, bounded, ranked)
            if advised is not None:
                ranked = [advised, *(x for x in ranked if x != advised)]
                route = "model_advised"

        def card(identifier: str) -> dict:
            option = bounded.adjusted[identifier]
            return {
                "identifier": identifier, "decisions": [list(d) for d in option.decisions],
                "expected_effects": option.expected_effects,
                "raw_expected_effects": bounded.raw[identifier].expected_effects,
                "uncertainty": option.uncertainty, "estimated_spend": option.estimated_spend,
                "evidence_ids": list(option.evidence_ids),
                "within_spend_bound": option.estimated_spend <= goals.max_spend,
                "priority_score_heuristic": round(_value(option, goals), 6),
            }

        chosen = bounded.adjusted[ranked[0]]
        if isinstance(model, (RelevantEffectModel, DomainGeneralRelevantEffectModel)):
            # Evidence is restricted to this tenant, domain and relevant scope.
            # Receipt-backed correction is not a ground-truth action label.
            selected_keys = effect_keys(chosen.decisions)
            memory["decision_evidence"] = {
                objective: (
                    model.evidence(selected_keys, objective, context, request.as_of,
                                   request.scope_id)
                    if isinstance(model, DomainGeneralRelevantEffectModel)
                    else model.evidence(selected_keys, objective, context, request.as_of))
                for objective in sorted(chosen.expected_effects)
            }
        selected = {**card(ranked[0]), "explanation": chosen.explanation,
                    "uncertainty_note": chosen.uncertainty_note,
                    "approval_state": PENDING_HUMAN_REVIEW,
                    "effects_are_estimates_not_observed_results": True}
        over_budget = sum(o.estimated_spend > goals.max_spend for o in bounded.adjusted.values())
        constraints = [
            {"constraint": "max_spend", "limit": goals.max_spend,
             "excluded_options": over_budget},
            {"constraint": "forbidden_choices",
             "values": sorted("=".join(pair) for pair in profile.forbidden_choices),
             "excluded_options": bounded.excluded_forbidden},
            {"constraint": "domain_prerequisites",
             "excluded_options": bounded.excluded_prerequisite},
            {"constraint": "evidence_grounding", "status": "selected_cites_current_evidence"},
            {"constraint": "human_approval_required", "status": "enforced"},
        ]
        if request.requested_option is not None:
            wanted = bounded.adjusted.get(request.requested_option)
            admissible = wanted is not None and wanted.estimated_spend <= goals.max_spend
            # A request can be noted, never forced past a hard constraint.
            constraints.append({
                "constraint": "requested_option", "option": request.requested_option,
                "status": "admissible_not_forced" if admissible
                else "rejected_by_hard_constraint_or_prerequisite"})
        refs = [{"event_id": i, "source_revision": evidence[i].source_revision,
                 "observed_at": evidence[i].observed_at} for i in sorted(chosen.evidence_ids)]
        return {
            "route": route,
            "candidate_options": [card(i) for i in sorted(bounded.adjusted)],
            "selected_option": selected, "expected_effects": chosen.expected_effects,
            "uncertainty": chosen.uncertainty, "constraints_checked": constraints,
            "evidence_refs": refs, "alternatives": [card(i) for i in ranked[1:4]],
            "abstention_reason": None, "approval_state": PENDING_HUMAN_REVIEW,
            "known_unknowns": unknowns, "goal_profile_version": version,
            "memory": memory, "model": advice,
            "budgets": {"time_budget_ms": request.time_budget_ms,
                        "compute_budget": request.compute_budget,
                        "option_assessments": bounded.assessments,
                        "model_call_budget": request.model_call_budget},
            "state_digest": digest([refs, version, memory]),
        }

    def _fast_path(self, adapter, bounded, facts, evidence_ids, goals) -> list[str]:
        """Cheap deterministic rule, falling back to the safe reference action."""
        ranked = []
        for decisions in (tuple(adapter.fixed_rule(facts)), bounded.baseline_decisions):
            choice = bounded.assess(facts, decisions)
            if choice is None or choice.identifier in ranked:
                continue
            _check_choice(choice, decisions, evidence_ids, goals)
            if choice.estimated_spend <= goals.max_spend:
                ranked.append(choice.identifier)
        if not ranked:
            raise ValueError("A feasible reference action is required")
        return ranked

    def _advise(self, request, started, goals, bounded, ranked):
        """Ask a configured model to pick among already-validated options only."""
        info = {"identity": "none", "is_mock": False, "calls": 0, "status": "not_configured"}
        if self.model is None:
            return info, None
        info.update(identity=self.model.identity, is_mock=bool(self.model.is_mock),
                    status="no_call_budget")
        options = [{"id": i, "expected_effects": bounded.adjusted[i].expected_effects,
                    "uncertainty": bounded.adjusted[i].uncertainty,
                    "estimated_spend": bounded.adjusted[i].estimated_spend} for i in ranked]
        messages = [
            {"role": "system", "content": (
                "Choose one pre-validated option for human review. Reply with JSON only: "
                '{"selected": "<option id>", "rationale": "<short reason>"}. '
                "You cannot add options or take actions.")},
            {"role": "user", "content": canonical({
                "owner_goal_weights": goals.weights, "options": options})},
        ]
        for _ in range(min(request.model_call_budget, MAX_MODEL_ATTEMPTS)):
            if (self.clock() - started) * 1000 > request.time_budget_ms:
                info["status"] = "time_budget_exhausted_before_call"
                break
            info["calls"] += 1
            try:
                raw = self.model.adapter.complete(messages)
            except Exception as error:  # a failing model must never break the cycle
                info["status"] = "model_error_ignored:" + type(error).__name__
                continue
            selected = _parse_advice(raw, ranked)
            if selected is not None:
                info["status"] = "advised"
                return info, selected
            info["status"] = "invalid_reply_ignored"
        return info, None

    # ---------------------------------------------------------------- outcome
    def record_outcome(self, outcome: OutcomeRecordV1) -> dict:
        """Match a supplied receipt to its prediction; learn only if verified."""
        adapter = self._adapter(outcome.domain_id)
        tenant, domain_id = outcome.tenant_id, outcome.domain_id
        existing = self.store.outcome(tenant, outcome.outcome_id)
        if existing is not None:
            if existing != outcome:
                raise ValueError("Conflicting duplicate outcome")
            return {"status": "duplicate", "effect_model_version": None,
                    "prediction_error": {}}
        proposal = self.store.proposal(tenant, outcome.proposal_id)
        if proposal is None or proposal.domain_id != domain_id:
            raise ValueError("No such proposal for this tenant and domain")
        if self.store.outcome_for_proposal(tenant, outcome.proposal_id) is not None:
            raise ValueError("This proposal already has a recorded outcome")
        if set(outcome.observed_effects) - set(adapter.objectives):
            raise ValueError("Outcome reports an unregistered objective")
        if outcome.observation_time < proposal.as_of:
            raise ValueError("An outcome cannot precede its proposal")
        card = next((c for c in proposal.candidate_options
                     if c["identifier"] == outcome.chosen_action_ref), None)
        result = {"status": "stored_unverified_not_learned", "effect_model_version": None,
                  "prediction_error": {}}
        if outcome.verified and card is None:
            result["status"] = "stored_without_matching_prediction"
        elif outcome.verified:
            observed = outcome.observed_effects
            residuals = {name: observed[name] - card["raw_expected_effects"][name]
                         for name in sorted(observed) if name in card["raw_expected_effects"]}
            memory_mode = (proposal.memory or {}).get("mode")
            model_key = (
                _relevant_store_key(domain_id, proposal.scope_id)
                if memory_mode == "relevant"
                else _hybrid_store_key(domain_id, proposal.scope_id)
                if memory_mode == "hybrid"
                else _contextual_store_key(domain_id, proposal.scope_id)
                if memory_mode == "contextual" else domain_id
            )
            active = self.store.active_effect_model(tenant, model_key)
            keys = effect_keys(tuple(tuple(d) for d in card["decisions"]))
            if memory_mode == "relevant":
                model = RelevantEffectModel.from_json(
                    active["body"] if active else None,
                    schema=getattr(adapter, "memory_relevance_schema", None))
                updated = model.updated(
                    keys, residuals, proposal.memory["context"],
                    outcome.observation_time, outcome.receipt_ref)
            elif memory_mode == "hybrid":
                model = HybridEffectModel.from_json(active["body"] if active else None)
                updated = model.updated(keys, residuals, proposal.memory["context"],
                                        outcome.observation_time)
            elif memory_mode == "contextual":
                model = ContextualEffectModel.from_json(active["body"] if active else None)
                updated = model.updated(keys, residuals, proposal.memory["context"],
                                        outcome.observation_time)
            else:
                model = EffectModel.from_json(active["body"] if active else None)
                updated = model.updated(keys, residuals)
            experimental = ({"memory_kind": (
                "relevant_context_residual_v123" if memory_mode == "relevant"
                else "hierarchical_contextual_residual_v12" if memory_mode == "hybrid"
                else "contextual_residual_v12"), "scope_id": proposal.scope_id}
                if memory_mode in ("hybrid", "contextual", "relevant") else {})
            result["effect_model_version"] = self.store.append_effect_model(
                tenant, model_key, updated.to_json(), {
                    "outcome_id": outcome.outcome_id, "proposal_id": outcome.proposal_id,
                    "receipt_ref": outcome.receipt_ref, "evidence_ref": outcome.evidence_ref,
                    "source": outcome.source, "chosen_action_ref": outcome.chosen_action_ref,
                    "source_revisions": list(proposal.evidence_refs),
                    **experimental})
            result["status"] = "learned_provisional"
            result["prediction_error"] = {
                name: round(observed[name] - card["expected_effects"][name], 6)
                for name in sorted(observed) if name in card["expected_effects"]}
        self.store.save_outcome(outcome, result["status"] == "learned_provisional")
        self.store.append_trace(tenant, "outcome", outcome.to_json(), canonical(result))
        return result

    def promote_effect_model(self, tenant_id: str, domain_id: str, version: int,
                             reviewer: str) -> bool:
        """Record a named human's promotion of a provisional estimate version."""
        self._adapter(domain_id)
        if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 100:
            raise ValueError("A named human reviewer is required")
        active = self.store.active_effect_model(tenant_id, domain_id)
        if active is None or active["version"] != version or active["state"] != "provisional":
            return False
        done = self.store.mark_effect_model(tenant_id, domain_id, version, "promoted")
        self.store.append_trace(tenant_id, "promote", {
            "domain_id": domain_id, "version": version, "reviewer": reviewer}, str(done))
        return done

    def rollback_effect_model(self, tenant_id: str, domain_id: str, version: int,
                              reviewer: str) -> bool:
        self._adapter(domain_id)
        if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 100:
            raise ValueError("A named human reviewer is required")
        done = self.store.rollback_effect_model(tenant_id, domain_id, version)
        self.store.append_trace(tenant_id, "rollback", {
            "domain_id": domain_id, "version": version, "reviewer": reviewer}, str(done))
        return done


def replay(trace: list[dict], adapters: Iterable[DomainAdapter],
           model: ModelBinding | None = None) -> dict:
    """Re-run an exported trace in a fresh store and compare every logical result."""
    store = RuntimeStore(":memory:")
    runtime = AionRuntime(store, adapters, model=model, clock=lambda: 0.0)
    mismatches = []
    try:
        for index, entry in enumerate(trace):
            kind, body = entry["kind"], entry["body"]
            if kind == "observation":
                result = runtime.observe(ObservationV1.from_json(body))
            elif kind == "goal_profile":
                runtime.set_goal_profile(GoalProfileV1.from_json(body))
                result = str(body["owner_preference_version"])
            elif kind == "request":
                result = runtime.investigate(DecisionRequestV1.from_json(body)).proposal_id
            elif kind == "outcome":
                result = canonical(runtime.record_outcome(OutcomeRecordV1.from_json(body)))
            elif kind in ("promote", "rollback"):
                tenant = entry.get("tenant_id") or trace_tenant(trace)
                action = (runtime.promote_effect_model if kind == "promote"
                          else runtime.rollback_effect_model)
                result = str(action(tenant, body["domain_id"], body["version"],
                                    body["reviewer"]))
            else:
                raise ValueError("Unknown trace entry")
            if result != entry["result"]:
                mismatches.append({"index": index, "kind": kind})
    finally:
        store.close()
    return {"entries": len(trace), "matches": not mismatches, "mismatches": mismatches}


def trace_tenant(trace: list[dict]) -> str:
    for entry in trace:
        if "tenant_id" in entry["body"]:
            return entry["body"]["tenant_id"]
    raise ValueError("Trace has no tenant")
