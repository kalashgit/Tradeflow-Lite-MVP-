"""Auditable, CPU-only bounded program synthesis for AION's known Boolean grammar.

This is an important non-LLM baseline, not an assertion of open-world invention.
It uses only observed interventions to choose among executable candidate mechanisms.
"""
from copy import deepcopy
from itertools import combinations

from .core import predict, states, variable, validate, violations


def _size(node):
    if node["op"] == "var":
        return 1
    if node["op"] == "not":
        return 1 + _size(node["arg"])
    return 1 + sum(_size(item) for item in node["args"])


def grammar(variables):
    """Deliberately finite public grammar; never consumes hidden rule internals."""
    names = tuple(variables)
    items = []
    for a, b in combinations(names, 2):
        for op in ("and", "or", "xor"):
            items.append({"op": op, "args": [variable(a), variable(b)]})
        for c in names:
            if c in (a, b):
                continue
            va, vb, vc = variable(a), variable(b), variable(c)
            items.extend([
                {"op": "and", "args": [va, vb, {"op": "not", "arg": vc}]},
                {"op": "or", "args": [{"op": "and", "args": [va, vb]}, {"op": "not", "arg": vc}]},
                {"op": "threshold", "k": 2, "args": [va, vb, vc]},
                {"op": "xor", "args": [va, vb, vc]},
            ])
    # Canonicalize by FULL truth-table behavior across all possible inputs. This
    # is semantic deduplication, not access to any hidden world outcome.
    chosen = {}
    all_states = states(names)
    for tree in items:
        candidate = validate(tree, names)
        signature = tuple(predict(candidate, state, names) for state in all_states)
        rank = (_size(candidate), repr(candidate))
        if signature not in chosen or rank < chosen[signature][0]:
            chosen[signature] = (rank, candidate)
    return [deepcopy(item[1]) for item in sorted(chosen.values(), key=lambda x: x[0])]


class SynthesisBaseline:
    """Predictively conservative, independently measured program-search reference."""
    def __init__(self):
        self.calls = 0
        self.generated = 0
        self._cache = {}

    def candidates(self, variables, evidence):
        key = tuple(variables)
        if key not in self._cache:
            self._cache[key] = grammar(variables)
        return [candidate for candidate in self._cache[key] if not violations(candidate, evidence, variables)]

    def propose(self, *, variables, recent, feedback, previous, analogies=()):
        self.calls += 1
        possible = self.candidates(variables, recent)
        self.generated += len(possible)
        return deepcopy(possible[0]) if possible else None


def evaluate_synthesis(seed=71, count=120, budget=8):
    from .core import worlds
    from .scientist import Scientist
    batch=worlds(seed=seed,count=count)
    report={}
    for split in ("development","heldout"):
        data = [Scientist(SynthesisBaseline()).investigate(world,max_experiments=budget)
                for world in batch if world.split == split]
        report[split]={
            "worlds":len(data),
            "meanAccuracy":round(sum(r.final_accuracy for r in data)/len(data),4),
            "meanConsistency":round(sum(r.consistent_proposals for r in data)/sum(r.experiments for r in data),4),
            "calls":sum(r.model_calls for r in data),
            "realLLMInference":False
        }
    return {"kind":"bounded-program-synthesis-control","seed":seed,"budget":budget,
            "persistentMemory":False,"report":report,
            "warning":"Known grammar includes the simulator's held-out operator families. This tests symbolic efficiency, not discovery of an unknown operator."}
