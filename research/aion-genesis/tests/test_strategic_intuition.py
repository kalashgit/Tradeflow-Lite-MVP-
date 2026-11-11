"""Controlled tests for AION's proposed strategic-intuition membrane."""
import unittest

from aion_genesis.core import HiddenWorld, states, predict
from aion_genesis.strategic_intuition import (
    VARS, StrategyBank, build_bank, synthetic_episode, flip_one_input,
    Calibration, calibrate, probe_memory, route, experiment, reliability
)


class StrategicIntuitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank=build_bank(seed=19)

    def test_only_independently_supported_and_frozen_memories_are_retrieved(self):
        b=StrategyBank()
        rule=self.bank.recall("context-00",VARS).mechanism
        observations={}
        for i in range(3):
            world=HiddenWorld("train-test-%s" % i,VARS,rule,"train")
            observations[world.world_id]=[world.intervene(s) for s in states(VARS)]
        with self.assertRaises(ValueError):
            b.admit("context-99",VARS,rule,dict(list(observations.items())[:2]))
        b.admit("context-99",VARS,rule,observations)
        self.assertIsNone(b.recall("context-99",VARS))
        b.freeze()
        self.assertIsNotNone(b.recall("context-99",VARS))
        with self.assertRaises(ValueError):
            b.admit("context-99",VARS,rule,observations)
        self.assertFalse(b.summary()["persistent"])

    def test_retrieved_strategy_is_not_mutable_global_knowledge(self):
        first=self.bank.recall("context-00",VARS)
        first.mechanism["op"]="tampered"
        second=self.bank.recall("context-00",VARS)
        self.assertNotEqual(second.mechanism["op"],"tampered")
        self.assertIsNone(self.bank.recall("nonexistent",VARS))

    def test_adversarial_shift_may_match_canaries_but_differs_on_exactly_one_state(self):
        candidate=self.bank.recall("context-00",VARS).mechanism
        altered=flip_one_input(candidate,{"A":0,"B":1,"C":0})
        different=sum(predict(candidate,s,VARS)!=predict(altered,s,VARS) for s in states(VARS))
        self.assertEqual(different,1)

    def test_certain_falsification_routes_back_to_deep_reasoning(self):
        from aion_genesis.strategic_intuition import choose_canaries
        memory=self.bank.recall("context-00",VARS)
        probe=choose_canaries(memory,self.bank.alternatives("context-00",VARS),[])
        altered=flip_one_input(memory.mechanism,probe)
        world=HiddenWorld("eval-contradiction",VARS,altered,"eval")
        cert=Calibration(min_samples=1,lower_bound=0.0)
        cert.observe(True,True)
        cert.freeze()
        measured=route(world,"context-00",self.bank,cert,mode="gated")
        self.assertEqual(measured["route"],"deep")
        self.assertTrue(measured["contradictionRoutedDeep"])
        self.assertEqual(measured["modelCalls"],0)
        self.assertLessEqual(measured["interventions"],5)
        self.assertFalse(measured["persistentKnowledgeWrites"])

    def test_novel_context_always_routes_deep_even_with_high_calibration(self):
        cert=Calibration(min_samples=1,lower_bound=0.0)
        cert.observe(True,True)
        cert.freeze()
        world,context,kind=synthetic_episode(self.bank,199,12,shift_probability=0,novel_probability=1)
        self.assertEqual(kind,"novel_context")
        result=route(world,context,self.bank,cert,mode="gated")
        self.assertEqual(result["route"],"deep")
        self.assertEqual(result["interventions"],5)

    def test_uncalibrated_membrane_fails_closed_to_deep(self):
        strategy=self.bank.recall("context-00",VARS).mechanism
        world=HiddenWorld("unknown-confidence",VARS,strategy,"eval")
        cert=Calibration()
        result=route(world,"context-00",self.bank,cert,mode="gated")
        self.assertEqual(result["route"],"deep")
        self.assertEqual(result["interventions"],5)
        self.assertEqual(cert.summary()["confidenceGateOpen"],False)

    def test_calibration_does_not_update_from_evaluation_outcomes(self):
        cert=calibrate(self.bank,seed=811,count=320)
        self.assertTrue(cert.frozen)
        previous=cert.summary()
        with self.assertRaises(ValueError):
            cert.observe(True,True)
        self.assertEqual(cert.summary(),previous)

    def test_familiar_fast_path_never_exceeds_diagnostic_budget(self):
        cert=Calibration(min_samples=1,lower_bound=0.0)
        cert.observe(True,True)
        cert.freeze()
        original=self.bank.recall("context-03",VARS).mechanism
        world=HiddenWorld("exact-familiar",VARS,original,"eval")
        result=route(world,"context-03",self.bank,cert,mode="gated")
        self.assertEqual(result["route"],"fast")
        self.assertEqual(result["interventions"],2)
        self.assertTrue(result["exact"])
        self.assertEqual(result["candidateChecksProxy"],0)
        self.assertIsNotNone(result["confidence"])

    def test_independently_seeded_ablation_completes_without_live_promotion(self):
        summary=experiment(seeds=(1901,),count_per_seed=24)
        self.assertEqual(summary["policies"]["gated"]["episodes"],24)
        self.assertEqual(summary["policies"]["deep_only"]["episodes"],24)
        self.assertTrue(summary["safety"]["noProductionData"])
        self.assertEqual(summary["safety"]["persistentCausalMemory"],"DISABLED")
        self.assertFalse(summary["safety"]["realQwenInference"])
        self.assertEqual(summary["policies"]["deep_only"]["meanInterventions"],5)
        self.assertEqual(summary["policies"]["gated"]["modelCalls"],0)
        self.assertTrue(summary["calibration"]["frozen"])

    def test_stream_drift_monitor_uses_only_canary_outcomes(self):
        from aion_genesis.strategic_intuition import DriftSentinel
        monitor=DriftSentinel(baseline_mismatch_rate=0.04,window=48,min_samples=32)
        for _ in range(20):
            monitor.record(True)
        self.assertFalse(monitor.alarm)
        for _ in range(13):
            monitor.record(False)
        self.assertTrue(monitor.alarm)
        self.assertGreaterEqual(monitor.alerts,1)
        self.assertTrue(monitor.summary()["noEvaluatorLabelsUsed"])
        with self.assertRaises(ValueError):
            monitor.record("bad model truth")

    def test_drift_alarm_rejects_familiar_fast_path_without_oracle(self):
        from aion_genesis.strategic_intuition import DriftSentinel
        monitor=DriftSentinel(0.04,window=48,min_samples=32)
        for _ in range(40):
            monitor.record(False)
        self.assertTrue(monitor.alarm)
        certificate=Calibration(min_samples=1,lower_bound=0.0)
        certificate.observe(True,True)
        certificate.freeze()
        memory=self.bank.recall("context-00",VARS)
        world=HiddenWorld("drift-alert",VARS,memory.mechanism,"eval")
        evaluation=route(world,"context-00",self.bank,certificate,
                         mode="gated_drift_aware",sentinel=monitor)
        self.assertEqual(evaluation["route"],"deep")
        self.assertTrue(evaluation["monitorAlarmBefore"])
        self.assertTrue(evaluation["monitorForcedDeep"])
        self.assertEqual(evaluation["interventions"],5)

    def test_residual_hypothesis_repairs_observed_local_rule_change(self):
        from aion_genesis.strategic_intuition import residual_repair, choose_canaries
        memory=self.bank.recall("context-00",VARS)
        first=choose_canaries(memory,self.bank.alternatives("context-00",VARS),[])
        rule=flip_one_input(memory.mechanism,first)
        world=HiddenWorld("local-change",VARS,rule,"eval")
        observed=[world.intervene(first)]
        proposal,additional,patches,checks,fallback=residual_repair(
            world,memory,observed,max_interventions=5,
            alternatives=self.bank.alternatives("context-00",VARS))
        self.assertFalse(fallback)
        self.assertEqual(patches,1)
        self.assertEqual(world.accuracy(proposal),1.0)
        self.assertEqual(len(additional),5)

    def test_multi_change_generator_alters_two_distinct_inputs(self):
        from aion_genesis.strategic_intuition import synthetic_episode
        found=False
        for index in range(80):
            world,context,kind=synthetic_episode(self.bank,9301,index,shift_probability=0.70,
                                                 change_points=2)
            if kind=="deceptive_shift":
                original=self.bank.recall(context,VARS).mechanism
                wrong=sum(predict(original,state,VARS)!=world.intervene(state)["result"]
                          for state in states(VARS))
                self.assertEqual(wrong,2)
                found=True
                break
        self.assertTrue(found)

    def test_replacement_worlds_are_not_just_one_or_two_local_exceptions(self):
        from aion_genesis.strategic_intuition import synthetic_episode
        for index in range(30):
            world,context,kind=synthetic_episode(self.bank,9541,index,shift_probability=0.7,
                                                  change_style="replacement")
            if kind=="deceptive_shift":
                prior=self.bank.recall(context,VARS).mechanism
                mismatch=sum(predict(prior,s,VARS)!=world.intervene(s)["result"]
                             for s in states(VARS))
                self.assertGreaterEqual(mismatch,3)
                return
        self.fail("no replacement test world sampled")

    def test_false_familiarity_is_recorded_not_hidden(self):
        rows=[{"confidence":0.9,"exact":False},{"confidence":0.9,"exact":True}]
        metrics=reliability(rows)
        self.assertEqual(metrics["samples"],2)
        self.assertGreater(metrics["brier"],0)
        self.assertGreater(metrics["ece"],0)


if __name__=="__main__":
    unittest.main()
