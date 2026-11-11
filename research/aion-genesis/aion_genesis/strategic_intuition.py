"""AION Adaptive Strategic Intuition Layer (ASIL) — research only.

A remembered strategy may be used quickly only after independent training
support, development-calibrated trust, and fresh diagnostic observations.
Contradiction, unsupported context or uncalibrated trust routes to bounded
symbolic reasoning. All 'knowledge' is temporary simulation-only state.

Evaluation-only hidden truth is never read by routing, strategy retrieval,
calibration probe selection or the deep reasoning controller.
"""
from copy import deepcopy
from dataclasses import dataclass
from math import sqrt
from collections import defaultdict, deque
import hashlib
import json
import random
import time

from .adaptive_synthesis import AdaptiveSynthesis, _catalog
from .core import HiddenWorld, predict, states, validate, variable
from .synthesis import grammar

VARS = ("A", "B", "C")
CONTEXTS = tuple("context-%02d" % n for n in range(8))


def _seed(seed, index):
    return int.from_bytes(hashlib.sha256(("%d:%d" % (seed, index)).encode()).digest()[:8], "big")


def _tree_key(tree):
    return json.dumps(tree, sort_keys=True, separators=(",", ":"))


def _literal(name, active):
    node=variable(name)
    return node if active else {"op":"not","arg":node}


def flip_one_input(tree, state, variables=VARS):
    """Generate a deception differing in exactly one input (simulation only)."""
    target={"op":"and","args":[_literal(name,state[name]) for name in variables]}
    return validate({"op":"xor","args":[deepcopy(tree),target]}, variables)


@dataclass(frozen=True)
class Strategy:
    context: str
    variables: tuple
    mechanism: dict
    distinct_training_worlds: int
    evidence_digest: str


class StrategyBank:
    """Frozen evidence-certified research catalog, never a live knowledge store."""
    def __init__(self):
        self._entries={}
        self.frozen=False

    def admit(self, context, variables, candidate, world_evidence):
        if self.frozen:
            raise ValueError("the training casebook is frozen")
        if not context.startswith("context-") or not isinstance(world_evidence, dict):
            raise ValueError("unsupported casebook source")
        variables=tuple(variables)
        if len(world_evidence)<3:
            raise ValueError("three independent training worlds required")
        mechanism=validate(candidate, variables)
        messages=[]
        for world,observations in sorted(world_evidence.items()):
            if not world.startswith("train-") or not isinstance(observations,list):
                raise ValueError("training evidence must be source labeled")
            seen=set()
            for entry in observations:
                if set(entry)!={"state","result"}:
                    raise ValueError("malformed source evidence")
                key=tuple(entry["state"][k] for k in variables)
                if key in seen or predict(mechanism,entry["state"],variables)!=entry["result"]:
                    raise ValueError("inconsistent or duplicated training outcome")
                seen.add(key)
            if seen!={tuple(s[k] for k in variables) for s in states(variables)}:
                raise ValueError("full independent training intervention coverage required")
            messages.append({"world":world,"observations":observations})
        digest=hashlib.sha256(json.dumps(messages,sort_keys=True).encode()).hexdigest()
        self._entries[context]=Strategy(context,variables,deepcopy(mechanism),
                                        len(world_evidence),digest)

    def freeze(self):
        self.frozen=True

    def recall(self, context, variables):
        record=self._entries.get(context)
        if record is None or record.variables!=tuple(variables) or not self.frozen:
            return None
        return Strategy(record.context,record.variables,deepcopy(record.mechanism),
                        record.distinct_training_worlds,record.evidence_digest)

    def alternatives(self, context, variables):
        return [deepcopy(e.mechanism) for key,e in sorted(self._entries.items())
                if key!=context and e.variables==tuple(variables)]

    def summary(self):
        return {"cases":len(self._entries),"frozen":self.frozen,
                "persistent":False,"sources":"independent labeled synthetic training interventions"}


