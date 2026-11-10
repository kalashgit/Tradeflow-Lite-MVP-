"""Scientific controls for progressive compositional synthesis."""
import unittest

from aion_genesis.adaptive_synthesis import AdaptiveSynthesis, catalog_details
from aion_genesis.core import states, predict
from aion_genesis.open_world import novel_worlds, HybridProposer
from aion_genesis.scientist import Scientist


class AdaptiveSynthesisTests(unittest.TestCase):
    def test_small_to_large_grammar_only_on_evidence_falsification(self):
        solver=AdaptiveSynthesis()
        variables=("A","B","C")
        no_evidence=[]
        candidate=solver.propose(variables=variables,recent=no_evidence,
                                 feedback=[],previous=None)
        self.assertIsNotNone(candidate)
        self.assertEqual(solver.expansion_events,0)
        world=novel_worlds(seed=938,count=6)[0]  # NAND composition
        observations=[world.intervene(s) for s in states(variables)]
        solution=solver.propose(variables=variables,recent=observations,
                                feedback=[],previous=candidate)
        self.assertIsNotNone(solution)
        self.assertEqual(solver.expansion_events,1)
        self.assertEqual(solver.expanded_decisions,1)
        self.assertTrue(all(predict(solution,o["state"],variables)==o["result"]
                            for o in observations))
        self.assertEqual(solver.expansion_events,1)

    def test_proposals_can_reconstruct_all_six_unseen_compositions_from_observations(self):
        for world in novel_worlds(seed=938,count=24):
            with self.subTest(world=world.world_id):
                evidence=[world.intervene(s) for s in states(world.variables)]
                solver=AdaptiveSynthesis()
                actual=solver.propose(variables=world.variables,recent=evidence,
                                      feedback=[],previous=None)
                self.assertIsNotNone(actual)
                self.assertEqual(world.accuracy(actual),1.0)
                self.assertEqual(solver.expansion_events,1)

    def test_representations_are_not_derived_from_hidden_world(self):
        triples=catalog_details(("A","B","C"))
        quadruples=catalog_details(("A","B","C","D"))
        self.assertGreater(triples["distinctTruthTables"],35)
        self.assertGreater(quadruples["distinctTruthTables"],90)
        self.assertTrue(triples["includesOnlyApprovedDSL"])
        self.assertTrue(quadruples["includesOnlyApprovedDSL"])

    def test_expanded_intervention_never_repeats_and_respects_budget(self):
        world=novel_worlds(seed=939,count=6)[4]
        solver=AdaptiveSynthesis(top_k=64)
        trial=Scientist(solver,working_limit=4).investigate(world,max_experiments=12)
        self.assertEqual(trial.experiments,12)
        self.assertEqual(trial.model_calls,12)  # one cheap proposal per intervention
        self.assertFalse(trial.long_term_memory_written)
        measured=[tuple(t["observation"]["state"][x] for x in world.variables)
                  for t in trial.trace]
        self.assertEqual(len(measured),len(set(measured)))
        self.assertEqual(solver.expansion_events,1)

    def test_legacy_grammar_stays_distinct_from_new_composition_engine(self):
        world=novel_worlds(seed=938,count=6)[0]
        observations=[world.intervene(s) for s in states(world.variables)]
        baseline=HybridProposer(inventor=None)
        self.assertIsNone(baseline.propose(variables=world.variables,
                            recent=observations,feedback=[],previous=None))
        expanded=AdaptiveSynthesis()
        self.assertIsNotNone(expanded.propose(variables=world.variables,
                            recent=observations,feedback=[],previous=None))


if __name__=="__main__":
    unittest.main()
