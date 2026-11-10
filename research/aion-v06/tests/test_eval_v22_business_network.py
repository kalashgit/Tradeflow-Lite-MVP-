"""Business-network scenario factory v2.2 research contracts.

Coverage and replay tests are not evidence of higher Genesis decision quality.
"""

from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

from aion_genesis.eval_v2.network_factory import (
    DISRUPTIONS, ROLES, WORKFLOWS, Event, Scenario,
    generate, generate_batch,
)
from aion_genesis.eval_v2.network_runner import (
    execute, verify_run, write_run,
)


class NetworkFactoryContracts(unittest.TestCase):
    def test_seeded_factory_is_reproducible_diverse_and_disjoint(self):
        a = generate_batch("dev", 96)
        b = generate_batch("dev", 96)
        self.assertEqual(a, b)
        self.assertEqual(len(set(c.fingerprint() for c in a)), 96)
        self.assertEqual(set(c.disruption for c in a), set(DISRUPTIONS))
        self.assertEqual(set(c.disruption for c in generate_batch(
            "validation", 48)), set(DISRUPTIONS))
        self.assertFalse({s.seed for s in a} & {
            s.seed for s in generate_batch("validation", 96)})
        self.assertGreaterEqual(len(set(len(s.job_ids) for s in a)), 4)
        self.assertTrue(all(s.tenant.startswith("SYN-TENANT-") for s in a))
        for invalid in ("holdout", "protected", "release", ""):
            with self.assertRaises(PermissionError):
                generate_batch(invalid)
        with self.assertRaises(ValueError):
            generate_batch("dev", 0)
        with self.assertRaises(ValueError):
            generate_batch("dev", 1025)

    def test_stakeholder_and_workflow_coverage_are_derived_from_actual_messages(self):
        scenario = generate("dev", 3, disruption="scope_change")
        self.assertEqual({event.actor for event in scenario.events}, set(ROLES))
        self.assertEqual({event.workflow for event in scenario.events}, set(WORKFLOWS))
        self.assertEqual({m.recipient for m in scenario.envelopes}, set(ROLES))
        self.assertTrue(all(e.tenant == scenario.tenant for e in scenario.events))
        self.assertGreater(len(scenario.envelopes), len(scenario.events))
        self.assertTrue(all(e.source_ref.startswith("SIM-EVIDENCE-")
                            for e in scenario.events))
        self.assertGreater(len(set(e.source_ref for e in scenario.events)), 1)

    def test_projection_is_not_global_omniscient_state_and_cannot_see_future(self):
        case = generate("dev", 0, jobs=3)
        early = case.public_view("project_manager", 1, case.tenant)
        self.assertTrue(early["known_information_not_complete"])
        self.assertFalse(early["hidden_truth_available"])
        self.assertNotIn("events", early)
        self.assertNotIn("truth", early)
        self.assertTrue(all(row["occurred_at"] <= 1 for row in early["known"]))
        self.assertTrue(all(row["job_id"] in case.job_ids for row in early["known"]))
        view = case.public_view("technician", case.horizon-1, case.tenant)
        # Finance should not broadcast cash reconciliation to field crews.
        self.assertTrue(all(row["stream"] not in ("invoice", "payment", "collection")
                            for row in view["known"]))
        self.assertGreater(len(case.source_truth(case.horizon-1)), len(view["known"]))

    def test_hard_tenant_and_role_revocation_boundaries(self):
        case = generate("dev", 4)
        with self.assertRaises(PermissionError):
            case.public_view("owner", 6, "SYN-TENANT-FOREIGN")
        with self.assertRaises(PermissionError):
            case.public_view("root", 6, case.tenant)
        with self.assertRaises(ValueError):
            case.public_view("owner", case.horizon + 1, case.tenant)
        revoked = replace(case, revoked_role="technician", revoked_at=7)
        self.assertEqual(revoked.public_view("technician", 6,
                                             case.tenant)["role"], "technician")
        with self.assertRaises(PermissionError):
            revoked.public_view("technician", 7, case.tenant)
        self.assertTrue(revoked.diagnostic(8)["technician"]["revoked"])
        with self.assertRaises(ValueError):
            replace(case, revoked_role="unknown", revoked_at=4)

    def test_revision_observation_never_rolls_back_when_messages_arrive_out_of_order(self):
        case = generate("dev", 7, jobs=2, disruption="stale_revision")
        job = case.job_ids[0]
        original = [e for e in case.events if e.job_id == job
                    and e.stream == "field"]
        self.assertEqual([e.revision for e in original], [1, 2])
        # Revision 1 is delayed deliberately; revision 2 can arrive first.
        first_deliveries = [
            m.delivered_at for m in case.envelopes
            if m.event_id == original[0].event_id and m.recipient == "foreman"]
        second_deliveries = [
            m.delivered_at for m in case.envelopes
            if m.event_id == original[1].event_id and m.recipient == "foreman"]
        self.assertLess(second_deliveries[0], first_deliveries[0])
        after_all = case.public_view("foreman", case.horizon-1, case.tenant)
        field = next(row for row in after_all["known"] if
                     row["job_id"] == job and row["stream"] == "field")
        self.assertEqual(field["source_revision"], 2)
        self.assertEqual(field["status"], "needs_reinspection")

    def test_lost_ack_is_not_confused_with_unverified_completion(self):
        case = generate("dev", 10, jobs=2, disruption="lost_acknowledgment")
        job = case.job_ids[0]
        pm = case.public_view("project_manager", case.horizon-1, case.tenant)
        seller = case.public_view("supplier", case.horizon-1, case.tenant)
        pm_purchase = next(r for r in pm["known"] if
                           r["job_id"] == job and r["stream"] == "purchase")
        supplier_purchase = next(r for r in seller["known"] if
                                 r["job_id"] == job and r["stream"] == "purchase")
        self.assertEqual(pm_purchase["status"], "requested")
        self.assertEqual(supplier_purchase["status"], "acknowledged")
        # A different source stream explicitly represents invoice verification.
        self.assertTrue(any(r["stream"] == "invoice_readiness" for r in pm["known"]))

    def test_incorrect_source_revision_and_duplicate_delivery_are_rejected(self):
        case = generate("dev", 1)
        bad = replace(case.events[1], revision=3)
        with self.assertRaisesRegex(ValueError, "revisions"):
            replace(case, events=tuple((case.events[0], bad, *case.events[2:])))
        with self.assertRaisesRegex(ValueError, "duplicate stakeholder"):
            replace(case, envelopes=case.envelopes + (case.envelopes[0],))


