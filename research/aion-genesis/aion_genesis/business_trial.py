"""Seven-day TradeFlow-owner simulation comparing reactive, proactive, and adaptive advice.

Paired runs use exact same fictional businesses and seeds. A scoring oracle is
accessible ONLY to the simulator after an approved hypothetical intervention.
Never infer actual revenue, profit, safety outcomes, or market ROI from these
synthetic utility points.
"""
import argparse
import json
from statistics import mean

from .contractor_twin import fixture_businesses
from .owner_advisor import simulate_owner_session

POLICIES=("reactive","proactive_static","adaptive")


def evaluate(seeds=tuple(range(11,19)), include_traces=False):
    if not seeds or len(set(seeds))!=len(seeds) or any(type(s) is not int or s<0 for s in seeds):
        raise ValueError("independent positive integer seeds required")
    companies=fixture_businesses()
    episodes={policy:[] for policy in POLICIES}
    for seed in seeds:
        for company in companies:
            for policy in POLICIES:
                episodes[policy].append(simulate_owner_session(company,seed,policy))
    def aggregate(items):
        n=len(items)
        domains={d for item in items for d in item["coveredDomains"]}
        return {
            "episodes":n,"daysSimulated":7*n,
            "meanUtilityPoints":round(mean(x["score"]["netSimulatedUtilityPoints"] for x in items),3),
            "meanGrossBenefitPoints":round(mean(x["score"]["grossSimulatedBenefitPoints"] for x in items),3),
            "meanAttentionEvents":round(mean(x["proposals"] for x in items),3),
            "meanAttentionCostPoints":round(mean(x["score"]["ownerAttentionCostPoints"] for x in items),3),
            "meanSimulatedApprovedActions":round(mean(x["score"]["simulatedApprovedActions"] for x in items),3),
            "unsafeActions":sum(x["score"]["unauthorizedActions"] for x in items),
            "domainsCovered":sorted(domains),
            "realQwenInference":False,
            "liveVoice":False,
            "persistentMemory":False
        }
    score={p:aggregate(episodes[p]) for p in POLICIES}
    def paired(left,right):
        offsets=[b["score"]["netSimulatedUtilityPoints"]-a["score"]["netSimulatedUtilityPoints"]
                 for a,b in zip(episodes[left],episodes[right])]
        return {"meanUtilityDelta":round(mean(offsets),3),
                "improvedEpisodes":sum(x>0 for x in offsets),
                "worseEpisodes":sum(x<0 for x in offsets),
                "unchangedEpisodes":sum(x==0 for x in offsets)}
    report={
        "study":"AION Genesis × TradeFlow synthetic owner operating twin",
        "seedSet":list(seeds),
        "companySizes":sorted(c["employees"] for c in companies),
        "synthetic":True,"simulationDaysPerEpisode":7,
        "policyConditions":score,
        "comparisons":{
            "proactiveVsReactive":paired("reactive","proactive_static"),
            "adaptiveVsStaticProactive":paired("proactive_static","adaptive"),
        },
        "researchBoundaries":{
            "realCompanyRecords":False,"actualVoiceInput":False,
            "realModelInference":False,"externalActions":False,
            "autonomousFinancialChanges":False,
            "longTermMemoryWrites":False,
            "ownerSpeechTreatedAsVerifiedEvidence":False,
            "metricMeaning":"Toy utility points under declared fictional simulator effects, not real financial performance",
            "modelLearningClaim":"No neural model was trained; adaptive policy uses a reversible session-only feedback preference",
        },
        "limitations":[
            "Synthetic outcomes and owner approvals were assumed for controlled comparisons, not observed in actual businesses",
            "Owner conversation is a labeled transcript, not ASR or live interactive speech understanding",
            "Priorities and action templates are preprogrammed and do not establish autonomous broad business intelligence",
            "The simulator's cost/benefit assumptions may favor certain policies and must be stress-tested independently",
            "No real TradeFlow tenant connection, authenticated record access, or workflow execution is enabled"
        ]
    }
    if include_traces:
        report["episodes"]={p:episodes[p] for p in POLICIES}
    else:
        report["sampleTranscript"]=episodes["adaptive"][0]["turns"]
    return report


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument("--seeds",type=int,nargs="+",default=list(range(11,19)))
    parser.add_argument("--output",default="")
    parser.add_argument("--full-trace",action="store_true")
    args=parser.parse_args(argv)
    result=evaluate(tuple(args.seeds),args.full_trace)
    if args.output:
        with open(args.output,"w",encoding="utf-8") as f:
            json.dump(result,f,indent=2)
    print(json.dumps({
        "study":result["study"],"seedSet":result["seedSet"],
        "companySizes":result["companySizes"],"policyConditions":result["policyConditions"],
        "comparisons":result["comparisons"],
        "researchBoundaries":result["researchBoundaries"]
    },indent=2))


if __name__=="__main__":
    main()
