"""Optional LOCAL Qwen trial: synthetic owner turns only, no approved actions applied."""
import argparse
import json
import os

from .contractor_twin import ContractorTwin, fixture_businesses
from .owner_model import LocalOwnerReasoner


def run_probe(model="qwen3:0.6b", endpoint="http://127.0.0.1:11434"):
    advisor=LocalOwnerReasoner(model=model,endpoint=endpoint)
    turns=[]
    for business in fixture_businesses():
        twin=ContractorTwin(business,seed=39)
        for day in range(5):
            if day not in (0,2,4):
                twin.advance()
                continue
            snapshot=twin.snapshot()
            response=advisor.advise(snapshot,max_actions=2)
            turns.append({
                "business":business["id"],"day":day,
                "syntheticOwnerWords":snapshot["ownerMessage"]["text"],
                "decisionStatus":response["status"],
                "recommendations":response.get("cards",[]),
                "clarificationQuestions":response.get("questions",[]),
                "allEvidenceGrounded":all(c["because"] and not c["executionAuthority"]
                                          for c in response.get("cards",[])),
                "executionAuthority":False,
            })
            # DO NOT apply actions in the live inference gate.
            if day<4:
                twin.advance()
    return {
        "study":"AION × TradeFlow synthetic owner conversation — local LLM grounded selection",
        "realModelInference":advisor.calls>0,
        "model":model,"syntheticOnly":True,"voiceAudioRecorded":False,
        "actualTradeflowAppInvoked":False,"actualBusinessRecordsUsed":False,
        "executions":0,"persistentMemory":False,"longTermKnowledgeAdmission":"BLOCKED",
        "turnCount":len(turns),"modelCalls":advisor.calls,
        "validatedModelSelections":sum(t["decisionStatus"]=="model_selection_verified" for t in turns),
        "deterministicFallbacks":sum(t["decisionStatus"]=="validated_fallback" for t in turns),
        "promptTokens":advisor.prompt_tokens,"completionTokens":advisor.completion_tokens,
        "unsafeCards":sum(not t["allEvidenceGrounded"] for t in turns),
        "turns":turns,
        "limitation":"Measures grounded action-ID selection from pre-written synthetic signals, not generative business strategy, live speech, or actual system optimization"
    }


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument("--model",default=os.environ.get("AION_MODEL_ID","qwen3:0.6b"))
    parser.add_argument("--output",default="")
    args=parser.parse_args(argv)
    outcome=run_probe(model=args.model,endpoint=os.environ.get("AION_MODEL_URL","http://127.0.0.1:11434"))
    if args.output:
        with open(args.output,"w",encoding="utf-8") as f:
            json.dump(outcome,f,indent=2)
    print(json.dumps({k:v for k,v in outcome.items() if k!="turns"},indent=2))


if __name__=="__main__":
    main()