def build_bank(seed=19):
    """ONLY independent train worlds yield training outcomes. No test-world access."""
    bank=StrategyBank()
    choices=grammar(VARS)
    rng=random.Random(seed)
    chosen=rng.sample(choices,len(CONTEXTS))
    for index,(context,original) in enumerate(zip(CONTEXTS,chosen)):
        episodes={}
        for replicate in range(3):
            world=HiddenWorld("train-%s-%d" % (context,replicate),VARS,original,"train")
            episodes[world.world_id]=[world.intervene(state) for state in states(VARS)]
        # Recover a mechanism from the training evidence, not from the source rule.
        observations=episodes[next(iter(episodes))]
        possible=[candidate for candidate in choices
                  if all(predict(candidate,o["state"],VARS)==o["result"] for o in observations)]
        if len(possible)!=1:
            raise ValueError("non-identifiable training hypothesis")
        bank.admit(context,VARS,possible[0],episodes)
    bank.freeze()
    return bank


def synthetic_episode(bank,seed,index,shift_probability=0.18,novel_probability=0.08,change_points=1,change_style="sparse"):
    """Surface context may deliberately conceal a changed underlying mechanism."""
    rng=random.Random(_seed(seed,index))
    if not 0<=shift_probability<=1 or not 0<=novel_probability<=1-shift_probability:
        raise ValueError("invalid episode proportions")
    trial=rng.random()
    if trial<novel_probability:
        context="unseen-context-%04d" % index
        rule=deepcopy(rng.choice(grammar(VARS)))
        kind="novel_context"
    else:
        context=rng.choice(CONTEXTS)
        source=bank.recall(context,VARS)
        rule=deepcopy(source.mechanism)
        kind="stable"
        if trial<novel_probability+shift_probability:
            if change_style=="sparse":
                if type(change_points) is not int or not 1<=change_points<=3:
                    raise ValueError("invalid semantic change budget")
                for altered_state in rng.sample(states(VARS),change_points):
                    rule=flip_one_input(rule,altered_state)
            elif change_style=="replacement":
                prior=rule
                choices=[candidate for candidate in grammar(VARS)
                         if sum(predict(candidate,state,VARS)!=predict(prior,state,VARS)
                                for state in states(VARS))>=3]
                rule=deepcopy(rng.choice(choices))
            else:
                raise ValueError("invalid environment change style")
            kind="deceptive_shift"
    world=HiddenWorld("challenge-%d-%d" % (seed,index),VARS,rule,"eval")
    return world,context,kind


def choose_canaries(memory, alternatives, seen, count=2):
    """Choose diagnostic interventions by conflicting predictions, no oracle."""
    variables=memory.variables
    pool=[s for s in states(variables)
          if tuple(s[k] for k in variables) not in {
             tuple(obs["state"][k] for k in variables) for obs in seen}]
    ranked=[]
    for state in pool:
        prediction=predict(memory.mechanism,state,variables)
        different=sum(predict(rule,state,variables)!=prediction for rule in alternatives)
        diversity=sum(state[k] for k in variables)
        ranked.append((-different,abs(diversity-len(variables)/2),
                       tuple(state[k] for k in variables),state))
    return deepcopy(min(ranked)[3]) if ranked else None


def probe_memory(world,bank,context,challenge_count=2):
    memory=bank.recall(context,world.variables)
    observations=[]
    if memory is None:
        return memory,observations,False
    alternative=bank.alternatives(context,world.variables)
    for _ in range(challenge_count):
        intervention=choose_canaries(memory,alternative,observations)
        if intervention is None:
            break
        observed=world.intervene(intervention)
        observations.append(observed)
        if predict(memory.mechanism,intervention,memory.variables)!=observed["result"]:
            return memory,observations,False
    return memory,observations,len(observations)==challenge_count


def wilson_lower(successes,total,z=1.645):
    """One-sided 95% binomial lower confidence bound, NOT proof of correctness."""
    if total<=0:
        return 0.0
    rate=successes/total
    denom=1+z*z/total
    center=rate+z*z/(2*total)
    correction=z*sqrt(rate*(1-rate)/total+z*z/(4*total*total))
    return max(0,(center-correction)/denom)


