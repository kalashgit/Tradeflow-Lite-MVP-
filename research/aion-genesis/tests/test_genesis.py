import tempfile
import unittest
from pathlib import Path
from aion_genesis.core import (
    MechanismError, ReferenceProposer, choose_intervention, predict, validate, states, variable, worlds
)
from aion_genesis.memory import WorkingMemory, ReviewJournal, EvidenceCertificate, LongTermStore
from aion_genesis.qwen import LocalQwenProposer
from aion_genesis.scientist import Scientist

def v(name):
    return {"op": "var", "name": name}

class MechanismTests(unittest.TestCase):
    def test_composed_rules_are_executable_without_executing_source_code(self):
        variables = ("A","B","C")
        inhibited = {"op":"and","args":[v("A"),v("B"),{"op":"not","arg":v("C")}]}
        majority = {"op":"threshold","args":[v("A"),v("B"),v("C")],"k":2}
        parity = {"op":"xor","args":[v("A"),v("B"),v("C")]}
        self.assertEqual(predict(inhibited,{"A":1,"B":1,"C":0},variables),1)
        self.assertEqual(predict(inhibited,{"A":1,"B":1,"C":1},variables),0)
        self.assertEqual(predict(majority,{"A":1,"B":0,"C":1},variables),1)
        self.assertEqual(predict(parity,{"A":1,"B":1,"C":1},variables),1)

    def test_unknown_ops_injections_and_invalid_arity_are_rejected(self):
        variables = ("A","B","C")
        bad = [
            {"op":"exec","code":"__import__('os').system('echo unsafe')"},
            {"op":"var","name":"__import__"},
            {"op":"and","args":[v("A")]},
            {"op":"threshold","args":[v("A"),v("B")],"k":5},
            {"op":"and","args":[v("A"),v("B")],"extra":"untrusted"},
        ]
        for tree in bad:
            with self.subTest(tree=tree), self.assertRaises(MechanismError):
                validate(tree,variables)
        huge = v("A")
        for _ in range(20):
            huge = {"op":"not","arg":huge}
        with self.assertRaises(MechanismError):
            validate(huge,variables)

    def test_120_hidden_worlds_are_reproducible(self):
        left,right=worlds(11,120),worlds(11,120)
        self.assertEqual(len(left),120)
        self.assertEqual(len({w.world_id for w in left}),120)
        self.assertEqual(sum(w.split=="heldout" for w in left),60)
        self.assertEqual(
            [a.intervene({k:0 for k in a.variables}) for a in left],
            [b.intervene({k:0 for k in b.variables}) for b in right]
        )
        self.assertFalse(hasattr(left[0],"hidden_rule"))

