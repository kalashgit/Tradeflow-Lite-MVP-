"""Equal-budget speed and accuracy comparison: fixed vs progressive synthesis.

The holdout evaluator privately knows simulator rules. Agent proposals and
interventions receive ONLY measured observations and allowed DSL operations.
All accuracy/first-success calculations are evaluator-only, performed after
the model has committed its predictions.
"""
import argparse
import json
import statistics
import time

from .adaptive_synthesis import AdaptiveSynthesis, catalog_details
from .core import states, predict
from .open_world import HybridProposer, novel_worlds
from .scientist import Scientist


def _run(seed, world_index, mode, budget, probe_strategy="balanced"):
    # Construct a NEW world for each arm so observations cannot leak across runs.
    world=novel_worlds(seed=seed,count=24)[world_index]
    proposer=AdaptiveSynthesis(probe_strategy=probe_strategy) if mode=="progressive" else HybridProposer(inventor=None,symbolic_strategy="fixed")
    started=time.perf_counter()
    trial=Scientist(proposer,working_limit=16).investigate(world,max_experiments=budget)
    elapsed=(time.perf_counter()-started)*1000
    observed={tuple(step["observation"]["state"][name] for name in world.variables)
              for step in trial.trace}
    unknown=[s for s in states(world.variables)
             if tuple(s[name] for name in world.variables) not in observed]
    # Evaluation-only calls; results NEVER influence the candidate engine.
    unseen_true=[world.intervene(s)["result"] for s in unknown]
    prediction=trial.trace[-1]["current"] if trial.trace else None
    correct=sum(predict(prediction,s,world.variables)==actual
                for s,actual in zip(unknown,unseen_true)) if prediction is not None else 0
    unseen_accuracy=correct/len(unknown)
    per_step=[world.accuracy(step["current"]) if step["current"] is not None else 0.0
              for step in trial.trace]
    perfect_at=next((i+1 for i in range(len(per_step)) if all(score==1 for score in per_step[i:])),None)
    return {
        "world":world.world_id,"seed":seed,"switches":len(world.variables),
        "finalAccuracy":round(trial.final_accuracy,5),
        "unseenAccuracy":round(unseen_accuracy,5),
        "firstStablePerfectObservation":perfect_at,
        "accuracyAfter3":per_step[2] if len(per_step)>=3 else None,
        "accuracyAfter5":per_step[4] if len(per_step)>=5 else None,
        "experiments":trial.experiments,
        "modelCalls":getattr(proposer,"calls",0) if mode=="fixed" else 0,
        "symbolicProposalCalls":getattr(proposer,"calls",0) if mode=="progressive" else 0,
        "qwenCalls":0,
        "expansionEvents":getattr(proposer,"expansion_events",0),
        "buildAndSolveMs":round(elapsed,3),
        "finalHypothesis":prediction,
    }


def compare(seeds=(938,939,940),worlds_per_seed=24,budget_three=7,budget_four=12,probe_strategy="balanced"):
    if not 1 <= worlds_per_seed <=24:
        raise ValueError("world count must be 1..24")
    by_arm={"fixed":[],"progressive":[]}
    for seed in seeds:
        for index in range(worlds_per_seed):
            nvars=4 if index%6 in (4,5) else 3
            budget=budget_four if nvars==4 else budget_three
            for mode in ("fixed","progressive"):
                by_arm[mode].append(_run(seed,index,mode,budget,probe_strategy=probe_strategy))
    def summarize(rows):
        return {
            "worlds":len(rows),
            "meanFinalAccuracy":round(statistics.mean(r["finalAccuracy"] for r in rows),4),
            "meanUnseenAccuracy":round(statistics.mean(r["unseenAccuracy"] for r in rows),4),
            "fullyIdentifiedWorlds":sum(r["finalAccuracy"]==1.0 for r in rows),
            "meanAccuracyAfter3":round(statistics.mean(r["accuracyAfter3"] for r in rows),4),
            "meanAccuracyAfter5":round(statistics.mean(r["accuracyAfter5"] for r in rows),4),
            "perfectBy5":sum(r["firstStablePerfectObservation"] is not None and r["firstStablePerfectObservation"]<=5 for r in rows),
            "perfectWithinBudget":sum(r["firstStablePerfectObservation"] is not None for r in rows),
            "meanExperimentsToStablePerfectAmongSuccessful":round(statistics.mean(
                r["firstStablePerfectObservation"] for r in rows
                if r["firstStablePerfectObservation"] is not None),4) if any(r["firstStablePerfectObservation"] is not None for r in rows) else None,
            "meanCPUmsPerWorld":round(statistics.mean(r["buildAndSolveMs"] for r in rows),2),
            "totalQwenCalls":0,
            "totalInterventions":sum(r["experiments"] for r in rows),
        }
    fixed=by_arm["fixed"]
    improved=by_arm["progressive"]
    deltas=[b["unseenAccuracy"]-a["unseenAccuracy"] for a,b in zip(fixed,improved)]
    return {
        "study":"AION Genesis progressive compositional induction — paired deterministic baseline",
        "realQwenInference":False,
        "persistentKnowledgeEnabled":False,
        "experimentPolicy":"known grammar until falsified -> bounded composed AST; active version-space disagreement",
        "probeStrategy":probe_strategy,
        "seeds":list(seeds),
        "budget3Switch":budget_three,
        "budget4Switch":budget_four,
        "catalog3Switch":catalog_details(("A","B","C")),
        "catalog4Switch":catalog_details(("A","B","C","D")),
        "fixed":summarize(fixed),
        "progressive":summarize(improved),
        "pairedComparison":{
            "finalAccuracyDelta":round(statistics.mean(b["finalAccuracy"]-a["finalAccuracy"] for a,b in zip(fixed,improved)),4),
            "unseenAccuracyDelta":round(statistics.mean(deltas),4),
            "positiveTransferWorlds":sum(v>0 for v in deltas),
            "negativeTransferWorlds":sum(v<0 for v in deltas),
            "unchangedWorlds":sum(v==0 for v in deltas),
        },
        "worldDetails":{"fixed":fixed,"progressive":improved},
        "limitations":[
            "The expanded grammar is made from the allowed Boolean DSL; these toy mechanisms are representable within it",
            "The hidden truth is used for evaluation only; no real-language-model inference or model-weight learning occurred",
            "Accuracy on held-out states is not equivalent to independent real-world causality",
            "More complex or noisy worlds may defeat this known-operator composition search"
        ]
    }


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--worlds-per-seed",type=int,default=24)
    parser.add_argument("--seeds",type=int,nargs="+",default=[938,939,940])
    parser.add_argument("--output",type=str,default="")
    parser.add_argument("--probe-strategy",choices=("balanced","all_on","corners","surprise"),default="balanced")
    args=parser.parse_args()
    result=compare(seeds=tuple(args.seeds),worlds_per_seed=args.worlds_per_seed,probe_strategy=args.probe_strategy)
    if args.output:
        with open(args.output,"w",encoding="utf-8") as f:
            json.dump(result,f,indent=2)
    print(json.dumps({key:result[key] for key in result if key!="worldDetails"},indent=2))


if __name__=="__main__":
    main()
