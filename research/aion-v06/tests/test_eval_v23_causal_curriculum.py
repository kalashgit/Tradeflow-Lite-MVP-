"""End-to-end synthetic causal world, adaptive lesson and feedback tests."""

from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

from aion_genesis.eval_v2.adaptive import (
    Curriculum, OutcomeBandit, Policy, contrast, critic_packet, episode, judge,
)
from aion_genesis.eval_v2.adaptive_runner import run_training, verify_run, write_run
from aion_genesis.eval_v2.causal_world import (
    Case, FAMILIES, Job, Shock, World, generate,
)


def action(tool, job="", key=""):
    return {"tool": tool, "job_id": job, "key": key}


def fixed_case(*shocks, cash=1000, lag=1, pay_delay=2):
    job_a = Job("JOB-A", 150, 70, 2, 700, 18, 1, pay_delay, 3, 220)
    job_b = Job("JOB-B", 180, 80, 2, 650, 20, 2, 2, 4, 230)
    return Case("SYN-CAUSAL-UNIT", "dev", 831111,
                "compound", 2, 0, 32, cash, 1, lag,
                (job_a, job_b), tuple(shocks))


class EconomicCausalityTests(unittest.TestCase):
    def test_generator_is_deterministic_disjoint_and_family_diverse(self):
        cases = [generate("dev", i) for i in range(24)]
        self.assertEqual(cases, [generate("dev", i) for i in range(24)])
        self.assertEqual({c.family for c in cases}, set(FAMILIES))
        self.assertEqual(len({c.fingerprint() for c in cases}), 24)
        other = [generate("validation", i) for i in range(24)]
        self.assertFalse({c.seed for c in cases} & {c.seed for c in other})
        for name in ("holdout", "protected", ""):
            with self.assertRaises(PermissionError):
                generate(name, 1)

    def test_supplier_message_delay_is_not_material_delivery(self):
        case = fixed_case(Shock(1, "JOB-A", "supplier_delay", 4), lag=2)
        w = World(case)
        self.assertEqual(w.step(action("order_material", "JOB-A", "ord-a"))[
            "result"]["status"], "committed")
        self.assertEqual(w.cash, case.initial_cash - 150)
        self.assertNotEqual(w.jobs["JOB-A"]["material"], "ready")
        self.assertEqual(w.public_view()["jobs"][0]["materials_seen"], "unknown")
        w.step(action("wait"))
        self.assertEqual(w.jobs["JOB-A"]["delivery_due"], 6)
        # Supplier message can be in transit while the true shipment is delayed.
        for _ in range(4):
            w.step(action("wait"))
        self.assertNotEqual(w.jobs["JOB-A"]["material"], "ready")
        w.step(action("wait"))
        self.assertEqual(w.jobs["JOB-A"]["material"], "ready")
        # Delivery itself is also subject to a separate delayed message.
        self.assertNotEqual(w.public_view()["jobs"][0]["materials_seen"], "delivered")
        for _ in range(2):
            w.step(action("wait"))
        self.assertEqual(w.public_view()["jobs"][0]["materials_seen"], "delivered")

    def test_blocker_requires_resolution_and_shifts_do_not_leak_cash(self):
        case = fixed_case(Shock(1, "JOB-A", "field_blocker", 2), lag=1)
        w = World(case)
        w.step(action("order_material", "JOB-A", "ord"))
        for _ in range(2):
            w.step(action("wait"))
        self.assertEqual(w.jobs["JOB-A"]["material"], "ready")
        original = w.cash
        self.assertEqual(w.step(action("assign_crew", "JOB-A", "labor-1"))[
            "result"]["status"], "work_unavailable")
        self.assertEqual(w.cash, original)
        self.assertEqual(w.step(action("escalate_blocker", "JOB-A", "blk-1"))[
            "result"]["status"], "committed")
        self.assertTrue(w.jobs["JOB-A"]["blocked"])
        for _ in range(3):
            w.step(action("wait"))
        self.assertFalse(w.jobs["JOB-A"]["blocked"])
        self.assertEqual(w.step(action("assign_crew", "JOB-A", "labor-1"))[
            "result"]["status"], "committed")
        self.assertEqual(w.cash, original - 70)

    def test_scope_change_does_not_auto_grant_approval(self):
        case = fixed_case(Shock(2, "JOB-A", "scope_change", 2), lag=0)
        w = World(case)
        w.step(action("order_material", "JOB-A", "ord"))
        w.step(action("wait"))
        w.step(action("wait"))
        self.assertTrue(w.jobs["JOB-A"]["scope_pending"])
        self.assertEqual(w.jobs["JOB-A"]["required"], 2)
        self.assertEqual(w.step(action("request_invoice", "JOB-A", "inv"))[
            "result"]["status"], "invoice_not_ready")
        response = w.step(action("request_change_approval", "JOB-A", "ask-1"))
        self.assertEqual(response["result"]["status"], "committed")
        self.assertTrue(w.jobs["JOB-A"]["scope_pending"])
        w.step(action("wait"))
        w.step(action("wait"))
        self.assertEqual(w.jobs["JOB-A"]["required"], 4)
        self.assertFalse(w.jobs["JOB-A"]["scope_pending"])
        seen = w.public_view()["jobs"][0]
        self.assertEqual(seen["required_known"], 4)
        self.assertEqual(seen["change_seen"], "approved")

    def test_invoice_verified_then_delayed_cash_never_double_paid(self):
        case = fixed_case(lag=0, pay_delay=2)
        w = World(case)
        w.step(action("order_material", "JOB-A", "purchase-a"))
        for _ in range(2):
            w.step(action("wait"))
        self.assertEqual(w.step(action("assign_crew", "JOB-A", "work-1"))[
            "result"]["status"], "committed")
        self.assertEqual(w.step(action("assign_crew", "JOB-A", "work-2"))[
            "result"]["status"], "committed")
        self.assertEqual(w.step(action("request_invoice", "JOB-A", "invoice-1"))[
            "result"]["status"], "committed")
        before_verified = w.cash
        self.assertEqual(w.jobs["JOB-A"]["invoice"], "pending")
        w.step(action("wait"))
        w.step(action("wait"))
        self.assertEqual(w.jobs["JOB-A"]["invoice"], "verified")
        self.assertEqual(w.cash, before_verified)
        self.assertEqual(w.step(action("request_invoice", "JOB-A", "invoice-1"))[
            "result"]["status"], "already_committed")
        for _ in range(4):
            w.step(action("wait"))
        self.assertTrue(w.jobs["JOB-A"]["paid"])
        self.assertEqual(w.cash, before_verified + 700)
        w.step(action("wait"))
        self.assertEqual(w.cash, before_verified + 700)
        self.assertEqual(w.duplicate_preventions, 1)

    def test_field_worker_cannot_view_cash_and_cross_tenant_denied(self):
        case = fixed_case(Shock(1, "JOB-A", "field_blocker", 2))
        w = World(case)
        public = w.public_view("foreman")
        self.assertNotIn("cash_budget", public)
        self.assertNotIn("jobs", public)
        self.assertNotIn("initial_cash", str(public))
        self.assertNotIn("shocks", str(w.public_view()))
        with self.assertRaises(PermissionError):
            w.public_view("project_manager", tenant="SYN-TENANT-OTHER")
        with self.assertRaises(PermissionError):
            w.public_view("root")

    def test_unapproved_order_denied_no_money_moves(self):
        case = fixed_case()
        j = replace(case.jobs[0], order_limit=100)
        case = replace(case, jobs=(j, case.jobs[1]))
        w = World(case)
        before = w.cash
        out = w.step(action("order_material", "JOB-A", "over-limit"))
        self.assertEqual(out["result"]["status"], "approval_denied")
        self.assertEqual(w.cash, before)
        self.assertEqual(w.denials, 1)

    def test_real_causal_receipts_export_to_ten_role_network_not_scripted_events(self):
        case = fixed_case(lag=0, pay_delay=1)
        w = World(case)
        w.step(action("order_material", "JOB-A", "purchase-1"))
        # A supplier receives only the purchase request, not a fake payment.
        early = w.export_causal_network()
        supplier = early.public_view("supplier", 0, early.tenant)
        self.assertTrue(any(e["stream"] == "purchase" for e in supplier["known"]))
        self.assertFalse(any(e["stream"] == "payment" for e in early.source_truth(0)))
        for _ in range(2):
            w.step(action("wait"))
        w.step(action("assign_crew", "JOB-A", "crew-1"))
        w.step(action("assign_crew", "JOB-A", "crew-2"))
        w.step(action("request_invoice", "JOB-A", "invoice-1"))
        self.assertFalse(w.jobs["JOB-A"]["paid"])
        for _ in range(6):
            w.step(action("wait"))
        self.assertTrue(w.jobs["JOB-A"]["paid"])
        stream = w.export_causal_network()
        completed = stream.source_truth(w.tick - 1)
        self.assertTrue(any(e["stream"] == "payment" and
                            e["status"] == "reconciled" for e in completed))
        self.assertTrue(any(e["stream"] == "invoice" and
                            e["status"] == "verified" for e in completed))
        self.assertTrue(any(e["stream"] == "assignment" for e in completed))
        owner = stream.public_view("owner", w.tick - 1, stream.tenant)
        self.assertTrue(any(e["stream"] == "payment" for e in owner["known"]))
        technician = stream.public_view("technician", w.tick - 1, stream.tenant)
        self.assertTrue(any(e["stream"] == "work" for e in technician["known"]))
        self.assertFalse(any(e["stream"] == "payment" for e in technician["known"]))
        with self.assertRaises(PermissionError):
            stream.public_view("supplier", w.tick - 1, "SYN-TENANT-NOT-OURS")

    def test_mock_references_are_distinct_from_real_business_data(self):
        case = generate("dev", 4)
        report = episode(case, "deadline_first")
        self.assertFalse(report["real_world_value_proven"])
        self.assertFalse(report["promotion_authorized"])
        self.assertIn("missed_opportunity_proxy", report)
        self.assertEqual(report["split"], "dev")


