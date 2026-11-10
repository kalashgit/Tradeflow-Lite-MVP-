"""AION Genesis V1 reproducible scientific performance gate (not memory admission)."""
import json
import sys


def quality_gate(reports):
    if len(reports)!=2:
        return {"passed":False,"reasons":["both development and independent validation reports are required"]}
    problems=[]
    summaries=[]
    for label,data in zip(("development","independent_validation"),reports):
        old=data.get("fixed",{})
        updated=data.get("progressive",{})
        paired=data.get("pairedComparison",{})
        if data.get("realQwenInference") is not False or data.get("persistentKnowledgeEnabled") is not False:
            problems.append(f"{label}: model/memory provenance must be explicitly false")
        if old.get("worlds")!=72 or updated.get("worlds")!=72:
            problems.append(f"{label}: require 72 matched worlds")
        if updated.get("totalQwenCalls")!=0 or old.get("totalQwenCalls")!=0:
            problems.append(f"{label}: no Qwen inference in deterministic efficiency study")
        if updated.get("totalInterventions")!=old.get("totalInterventions"):
            problems.append(f"{label}: intervention budgets must be identical")
        if updated.get("meanFinalAccuracy",0)<0.94:
            problems.append(f"{label}: full accuracy regressed below 94%")
        if updated.get("meanUnseenAccuracy",0)<0.68:
            problems.append(f"{label}: independent unseen accuracy below 68%")
        if paired.get("unseenAccuracyDelta",0)<0.30:
            problems.append(f"{label}: improvement over legacy unseen accuracy below 30 percentage points")
        if paired.get("negativeTransferWorlds",999)!=0:
            problems.append(f"{label}: some paired worlds got worse than the fixed control")
        if updated.get("perfectBy5",0)<18:
            problems.append(f"{label}: fewer than 18 worlds predicted perfectly by 5 observations")
        old_cpu=old.get("meanCPUmsPerWorld",0)
        new_cpu=updated.get("meanCPUmsPerWorld",0)
        if old_cpu<=0 or new_cpu>3*old_cpu:
            problems.append(f"{label}: unbounded CPU time regression")
        summaries.append({
            "dataset":label,
            "fixedUnseenAccuracy":old.get("meanUnseenAccuracy"),
            "progressiveUnseenAccuracy":updated.get("meanUnseenAccuracy"),
            "fullAccuracy":updated.get("meanFinalAccuracy"),
            "perfectByFiveObservations":updated.get("perfectBy5"),
            "extraModelCalls":updated.get("totalQwenCalls"),
            "cpuMsPerWorld":new_cpu,
        })
    return {
        "kind":"adaptive-discovery-performance-only",
        "passed":not problems,
        "problems":problems,
        "summaries":summaries,
        "knowledgeAdmission":"BLOCKED",
        "note":"Passing demonstrates bounded-DSL synthetic mechanism-discovery performance, NOT autonomous general science or trained-model improvement."
    }


def main(argv=None):
    paths=sys.argv[1:] if argv is None else argv
    if len(paths)!=2:
        raise SystemExit("usage: python -m aion_genesis.gates DEVELOPMENT.json VALIDATION.json")
    try:
        with open(paths[0],encoding="utf-8") as f:
            dev=json.load(f)
        with open(paths[1],encoding="utf-8") as f:
            validate=json.load(f)
        gate=quality_gate([dev,validate])
    except (OSError,ValueError,KeyError,TypeError) as error:
        raise SystemExit("Invalid benchmark inputs: "+str(error))
    print(json.dumps(gate,indent=2))
    if not gate["passed"]:
        raise SystemExit(3)


if __name__=="__main__":
    main()
