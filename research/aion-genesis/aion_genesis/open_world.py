"""Unknown-mechanism research: explicit symbolic-to-Qwen escalation boundary."""
from copy import deepcopy
import random

from .core import HiddenWorld, variable, violations, validate, MechanismError, states
from .synthesis import SynthesisBaseline
from .adaptive_synthesis import AdaptiveSynthesis
from .core import choose_intervention as legacy_choose_intervention


def v(name):
    return variable(name)


def novel_mechanism(kind, variables, rng):
    a,b,c = rng.sample(list(variables), 3)
    if kind=="nand":
        return {"op":"not","arg":{"op":"and","args":[v(a),v(b)]}}
    if kind=="xnor":
        return {"op":"not","arg":{"op":"xor","args":[v(a),v(b)]}}
    if kind=="multiplexer":
        return {"op":"or","args":[{"op":"and","args":[v(a),v(b)]},
                                  {"op":"and","args":[{"op":"not","arg":v(a)},v(c)]}]}
    if kind=="all_three":
        return {"op":"and","args":[v(a),v(b),v(c)]}
    if kind=="three_of_four":
        d=next(var for var in variables if var not in (a,b,c))
        return {"op":"threshold","k":3,"args":[v(a),v(b),v(c),v(d)]}
    if kind=="parity_four":
        d=next(var for var in variables if var not in (a,b,c))
        return {"op":"xor","args":[v(a),v(b),v(c),v(d)]}
    raise ValueError("unknown novel mechanism family")


def novel_worlds(seed=938, count=24):
    if count < 6:
        raise ValueError("need at least six test worlds")
    rng=random.Random(seed)
    families=("nand","xnor","multiplexer","all_three","three_of_four","parity_four")
    items=[]
    for index in range(count):
        family=families[index%len(families)]
        variables=("A","B","C","D") if family in ("three_of_four","parity_four") else ("A","B","C")
        items.append(HiddenWorld("novel-%04d" % index,variables,
                                 novel_mechanism(family,variables,rng),"unseen_operator_composition"))
    return items


class HybridProposer:
    """Use cheap symbolic inference whenever it fits evidence; escalate otherwise.

    Neither branch sees the world's hidden rule. A proposed new AST must pass the
    independent DSL validator and fit existing observations before provisional
    in-memory reuse. Memory is wiped with each new HybridProposer instance.
    """
    use_full_history=True

    def __init__(self, inventor=None, max_invention_attempts=1, symbolic_strategy="adaptive"):
        if symbolic_strategy not in ("adaptive","fixed"):
            raise ValueError("unsupported symbolic strategy")
        self.symbolic_strategy=symbolic_strategy
        if type(max_invention_attempts) is not int or not 1 <= max_invention_attempts <= 3:
            raise ValueError("repair budget must be 1-3 model calls")
        self.max_invention_attempts=max_invention_attempts
        self.symbolic=AdaptiveSynthesis() if symbolic_strategy=='adaptive' else SynthesisBaseline()
        self.inventor=inventor
        self._provisional={}
        self.calls=0
        self.prompt_tokens=0
        self.completion_tokens=0
        self.escalations=0
        self.known_decisions=0
        self.expanded_symbolic_decisions=0
        self.symbolic_expansions=0
        self.rejected_inventions=0
        self.rejection_counts={}
        self.admitted_inventions=0

    def candidates(self, variables, observations):
        symbolic=self.symbolic.candidates(variables,observations)
        if symbolic:
            return symbolic
        return [deepcopy(p) for p in self._provisional.get(tuple(variables),())
                if not violations(p,observations,variables)]

    def choose_intervention(self,variables,observations):
        if hasattr(self.symbolic,"choose_intervention"):
            return self.symbolic.choose_intervention(variables,observations)
        return legacy_choose_intervention(variables,observations,
                                           self.candidates(variables,observations))

    def propose(self, *, variables, recent, feedback, previous, analogies=()):
        symbolic=self.symbolic.propose(variables=variables,recent=recent,
                                        feedback=feedback,previous=previous,analogies=analogies)
        if symbolic is not None:
            self.known_decisions+=1
            self.expanded_symbolic_decisions=getattr(self.symbolic,"expanded_decisions",0)
            self.symbolic_expansions=getattr(self.symbolic,"expansion_events",0)
            return deepcopy(symbolic)
        self.symbolic_expansions=getattr(self.symbolic,"expansion_events",0)
        remembered=self.candidates(variables,recent)
        if remembered:
            return deepcopy(remembered[0])
        self.escalations+=1
        if self.inventor is None:
            return None
        retry_feedback=list(feedback)
        retry_previous=previous
        candidate=None
        for _attempt in range(self.max_invention_attempts):
            before=getattr(self.inventor,"calls",0)
            response=self.inventor.propose(variables=variables,recent=recent,
                                          feedback=retry_feedback[-3:],
                                          previous=retry_previous,analogies=analogies)
            self.calls+=getattr(self.inventor,"calls",0)-before
            self.prompt_tokens=getattr(self.inventor,"prompt_tokens",0)
            self.completion_tokens=getattr(self.inventor,"completion_tokens",0)
            try:
                candidate=validate(response,variables)
            except (MechanismError,ValueError,TypeError,KeyError,RecursionError):
                failure=getattr(self.inventor,"last_failure_kind",None) or "invalid_ast"
                self.rejected_inventions+=1
                self.rejection_counts[failure]=self.rejection_counts.get(failure,0)+1
                candidate=None
                retry_previous=None
                retry_feedback=list(recent[-3:])
                continue
            contradictory=violations(candidate,recent,variables)
            if contradictory:
                self.rejected_inventions+=1
                self.rejection_counts["contradicts_evidence"]=self.rejection_counts.get("contradicts_evidence",0)+1
                retry_previous=deepcopy(candidate)
                retry_feedback=list(contradictory[-3:])
                candidate=None
                continue
            break
        if candidate is None:
            return None
        store=self._provisional.setdefault(tuple(variables),[])
        if candidate not in store and len(store)<12:
            store.append(deepcopy(candidate))
            self.admitted_inventions+=1
        return deepcopy(candidate)


def test_unknown_grammar(seed=938,count=24):
    """Deterministic *gate test*: no LLM inference, no hidden-rule prompt leakage."""
    examples=novel_worlds(seed=seed,count=count)
    failures=[]
    for world in examples:
        evidence=[world.intervene(state) for state in states(world.variables)]
        if SynthesisBaseline().candidates(world.variables,evidence):
            failures.append(world.world_id)
    return {"kind":"out-of-known-grammar-gate","totalWorlds":len(examples),
            "outsideKnownGrammar":len(examples)-len(failures),
            "incorrectlyExplained":failures,
            "passed":not failures,
            "realQwenInference":False,
            "persistentKnowledgeEnabled":False,
            "note":"Unknown to the fixed search grammar, but all mechanisms are still expressible in the wider permitted AST language."}


if __name__=="__main__":
    import json
    print(json.dumps(test_unknown_grammar(),indent=2))
