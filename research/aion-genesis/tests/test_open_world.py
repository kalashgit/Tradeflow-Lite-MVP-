import unittest
from aion_genesis.core import HiddenWorld, states, variable
from aion_genesis.open_world import HybridProposer, novel_worlds, test_unknown_grammar


def v(k):
    return {"op":"var","name":k}


class UnknownMechanismTests(unittest.TestCase):
    def test_four_unseen_compositions_are_outside_fixed_symbolic_grammar(self):
        result=test_unknown_grammar(seed=938,count=24)
        self.assertTrue(result["passed"])
        self.assertEqual(result["totalWorlds"],24)
        self.assertEqual(result["outsideKnownGrammar"],24)
        self.assertFalse(result["realQwenInference"])

    def test_symbolic_rules_skip_all_qwen_model_calls(self):
        class ShouldNotRun:
            def propose(self, **kwargs):
                raise AssertionError("Qwen should not be needed for known rules")
        hybrid=HybridProposer(inventor=ShouldNotRun())
        state={"A":0,"B":0,"C":0}
        out=hybrid.propose(variables=("A","B","C"),
                           recent=[{"state":state,"result":0}],feedback=[],previous=None)
        self.assertIsNotNone(out)
        self.assertEqual(hybrid.calls,0)
        self.assertEqual(hybrid.escalations,0)
        self.assertEqual(hybrid.known_decisions,1)

    def test_unknown_rule_escalates_and_verified_proposal_is_reusable(self):
        class SyntheticInventor:
            def __init__(self):
                self.calls=0
            def propose(self, *, variables, recent, feedback, previous, analogies):
                self.calls+=1
                return {"op":"not","arg":{"op":"and","args":[v("A"),v("B")]}}
        world=HiddenWorld("test-nand",("A","B","C"),
                          {"op":"not","arg":{"op":"and","args":[v("A"),v("B")]}},
                          "unseen")
        evidence=[world.intervene(s) for s in states(world.variables)]
        agent=HybridProposer(inventor=SyntheticInventor())
        proposal=agent.propose(variables=world.variables,recent=evidence,feedback=[],
                               previous=None)
        self.assertEqual(proposal["op"],"not")
        self.assertEqual(agent.escalations,1)
        self.assertEqual(agent.calls,1)
        self.assertEqual(len(agent.candidates(world.variables,evidence)),1)
        again=agent.propose(variables=world.variables,recent=evidence,feedback=[],previous=None)
        self.assertEqual(again,proposal)
        self.assertEqual(agent.calls,1) # short-term reuse, no repeated LLM expense

    def test_inconsistent_novel_model_is_rejected_not_saved_as_truth(self):
        class BadInventor:
            def __init__(self):
                self.calls=0
            def propose(self, **kwargs):
                self.calls+=1
                return {"op":"xor","args":[v("A"),v("C")]}
        world=HiddenWorld("test-nand",("A","B","C"),
                          {"op":"not","arg":{"op":"and","args":[v("A"),v("B")]}},
                          "unseen")
        evidence=[world.intervene(s) for s in states(world.variables)]
        agent=HybridProposer(inventor=BadInventor())
        self.assertIsNone(agent.propose(variables=world.variables,recent=evidence,
                                        feedback=[],previous=None))
        self.assertEqual(agent.rejected_inventions,1)
        self.assertEqual(agent.candidates(world.variables,evidence),[])


if __name__=="__main__":
    unittest.main()