class Calibration:
    def __init__(self, min_samples=80, lower_bound=0.80):
        self.min_samples=min_samples
        self.lower_bound=lower_bound
        self._n=0
        self._recalled=0
        self._correct=0
        self.frozen=False

    def observe(self,canary_passed,exact):
        if self.frozen:
            raise ValueError("cannot calibrate using evaluation outcomes")
        self._recalled+=1
        if canary_passed:
            self._n+=1
            self._correct+=bool(exact)

    def freeze(self):
        self.frozen=True

    @property
    def mismatch_rate(self):
        return 1-self._n/self._recalled if self._recalled else 1.0

    @property
    def confidence(self):
        return (self._correct+1)/(self._n+2)

    @property
    def trusted(self):
        return self.frozen and self._n>=self.min_samples and wilson_lower(
            self._correct,self._n)>=self.lower_bound

    def summary(self):
        return {"calibrationPasses":self._n,"totalRecalled":self._recalled,
                "mismatchRate":round(self.mismatch_rate,5),
                "correctAmongPasses":self._correct,
                "smoothedConfidence":round(self.confidence,5),
                "wilsonLower":round(wilson_lower(self._correct,self._n),5),
                "confidenceGateOpen":self.trusted,"frozen":self.frozen,
                "source":"separate calibration-world outcomes; never evaluator-world outcomes"}


def calibrate(bank,seed=811,count=800,shift_probability=0.18):
    calibration=Calibration()
    for i in range(count):
        world,context,_=synthetic_episode(bank,seed,i,shift_probability)
        memory,observations,passed=probe_memory(world,bank,context)
        if memory is not None:
            calibration.observe(passed,world.accuracy(memory.mechanism)==1.0)
    calibration.freeze()
    return calibration



class DriftSentinel:
    """Prequential metacognitive controller built ONLY from observed canary outcomes.

    Calibration supplies a baseline mismatch rate learned on a separate stream.
    Each next-world routing decision uses only prior canary outcomes. The current
    world's diagnostic measurements may falsify its memory, but no evaluator
    full-truth-table score is permitted into this controller.
    """
    def __init__(self, baseline_mismatch_rate, window=48, min_samples=32,
                 alert_margin=0.08, clear_margin=0.025):
        if not 0<=baseline_mismatch_rate<1:
            raise ValueError("invalid calibrated mismatch rate")
        if type(window) is not int or not 16<=window<=256:
            raise ValueError("invalid evidence window")
        if type(min_samples) is not int or not 8<=min_samples<=window:
            raise ValueError("invalid minimum monitoring coverage")
        self.baseline=baseline_mismatch_rate
        self.window=window
        self.min_samples=min_samples
        self.alert_margin=alert_margin
        self.clear_margin=clear_margin
        self._recent=deque(maxlen=window)
        self.alarm=False
        self.alerts=0
        self.recoveries=0

    @property
    def observed_mismatch(self):
        return sum(self._recent)/len(self._recent) if self._recent else 0.0

    def record(self, passed):
        if type(passed) is not bool:
            raise ValueError("sentinel accepts only observed diagnostic outcomes")
        self._recent.append(not passed)
        if len(self._recent)<self.min_samples:
            return
        rate=self.observed_mismatch
        if not self.alarm and rate>self.baseline+self.alert_margin:
            self.alarm=True
            self.alerts+=1
        elif self.alarm and len(self._recent)==self.window and rate<self.baseline+self.clear_margin:
            self.alarm=False
            self.recoveries+=1

    def summary(self):
        return {"alarm":self.alarm,"alerts":self.alerts,
                "recoveries":self.recoveries,
                "priorDiagnosticSamples":len(self._recent),
                "observedMismatchRate":round(self.observed_mismatch,5),
                "calibratedMismatchRate":round(self.baseline,5),
                "noEvaluatorLabelsUsed":True,
                "persistent":False}