class CurriculumAndCriticTests(unittest.TestCase):
    def test_escalation_remediation_and_exploration_are_bounded(self):
        curriculum = Curriculum()
        lesson = curriculum.next_lesson()
        case = generate("dev", 0, family=lesson.family,
                        difficulty=lesson.difficulty, novelty=lesson.novelty)
        record = curriculum.admit_feedback(
            lesson, case, "deadline_first", "deadline_first")
        self.assertTrue(record["win"])
        self.assertEqual(record["mode_next"], "escalate")
        self.assertEqual(curriculum.levels[lesson.family], 2)
        self.assertFalse(record["code_update_permitted"])
        following = curriculum.next_lesson()
        self.assertEqual(following.mode, "escalate")
        with self.assertRaises(PermissionError):
            curriculum.admit_feedback(
                following, generate("validation", 1, family=following.family,
                                    difficulty=following.difficulty), "no_action",
                "deadline_first")

    def test_learning_is_empirical_and_validation_cannot_update(self):
        learner = OutcomeBandit()
        case = generate("dev", 1)
        self.assertEqual(learner.choose(case.family), "deadline_first")
        learner.learn_from_paired_dev(case)
        self.assertTrue(any(learner.snapshot()[case.family][mode][
            "observations"] == 1 for mode in learner.OPTIONS))
        with self.assertRaises(PermissionError):
            learner.learn_from_paired_dev(generate("validation", 1))
        self.assertIn(learner.choose(case.family), learner.OPTIONS)

    def test_independent_shock_ablation_has_honest_limitations(self):
        case = generate("dev", 0, family="supplier_shock")
        analysis = contrast(case, "deadline_first", "supplier_delay")
        self.assertTrue(analysis["paired_same_policy"])
        self.assertEqual(analysis["matched_seed"], case.seed)
        self.assertFalse(analysis["real_world_causation_proven"])
        self.assertFalse(analysis["code_change_authorized"])

    def test_critic_packet_cannot_override_numeric_evaluator(self):
        case = generate("dev", 0)
        score, trace = episode(case, "deadline_first", review=True)
        packet = critic_packet(case, score, trace)
        self.assertFalse(packet["score_override_permitted"])
        self.assertFalse(packet["source_truth_included"])
        self.assertFalse(packet["judgment_binding"])
        self.assertNotIn("hidden_case", packet)
        self.assertGreater(len(packet["public_action_trace"]), 10)

    def test_adaptive_tournament_determinism_and_replay(self):
        report, ledger, critics = run_training(12, 6)
        second, other_ledger, other_critics = run_training(12, 6)
        self.assertEqual(report, second)
        self.assertEqual(ledger.records, other_ledger.records)
        self.assertEqual(critics, other_critics)
        self.assertEqual(report["development_cases"], 12)
        self.assertEqual(report["public_validation_cases"], 6)
        self.assertFalse(report["validation_used_for_learning"])
        self.assertFalse(report["secured_holdout_evaluated"])
        self.assertFalse(report["candidate_code_modified"])
        self.assertFalse(report["machine_learning_model_trained"])
        self.assertEqual(report["promotion"], "blocked_pending_external_review")
        self.assertEqual(len(report["strategy_map_frozen_before_validation"]),
                         len(FAMILIES))
        self.assertTrue(all(row["case_id"].startswith("SYN-CAUSAL-VALIDATION")
                            for row in report["public_validation"]))
        self.assertEqual(len(critics), 3)

    def test_artifacts_are_reproducible_and_tampering_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "run"
            write_run(target, 8, 6)
            self.assertTrue(verify_run(target)["deterministically_reproduced"])
            with self.assertRaises(FileExistsError):
                write_run(target, 8, 6)
            target_file = target / "critic-packets.json"
            target_file.write_text(target_file.read_text().replace(
                "score_override_permitted", "score_override_allowed", 1))
            with self.assertRaisesRegex(ValueError, "tampering"):
                verify_run(target)


if __name__ == "__main__":
    unittest.main()
