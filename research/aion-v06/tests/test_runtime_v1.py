"""AION Genesis v1.0 unified runtime: contract, safety and portability tests."""

import os
import tempfile
import unittest

from aion_genesis.domains.dependency_dispatch import DependencyDispatchAdapter, METRICS
from aion_genesis.domains.electrical_runtime import ElectricalProcurementAdapter
from aion_genesis.domains.electrical_strategy import STRATEGY_DEMO_OBSERVATIONS
from aion_genesis.domains.equipment_maintenance import EquipmentMaintenanceAdapter, UNITS
from aion_genesis.domains.process_tuning import ProcessTuningAdapter
from aion_genesis.runtime import (
    ABSTAINED, PENDING_HUMAN_REVIEW, AionRuntime, DecisionProposalV1,
    DecisionRequestV1, EffectModel, GoalProfileV1, ModelBinding, ObservationV1,
    OutcomeRecordV1, RuntimeStore, replay,
)
from aion_genesis.situation_engine import SituationStore

ELECTRICAL = "tradeflow_electrical_procurement"
EQUIPMENT = "synthetic_equipment_maintenance"
TUNING = "synthetic_process_tuning"
DISPATCH = "synthetic_dependency_dispatch"
OWNER, SCOPE = "OWNER-1", "MATERIAL-BATCH-7"
WEIGHTS = {"schedule": 5, "margin": 3, "crew_productivity": 2, "customer_trust": 1}


def adapters():
    return [ElectricalProcurementAdapter(), EquipmentMaintenanceAdapter(),
            ProcessTuningAdapter(), DependencyDispatchAdapter()]


def profile(tenant=OWNER, domain=ELECTRICAL, weights=None, version=1, **changes):
    values = dict(goal_weights=dict(weights or WEIGHTS), hard_constraints={"max_spend": 500},
                  risk_tolerance=0.75, decision_deadline=None)
    values.update(changes)
    return GoalProfileV1(tenant_id=tenant, domain_id=domain,
                         owner_preference_version=version, **values)


def request(request_id="REQ-1", tenant=OWNER, domain=ELECTRICAL, scope=SCOPE, as_of=5,
            **changes):
    return DecisionRequestV1(request_id=request_id, case_id="CASE-1", tenant_id=tenant,
                             domain_id=domain, scope_id=scope, as_of=as_of, **changes)


def fact(event_id, metric, value, *, tenant=OWNER, domain=EQUIPMENT, scope="FLEET",
         subject="CREW", revision=1, at=1, **extra):
    return ObservationV1(event_id=event_id, tenant_id=tenant, domain_id=domain,
                         scope_id=scope, subject_id=subject, metric=metric, value=value,
                         source_revision=revision, observed_at=at, **extra)


def outcome(proposal, effects, outcome_id="OUT-1", verified=True, action=None, tenant=None):
    return OutcomeRecordV1(
        outcome_id=outcome_id, proposal_id=proposal.proposal_id,
        tenant_id=tenant or proposal.tenant_id, domain_id=proposal.domain_id,
        chosen_action_ref=action or proposal.selected_option["identifier"],
        observed_effects=effects, receipt_ref="RECEIPT-" + outcome_id,
        evidence_ref="SIM-" + outcome_id, observation_time=proposal.as_of + 1,
        verified=verified)


BAD_SUBSTITUTE = {"schedule": 0.0, "margin": -6.0, "crew_productivity": 1.0,
                  "customer_trust": 3.0}


class RuntimeCase(unittest.TestCase):
    def setUp(self):
        self.store = RuntimeStore(":memory:")
        self.runtime = AionRuntime(self.store, adapters())

    def tearDown(self):
        self.store.close()

    def seed_electrical(self, tenant=OWNER, goals=True):
        for legacy in STRATEGY_DEMO_OBSERVATIONS:
            upgraded = ObservationV1.from_legacy(legacy, ELECTRICAL)
            self.runtime.observe(ObservationV1.from_json(
                {**upgraded.to_json(), "tenant_id": tenant}))
        if goals:
            self.runtime.set_goal_profile(profile(tenant=tenant))

    def seed_fleet(self, tenant=OWNER, hours=8, kits=1, at=1, revision=1, suffix=""):
        wear = {"unit_a": 40, "unit_b": 85, "unit_c": 60}
        for unit in UNITS:
            self.runtime.observe(fact(f"EV-WEAR-{unit}{suffix}", "wear_index", wear[unit],
                                      tenant=tenant, subject=unit, at=at, revision=revision))
            self.runtime.observe(fact(f"EV-CRIT-{unit}{suffix}", "criticality", 2,
                                      tenant=tenant, subject=unit, at=at, revision=revision))
        self.runtime.observe(fact("EV-HOURS" + suffix, "technician_hours", hours,
                                  tenant=tenant, at=at, revision=revision))
        self.runtime.observe(fact("EV-KITS" + suffix, "spare_kits", kits, tenant=tenant,
                                  at=at, revision=revision))
        if revision == 1:
            self.runtime.set_goal_profile(profile(
                tenant=tenant, domain=EQUIPMENT,
                weights={"uptime": 5, "budget": 2, "safety": 3}))


