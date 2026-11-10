"""Export AION's actual selected owner tasks into a synthetic TradeFlow tool contract.

Output is trusted ONLY as an isolated research fixture. Real app integration
must use its own authenticated permission-filtered server snapshot, never a
model/client-provided claims list.
"""
import argparse
import json
from .contractor_twin import ContractorTwin, fixture_businesses
from .owner_advisor import OwnerAdvisor

def build(seed=41):
    cases=[]
    for company in fixture_businesses():
        twin=ContractorTwin(company,seed)
        advisor=OwnerAdvisor(mode="adaptive")
        for day in range(7):
            snapshot=twin.snapshot()
            chosen=advisor.choose(snapshot,max_per_day=2)
            cases.append({"businessId":company["id"],"day":day,"snapshot":snapshot,
                          "aionRecommendations":[x["actionId"] for x in chosen]})
            if day<6:
                twin.advance()
    return {
        "kind":"AION-GENESIS-SYNTHETIC-TRADEFLOW-CAPABILITIES-V1",
        "synthetic":True,"realTenant":False,"actualOwnerAuthorization":False,
        "trustedSource":"Python synthetic ContractorTwin, not model-supplied JSON",
        "cases":cases,"realQwenInference":False,"externalActions":False,
        "longTermMemoryWrites":False
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",required=True)
    args=parser.parse_args()
    doc=build()
    with open(args.output,"w",encoding="utf-8") as file:
        json.dump(doc,file,indent=2)
    print(json.dumps({"cases":len(doc["cases"]),"synthetic":True,
                      "ownerChosenActions":sum(len(x["aionRecommendations"]) for x in doc["cases"])},
                     indent=2))

if __name__=="__main__":
    main()
