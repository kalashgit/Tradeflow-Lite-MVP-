"""Contract tests for a separate shared-resource portfolio benchmark.

Tests prove sandbox boundaries, trace reproduction and baseline behavior,
NOT general Genesis intelligence or a validated contractor business model.
"""

from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

from aion_genesis.eval_v2.portfolio import Job, OwnerChange, PortfolioCase, PortfolioWorld, ToolFault
from aion_genesis.eval_v2.portfolio_agents import make_policy
from aion_genesis.eval_v2.portfolio_cases import DEV, VALIDATION, load_suite, manifest
from aion_genesis.eval_v2.portfolio_runner import (
    evaluate_suite, score, verify_run, write_run,
)


class PortfolioContractTests(unittest.TestCase):
    def test_dev_validation_disjoint_and_holdout_denied(self):
        self.assertGreaterEqual(len(DEV), 4)
        self.assertGreaterEqual(len(VALIDATION), 3)
        self.assertFalse({s.seed for s in DEV} & {s.seed for s in VALIDATION})
        self.assertFalse({s.case_id for s in DEV} & {s.case_id for s in VALIDATION})
        self.assertEqual(len({s.fingerprint() for s in (*DEV, *VALIDATION)}),
                         len(DEV) + len(VALIDATION))
        self.assertFalse(manifest("dev")["protected_holdout"])
        for name in ("holdout", "secret", "release", ""):
            with self.assertRaises(PermissionError):
                load_suite(name)
        with self.assertRaises(ValueError):
            make_policy("experimental_oracle")
        with self.assertRaises(ValueError):
            evaluate_suite("dev", policies=("no_action", "cash_aware"))

    def test_public_view_hides_changes_faults_and_exact_scenario_identity(self):
        case = DEV[2]
        world = PortfolioWorld(case)
        public = world.public_view()
        self.assertNotIn("fault", str(public).lower())
        self.assertNotIn("future", str(public).lower())
        self.assertNotIn("changes", str(public).lower())
        self.assertNotIn(case.case_id, str(public))
        self.assertTrue(all("job_id" in j for j in public["jobs"]))
        self.assertNotIn("case_hash", public)

    def test_shared_supplier_capacity_and_permission_denial(self):
        # Admit the third mock project at tick zero so that the second
        # order is genuinely testing supplier throughput, not arrival.
        case = replace(DEV[4], jobs=tuple(
            replace(job, arrival=0) if job.job_id == "JOB-C" else job
            for job in DEV[4].jobs))
        world = PortfolioWorld(case)
        a = world.step({"tool": "order_materials", "job_id": "JOB-A",
                        "key": "no-approval"})
        self.assertEqual(a["result"]["status"], "approval_denied")
        first = world.step({"tool": "order_materials", "job_id": "JOB-B",
                            "key": "order-b"})
        self.assertEqual(first["result"]["status"], "committed")
        second = world.step({"tool": "order_materials", "job_id": "JOB-C",
                             "key": "order-c"})
        self.assertEqual(second["result"]["status"], "supplier_capacity")
        self.assertGreaterEqual(world.invalid_or_denied, 1)
        self.assertGreaterEqual(world.cash, 0)

    def test_after_commit_timeout_operation_verified_and_write_idempotent(self):
        world = PortfolioWorld(DEV[3])
        initial = world.cash
        act = {"tool": "order_materials", "job_id": "JOB-A",
               "key": "material-a"}
        result = world.step(act)
        self.assertEqual(result["result"]["status"], "timeout_unknown_commit")
        self.assertEqual(world.cash, initial - 210)
        verified = world.step({"tool": "inspect_operation", "job_id": "",
                               "key": "material-a"})
        self.assertEqual(verified["result"]["status"], "committed")
        world.step({"tool": "wait", "job_id": "", "key": ""})
        duplicate = world.step(act)
        self.assertEqual(duplicate["result"]["status"], "already_committed")
        self.assertEqual(world.cash, initial - 210)
        self.assertEqual(world.duplicate_prevented, 1)
        self.assertEqual(len(world.judge_state()["operations"]), 1)

    def test_project_priorities_change_without_future_information(self):
        world = PortfolioWorld(DEV[2])
        # JOB-B arrives at tick one; future jobs must remain hidden.
        self.assertNotIn("JOB-B", [
            j["job_id"] for j in world.public_view()["jobs"]])
        world.step({"tool": "wait", "job_id": "", "key": ""})
        self.assertEqual(next(j["priority"] for j in world.public_view()[
            "jobs"] if j["job_id"] == "JOB-B"), 1)
        for _ in range(4):
            world.step({"tool": "wait", "job_id": "", "key": ""})
        current = world.public_view()
        b = next(j for j in current["jobs"] if j["job_id"] == "JOB-B")
        self.assertEqual(b["priority"], 5)
        self.assertEqual(b["work_required"], 4)
        self.assertNotIn("future_changes", current)

    def test_owner_scope_change_and_delayed_payment_never_double_pay(self):
        case = PortfolioCase(
            "SYN-PORT-TEST-PAY-ONCE", "dev", 94700, 17, 650, 1, 1,
            (Job("JOB-A", 0, 12, 100, 60, 1, 400, 0, 1, 3, 120),
             Job("JOB-B", 0, 13, 100, 65, 1, 450, 0, 1, 2, 120)),
            changes=(OwnerChange(5, "JOB-A", 5, 1),))
        world = PortfolioWorld(case)
        world.step({"tool": "order_materials", "job_id": "JOB-A", "key": "ord-a"})
        world.step({"tool": "wait", "job_id": "", "key": ""})
        world.step({"tool": "schedule_crew", "job_id": "JOB-A", "key": "crew-a-1"})
        world.step({"tool": "verify_job", "job_id": "JOB-A", "key": ""})
        world.step({"tool": "wait", "job_id": "", "key": ""})
        for _ in range(4):
            world.step({"tool": "wait", "job_id": "", "key": ""})
        self.assertIn("JOB-A", world.paid)
        self.assertNotIn("JOB-A", world.verified)
        before = world.cash
        world.step({"tool": "schedule_crew", "job_id": "JOB-A", "key": "crew-a-2"})
        world.step({"tool": "verify_job", "job_id": "JOB-A", "key": ""})
        world.step({"tool": "wait", "job_id": "", "key": ""})
        world.step({"tool": "wait", "job_id": "", "key": ""})
        self.assertEqual(world.cash, before - 60)
        self.assertEqual(world.work["JOB-A"], 2)
        self.assertEqual(len(world.paid), 1)

    def test_bad_mock_tool_never_changes_cash(self):
        world = PortfolioWorld(DEV[0])
        cash = world.cash
        for payload in (
            {"tool": "bank_wire", "job_id": "JOB-A", "key": "x"},
            {"tool": "schedule_crew", "job_id": "", "key": "x"},
            {"tool": "order_materials", "job_id": "JOB-A", "key": ""},
        ):
            self.assertEqual(world.step(payload)["result"]["status"],
                             "invalid_tool_call")
        self.assertEqual(world.cash, cash)
        self.assertEqual(world.invalid_or_denied, 3)


class PortfolioResearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result, cls.ledger = evaluate_suite("dev")

    def test_paired_scorecards_and_true_no_action_control(self):
        result = self.result
        self.assertEqual(result["schema"], "GenesisPortfolioEvaluation/2.1")
        self.assertEqual(set(result["policy_names"]),
                         {"no_action", "deadline_first", "cash_aware"})
        self.assertEqual(len(result["paired_cases"]), len(DEV))
        self.assertFalse(result["protected_holdout_evaluated"])
        self.assertFalse(result["real_world_improvement_proven"])
        self.assertEqual(result["promotion"], "not_authorized")
        self.assertEqual(result["autonomous_business_actions"], 0)
        inactive = result["scorecards"]["no_action"]
        self.assertEqual(inactive["verified_jobs"], 0)
        self.assertEqual(inactive["mean_cash_delta"], 0)
        self.assertGreater(inactive["missed_opportunity_proxy_total"], 0)
        self.assertGreater(result["scorecards"]["deadline_first"][
            "verified_jobs"], 0)
        for name in result["policy_names"]:
            counts = result["scorecards"][name]
            self.assertGreaterEqual(counts["possible_jobs"], counts["verified_jobs"])
            self.assertGreaterEqual(counts["possible_jobs"], counts["paid_jobs"])

    def test_deterministic_replay_and_artifact_tamper_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_run("dev", tmp)
            self.assertTrue(verify_run(tmp)["reproduced"])
            with self.assertRaises(FileExistsError):
                write_run("dev", tmp)
            ledger = Path(tmp) / "ledger.jsonl"
            ledger.write_text(ledger.read_text().replace(
                "portfolio_tool_step", "portfolio_stealth_call", 1))
            with self.assertRaisesRegex(ValueError, "tampering"):
                verify_run(tmp)

    def test_scored_state_never_claims_counterfactual_truth(self):
        world = PortfolioWorld(DEV[0])
        output = score(DEV[0], world.judge_state())
        self.assertEqual(output["verified_jobs"], 0)
        self.assertFalse(output["real_world_performance_proven"])
        self.assertIn("missed_opportunity_proxy", output)


if __name__ == "__main__":
    unittest.main()
