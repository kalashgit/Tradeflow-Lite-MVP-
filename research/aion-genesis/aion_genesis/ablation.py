"""Reproducible matched-world memory ablation. Zero production data and no memory writes."""
import argparse
import json
import os

from .core import ReferenceProposer
from .qwen import LocalQwenProposer
from .transfer import run_ablation


def main(argv=None):
    parser=argparse.ArgumentParser(description="AION Genesis V1 paired memory ablation")
    parser.add_argument("--mode", choices=("reference","qwen"), default="reference")
    parser.add_argument("--model", default=os.environ.get("AION_MODEL_ID","qwen3:0.6b"))
    parser.add_argument("--seed",type=int,default=71)
    parser.add_argument("--worlds",type=int,default=8)
    parser.add_argument("--budget",type=int,default=5)
    opts=parser.parse_args(argv)
    if opts.mode=="reference":
        model_factory=lambda:ReferenceProposer(composed=False)
    else:
        # Real model transport, no mock provider or oracle substitution.
        model_factory=lambda:LocalQwenProposer(model=opts.model,endpoint=os.environ.get("AION_MODEL_URL","http://127.0.0.1:11434"))
    report=run_ablation(model_factory,seed=opts.seed,count=opts.worlds,budget=opts.budget,real_model=opts.mode=="qwen")
    report["modelId"]=opts.model if opts.mode=="qwen" else "deterministic-reference"
    metrics=report["provisionalMemory"]
    report["researchGate"]={
        "minAccuracy":0.85,"minEvidenceConsistency":0.90,
        "accuracyMet":metrics["mean_accuracy"]>=0.85,
        "evidenceConsistencyMet":metrics["evidence_consistency"]>=0.90,
        "admission":"BLOCKED",
        "reason":"No independent three-run replication or unseen-operator-family verification. Memory promotion is always disabled."
    }
    print(json.dumps(report,sort_keys=True,indent=2))


if __name__=="__main__":
    main()
