"""Adaptive, evidence-driven Boolean program synthesis (CPU-only).

Begin with a small, inexpensive fixed grammar. Only when measurements falsify
EVERY known rule expand to a general bounded composition grammar. The catalog is
built solely from public variable names and legal DSL primitives; it never sees
the hidden rule, its generator, or evaluator-only holdout outcomes.

Signatures are bit vectors over ALL possible input states and are used solely
to identify semantically equivalent programs and plan informative interventions.
The observations are checked against each signature; no true output is queried
except by the environment when Scientist explicitly intervenes.
"""
from copy import deepcopy
from functools import lru_cache
from itertools import combinations, product
import time

from .core import states, validate, variable
from .synthesis import SynthesisBaseline


def _tree_size(node):
    kind=node["op"]
    if kind=="var":
        return 1
    if kind=="not":
        return 1+_tree_size(node["arg"])
    return 1+sum(_tree_size(arg) for arg in node["args"])


def _v(name, invert=False):
    item=variable(name)
    return {"op":"not","arg":item} if invert else item


@lru_cache(maxsize=6)
def _catalog(variable_names):
    """Return minimal-cost programs indexed by truth-table signature."""
    names=tuple(variable_names)
    if len(names) not in (3,4):
        raise ValueError("adaptive catalog presently supports 3 or 4 variables")
    inputs=states(names)
    all_bits=(1 << len(inputs))-1
    leaf_masks={}
    for key in names:
        mask=sum(1 << idx for idx,state in enumerate(inputs) if state[key])
        leaf_masks[key]=mask
    best={}

    def register(mask,tree):
        size=_tree_size(tree)
        if size>12:
            return
        previous=best.get(mask)
        rank=(size,repr(tree))
        if previous is None or rank<previous[0]:
            best[mask]=(rank,deepcopy(tree))

    clauses=[]
    for width in range(1,min(4,len(names))+1):
        for subset in combinations(names,width):
            for polarity in product((0,1),repeat=width):
                literals=[_v(name, bool(negative)) for name,negative in zip(subset,polarity)]
                masks=[all_bits ^ leaf_masks[name] if negative else leaf_masks[name]
                       for name,negative in zip(subset,polarity)]
                if width==1:
                    register(masks[0],literals[0])
                    continue
                for op in ("and","or","xor"):
                    if op=="and":
                        mask=all_bits
                        for child in masks:
                            mask &= child
                    elif op=="or":
                        mask=0
                        for child in masks:
                            mask |= child
                    else:
                        mask=0
                        for child in masks:
                            mask ^= child
                    tree={"op":op,"args":deepcopy(literals)}
                    register(mask,tree)
                    register(all_bits ^ mask,{"op":"not","arg":deepcopy(tree)})
                    if width==2:
                        clauses.append((mask,tree))
                if width>=3:
                    for threshold in range(2,width):
                        mask=0
                        for index in range(len(inputs)):
                            if sum((bit >> index)&1 for bit in masks)>=threshold:
                                mask |= 1<<index
                        tree={"op":"threshold","k":threshold,"args":deepcopy(literals)}
                        register(mask,tree)
                        register(all_bits ^ mask,{"op":"not","arg":deepcopy(tree)})
    # Combine two generic signed two-literal clauses. No family-specific rules
    # are enumerated here: multiplexer, inhibition and other compositions emerge.
    for i,(left_mask,left_expr) in enumerate(clauses):
        for right_mask,right_expr in clauses[i+1:]:
            for op in ("and","or","xor"):
                if op=="and":
                    signature=left_mask & right_mask
                elif op=="or":
                    signature=left_mask | right_mask
                else:
                    signature=left_mask ^ right_mask
                tree={"op":op,"args":[left_expr,right_expr]}
                register(signature,tree)
                register(all_bits ^ signature,{"op":"not","arg":tree})
    # Strict AST validation applies to every expression before it is exposed.
    ordered=[]
    for signature,(rank,tree) in best.items():
        verified=validate(tree,names)
        ordered.append((rank[0],signature,verified))
    ordered.sort(key=lambda item:(item[0],repr(item[2])))
    return tuple(ordered)