class ContractTests(unittest.TestCase):
    def test_json_round_trip_and_strict_schema(self):
        records = [
            fact("EV-1", "wear_index", 41.5, subject="unit_a"),
            fact("EV-2", "wear_index", None, subject="unit_b"),
            profile(hard_constraints={"max_spend": 100, "forbidden_choices": ["supply=wait"]}),
            request(observation_refs=("EV-1",), requested_option="wait|hold|quiet"),
        ]
        for record in records:
            payload = record.to_json()
            self.assertEqual(type(record).from_json(payload), record)
            with self.assertRaises(ValueError):
                type(record).from_json({**payload, "surprise": 1})
            with self.assertRaises(ValueError):
                type(record).from_json({**payload, "schema": "Other/9"})

    def test_observation_rejects_real_data_and_bad_values(self):
        with self.assertRaises(ValueError):
            fact("EV-1", "wear_index", 1, provenance="production")
        with self.assertRaises(ValueError):
            fact("EV-1", "wear_index", float("nan"))
        with self.assertRaises(ValueError):
            fact("EV 1", "wear_index", 1)
        with self.assertRaises(ValueError):
            fact("EV-1", "wear_index", True)
        with self.assertRaises(ValueError):
            fact("EV-1", "wear_index", 1, corrects_event_id="EV-1")

    def test_goal_profile_validation(self):
        for bad in (dict(goal_weights={}), dict(goal_weights={"schedule": 9}),
                    dict(hard_constraints={}), dict(risk_tolerance=1.5),
                    dict(hard_constraints={"max_spend": 1, "override_permissions": True}),
                    dict(hard_constraints={"max_spend": 1, "forbidden_choices": ["oops"]})):
            with self.assertRaises(ValueError):
                profile(**bad)
        self.assertEqual(profile(risk_tolerance=0.5).uncertainty_aversion, 1.0)

    def test_proposal_cannot_claim_an_executed_action(self):
        base = dict(
            proposal_id="P", request_id="R", case_id="C", tenant_id=OWNER,
            domain_id=ELECTRICAL, scope_id=SCOPE, as_of=1, route="bounded_search",
            candidate_options=(), selected_option={"identifier": "x"},
            expected_effects={}, uncertainty={}, constraints_checked=(), evidence_refs=(),
            alternatives=(), abstention_reason=None, approval_state=PENDING_HUMAN_REVIEW,
            trace_id="T")
        DecisionProposalV1(**base)
        with self.assertRaises(ValueError):
            DecisionProposalV1(**{**base, "external_actions": 1})
        with self.assertRaises(ValueError):
            DecisionProposalV1(**{**base, "approval_state": "executed"})
        with self.assertRaises(ValueError):
            DecisionProposalV1(**{**base, "selected_option": None})


