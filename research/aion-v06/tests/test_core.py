import unittest
from unittest.mock import patch

from aion_genesis.evolution import evolve
from aion_genesis.experiment import run_trial
from aion_genesis.investigation import investigate
from aion_genesis.learner import Genome, estimate, predict, select_interventions
from aion_genesis.provider import CompatibleChatAdapter, InferenceConfig
from aion_genesis.world import ALL_ACTIONS, HiddenWorld


class CoreTests(unittest.TestCase):
    def test_hidden_world_reproducible(self):
        first, second = HiddenWorld(17), HiddenWorld(17)
        self.assertEqual([first.observe(a) for a in ALL_ACTIONS],
                         [second.observe(a) for a in ALL_ACTIONS])

    def test_full_design_can_identify_pairwise_rules(self):
        genome = Genome(basis="pairwise", regularization=1e-6)
        world = HiddenWorld(101)
        weights = estimate([world.observe(a) for a in ALL_ACTIONS], genome)
        self.assertLess(max(abs(predict(weights, a, genome) - world.observe(a).outcome)
                            for a in ALL_ACTIONS), 0.001)

    def test_interventions_are_unique(self):
        for strategy in ("random", "information"):
            selected = select_interventions(Genome(exploration=strategy), 12, 12)
            self.assertEqual(len(selected), len(set(selected)))

    def test_evolution_is_deterministic(self):
        first = evolve(seed=11, generations=3, population_size=6,
                       training_worlds=5, holdout_worlds=5).as_dict()
        second = evolve(seed=11, generations=3, population_size=6,
                        training_worlds=5, holdout_worlds=5).as_dict()
        self.assertEqual(first, second)
        self.assertLessEqual(first["champion_dev_mae"], first["baseline_dev_mae"])
        self.assertFalse(first["protocol"]["holdout_used_for_selection"])
        self.assertIn("champion_ood_mae", first)

    def test_hypothesis_updates_without_observing_evaluation_actions(self):
        result = investigate(world_seed=7)
        self.assertEqual([step["observations_seen"] for step in result["hypothesis_updates"]],
                         [4, 8, 12])
        self.assertNotEqual(result["hypothesis_updates"][0]["hypothesis_coefficients"],
                            result["hypothesis_updates"][2]["hypothesis_coefficients"])

    def test_trial_still_has_unseen_interventions(self):
        trial = run_trial(Genome(), world_seed=12)
        self.assertEqual(trial.training_count, 12)
        self.assertEqual(trial.unseen_count, 4)

    def test_chat_adapter_parses_compatible_response(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _size):
                return b'{"choices":[{"message":{"content":"AION_OK"}}]}'

        with patch("aion_genesis.provider.request.urlopen", return_value=Response()) as send:
            response = CompatibleChatAdapter(
                InferenceConfig(base_url="http://127.0.0.1:11434/v1", model="qwen3:4b")
            ).complete([{"role": "user", "content": "Check"}])
        self.assertEqual(response, "AION_OK")
        self.assertEqual(send.call_count, 1)


if __name__ == "__main__":
    unittest.main()