class AdaptiveSynthesis:
    """Progressively widen the hypothesis space only after falsification.

    One object is scoped to one world. The only 'learning' is incremental
    evidence elimination and proposal revision; no model-weight updates.
    """
    use_full_history=True

    def __init__(self,top_k=96):
        if type(top_k) is not int or not 8<=top_k<=512:
            raise ValueError("invalid planning budget")
        self.fast=SynthesisBaseline()
        self.top_k=top_k
        self.calls=0
        self.known_decisions=0
        self.expanded_decisions=0
        self.expansion_events=0
        self._expanded=False
        self._last_variable_set=None
        self._last_count=0
        self._last_candidate=None

    def _survivors(self,variables,observations):
        names=tuple(variables)
        familiar=self.fast.candidates(names,observations)
        if familiar:
            return [(self._cost(candidate),None,candidate) for candidate in familiar],False
        if not self._expanded:
            self._expanded=True
            self.expansion_events+=1
        catalog=_catalog(names)
        indexed={tuple(value["state"][k] for k in names):value["result"] for value in observations}
        state_order=states(names)
        bits=[(i,result) for i,state in enumerate(state_order)
              if (result:=indexed.get(tuple(state[k] for k in names))) is not None]
        compatible=[(size,mask,tree) for size,mask,tree in catalog
                    if all(((mask >> position)&1)==result for position,result in bits)]
        return compatible,True

    @staticmethod
    def _cost(rule):
        return _tree_size(rule)

    def candidates(self,variables,observations):
        possible,expanded=self._survivors(variables,observations)
        self._last_count=len(possible)
        return [deepcopy(tree) for _,_,tree in possible[:self.top_k]]

    def choose_intervention(self,variables,observations):
        possible,expanded=self._survivors(variables,observations)
        names=tuple(variables)
        all_states=states(names)
        already={tuple(obs["state"][k] for k in names) for obs in observations}
        options=[(i,state) for i,state in enumerate(all_states)
                 if tuple(state[k] for k in names) not in already]
        if not options:
            return None
        if not possible:
            return deepcopy(options[0][1])
        # On expanded grammars, plan from minimum-complexity survivors.
        # A complexity prior limits domination by thousands of elaborate rules.
        focus=possible[:self.top_k]
        costs=[2.0 ** (-max(0,size-1)/2.0) for size,_,_ in focus]
        total=sum(costs)
        scored=[]
        for index,state in options:
            yes=0.0
            for (cost,mask,rule),weight in zip(focus,costs):
                guess=((mask >> index)&1) if mask is not None else _raw_eval(rule,state)
                if guess:
                    yes+=weight
            # Higher entropy / more evenly split explanations first.
            scored.append((yes*(total-yes),tuple(state[k] for k in names),state))
        return deepcopy(min(scored,key=lambda x:(-x[0],x[1]))[2])

    def propose(self,*,variables,recent,feedback,previous,analogies=()):
        self.calls+=1
        possible,expanded=self._survivors(variables,recent)
        self._last_count=len(possible)
        if not possible:
            self._last_candidate=None
            return None
        if expanded:
            self.expanded_decisions+=1
        else:
            self.known_decisions+=1
        self._last_candidate=deepcopy(possible[0][2])
        return deepcopy(self._last_candidate)

    @property
    def candidate_count(self):
        return self._last_count


def _raw_eval(node,state):
    op=node["op"]
    if op=="var":
        return state[node["name"]]
    if op=="not":
        return 1-_raw_eval(node["arg"],state)
    args=[_raw_eval(child,state) for child in node["args"]]
    if op=="and":
        return int(all(args))
    if op=="or":
        return int(any(args))
    if op=="xor":
        return sum(args)%2
    return int(sum(args)>=node["k"])


def catalog_details(variables=("A","B","C")):
    started=time.perf_counter()
    catalog=_catalog(tuple(variables))
    return {"variables":list(variables),"distinctTruthTables":len(catalog),
            "cpuBuildMilliseconds":round((time.perf_counter()-started)*1000,2),
            "includesOnlyApprovedDSL":True}