def deep_investigate(world,previous,max_interventions):
    """A truly separate, bounded symbolic reasoning path. No hidden-world access."""
    solver=AdaptiveSynthesis()
    observed=deepcopy(previous)
    candidate=None
    deep_steps=0
    checks=0
    # Rebuild a candidate from ALL available evidence, including contrary probes.
    while len(observed)<max_interventions:
        candidate=solver.propose(variables=world.variables,recent=observed,
                                 feedback=[],previous=candidate)
        checks+=len(solver.candidates(world.variables,observed))
        next_state=solver.choose_intervention(world.variables,observed)
        if next_state is None:
            break
        measured=world.intervene(next_state)
        observed.append(measured)
        deep_steps+=1
    candidate=solver.propose(variables=world.variables,recent=observed,
                             feedback=[],previous=candidate)
    checks+=len(solver.candidates(world.variables,observed))
    return candidate,observed,deep_steps,checks



def residual_repair(world,memory,observations,max_interventions=5,max_exceptions=2,alternatives=()):
    """Compose a prior mechanism with observed, state-specific residuals.

    This is a candidate only, never proof that other states are correct.
    The exception hypothesis is explicit and bounded; if it becomes too
    complicated, abandon patching and use the ordinary deep solver.
    """
    observed=deepcopy(observations)
    names=memory.variables
    def correction():
        wrong=[o["state"] for o in observed
               if predict(memory.mechanism,o["state"],names)!=o["result"]]
        if len(wrong)>max_exceptions:
            return None,len(wrong)
        if not wrong:
            return deepcopy(memory.mechanism),0
        clauses=[]
        for state in wrong:
            literals=[_literal(k,state[k]) for k in names]
            clauses.append({"op":"and","args":literals})
        change=clauses[0] if len(clauses)==1 else {"op":"or","args":clauses}
        return validate({"op":"xor","args":[deepcopy(memory.mechanism),change]},names),len(wrong)
    candidate,patches=correction()
    checks=1
    while len(observed)<max_interventions and candidate is not None:
        state=choose_canaries(memory,alternatives,observed)
        if state is None:
            break
        observed.append(world.intervene(state))
        candidate,patches=correction()
        checks+=1
    if candidate is None:
        deep,observed,extra_steps,extra_checks=deep_investigate(world,observed,max_interventions)
        return deep,observed,patches,checks+extra_checks,True
    return candidate,observed,patches,checks,False


def route(world,context,bank,calibration,mode="gated",budget=5,sentinel=None):
    if mode not in ("deep_only","memory_only","gated","gated_drift_aware","gated_residual"):
        raise ValueError("invalid mode")
    if type(budget) is not int or budget<3 or budget>7:
        raise ValueError("invalid world budget")
    t0=time.perf_counter()
    memory=bank.recall(context,world.variables)
    observations=[]
    fast_used=False
    repair_used=False
    repair_patches=0
    deep_steps=0
    checks=0
    contradicted=False
    alarm_before=bool(sentinel.alarm) if sentinel is not None else False
    if mode=="memory_only" and memory is not None:
        candidate=memory.mechanism
        fast_used=True
    else:
        if mode in ("gated","gated_drift_aware","gated_residual") and memory is not None and calibration.trusted:
            memory,observations,passed=probe_memory(world,bank,context,2)
            contradicted=not passed
            if sentinel is not None:
                sentinel.record(bool(passed))
            alarm_after=bool(sentinel.alarm) if sentinel is not None else False
            if passed and not alarm_before and not alarm_after:
                candidate=memory.mechanism
                fast_used=True
        if not fast_used:
            if mode=="gated_residual" and memory is not None and calibration.trusted:
                candidate,observations,repair_patches,checks,fell_back=residual_repair(
                    world,memory,observations,budget,alternatives=bank.alternatives(context,world.variables))
                repair_used=not fell_back
                deep_steps=budget-len(observations) if fell_back else 0
            else:
                candidate,observations,deep_steps,checks=deep_investigate(world,observations,budget)
    elapsed=(time.perf_counter()-t0)*1000
    # Independent evaluator scoring starts only AFTER routing commits an answer.
    accuracy=world.accuracy(candidate)
    observed={tuple(o["state"][k] for k in world.variables) for o in observations}
    unseen=[s for s in states(world.variables)
            if tuple(s[k] for k in world.variables) not in observed]
    correct=sum(predict(candidate,s,world.variables)==world.intervene(s)["result"]
                for s in unseen) if candidate is not None else 0
    return {
        "route":"fast" if fast_used else ("repair" if repair_used else "deep"),
        "residualExceptions":repair_patches,
        "fullAccuracy":accuracy,
        "exact":accuracy==1.0,
        "unseenAccuracy":correct/len(unseen) if unseen else None,
        "interventions":len(observations),
        "deepSteps":deep_steps,
        "candidateChecksProxy":checks,
        "latencyMs":elapsed,
        "confidence":calibration.confidence if fast_used and mode in ("gated","gated_drift_aware","gated_residual") else None,
        "falseFamiliarity":fast_used and accuracy!=1.0,
        "contradictionRoutedDeep":contradicted and not fast_used,
        "monitorAlarmBefore":alarm_before,
        "monitorAlarmAfter":bool(sentinel.alarm) if sentinel is not None else False,
        "monitorForcedDeep":bool(sentinel is not None and (alarm_before or sentinel.alarm) and not contradicted and not fast_used),
        "monitorForcedInvestigation":bool(sentinel is not None and (alarm_before or sentinel.alarm) and not fast_used),
        "externalActions":False,
        "persistentKnowledgeWrites":False,
        "modelCalls":0,
    }