class MemoryTests(unittest.TestCase):
    def test_fast_memory_retains_only_recent_evidence_and_returns_copies(self):
        memory=WorkingMemory(limit=3)
        for n in range(8):
            memory.push({"index":n,"state":{"A":n}})
        self.assertEqual([x["index"] for x in memory.snapshot()],[5,6,7])
        result=memory.snapshot()
        result[0]["state"]["A"]=999
        self.assertEqual(memory.snapshot()[0]["state"]["A"],5)

    def test_review_detects_recurring_hypothesis_across_distinct_worlds(self):
        journal=ReviewJournal(limit=20)
        mechanism={"op":"and","args":[v("A"),v("B")]}
        for world in ("w1","w1","w2"):
            journal.add(world,("A","B","C"),mechanism,{"state":{"A":0,"B":0,"C":0},"result":0},0)
        results=journal.recurring()
        self.assertEqual(len(results),1)
        self.assertEqual(results[0]["worlds"],2)
        self.assertEqual(results[0]["status"],"needs_independent_review")

    def test_counterexamples_are_world_scoped(self):
        review=ReviewJournal()
        rule={"op":"and","args":[v("A"),v("B")]}
        bad={"state":{"A":1,"B":0,"C":0},"result":1}
        review.add("first",("A","B","C"),rule,bad,1)
        self.assertEqual(review.counterexamples(world_id="first"),[bad])
        self.assertEqual(review.counterexamples(world_id="second"),[])

    def test_long_term_memory_cannot_write_under_default_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"knowledge.sqlite"
            store=LongTermStore(path)
            strong=EvidenceCertificate(1.0,1.0,3,3,6,0,"a"*64)
            decision=store.promote("experiment",{"op":"and","args":[v("A"),v("B")]},
                                   ("A","B","C"),strong,independent_gate=True)
            self.assertFalse(decision["accepted"])
            self.assertFalse(path.exists())
            self.assertEqual(store.history("experiment"),[])

    def test_opt_in_sandbox_ledger_preserves_disputes_and_revisions(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=LongTermStore(Path(tmp)/"demo.sqlite",enabled=True)
            strong=EvidenceCertificate(0.97,0.96,3,3,8,0,"b"*64)
            weak=EvidenceCertificate(0.30,0.10,1,1,0,3,"c"*64)
            first={"op":"and","args":[v("A"),v("B")]}
            second={"op":"or","args":[v("A"),v("B")]}
            self.assertFalse(store.promote("world",first,("A","B","C"),strong)["accepted"])
            self.assertFalse(store.promote("world",first,("A","B","C"),weak,independent_gate=True)["accepted"])
            self.assertEqual(store.promote("world",first,("A","B","C"),strong,independent_gate=True)["version"],1)
            self.assertTrue(store.dispute("world",independent_contradiction=True)["changed"])
            self.assertEqual(store.promote("world",second,("A","B","C"),strong,independent_gate=True)["version"],2)
            self.assertEqual([x["status"] for x in store.history("world")],["disputed","verified"])
            store.close()

class ResearchTests(unittest.TestCase):
    def test_intervention_uses_candidate_disagreement_and_never_repeats(self):
        variables=("A","B","C")
        candidates=[{"op":"and","args":[v("A"),v("B")]},{"op":"or","args":[v("A"),v("B")]}]
        first=choose_intervention(variables,[],candidates)
        self.assertIsNotNone(first)
        second=choose_intervention(variables,[{"state":first,"result":0}],candidates)
        self.assertNotEqual(first,second)

    def test_scientist_runs_end_to_end_without_knowledge_promotion(self):
        world=worlds(9,4)[-1]
        researcher=Scientist(ReferenceProposer(composed=False),working_limit=4)
        result=researcher.investigate(world,max_experiments=6)
        self.assertEqual(result.experiments,6)
        self.assertLessEqual(result.working_size,4)
        self.assertFalse(result.long_term_memory_written)
        self.assertEqual(len(result.trace),6)
        self.assertEqual(result.model_calls,6)
        self.assertEqual(result.split,"heldout")

    def test_evidence_rejects_a_regressive_hypothesis_revision(self):
        from aion_genesis.core import HiddenWorld
        class ScriptedProposer:
            def __init__(self):
                self.calls=0
            def propose(self, **kwargs):
                self.calls+=1
                op="or" if self.calls==3 else "and"
                return {"op":op,"args":[v("A"),v("B")]}
        world=HiddenWorld("regression",("A","B","C"),
                          {"op":"and","args":[v("A"),v("B")]},"development")
        result=Scientist(ScriptedProposer()).investigate(world,max_experiments=5)
        third=result.trace[2]
        self.assertEqual(third["candidate"]["op"],"or")
        self.assertFalse(third["accepted"])
        self.assertEqual(third["current"]["op"],"and")
        self.assertEqual(result.final_accuracy,1.0)

    def test_qwen_adapter_stays_local_and_sends_only_evidence(self):
        with self.assertRaises(ValueError):
            LocalQwenProposer(endpoint="https://some-cloud-model.example")
        requests=[]
        def mock(body):
            requests.append(body)
            return {"done":True,"done_reason":"stop","message":{"content":
                '{"op":"threshold","k":2,"args":[{"op":"var","name":"A"},{"op":"var","name":"B"},{"op":"var","name":"C"}]}'}}
        qwen=LocalQwenProposer(transport=mock)
        actual=qwen.propose(variables=("A","B","C"),recent=[{"state":{"A":1,"B":0,"C":1},"result":1}],
                            feedback=[],previous=None)
        self.assertEqual(actual["op"],"threshold")
        self.assertEqual(qwen.calls,1)
        self.assertFalse(requests[0]["think"])
        self.assertNotIn("hidden_rule",str(requests[0]))


class TransferLearningTests(unittest.TestCase):

    def test_schema_mode_contains_finite_executable_ast_grammar(self):
        from aion_genesis.qwen import expression_schema
        self.assertEqual(expression_schema(("A","B","C"),0)["properties"]["op"]["const"],"var")
        payloads=[]
        def canned(request):
            payloads.append(request)
            return {"done":True,"done_reason":"stop",
                    "message":{"content":'{"op":"not","arg":{"op":"and","args":[{"op":"var","name":"A"},{"op":"var","name":"B"}]}}'}}
        model=LocalQwenProposer(transport=canned,output_mode="schema")
        result=model.propose(variables=("A","B","C"),
            recent=[{"state":{"A":0,"B":0,"C":0},"result":1}],feedback=[],previous=None)
        self.assertEqual(result["op"],"not")
        self.assertIn("anyOf",payloads[0]["format"])
        self.assertNotIn("hidden_rule",str(payloads[0]))

    def test_casebook_requires_independent_worlds_and_blocks_holdout(self):
        from aion_genesis.transfer import ProvisionalCasebook
        memory=ProvisionalCasebook(minimum_worlds=2)
        rule={"op":"and","args":[v("A"),v("B")]}
        evidence=[{"state":s,"result":int(s["A"] and s["B"])}
                  for s in [{"A":0,"B":0,"C":0},{"A":1,"B":0,"C":0},{"A":1,"B":1,"C":0}]]
        self.assertFalse(memory.admit_training_case("holdout-1","heldout",("A","B","C"),rule,evidence))
        self.assertTrue(memory.admit_training_case("development-1","development",("A","B","C"),rule,evidence))
        self.assertEqual(memory.retrieve(("A","B","C"),evidence),[])
        self.assertTrue(memory.admit_training_case("development-2","development",("A","B","C"),rule,evidence))
        self.assertEqual(len(memory.retrieve(("A","B","C"),evidence)),1)
        contradiction=[{"state":{"A":1,"B":1,"C":0},"result":0}]
        self.assertEqual(memory.retrieve(("A","B","C"),contradiction),[])
        self.assertEqual(memory.summary()["status"],"provisional-only")

    def test_transfer_ablation_keeps_identical_worlds_and_budgets(self):
        from aion_genesis.transfer import prepare_casebook, run_ablation
        bank, provenance=prepare_casebook(seed=71)
        self.assertEqual(provenance["trainingWorlds"],60)
        self.assertGreaterEqual(provenance["independentlySupportedGroups"],1)
        result=run_ablation(lambda:ReferenceProposer(composed=False),count=4,budget=4)
        self.assertFalse(result["realQwenInference"])
        self.assertFalse(result["persistentCausalKnowledge"])
        self.assertEqual(result["control"]["model_calls"],16)
        self.assertEqual(result["provisionalMemory"]["model_calls"],16)
        self.assertGreater(result["provisionalMemory"]["retrieved_hypotheses"],0)
        self.assertEqual(
            [v["world"] for v in result["control"]["world_results"]],
            [v["world"] for v in result["provisionalMemory"]["world_results"]])

    def test_qwen_analogies_are_provisional_and_token_usage_is_recorded(self):
        requests=[]
        def mock(body):
            requests.append(body)
            return {"done":True,"done_reason":"stop","prompt_eval_count":120,"eval_count":28,
                    "message":{"content":'{"op":"and","args":[{"op":"var","name":"A"},{"op":"var","name":"B"}]}'}}
        qwen=LocalQwenProposer(transport=mock)
        analogy={"op":"and","args":[v("A"),v("B")]}
        proposed=qwen.propose(variables=("A","B","C"),recent=[{"state":{"A":0,"B":0,"C":0},"result":0}],
                              feedback=[],previous=None,analogies=[analogy])
        self.assertIsNotNone(proposed)
        self.assertEqual(qwen.prompt_tokens,120)
        self.assertEqual(qwen.completion_tokens,28)
        self.assertIn("provisionalAnalogies",requests[0]["messages"][1]["content"])
        self.assertNotIn("hidden_rule",str(requests[0]))

if __name__ == "__main__":
    unittest.main()
