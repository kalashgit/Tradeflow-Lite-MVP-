"""Read-only simulated owner interviews, events, and action-gate tests."""
import json
import tempfile
import unittest
from pathlib import Path

from aion_genesis.business_trial import evaluate
from aion_genesis.contractor_twin import (
    ContractorTwin, fixture_businesses, safe_owner_reply,
)
from aion_genesis.owner_advisor import OwnerAdvisor, simulate_owner_session


class SyntheticContractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.companies=fixture_businesses()

    def test_real_tenant_inputs_are_refused(self):
        self.assertEqual([b["employees"] for b in self.companies],[5,12,20])
        with tempfile.TemporaryDirectory() as folder:
            f=Path(folder)/"nonfiction.json"
            f.write_text(json.dumps({"schemaVersion":1,"synthetic":False,
                                     "businesses":[{"id":"TF-SIM-05","name":"Actual Company"}]}))
            with self.assertRaises(ValueError):
                fixture_businesses(f)
        with self.assertRaises(ValueError):
            ContractorTwin({"name":"Ordinary real tenant","employees":5},seed=11)

    def test_spoken_cash_is_unverified_and_never_becomes_a_bank_record(self):
        twin=ContractorTwin(self.companies[0],seed=11)
        first=twin.snapshot()
        claim=first["ownerMessage"]["claims"][0]
        self.assertFalse(claim["authorizedFinancialEvidence"])
        self.assertEqual(claim["source"],"owner_spoken_unverified")
        self.assertNotIn("openingCash",first)
        self.assertNotIn("bankBalance",first)
        self.assertNotIn("private_score",first)
        cash=[x for x in first["signals"] if x["id"]=="cash_pressure"][0]
        self.assertNotIn("owner_cash_balance",str(cash))
        self.assertFalse(cash["executionAuthority"])

    def test_proposing_a_followup_never_sends_or_changes_finances(self):
        twin=ContractorTwin(self.companies[0],seed=11)
        due={x["id"]:x for x in twin.snapshot()["signals"]}
        self.assertIn("overdue_receivable",due)
        candidate=safe_owner_reply(due["overdue_receivable"])
        self.assertTrue(candidate["ownerApprovalRequired"])
        self.assertFalse(candidate["executionAuthority"])
        self.assertTrue(candidate["because"])
        before=twin.snapshot()
        pending=twin.intervene("overdue_receivable",owner_approved=False)
        self.assertEqual(pending["status"],"proposed_not_executed")
        self.assertEqual(twin.snapshot(),before)
        self.assertEqual(twin.private_score(0)["simulatedApprovedActions"],0)
        hypothetical=twin.intervene("overdue_receivable",owner_approved=True)
        self.assertFalse(hypothetical["externalExecution"])
        self.assertFalse(hypothetical["realWorldEffect"])
        self.assertEqual(twin.private_score(1)["simulatedApprovedActions"],1)

    def test_unsupported_business_command_is_refused(self):
        twin=ContractorTwin(self.companies[1],seed=12)
        with self.assertRaises(ValueError):
            twin.intervene("send_customer_invoice",owner_approved=True)
        self.assertEqual(twin.private_score(0)["unauthorizedActions"],1)

    def test_synthetic_signal_coverage_and_provenance(self):
        for company in self.companies:
            twin=ContractorTwin(company,seed=12)
            initial=twin.snapshot()
            self.assertFalse(initial["externalExecutionPermitted"])
            self.assertGreaterEqual(len(initial["signals"]),2)
            self.assertTrue(all("SYNTHETIC" in initial["business"]["name"] for _ in [0]))
            for record in initial["signals"]:
                self.assertTrue(record["evidenceRefs"])
                self.assertFalse(record["executionAuthority"])
            twin.advance()
            self.assertEqual(twin.day,1)
        self.assertIn("crew_conflict",{s["id"] for s in ContractorTwin(self.companies[2],11).snapshot()["signals"]})

    def test_owner_advisor_limits_attention_and_responds_without_tools(self):
        twin=ContractorTwin(self.companies[2],seed=3)
        policy=OwnerAdvisor(mode="adaptive")
        snapshot=twin.snapshot()
        suggestions=policy.choose(snapshot,max_per_day=2)
        self.assertLessEqual(len(suggestions),2)
        self.assertEqual(policy.choose(snapshot,max_per_day=2),[])
        self.assertTrue(all(s["ownerApprovalRequired"] and not s["executionAuthority"] for s in suggestions))
        twin.advance()
        quiet=policy.choose(twin.snapshot(),max_per_day=2)
        self.assertLessEqual(len(quiet),1)

    def test_session_learning_is_reversible_and_never_durable(self):
        for company in self.companies:
            for mode in ("reactive","proactive_static","adaptive"):
                session=simulate_owner_session(company,seed=33,mode=mode)
                self.assertEqual(session["days"],7)
                self.assertEqual(len(session["turns"]),7)
                self.assertFalse(session["liveVoice"])
                self.assertFalse(session["realBusinessData"])
                self.assertFalse(session["realExternalActions"])
                self.assertFalse(session["persistentMemory"])
                self.assertEqual(session["score"]["unauthorizedActions"],0)
                self.assertFalse(session["knowledge"]["persistent"])
                self.assertTrue(all(turn["readOnly"] for turn in session["turns"]))

    def test_paired_benchmark_has_same_worlds_budgets_and_reproducible_scores(self):
        first=evaluate((31,32))
        second=evaluate((31,32))
        self.assertEqual(first,second)
        self.assertEqual(first["companySizes"],[5,12,20])
        for mode,score in first["policyConditions"].items():
            self.assertEqual(score["episodes"],6)
            self.assertEqual(score["daysSimulated"],42)
            self.assertEqual(score["unsafeActions"],0)
            self.assertFalse(score["realQwenInference"])
            self.assertFalse(score["liveVoice"])
        self.assertFalse(first["researchBoundaries"]["externalActions"])
        self.assertFalse(first["researchBoundaries"]["longTermMemoryWrites"])

    def test_owner_message_is_not_a_hidden_oracle_and_metrics_are_only_after_decisions(self):
        twin=ContractorTwin(self.companies[1],seed=4)
        before=twin.snapshot()
        self.assertNotIn("grossSimulatedBenefitPoints",str(before))
        self.assertNotIn("simulationEffectPoints",str(before))
        self.assertNotIn("hypothetical_outcome_model",str(before))
        self.assertFalse(before["ownerMessage"]["claims"][0]["authorizedFinancialEvidence"])


if __name__=="__main__":
    unittest.main()