def reliability(results):
    scored=[r for r in results if r["confidence"] is not None]
    if not scored:
        return {"samples":0,"brier":None,"ece":None}
    brier=sum((r["confidence"]-float(r["exact"]))**2 for r in scored)/len(scored)
    bins=defaultdict(list)
    for r in scored:
        bins[min(9,int(r["confidence"]*10))].append(r)
    ece=sum((len(v)/len(scored))*abs(sum(r["confidence"] for r in v)/len(v)-
            sum(float(r["exact"]) for r in v)/len(v)) for v in bins.values())
    return {"samples":len(scored),"brier":round(brier,5),"ece":round(ece,5)}


def experiment(seeds=(1901,1902),count_per_seed=160,shift_probability=0.18,change_points=1,change_style="sparse"):
    bank=build_bank(seed=19)
    calibration=calibrate(bank,seed=811,count=800,shift_probability=0.18)
    rows={mode:[] for mode in ("deep_only","memory_only","gated","gated_drift_aware","gated_residual")}
    grouped={mode:defaultdict(list) for mode in rows}
    sentinel_summaries=[]
    for seed in seeds:
        monitors={"gated_drift_aware":DriftSentinel(calibration.mismatch_rate),
                  "gated_residual":DriftSentinel(calibration.mismatch_rate)}
        for index in range(count_per_seed):
            # Fresh world per mode. Identical hidden generator inputs, no outcome
            # or agent state transfer across arms.
            for mode in rows:
                world,context,kind=synthetic_episode(bank,seed,index,shift_probability,
                                                     change_points=change_points,change_style=change_style)
                result=route(world,context,bank,calibration,mode=mode,
                             sentinel=monitors.get(mode))
                result.update({"world":world.world_id,"context":context,"kind":kind})
                rows[mode].append(result)
                grouped[mode][kind].append(result)
        sentinel_summaries.append({"seed":seed,**{k:v.summary() for k,v in monitors.items()}})
    def aggregate(part):
        n=len(part)
        return {
            "episodes":n,
            "meanFullAccuracy":round(sum(r["fullAccuracy"] for r in part)/n,5),
            "meanUnseenAccuracy":round(sum(r["unseenAccuracy"] for r in part)/n,5),
            "exactStrategies":sum(r["exact"] for r in part),
            "meanInterventions":round(sum(r["interventions"] for r in part)/n,4),
            "meanCandidateChecksProxy":round(sum(r["candidateChecksProxy"] for r in part)/n,3),
            "meanLatencyMs":round(sum(r["latencyMs"] for r in part)/n,4),
            "fastRouteCount":sum(r["route"]=="fast" for r in part),
            "falseFamiliarityCount":sum(r["falseFamiliarity"] for r in part),
            "detectedContradictions":sum(r["contradictionRoutedDeep"] for r in part),
            "monitorForcedDeep":sum(r["monitorForcedDeep"] for r in part),
            "monitorForcedInvestigation":sum(r["monitorForcedInvestigation"] for r in part),
            "residualRepairRoutes":sum(r["route"]=="repair" for r in part),
            "residualExceptionCount":sum(r["residualExceptions"] for r in part),
            "confidenceCalibration":reliability(part),
            "modelCalls":0,
        }
    return {
        "study":"AION Genesis Adaptive Strategic Intuition: calibrated fast vs deep",
        "provenance":"deterministic Python, synthetic binary mechanism worlds, no neural learning",
        "seeds":list(seeds),"perSeed":count_per_seed,
        "shiftProbability":shift_probability,
        "hiddenChangePoints":change_points if change_style=="sparse" else None,
        "hiddenChangeStyle":change_style,
        "independentCalibrationSeed":811,"calibration":calibration.summary(),
        "bank":bank.summary(),
        "prequentialDriftSentinels":sentinel_summaries,
        "policies":{k:aggregate(v) for k,v in rows.items()},
        "regimes":{mode:{kind:aggregate(v) for kind,v in kinds.items()}
                   for mode,kinds in grouped.items()},
        "paired": {
            "gatedMinusDeepAccuracy":round(sum(b["fullAccuracy"]-a["fullAccuracy"]
                for a,b in zip(rows["deep_only"],rows["gated"]))/len(rows["gated"]),5),
            "gatedSavedInterventions":sum(a["interventions"]-b["interventions"]
                for a,b in zip(rows["deep_only"],rows["gated"])),
            "gatedWorseExactWorlds":sum(a["exact"] and not b["exact"]
                for a,b in zip(rows["deep_only"],rows["gated"])),
            "monitorReductionInFalseFamiliarity":sum(r["falseFamiliarity"] for r in rows["gated"])-
                sum(r["falseFamiliarity"] for r in rows["gated_drift_aware"]),
            "monitorExtraInterventions":sum(r["interventions"] for r in rows["gated_drift_aware"])-
                sum(r["interventions"] for r in rows["gated"]),
            "residualMinusMonitorUnseenAccuracy":round(sum(b["unseenAccuracy"]-a["unseenAccuracy"]
                for a,b in zip(rows["gated_drift_aware"],rows["gated_residual"]))/len(rows["gated_residual"]),5),
            "residualReducedFalseFamiliarity":sum(r["falseFamiliarity"] for r in rows["gated"])-
                sum(r["falseFamiliarity"] for r in rows["gated_residual"]),
        },
        "safety":{"noProductionData":True,"noExternalActions":True,
                  "persistentCausalMemory":"DISABLED","realQwenInference":False},
        "limits":["Known three-variable Boolean DSL",
                  "Bank trained on complete observations from separate fictional worlds",
                  "Calibration reliability depends on stable shift prevalence",
                  "Cannot guarantee safety under adversarial unseen drifts",
                  "CPU time and candidate checks are not cloud cost or real-world latency"],
    }


def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--seeds",nargs="+",type=int,default=[1901,1902])
    parser.add_argument("--per-seed",type=int,default=160)
    parser.add_argument("--shift",type=float,default=0.18)
    parser.add_argument("--change-points",type=int,choices=(1,2,3),default=1)
    parser.add_argument("--change-style",choices=("sparse","replacement"),default="sparse")
    parser.add_argument("--out",default="")
    args=parser.parse_args()
    report=experiment(tuple(args.seeds),args.per_seed,args.shift,args.change_points,args.change_style)
    if args.out:
        with open(args.out,"w") as f: json.dump(report,f,indent=2)
    print(json.dumps(report,indent=2))


if __name__=="__main__":
    main()
