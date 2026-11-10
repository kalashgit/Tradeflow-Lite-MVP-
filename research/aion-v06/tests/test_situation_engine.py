import os
import tempfile
import unittest

from aion_genesis.domains.electrical_contractor import DEMO_EVENTS, ElectricalContractorPack
from aion_genesis.situation_engine import Hypothesis, Observation, SituationStore


class FactoryMaintenancePack:
    """A genuinely different domain adapter, using the exact same core engine."""

    name = "example_factory_maintenance"
    allowed_actions = frozenset({"inspect_machine"})

    def analyze(self, current):
        bad = [e for e in current if e.metric == "temperature_c" and e.value > 80]
        return [Hypothesis(
            scope_id=e.scope_id,
            claim="A machine is hot; an inspection may be warranted.",
            action="inspect_machine", severity=3, evidence_ids=(e.event_id,),
            dimensions=("uptime",),
            alternative="Confirm the sensor reading independently.",
            uncertainty="An elevated temperature alone does not prove a fault.",
        ) for e in bad]


class FakeUnsupportedPack:
    name = "bad_adapter"
    allowed_actions = frozenset({"inspect_machine"})

    def analyze(self, current):
        return [Hypothesis(
            scope_id="JOB-17", claim="Invented problem", action="inspect_machine",
            severity=5, evidence_ids=("FAKE-EVENT",), dimensions=("uptime",),
            alternative="Unknown", uncertainty="Unknown",
        )]


class SituationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "situation.sqlite3")
        self.store = SituationStore(self.path)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def _seed(self):
        for event in DEMO_EVENTS:
            self.store.observe(event)

    def test_electrical_cross_department_investigations(self):
        self._seed()
        result = self.store.investigate("DEMO-OWNER", ElectricalContractorPack())
        self.assertEqual(result["current_facts"], 6)
        self.assertEqual(len(result["briefing"]), 3)
        self.assertEqual({x["proposed_action"] for x in result["briefing"]}, {
            "review_schedule_dependencies", "review_permit_and_inspection",
            "review_cashflow_plan",
        })
        self.assertIn("procurement", result["situation_map"]["JOB-17"]["departments"])
        self.assertIn("finance", result["situation_map"]["JOB-17"]["departments"])
        schedule = next(x for x in result["briefing"]
                        if x["proposed_action"] == "review_schedule_dependencies")
        self.assertEqual({e["event_id"] for e in schedule["evidence"]}, {
            "EVT-SUP-1", "EVT-CREW-1",
        })
        self.assertFalse(result["model_learning_established"])

    def test_owner_goals_change_order_without_fabricating_evidence(self):
        self._seed()
        before = self.store.investigate("DEMO-OWNER", ElectricalContractorPack())
        self.store.set_goal("DEMO-OWNER", "cashflow", 5)
        self.store.set_goal("DEMO-OWNER", "staff_wellbeing", 5)
        after = self.store.investigate("DEMO-OWNER", ElectricalContractorPack())
        self.assertEqual(before["current_facts"], after["current_facts"])
        cashflow = next(x for x in after["briefing"] if x["proposed_action"] == "review_cashflow_plan")
        old_cashflow = next(x for x in before["briefing"] if x["proposed_action"] == "review_cashflow_plan")
        self.assertEqual(cashflow["id"], old_cashflow["id"])
        self.assertGreater(cashflow["priority_score_heuristic"], old_cashflow["priority_score_heuristic"])

    def test_new_evidence_replaces_old_and_supersedes_stale_hypothesis(self):
        self._seed()
        first = self.store.investigate("DEMO-OWNER", ElectricalContractorPack())
        target = next(x["id"] for x in first["briefing"]
                      if x["proposed_action"] == "review_schedule_dependencies")
        self.store.observe(Observation(
            "DEMO-OWNER", "EVT-SUP-2", 2, "JOB-17", "SUPPLIER-3",
            "procurement", "supplier_eta_slip_days", 0,
        ))
        next_result = self.store.investigate("DEMO-OWNER", ElectricalContractorPack())
        self.assertNotIn("review_schedule_dependencies", [x["proposed_action"]
                          for x in next_result["briefing"]])
        old = self.store.db.execute(
            "SELECT state FROM situation_hypotheses WHERE tenant_id = ? AND hypothesis_id = ?",
            ("DEMO-OWNER", target),
        ).fetchone()
        self.assertEqual(old[0], "superseded")
        self.assertEqual(len(self.store.current("DEMO-OWNER")), 6)

    def test_core_runs_other_domain_without_electrical_imports(self):
        self.store.observe(Observation(
            "FACTORY-1", "TEMP-1", 1, "LINE-A", "MACHINE-7",
            "engineering", "temperature_c", 91,
        ))
        result = self.store.investigate("FACTORY-1", FactoryMaintenancePack())
        self.assertEqual(result["domain_pack"], "example_factory_maintenance")
        self.assertEqual(result["briefing"][0]["proposed_action"], "inspect_machine")

    def test_tenant_isolation_in_evidence_and_preferences(self):
        self._seed()
        self.store.set_goal("DEMO-OWNER", "cashflow", 5)
        self.assertEqual(self.store.current("ANOTHER-TENANT"), [])
        result = self.store.investigate("ANOTHER-TENANT", ElectricalContractorPack())
        self.assertEqual(result["briefing"], [])
        self.assertEqual(result["owner_goals"], {})

    def test_review_is_human_gated_tenant_scoped_and_not_an_execution(self):
        self._seed()
        pack = ElectricalContractorPack()
        report = self.store.investigate("DEMO-OWNER", pack)
        identifier = report["briefing"][0]["id"]
        self.assertFalse(self.store.review("ANOTHER-TENANT", pack, identifier, "owner", True))
        with self.assertRaises(ValueError):
            self.store.review("DEMO-OWNER", pack, identifier, "", True)
        self.assertTrue(self.store.review("DEMO-OWNER", pack, identifier, "owner", True))
        self.assertFalse(self.store.review("DEMO-OWNER", pack, identifier, "owner", False))
        self.assertEqual(self.store.investigate("DEMO-OWNER", pack)["briefing"][0]["status"],
                         "approved")
        self.assertEqual(self.store.db.execute(
            "SELECT decision FROM situation_reviews WHERE tenant_id = ? AND hypothesis_id = ?",
            ("DEMO-OWNER", identifier),
        ).fetchone()[0], "approved")

    def test_new_evidence_revokes_prior_simulated_approval(self):
        self._seed()
        pack = ElectricalContractorPack()
        identifier = next(x["id"] for x in self.store.investigate("DEMO-OWNER", pack)["briefing"]
                          if x["proposed_action"] == "review_schedule_dependencies")
        self.assertTrue(self.store.review("DEMO-OWNER", pack, identifier, "owner", True))
        self.store.observe(Observation("DEMO-OWNER", "EVT-SUP-3", 9, "JOB-17",
                                       "SUPPLIER-3", "procurement", "supplier_eta_slip_days", 0))
        self.store.investigate("DEMO-OWNER", pack)
        self.assertEqual(self.store.db.execute(
            "SELECT state FROM situation_hypotheses WHERE tenant_id = ? AND hypothesis_id = ?",
            ("DEMO-OWNER", identifier),
        ).fetchone()[0], "superseded")
        self.assertFalse(self.store.review("DEMO-OWNER", pack, identifier, "owner", True))

    def test_bad_domain_hypothesis_is_rejected_before_persistence(self):
        self._seed()
        with self.assertRaisesRegex(ValueError, "missing"):
            self.store.investigate("DEMO-OWNER", FakeUnsupportedPack())
        self.assertEqual(self.store.db.execute(
            "SELECT COUNT(*) FROM situation_hypotheses"
        ).fetchone()[0], 0)

    def test_observations_and_owner_preferences_survive_restart(self):
        self._seed()
        self.store.set_goal("DEMO-OWNER", "schedule", 4)
        self.store.close()
        self.store = SituationStore(self.path)
        result = self.store.investigate("DEMO-OWNER", ElectricalContractorPack())
        self.assertEqual(result["owner_goals"]["schedule"], 4)
        self.assertEqual(result["current_facts"], 6)

    def test_duplicate_event_cannot_rewrite_history(self):
        self.store.observe(DEMO_EVENTS[0])
        self.assertFalse(self.store.observe(DEMO_EVENTS[0]))
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.store.observe(Observation(
                "DEMO-OWNER", "EVT-SUP-1", 1, "JOB-17", "SUPPLIER-3",
                "procurement", "supplier_eta_slip_days", 9,
            ))


if __name__ == "__main__":
    unittest.main()
