"""Small, strictly held-out novel-composition trial against REAL loopback Qwen.

The symbolic library knows its fixed grammar; Qwen is called only after that
grammar has been contradicted by actual observations. Evaluation measurements
are performed AFTER inference and never passed into the model.
"""
import argparse
import json
import os

from .core import predict, states
from .open_world import HybridProposer, novel_worlds, test_unknown_grammar
from .qwen import LocalQwenProposer
from .scientist import Scientist


def evaluate(seed=938, count=6, model="qwen3:0.6b", output_mode="schema"):
    if count < 1 or count > 24:
        raise ValueError("invalid novel-world budget")
    provenance=test_unknown_grammar(seed=seed, count=max(6,count))
    results=[]
    for world in novel_worlds(seed=seed,count=max(6,count))[:count]:
        model_agent=LocalQwenProposer(model=model,output_mode=output_mode,
                                     endpoint=os.environ.get("AION_MODEL_URL","http://127.0.0.1:11434"))
        hybrid=HybridProposer(inventor=model_agent)
        # 7/8 observations for 3-switch worlds; 12/16 for four-switch worlds.
        budget=7 if len(world.variables)==3 else 12
        trial=Scientist(hybrid,working_limit=16).investigate(world,max_experiments=budget)
        last=trial.trace[-1]["current"] if trial.trace else None
        seen={tuple(entry["observation"]["state"][v] for v in world.variables)
              for entry in trial.trace}
        new_inputs=[state for state in states(world.variables)
                    if tuple(state[v] for v in world.variables) not in seen]
        # These are SEPARATE evaluator-only measurements. They are never given to Qwen.
        correct=0
        for state in new_inputs:
            actual=world.intervene(state)["result"]
            if last is not None and predict(last,state,world.variables)==actual:
                correct+=1
        unseen_accuracy=correct/len(new_inputs) if new_inputs else None
        results.append({
            "world":world.world_id,
            "variables":list(world.variables),
            "interventionsForInference":trial.experiments,
            "evaluatorOnlyUnseenInterventions":len(new_inputs),
            "unseenPredictiveAccuracy":unseen_accuracy,
            "fullTruthTableAccuracy":trial.final_accuracy,
            "validProposals":trial.valid_proposals,
            "consistentProposals":trial.consistent_proposals,
            "qwenCalls":hybrid.calls,
            "qwenEscalationDecisions":hybrid.escalations,
            "knownGrammarDecisions":hybrid.known_decisions,
            "rejectedInventedASTs":hybrid.rejected_inventions,
            "acceptedNovelASTs":hybrid.admitted_inventions,
            "inputTokens":hybrid.prompt_tokens,
            "outputTokens":hybrid.completion_tokens,
            "latestHypothesis":last,
        })
    calls=sum(r["qwenCalls"] for r in results)
    return {
        "kind":"AION-Genesis-V1-symbolic-first-novel-composition",
        "model":model,
        "outputMode":output_mode,
        "realQwenInference":calls>0,
        "persistentMemoryEnabled":False,
        "researchAdmission":"BLOCKED",
        "provenance":provenance,
        "worlds":len(results),
        "qwenCalls":calls,
        "escalations":sum(r["qwenEscalationDecisions"] for r in results),
        "acceptedNovelASTs":sum(r["acceptedNovelASTs"] for r in results),
        "meanUnseenAccuracy":round(sum(r["unseenPredictiveAccuracy"] for r in results)/len(results),4),
        "meanFullAccuracy":round(sum(r["fullTruthTableAccuracy"] for r in results)/len(results),4),
        "totalInputTokens":sum(r["inputTokens"] for r in results),
        "totalOutputTokens":sum(r["outputTokens"] for r in results),
        "results":results,
        "limitation":"Fixed DSL with previously unseen compositions, not genuine invention of new operators; no independent repeated runs."
    }


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument("--worlds",type=int,default=6)
    parser.add_argument("--seed",type=int,default=938)
    parser.add_argument("--model",default=os.environ.get("AION_MODEL_ID","qwen3:0.6b"))
    parser.add_argument("--output-mode",choices=("json","schema"),default="schema")
    opts=parser.parse_args(argv)
    report=evaluate(seed=opts.seed,count=opts.worlds,model=opts.model,output_mode=opts.output_mode)
    print(json.dumps(report,indent=2,sort_keys=True))


if __name__=="__main__":
    main()
