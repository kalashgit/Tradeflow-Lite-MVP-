"""Business-owner advisory policies for an entirely synthetic TradeFlow twin.

The policy sees only public snapshots; it has no access to the simulator's
hidden reward/effect assumptions. "Learning" is local, reversible preference
calibration from simulated feedback, NOT LLM training or verified business
expertise.
"""
from collections import defaultdict
from copy import deepcopy

from .contractor_twin import safe_owner_reply


class OwnerAdvisor:
    def __init__(self, mode="adaptive"):
        if mode not in ("reactive","proactive_static","adaptive"):
            raise ValueError("unknown owner-advisor policy")
        self.mode=mode
        self._feedback=defaultdict(list)
        self._past=set()
        self._used_by_day={}
        self._read_only=True
        self.proposals=0
        self.suppressed=0

    def choose(self, public_snapshot, max_per_day=2):
        if type(max_per_day) is not int or not 0<=max_per_day<=3:
            raise ValueError("invalid owner-attention budget")
        if public_snapshot.get("externalExecutionPermitted") is not False:
            raise ValueError("production execution boundary violated")
        message=public_snapshot["ownerMessage"]
        day_key=(public_snapshot["worldId"],public_snapshot["day"])
        day_limit=min(max_per_day,1) if message["text"] is None and self.mode!="reactive" else max_per_day
        remaining=max(0,day_limit-self._used_by_day.get(day_key,0))
        if remaining==0:
            return []
        focused=set(message["intentDomains"])
        candidates=[]
        for signal in public_snapshot["signals"]:
            if not signal.get("evidenceRefs") or signal["executionAuthority"] is not False:
                continue
            if signal["id"] in self._past:
                continue
            if self.mode=="reactive" and (not message["text"] or signal["domain"] not in focused):
                continue
            value=signal["priority"]
            if self.mode=="adaptive":
                if signal["domain"] in focused:
                    value+=12  # owner-stated goals, not assumed cash claims
                feedback=self._feedback[signal["domain"]]
                if len(feedback)>=1:
                    # A weak bounded preference update from realized observations.
                    value+=max(-8,min(8,(sum(feedback)/len(feedback)-10)/2))
            candidates.append((value,signal["id"],signal))
        candidates.sort(key=lambda item:(-item[0],item[1]))
        chosen=[safe_owner_reply(signal) for _,_,signal in candidates[:remaining]]
        # This cap is applied to unsolicited notifications in the research scenario.
        self._used_by_day[day_key]=self._used_by_day.get(day_key,0)+len(chosen)
        self.suppressed+=max(0,len(candidates)-len(chosen))
        self.proposals+=len(chosen)
        for proposal in chosen:
            self._past.add(proposal["actionId"])
        return chosen

    def observe(self, proposal, simulated_outcome):
        if simulated_outcome.get("status")!="synthetic_owner_approved":
            return
        if self.mode=="adaptive":
            self._feedback[proposal["domain"]].append(simulated_outcome["simulationEffectPoints"])

    @property
    def knowledge(self):
        return {"ephemeral":True,"persistent":False,"domainFeedback":{
            k:{"observations":len(values),"meanSimulatedBenefitPoints":round(sum(values)/len(values),2)}
            for k,values in self._feedback.items()}}


def simulate_owner_session(company, seed=3, mode="adaptive", max_per_day=2):
    from .contractor_twin import ContractorTwin
    twin=ContractorTwin(company,seed)
    advisor=OwnerAdvisor(mode=mode)
    turns=[]
    for day in range(7):
        snapshot=twin.snapshot()
        proposals=advisor.choose(snapshot,max_per_day=max_per_day)
        responses=[]
        for proposal in proposals:
            # The simulated owner approves a proposal for evaluation purposes.
            # This is NOT a real customer communication or an actual approval.
            result=twin.intervene(proposal["actionId"],owner_approved=True)
            advisor.observe(proposal,result)
            responses.append({"recommendation":proposal,"simulationOwnerDecision":"approved",
                              "syntheticResult":result})
        turns.append({
            "day":day,
            "syntheticOwnerUtterance":snapshot["ownerMessage"]["text"],
            "unverifiedOwnerClaims":snapshot["ownerMessage"]["claims"],
            "observedSignalCount":len(snapshot["signals"]),
            "recommendations":responses,
            "readOnly":True,
        })
        if day<6:
            twin.advance()
    outcome=twin.private_score(advisor.proposals)
    return {"company":company["id"],"employees":company["employees"],
            "mode":mode,"seed":seed,"days":7,
            "score":outcome,
            "proposals":advisor.proposals,"suppressedSuggestions":advisor.suppressed,
            "coveredDomains":sorted({r["recommendation"]["domain"]
                                      for turn in turns for r in turn["recommendations"]}),
            "knowledge":advisor.knowledge,"turns":turns,
            "realQwenInference":False,"liveVoice":False,
            "persistentMemory":False,"realBusinessData":False,
            "realExternalActions":False}
