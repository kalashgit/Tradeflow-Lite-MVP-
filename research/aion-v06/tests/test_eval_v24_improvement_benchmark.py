"""Restricted AionRuntime candidate improvement and paired bench contracts."""

from pathlib import Path
import tempfile
import unittest

from aion_genesis.eval_v2.genesis_runner import (
    run_benchmark, verify_run, write_run,
)
from aion_genesis.eval_v2.improvement_gate import (
    ImprovementHypothesis, apply_improvement, prepare_draft, promote_candidate,
)


class RestrictedImprovementTests(unittest.TestCase):
    @staticmethod
    def example():
        return ImprovementHypothesis(
            baseline_sha="a" * 40,
            proposed_kind="belief_state_estimator",
            development_cases=("SYN-CAUSAL-DEV-830000-SUPPLIER_SHOCK-2-0",),
            receipt_refs=("SYN-RECEIPT-a123",),
            explanation="The action sequence ignored late material delivery evidence.",
            predicted_diagnostic="Belief-state improvements reduce blocked crew attempts.",
            falsifying_condition="Paired new scenarios show equal or worse verified payments.",
            fallback="Preserve the existing safe bounded planner and abstain.")
        
    def test_drafts_are_falsifiable_pinned_and_non_executable(self):
        proposal = prepare_draft(self.example(), replay_ok=True,
                                 independent_review=True)
        self.assertEqual(proposal["status"], "DRAFT_NOT_AUTHORIZED")
        self.assertFalse(proposal["promotion_eligible"])
        self.assertFalse(proposal["apply_automatically"])
        self.assertFalse(proposal["write_production"])
        self.assertTrue(proposal["original_benchmark_immutable"])
        self.assertEqual(len(proposal["digest"]), 64)
        with self.assertRaises(PermissionError):
            apply_improvement(proposal)
        with self.assertRaises(PermissionError):
            promote_candidate(proposal)

    def test_reject_validation_or_unpinned_research_claims(self):
        example = self.example()
        from dataclasses import replace
        with self.assertRaises(ValueError):
            replace(example, baseline_sha="main")
        with self.assertRaises(ValueError):
            replace(example, development_cases=(
                "SYN-CAUSAL-VALIDATION-930000-SUPPLIER_SHOCK-2-0",))
        with self.assertRaises(ValueError):
            replace(example, receipt_refs=("unsourced",))


class ActualRuntimeBenchmarkTests(unittest.TestCase):
    def test_matched_runtime_and_fixed_controls_expose_no_model_tricks(self):
        report, ledger = run_benchmark(2, 2)
        self.assertEqual(report["runtime"], "AionRuntime")
        self.assertEqual(report["model_calls"], 0)
        self.assertFalse(report["protected_holdout_used"])
        self.assertFalse(report["candidate_promoted"])
        self.assertFalse(report["validation_used_to_train"])
        self.assertFalse(report["model_weight_training"])
        self.assertFalse(report["real_training_data"])
        self.assertEqual(set(report["summaries"]), {"dev", "validation"})
        for split in ("dev", "validation"):
            self.assertEqual(len(report["cohorts"][split]), 2)
            for policy in ("runtime_memory_on", "runtime_memory_off",
                           "deadline_first", "cash_first", "risk_averse",
                           "no_action"):
                self.assertIn(policy, report["summaries"][split])
            self.assertEqual(report["summaries"][split][
                "no_action"]["paid_jobs"], 0)
        self.assertEqual(report["ledger_hash"], ledger.head)
        gate = report["development_only_memory_admission"]
        self.assertEqual(gate["evaluated_on"], "dev_only")
        self.assertFalse(gate["validation_used_for_gate"])
        self.assertFalse(gate["candidate_promotion_allowed"])
        self.assertIn(gate["status"], (
            "BLOCKED_DEVELOPMENT_REGRESSION",
            "DEV_CHECK_ONLY_EXTERNAL_REVIEW_REQUIRED"))

    def test_exact_paired_replay_integrity_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_run(root, 2, 2)
            self.assertTrue(verify_run(root)["independent_replay"])
            with self.assertRaises(FileExistsError):
                write_run(root, 2, 2)
            source = root / "review.md"
            source.write_text(source.read_text().replace(
                "AionRuntime", "not-genesis", 1))
            with self.assertRaisesRegex(ValueError, "hash"):
                verify_run(root)

    def test_oversized_unpinned_eval_budget_rejected(self):
        for count in (0, 1, 13, 1000):
            with self.assertRaises(ValueError):
                run_benchmark(count, 2)


if __name__ == "__main__":
    unittest.main()