class ObservationLedgerTests(RuntimeCase):
    def test_revision_supersedes_and_keeps_lineage(self):
        self.assertEqual(self.runtime.observe(fact("EV-H1", "technician_hours", 4)),
                         "accepted")
        self.assertEqual(self.runtime.observe(
            fact("EV-H2", "technician_hours", 8, revision=2, corrects_event_id="EV-H1")),
            "superseded_prior")
        current = self.store.current(OWNER, EQUIPMENT, "FLEET")
        self.assertEqual([(o.event_id, o.value) for o in current], [("EV-H2", 8)])
        history = self.store.history(OWNER, EQUIPMENT, "FLEET", "CREW", "technician_hours")
        self.assertEqual([(h["event_id"], h["state"], h["superseded_by"]) for h in history],
                         [("EV-H1", "superseded", "EV-H2"), ("EV-H2", "current", None)])

    def test_late_and_conflicting_revisions_never_displace_newer_evidence(self):
        self.runtime.observe(fact("EV-H2", "technician_hours", 8, revision=2))
        self.assertEqual(self.runtime.observe(fact("EV-H1", "technician_hours", 4)),
                         "rejected_stale_revision")
        self.assertEqual(self.store.current(OWNER, EQUIPMENT)[0].event_id, "EV-H2")
        self.assertEqual(self.store.event_state(OWNER, "EV-H1"), "rejected_stale_revision")
        with self.assertRaises(ValueError):
            self.runtime.observe(fact("EV-H2B", "technician_hours", 9, revision=2))
        with self.assertRaises(ValueError):  # a correction must name the current reading
            self.runtime.observe(fact("EV-H3", "technician_hours", 9, revision=3,
                                      corrects_event_id="EV-H1"))

    def test_idempotent_duplicate_and_conflicting_duplicate(self):
        first = fact("EV-H1", "technician_hours", 4)
        self.assertEqual(self.runtime.observe(first), "accepted")
        self.assertEqual(self.runtime.observe(first), "duplicate")
        self.assertEqual(len(self.store.trace(OWNER)), 1)
        with self.assertRaises(ValueError):
            self.runtime.observe(fact("EV-H1", "technician_hours", 5))

    def test_unregistered_domain_is_refused(self):
        with self.assertRaises(ValueError):
            self.runtime.observe(fact("EV-1", "wear_index", 1, domain="unknown_domain"))

    def test_legacy_v08_events_migrate_without_destruction(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        path = os.path.join(folder.name, "shared.sqlite3")
        legacy = SituationStore(path)
        for event in STRATEGY_DEMO_OBSERVATIONS:
            legacy.observe(event)
        legacy.close()
        store = RuntimeStore(path)
        self.addCleanup(store.close)
        self.assertEqual(store.import_legacy(OWNER, ELECTRICAL), 8)
        self.assertEqual(store.import_legacy(OWNER, ELECTRICAL), 0)
        self.assertEqual(len(store.legacy.current(OWNER)), 8)  # v0.8 view intact
        runtime = AionRuntime(store, adapters())
        runtime.set_goal_profile(profile())
        self.assertEqual(runtime.investigate(request()).selected_option["identifier"],
                         "qualified_substitute|reassign_to_ready_work|prepare_notice")


class InvestigationTests(RuntimeCase):
    def test_proposal_is_grounded_reviewable_and_matches_v09_planner(self):
        self.seed_electrical()
        proposal = self.runtime.investigate(request())
        self.assertEqual(proposal.route, "bounded_search")
        self.assertEqual(proposal.approval_state, PENDING_HUMAN_REVIEW)
        self.assertEqual(proposal.external_actions, 0)
        self.assertEqual(len(proposal.candidate_options), 12)
        current = {o.event_id: o.source_revision
                   for o in self.store.current(OWNER, ELECTRICAL, SCOPE)}
        self.assertTrue(proposal.evidence_refs)
        for ref in proposal.evidence_refs:
            self.assertEqual(current[ref["event_id"]], ref["source_revision"])
        self.assertTrue(proposal.effects_are_estimates_not_observed_results)
        self.assertEqual(self.store.proposal(OWNER, proposal.proposal_id), proposal)

    def test_request_is_idempotent_and_id_reuse_is_refused(self):
        self.seed_electrical()
        first = self.runtime.investigate(request())
        self.assertEqual(self.runtime.investigate(request()), first)
        with self.assertRaises(ValueError):
            self.runtime.investigate(request(as_of=6))

    def test_stale_evidence_forces_abstention(self):
        self.seed_fleet(at=1)
        fresh = self.runtime.investigate(request("REQ-A", domain=EQUIPMENT, scope="FLEET",
                                                 as_of=4))
        self.assertFalse(fresh.abstained)
        stale = self.runtime.investigate(request("REQ-B", domain=EQUIPMENT, scope="FLEET",
                                                 as_of=30))
        self.assertEqual(stale.abstention_reason, "insufficient_evidence")
        self.assertEqual(stale.approval_state, ABSTAINED)
        self.assertIn("stale:technician_hours@CREW", stale.known_unknowns)
        self.assertIn("missing:technician_hours:CREW", stale.known_unknowns)
        self.assertIsNone(stale.selected_option)

    def test_superseded_and_future_references_are_unavailable(self):
        self.seed_fleet()
        self.runtime.observe(fact("EV-HOURS-2", "technician_hours", 12, revision=2, at=3))
        proposal = self.runtime.investigate(request(
            "REQ-A", domain=EQUIPMENT, scope="FLEET", as_of=4,
            observation_refs=("EV-HOURS",)))
        self.assertEqual(proposal.abstention_reason, "observation_reference_unavailable")
        self.runtime.observe(fact("EV-HOURS-3", "technician_hours", 2, revision=3, at=99))
        future = self.runtime.investigate(request("REQ-B", domain=EQUIPMENT, scope="FLEET",
                                                  as_of=4))
        self.assertIn("not_yet_valid:technician_hours@CREW", future.known_unknowns)

    def test_tenant_boundaries(self):
        self.seed_electrical()
        mine = self.runtime.investigate(request())
        # Another tenant sees none of OWNER-1's facts, goals, proposals or memory.
        blind = self.runtime.investigate(request("REQ-X", tenant="OWNER-2"))
        self.assertEqual(blind.abstention_reason, "missing_goal_profile")
        self.runtime.set_goal_profile(profile(tenant="OWNER-2"))
        empty = self.runtime.investigate(request("REQ-Y", tenant="OWNER-2"))
        self.assertEqual(empty.abstention_reason, "insufficient_evidence")
        stolen = self.runtime.investigate(request(
            "REQ-Z", tenant="OWNER-2", observation_refs=("SRC-1",)))
        self.assertEqual(stolen.abstention_reason, "observation_reference_unavailable")
        self.assertIsNone(self.store.proposal("OWNER-2", mine.proposal_id))
        with self.assertRaises(ValueError):
            self.runtime.record_outcome(outcome(mine, BAD_SUBSTITUTE, tenant="OWNER-2"))
        self.runtime.record_outcome(outcome(mine, BAD_SUBSTITUTE))
        self.assertIsNone(self.store.active_effect_model("OWNER-2", ELECTRICAL))
        # The same event id may exist independently for another tenant.
        self.seed_electrical(tenant="OWNER-2", goals=False)
        other = self.runtime.investigate(request(
            "REQ-W", tenant="OWNER-2",
            available_capabilities=("bounded_search", "outcome_memory")))
        self.assertEqual(other.selected_option["identifier"],
                         mine.selected_option["identifier"])
        self.assertIsNone(other.memory["effect_model_version"])
        self.assertEqual(self.store.trace("OWNER-3"), [])

    def test_missing_or_superseded_goals_never_get_guessed(self):
        self.seed_electrical(goals=False)
        self.assertEqual(self.runtime.investigate(request()).abstention_reason,
                         "missing_goal_profile")
        with self.assertRaises(ValueError):  # incomplete priorities are refused outright
            self.runtime.set_goal_profile(profile(weights={"schedule": 5}))
        self.runtime.set_goal_profile(profile())
        self.runtime.set_goal_profile(profile(version=2, risk_tolerance=0.2))
        with self.assertRaises(ValueError):
            self.runtime.set_goal_profile(profile(version=2, risk_tolerance=0.9))
        old = self.runtime.investigate(request("REQ-B", goal_profile_ref=1))
        self.assertEqual(old.abstention_reason, "goal_profile_reference_superseded")
        self.assertEqual(self.runtime.investigate(
            request("REQ-C", goal_profile_ref=2)).goal_profile_version, 2)

    def test_unknown_facts_are_explicit_and_never_filled_in(self):
        self.seed_electrical()
        self.runtime.observe(ObservationV1(
            event_id="CREW-2", tenant_id=OWNER, domain_id=ELECTRICAL, scope_id=SCOPE,
            subject_id="TEAM-2", metric="crew_idle_hours", value=None, source_revision=2,
            observed_at=2, department="operations"))
        proposal = self.runtime.investigate(request())
        self.assertEqual(proposal.abstention_reason, "insufficient_evidence")
        self.assertIn("unknown:crew_idle_hours@TEAM-2", proposal.known_unknowns)

    def test_unknown_precondition_excludes_only_dependent_options(self):
        values = {"cond_a": None, "cond_b": 1, "cond_c": 1, "load_level": 3}
        for metric, value in values.items():
            self.runtime.observe(fact("EV-" + metric, metric, value, domain=TUNING,
                                      scope="LINE", subject="LINE"))
        self.runtime.set_goal_profile(profile(
            domain=TUNING, weights={"output": 5, "stability": 2, "cost": 2}))
        proposal = self.runtime.investigate(request(domain=TUNING, scope="LINE"))
        identifiers = {c["identifier"] for c in proposal.candidate_options}
        self.assertFalse(any(i.startswith("lever_x") for i in identifiers))
        self.assertIn("lever_z|standard", identifiers)
        self.assertIn("unknown:cond_a@LINE", proposal.known_unknowns)
        self.assertIn("unknown:cond_a_blocks_lever_x", proposal.known_unknowns)

    def test_restricted_evidence_is_not_used(self):
        self.seed_fleet()
        self.runtime.observe(fact("EV-KITS-2", "spare_kits", 2, revision=2,
                                  visibility="restricted"))
        proposal = self.runtime.investigate(request(domain=EQUIPMENT, scope="FLEET"))
        self.assertEqual(proposal.abstention_reason, "insufficient_evidence")
        self.assertIn("restricted:spare_kits@CREW", proposal.known_unknowns)

    def test_deadline_and_budget_exhaustion_abstain(self):
        self.seed_electrical()
        tight = self.runtime.investigate(request("REQ-A", compute_budget=5))
        self.assertEqual(tight.abstention_reason, "compute_budget_exhausted")
        ticks = iter(range(0, 1000, 5))  # every clock read is 5 s later
        slow = AionRuntime(self.store, adapters(), clock=lambda: next(ticks))
        self.assertEqual(slow.investigate(request("REQ-B")).abstention_reason,
                         "time_budget_exhausted")
        self.runtime.set_goal_profile(profile(version=2, decision_deadline=4))
        late = self.runtime.investigate(request("REQ-C", as_of=5))
        self.assertEqual(late.abstention_reason, "decision_deadline_passed")
        for bad in (dict(time_budget_ms=0), dict(model_call_budget=99),
                    dict(compute_budget=10**6), dict(research_mode="production")):
            with self.assertRaises(ValueError):
                request(**bad)

    def test_fast_path_for_urgent_or_search_free_requests(self):
        self.seed_electrical()
        urgent = self.runtime.investigate(request("REQ-A", time_budget_ms=5))
        self.assertEqual(urgent.route, "deterministic_fast_path")
        self.assertEqual(urgent.selected_option["identifier"],
                         "expedite|reassign_to_ready_work|prepare_notice")
        self.assertLessEqual(urgent.budgets["option_assessments"], 2)
        only = self.runtime.investigate(request(
            "REQ-B", available_capabilities=("deterministic_fast_path",)))
        self.assertEqual(only.route, "deterministic_fast_path")
        self.runtime.set_goal_profile(profile(version=2, hard_constraints={"max_spend": 10}))
        frugal = self.runtime.investigate(request(
            "REQ-C", available_capabilities=("deterministic_fast_path",)))
        self.assertEqual(frugal.selected_option["identifier"], "wait|hold|quiet")

    def test_no_action_authority_and_hard_constraints_outrank_goals(self):
        for forbidden in ("execute_command", "approve", "send_notice"):
            with self.assertRaises(ValueError):
                request(available_capabilities=("bounded_search", forbidden))
        for name in ("execute", "approve", "apply", "send", "dispatch"):
            self.assertFalse(hasattr(self.runtime, name))
        self.seed_electrical()
        wanted = "qualified_substitute|reassign_to_ready_work|prepare_notice"
        free = self.runtime.investigate(request("REQ-A", requested_option=wanted))
        self.assertEqual(free.selected_option["identifier"], wanted)
        self.runtime.set_goal_profile(profile(version=2, hard_constraints={
            "max_spend": 500, "forbidden_choices": ["supply=qualified_substitute"]}))
        bound = self.runtime.investigate(request("REQ-B", requested_option=wanted))
        self.assertNotIn("qualified_substitute", bound.selected_option["identifier"])
        self.assertFalse(any("qualified_substitute" in c["identifier"]
                             for c in bound.candidate_options))
        asked = next(c for c in bound.constraints_checked
                     if c["constraint"] == "requested_option")
        self.assertEqual(asked["status"], "rejected_by_hard_constraint_or_prerequisite")
        self.runtime.set_goal_profile(profile(version=3, hard_constraints={"max_spend": 0}))
        broke = self.runtime.investigate(request("REQ-C", requested_option=wanted))
        self.assertEqual(broke.selected_option["identifier"], "wait|hold|quiet")
        self.runtime.set_goal_profile(profile(version=4, hard_constraints={
            "max_spend": 500, "forbidden_choices": ["supply=wait"]}))
        stuck = self.runtime.investigate(request("REQ-D"))
        self.assertTrue(stuck.abstention_reason.startswith("domain_contract_violation"))


class Scripted:
    def __init__(self, *replies):
        self.replies, self.calls = list(replies), 0

    def complete(self, messages):
        self.calls += 1
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class ModelAdviceTests(RuntimeCase):
    CAPS = ("bounded_search", "model_advice")

    def advised(self, *replies, budget=2):
        self.seed_electrical()
        model = Scripted(*replies)
        runtime = AionRuntime(self.store, adapters(),
                              model=ModelBinding(model, "mock:scripted", True))
        proposal = runtime.investigate(request(
            available_capabilities=self.CAPS, model_call_budget=budget))
        return proposal, model

    def test_invalid_model_replies_fail_closed(self):
        expected = "qualified_substitute|reassign_to_ready_work|prepare_notice"
        for replies in (("not json", "[]"),
                        ('{"selected": "invented|option|here"}', '{"selected": 7}'),
                        ('{"selected": "wait|hold|quiet", "run": "rm -rf"}', "x" * 9000),
                        (RuntimeError("endpoint down"), TimeoutError())):
            with self.subTest(replies=replies):
                self.store = RuntimeStore(":memory:")
                self.addCleanup(self.store.close)
                self.runtime = AionRuntime(self.store, adapters())
                proposal, model = self.advised(*replies)
                self.assertEqual(proposal.selected_option["identifier"], expected)
                self.assertEqual(proposal.route, "bounded_search")
                self.assertEqual(model.calls, 2)  # one bounded retry, never more
                self.assertEqual(proposal.model["calls"], 2)
                self.assertNotEqual(proposal.model["status"], "advised")
                self.assertTrue(proposal.model["is_mock"])

    def test_valid_advice_can_only_pick_a_validated_option(self):
        proposal, model = self.advised(
            'nonsense', '{"selected": "expedite|reassign_to_ready_work|prepare_notice"}')
        self.assertEqual(proposal.route, "model_advised")
        self.assertEqual(proposal.selected_option["identifier"],
                         "expedite|reassign_to_ready_work|prepare_notice")
        self.assertEqual(proposal.model["identity"], "mock:scripted")
        self.assertEqual(proposal.approval_state, PENDING_HUMAN_REVIEW)

    def test_model_is_never_called_without_budget_or_configuration(self):
        proposal, model = self.advised('{"selected": "wait|hold|quiet"}', budget=0)
        self.assertEqual((model.calls, proposal.model["status"]), (0, "no_call_budget"))
        plain_runtime = AionRuntime(self.store, adapters())
        unconfigured = plain_runtime.investigate(request(
            "REQ-2", available_capabilities=self.CAPS, model_call_budget=2))
        self.assertEqual(unconfigured.model["status"], "not_configured")
        self.assertEqual(unconfigured.model["calls"], 0)


class OutcomeLearningTests(RuntimeCase):
    MEMORY = ("bounded_search", "outcome_memory")

    def test_verified_outcome_revises_provisional_estimates_with_provenance(self):
        self.seed_electrical()
        first = self.runtime.investigate(request(available_capabilities=self.MEMORY))
        learned = self.runtime.record_outcome(outcome(first, BAD_SUBSTITUTE))
        self.assertEqual(learned["status"], "learned_provisional")
        self.assertEqual(learned["prediction_error"]["margin"], -3.35)
        second = self.runtime.investigate(request("REQ-2", as_of=7,
                                                  available_capabilities=self.MEMORY))
        self.assertNotIn("qualified_substitute", second.selected_option["identifier"])
        self.assertEqual(second.memory, {"mode": "on", "effect_model_version": 1,
                                         "state": "provisional"})
        # Facts are untouched: the same evidence, only the estimate layer moved.
        self.assertEqual(len(self.store.current(OWNER, ELECTRICAL, SCOPE)), 8)
        version = self.store.effect_model_versions(OWNER, ELECTRICAL)[0]
        self.assertEqual(version["provenance"]["outcome_id"], "OUT-1")
        self.assertEqual(version["provenance"]["receipt_ref"], "RECEIPT-OUT-1")
        self.assertTrue(version["provenance"]["source_revisions"])
        off = self.runtime.investigate(request("REQ-3", as_of=7))
        self.assertEqual(off.selected_option["identifier"],
                         first.selected_option["identifier"])
        self.assertEqual(off.memory["mode"], "off")

    def test_unverified_unmatched_and_conflicting_outcomes(self):
        self.seed_electrical()
        proposal = self.runtime.investigate(request())
        record = outcome(proposal, BAD_SUBSTITUTE, verified=False)
        self.assertEqual(self.runtime.record_outcome(record)["status"],
                         "stored_unverified_not_learned")
        self.assertEqual(self.runtime.record_outcome(record)["status"], "duplicate")
        self.assertIsNone(self.store.active_effect_model(OWNER, ELECTRICAL))
        with self.assertRaises(ValueError):  # one receipt per proposal
            self.runtime.record_outcome(outcome(proposal, BAD_SUBSTITUTE, "OUT-2"))
        other = self.runtime.investigate(request("REQ-2", as_of=6))
        with self.assertRaises(ValueError):
            self.runtime.record_outcome(outcome(other, {"invented_metric": 1.0}, "OUT-3"))
        with self.assertRaises(ValueError):
            self.runtime.record_outcome(OutcomeRecordV1(
                "OUT-4", "PROP-missing", OWNER, ELECTRICAL, "wait|hold|quiet", {},
                "R", "E", 9, True))
        unmatched = self.runtime.record_outcome(
            outcome(other, BAD_SUBSTITUTE, "OUT-5", action="something|else|entirely"))
        self.assertEqual(unmatched["status"], "stored_without_matching_prediction")
        with self.assertRaises(ValueError):
            OutcomeRecordV1("OUT-6", "P", OWNER, ELECTRICAL, "a", {}, "R", "E", 1, True,
                            source="production_receipt")

    def test_promotion_needs_a_named_human_and_rollback_is_reversible(self):
        self.seed_electrical()
        first = self.runtime.investigate(request(available_capabilities=self.MEMORY))
        self.runtime.record_outcome(outcome(first, BAD_SUBSTITUTE))
        with self.assertRaises(ValueError):
            self.runtime.promote_effect_model(OWNER, ELECTRICAL, 1, "  ")
        self.assertFalse(self.runtime.promote_effect_model(OWNER, ELECTRICAL, 7, "Reviewer"))
        self.assertTrue(self.runtime.promote_effect_model(OWNER, ELECTRICAL, 1, "Reviewer"))
        second = self.runtime.investigate(request("REQ-2", as_of=7,
                                                  available_capabilities=self.MEMORY))
        self.assertEqual(second.memory["state"], "promoted")
        self.runtime.record_outcome(outcome(second, {"schedule": 9.0}, "OUT-2"))
        self.assertTrue(self.runtime.rollback_effect_model(OWNER, ELECTRICAL, 1, "Reviewer"))
        states = [v["state"] for v in self.store.effect_model_versions(OWNER, ELECTRICAL)]
        self.assertEqual(states, ["promoted", "rolled_back"])
        third = self.runtime.investigate(request("REQ-3", as_of=9,
                                                 available_capabilities=self.MEMORY))
        self.assertEqual(third.memory["effect_model_version"], 1)
        self.assertEqual(third.selected_option["identifier"],
                         second.selected_option["identifier"])

    def test_effect_model_math_is_a_shrunken_running_residual(self):
        keys = ("supply=expedite", "crew=hold")
        model = EffectModel().updated(keys, {"margin": -2.0})
        self.assertAlmostEqual(model.correction(keys, "margin"), -1.0)  # half-trusted once
        model = model.updated(keys, {"margin": -4.0})
        self.assertAlmostEqual(sum(model.entries[k]["margin"][1] for k in keys), -3.0)
        self.assertAlmostEqual(model.correction(("supply=expedite",), "margin"), -1.0)
        self.assertEqual(model.correction(keys, "schedule"), 0.0)
        self.assertEqual(EffectModel.from_json(model.to_json()).to_json(), model.to_json())


class PortabilityAndReplayTests(RuntimeCase):
    def seed_job(self):
        values = {"upstream_remaining": 0, "downstream_remaining": 3, "part_eta_periods": 2,
                  "crew_capacity_units": 2, "periods_left": 4}
        for metric in METRICS:
            self.runtime.observe(fact("EV-" + metric, metric, values[metric],
                                      domain=DISPATCH, scope="JOB-1", subject="JOB"))
        self.runtime.set_goal_profile(profile(
            domain=DISPATCH, weights={"schedule": 5, "cost": 2, "quality": 2},
            hard_constraints={"max_spend": 150}))

    def test_four_domain_packs_share_one_typed_core(self):
        self.seed_electrical()
        self.seed_fleet()
        self.seed_job()
        for metric, value in {"cond_a": 1, "cond_b": 0, "cond_c": 0,
                              "load_level": 2}.items():
            self.runtime.observe(fact("EV-" + metric, metric, value, domain=TUNING,
                                      scope="LINE", subject="LINE"))
        self.runtime.set_goal_profile(profile(
            domain=TUNING, weights={"output": 5, "stability": 2, "cost": 2}))
        cases = [(ELECTRICAL, SCOPE), (EQUIPMENT, "FLEET"), (DISPATCH, "JOB-1"),
                 (TUNING, "LINE")]
        for index, (domain, scope) in enumerate(cases):
            with self.subTest(domain=domain):
                proposal = self.runtime.investigate(request(
                    f"REQ-{index}", domain=domain, scope=scope, as_of=2))
                self.assertIsInstance(proposal, DecisionProposalV1)
                self.assertFalse(proposal.abstained)
                self.assertEqual(proposal.approval_state, PENDING_HUMAN_REVIEW)
                self.assertEqual(proposal.domain_id, domain)
                self.assertTrue(proposal.evidence_refs)
                effects = {name: 0.0 for name in proposal.expected_effects}
                learned = self.runtime.record_outcome(
                    outcome(proposal, effects, f"OUT-{index}"))
                self.assertEqual(learned["status"], "learned_provisional")
        situation = self.runtime.situation(OWNER, EQUIPMENT, "FLEET", 2)
        self.assertEqual(len(situation["usable_facts"]), 8)
        self.assertEqual(situation["assumptions_promoted_to_facts"], 0)

    def test_deterministic_replay_and_tamper_detection(self):
        self.seed_electrical()
        caps = ("bounded_search", "outcome_memory")
        first = self.runtime.investigate(request(available_capabilities=caps))
        self.runtime.record_outcome(outcome(first, BAD_SUBSTITUTE))
        self.runtime.investigate(request("REQ-2", as_of=7, available_capabilities=caps))
        self.runtime.investigate(request("REQ-3", as_of=8, compute_budget=2))
        self.runtime.promote_effect_model(OWNER, ELECTRICAL, 1, "Reviewer")
        trace = self.store.trace(OWNER)
        self.assertEqual(replay(trace, adapters()),
                         {"entries": len(trace), "matches": True, "mismatches": []})
        tampered = [dict(entry) for entry in trace]
        target = next(i for i, e in enumerate(tampered) if e["kind"] == "outcome")
        tampered[target] = {**tampered[target], "body": {
            **tampered[target]["body"],
            "observed_effects": {**BAD_SUBSTITUTE, "margin": 6.0}}}
        self.assertFalse(replay(tampered, adapters())["matches"])

    def test_durable_history_survives_reopening(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        path = os.path.join(folder.name, "runtime.sqlite3")
        store = RuntimeStore(path)
        runtime = AionRuntime(store, adapters())
        self.store, self.runtime = store, runtime
        self.seed_electrical()
        proposal = runtime.investigate(request(
            available_capabilities=("bounded_search", "outcome_memory")))
        runtime.record_outcome(outcome(proposal, BAD_SUBSTITUTE))
        store.close()
        reopened = RuntimeStore(path)
        self.store = reopened
        self.assertEqual(reopened.proposal(OWNER, proposal.proposal_id), proposal)
        self.assertEqual(reopened.outcome(OWNER, "OUT-1").receipt_ref, "RECEIPT-OUT-1")
        self.assertEqual(reopened.active_effect_model(OWNER, ELECTRICAL)["version"], 1)
        self.assertEqual(AionRuntime(reopened, adapters()).investigate(request(
            available_capabilities=("bounded_search", "outcome_memory"))), proposal)


if __name__ == "__main__":
    unittest.main()
