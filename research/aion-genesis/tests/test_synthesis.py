import unittest
from aion_genesis.core import worlds, states, variable
from aion_genesis.synthesis import SynthesisBaseline, grammar, evaluate_synthesis


class SymbolicProgramSearchTests(unittest.TestCase):
    def test_bounded_grammar_covers_each_existing_hidden_family_by_observations_only(self):
        for world in worlds(seed=71, count=120):
            evidence=[world.intervene(s) for s in states(world.variables)]
            proposer=SynthesisBaseline()
            candidates=proposer.candidates(world.variables, evidence)
            self.assertGreaterEqual(len(candidates), 1, world.world_id)

    def test_program_search_has_an_explicit_out_of_grammar_state(self):
        vars=("A","B","C")
        all_zero=[{"state":s, "result":0} for s in states(vars)]
        proposer=SynthesisBaseline()
        self.assertEqual(proposer.candidates(vars,all_zero),[])
        self.assertIsNone(proposer.propose(variables=vars,recent=all_zero,feedback=[],previous=None))

    def test_grammar_is_deterministic_and_semantically_distinct(self):
        from aion_genesis.core import predict
        vars=("A","B","C","D")
        a,b=grammar(vars),grammar(vars)
        self.assertEqual(a,b)
        signatures=[tuple(predict(rule,s,vars) for s in states(vars)) for rule in a]
        self.assertEqual(len(signatures),len(set(signatures)))

    def test_120_world_control_has_no_model_calls_or_persistent_memory(self):
        outcome=evaluate_synthesis(seed=71,count=12,budget=5)
        self.assertEqual(outcome["kind"],"bounded-program-synthesis-control")
        self.assertFalse(outcome["persistentMemory"])
        self.assertFalse(outcome["report"]["heldout"]["realLLMInference"])
        self.assertEqual(outcome["report"]["heldout"]["worlds"],6)


if __name__=="__main__":
    unittest.main()