class NetworkFactoryReplayTests(unittest.TestCase):
    def test_count_coverage_and_role_metrics_are_sourced_from_generated_data(self):
        result, ledger, timing = execute("dev", 48)
        self.assertEqual(result["batch_size"], 48)
        self.assertEqual(result["different_scenarios"], 48)
        self.assertEqual(set(result["disruption_coverage"]), set(DISRUPTIONS))
        self.assertEqual(set(result["workflow_coverage"]), set(WORKFLOWS))
        self.assertEqual(set(result["stakeholder_receipt_coverage"]), set(ROLES))
        self.assertGreater(result["routed_deliveries"], result["source_events"])
        self.assertEqual(result["source_ledger_hash"], ledger.head)
        self.assertGreater(timing["generated_scenarios_per_second"], 0)
        self.assertFalse(result["protected_holdout_evaluated"])
        self.assertFalse(result["real_business_records_used"])
        self.assertFalse(result["policy_decision_improvement_proven"])
        self.assertEqual(result["promotion"], "not_authorized")
        self.assertGreaterEqual(result["audited_stale_streams"], 0)
        self.assertGreaterEqual(result["audited_missing_streams"], 0)

    def test_fresh_run_replays_independently_and_detects_modified_ledger(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "run"
            write_run("dev", 16, path)
            self.assertTrue(verify_run(path)["reproduced"])
            with self.assertRaises(FileExistsError):
                write_run("dev", 16, path)
            evidence = path / "ledger.jsonl"
            evidence.write_text(evidence.read_text().replace(
                "source_event", "source_mutated", 1), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                verify_run(path)

    def test_holdout_and_large_run_requests_fail_closed(self):
        with self.assertRaises(PermissionError):
            execute("holdout", 2)
        with self.assertRaises(ValueError):
            execute("dev", 10000)


if __name__ == "__main__":
    unittest.main()
