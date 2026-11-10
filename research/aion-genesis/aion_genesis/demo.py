"""120 synthetic worlds; deterministic research controls, no live model, no memory writes."""
from .core import worlds, ReferenceProposer
from .scientist import Scientist
import json

def main():
    batch = worlds(seed=71, count=120)
    results = {}
    for name, is_composed in (("pairwise-fixed-grammar", False), ("composed-fixed-grammar", True)):
        researcher = Scientist(ReferenceProposer(composed=is_composed), working_limit=8)
        trials = [researcher.investigate(world, max_experiments=8) for world in batch]
        results[name] = {}
        for split in ("development", "heldout"):
            selected = [trial for trial in trials if trial.split == split]
            results[name][split] = {
                "worlds": len(selected),
                "meanAccuracy": round(sum(t.final_accuracy for t in selected) / len(selected), 4),
                "meanConsistentProposals": round(sum(t.consistent_proposals for t in selected) / len(selected), 4),
                "modelCalls": sum(t.model_calls for t in selected)
            }
    print(json.dumps({
        "project": "AION Genesis V1",
        "simulation": True, "realQwenInference": False,
        "persistentKnowledge": False,
        "worlds": len(batch), "baselines": results
    }, indent=2))

if __name__ == "__main__":
    main()
