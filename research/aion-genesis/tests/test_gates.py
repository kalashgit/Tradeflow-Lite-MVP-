import unittest
from aion_genesis.gates import quality_gate


class DeterministicLearningGateTests(unittest.TestCase):
    def make_report(self):
        return {
            "realQwenInference":False,"persistentKnowledgeEnabled":False,
            "fixed":{"worlds":72,"totalQwenCalls":0,"totalInterventions":624,
                     "meanUnseenAccuracy":0.375,"meanCPUmsPerWorld":22.0},
            "progressive":{"worlds":72,"totalQwenCalls":0,"totalInterventions":624,
                           "meanUnseenAccuracy":0.75,"meanFinalAccuracy":0.9688,
                           "perfectBy5":21,"meanCPUmsPerWorld":21.0},
            "pairedComparison":{"unseenAccuracyDelta":0.375,"negativeTransferWorlds":0},
        }

    def test_verified_style_results_pass_but_never_authorize_memory(self):
        report=quality_gate([self.make_report(),self.make_report()])
        self.assertTrue(report["passed"],report["problems"])
        self.assertEqual(report["knowledgeAdmission"],"BLOCKED")

    def test_unequal_experiment_budgets_fail_even_with_good_accuracy(self):
        record=self.make_report()
        record["progressive"]["totalInterventions"]=630
        result=quality_gate([record,self.make_report()])
        self.assertFalse(result["passed"])

    def test_negative_transfer_world_fails(self):
        record=self.make_report()
        record["pairedComparison"]["negativeTransferWorlds"]=1
        result=quality_gate([self.make_report(),record])
        self.assertFalse(result["passed"])

    def test_requires_independent_validation(self):
        result=quality_gate([self.make_report()])
        self.assertFalse(result["passed"])

    def test_model_inference_cannot_be_mislabeled_as_zero_cost(self):
        record=self.make_report()
        record["progressive"]["totalQwenCalls"]=2
        result=quality_gate([self.make_report(),record])
        self.assertFalse(result["passed"])


if __name__=="__main__":
    unittest.main()
