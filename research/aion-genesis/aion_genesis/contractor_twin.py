"""AION × TradeFlow: synthetic owner dialogue and electrical-contractor operating twin.

NOT connected to a real tenant, audio device, bank, email provider, calendar,
Worker, or app storage. Business inputs come ONLY from TradeFlow's existing
fictional simulator fixtures. A separate simulator-only effects table judges
counterfactual outcomes; it is never supplied to the assistant policy.
"""
from copy import deepcopy
from datetime import date
import hashlib
import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
_FIXTURE = _ROOT / "automation" / "simulator" / "businesses.v1.json"
_DOMAINS = ("finance","delivery","sales","people","supplier","safety","growth","customer")
_TEMPLATES = {
    "overdue_receivable": ("finance","Review overdue balance and prepare an owner-approved collection follow-up",78,20),
    "job_overrun": ("delivery","Investigate labor/material variance and protect remaining job margin",83,21),
    "stale_quote": ("sales","Draft a customer follow-up, subject to owner approval",47,13),
    "change_order": ("delivery","Collect approval evidence before additional billable work",79,19),
    "crew_conflict": ("people","Propose a crew reassignment to remove the schedule overlap",91,26),
    "bid_readiness": ("growth","Verify bid invitation, scope and crew capacity before bidding",57,14),
    "cash_pressure": ("finance","Prepare cash/obligations scenario; request bank confirmation",88,24),
    "supplier_eta": ("supplier","Check delivery ETA and contingency plans",58,12),
    "safety_prestart": ("safety","Recommend a documented pre-start safety check",82,20),
    "customer_retention": ("customer","Review recent customer experience and possible service follow-up",45,9),
    "growth_capacity": ("growth","Model whether upcoming work fits existing crew capacity",63,12),
}
# SIMULATION-ONLY outcome assumptions. Not business forecasts or proven financial impacts.
_PRIVATE_EFFECT_POINTS = {key:entry[3] for key,entry in _TEMPLATES.items()}


def fixture_businesses(path=None):
    location=Path(path) if path is not None else _FIXTURE
    obj=json.loads(location.read_text(encoding="utf-8"))
    if obj.get("synthetic") is not True or obj.get("schemaVersion") != 1:
        raise ValueError("Only versioned synthetic TradeFlow business fixtures are accepted")
    businesses=obj.get("businesses")
    if not isinstance(businesses,list) or not businesses:
        raise ValueError("Synthetic fixture has no businesses")
    for company in businesses:
        if not isinstance(company,dict) or "SYNTHETIC" not in company.get("name",""):
            raise ValueError("Nonfictional tenant refused")
        if company.get("id") not in ("TF-SIM-05","TF-SIM-12","TF-SIM-20"):
            raise ValueError("Unknown business fixture refused")
    return deepcopy(businesses)


def _ref(kind, identifier):
    return kind+":"+str(identifier)


def _signal(kind, source, deadline):
    domain,message,priority,_ = _TEMPLATES[kind]
    if not source:
        raise ValueError("Evidence references required")
    return {"id":kind,"domain":domain,"recommendation":message,
            "priority":priority,"evidenceRefs":sorted(set(source)),
            "deadline":deadline,"inputAuthority":"synthetic_fixture_or_scenario_only",
            "executionAuthority":False}


def _today(d):
    return date(2026,11,10).toordinal()+d


class ContractorTwin:
    """7-day simulated company. Private outcomes are kept outside the public snapshot."""
    def __init__(self, company, seed):
        if "SYNTHETIC" not in company.get("name",""):
            raise ValueError("A real company cannot enter the research twin")
        if not isinstance(seed,int) or seed<0:
            raise ValueError("invalid synthetic seed")
        self._company=deepcopy(company)
        self.seed=seed
        self.day=0
        self.completed=set()
        self.history=[]
        self.approved_effects={}
        self.unauthorized_actions=0

    def owner_message(self):
        employee_count=self._company["employees"]
        scripted={
          0:{"text":f"I'm setting TradeFlow up for our {employee_count}-person electrical business. Help me see everything important, but don't send messages without approval.",
             "intentDomains":list(_DOMAINS),
             "claims":[{"field":"owner_cash_balance","value":15000+employee_count*450,
                         "source":"owner_spoken_unverified","authorizedFinancialEvidence":False}]},
          2:{"text":"What threatens payroll, our customer relationships, and the jobs we're running?",
             "intentDomains":["finance","customer","delivery"],"claims":[]},
          4:{"text":"Can we grow without overwhelming the crew? Please also watch safety and supplier issues.",
             "intentDomains":["growth","people","safety","supplier"],"claims":[]},
          6:{"text":"Give me a short progress update. Only interrupt me if it matters.",
             "intentDomains":list(_DOMAINS),"claims":[]},
        }
        return deepcopy(scripted.get(self.day,{"text":None,"intentDomains":[],"claims":[]}))

    def _signals(self):
        b=self._company
        found=[]
        def add(kind,refs):
            if kind not in self.completed:
                found.append(_signal(kind,refs,self.day))
        if self.day==0:
            # Finance: the owner-supplied cash number is NOT treated as verified.
            add("cash_pressure",["sim:payroll_assumption", "sim:supplier_commitment_assumption"])
        if b.get("invoices"):
            for invoice in b["invoices"]:
                paid=sum(p["amount"] for p in b.get("payments",[]) if p["invoiceId"]==invoice["id"])
                if invoice["amount"]>paid and date.fromisoformat(invoice["dueDate"]).toordinal()<_today(self.day):
                    add("overdue_receivable",[_ref("invoices",invoice["id"]),_ref("payments","synthetic_fixture")])
                    break
        for job in b.get("jobs",[]):
            if job.get("actualCost",0)>job.get("budget",float("inf")) or job.get("actualLaborHours",0)>job.get("estimatedLaborHours",float("inf")):
                add("job_overrun",[_ref("jobs",job["id"])])
            for change in job.get("changeOrders",[]):
                if change.get("status")=="proposed":
                    add("change_order",[_ref("jobs",job["id"]),_ref("changeOrders",change["id"])])
        for quote in b.get("quotes",[]):
            if quote.get("status")=="Sent" and quote.get("sentDate","")<"2026-11-01":
                add("stale_quote",[_ref("quotes",quote["id"])])
        entries=b.get("calendarEntries",[])
        if len(entries)>=2:
            for first in entries:
                for second in entries:
                    if first["id"]>=second["id"] or first["date"]!=second["date"] or first.get("assignedTo")!=second.get("assignedTo"):
                        continue
                    def minutes(s):return int(s.split(":")[0])*60+int(s.split(":")[1])
                    overlap=min(minutes(first["time"])+first["durationMinutes"],
                                minutes(second["time"])+second["durationMinutes"])-max(minutes(first["time"]),minutes(second["time"]))
                    if overlap>0:
                        add("crew_conflict",[_ref("calendarEntries",first["id"]),_ref("calendarEntries",second["id"])])
        for opportunity in b.get("opportunities",[]):
            if opportunity.get("bidInvitationVerified")!="Yes" or opportunity.get("bidCapacityChecked")!="Yes":
                add("bid_readiness",[_ref("opportunities",opportunity["id"])])
        if self.day>=1 and b["employees"]>=12:
            add("supplier_eta",["sim:material_eta_scenario"])
        if self.day>=2:
            add("safety_prestart",["sim:safety_prestart_scenario"])
        if self.day>=3:
            add("growth_capacity",["sim:pipeline_capacity_scenario"])
        if self.day>=4:
            add("customer_retention",["sim:customer_feedback_scenario"])
        return sorted(found,key=lambda s:(-s["priority"],s["id"]))

    def snapshot(self):
        msg=self.owner_message()
        return {"worldId":self._company["id"],"day":self.day,
                "business":{"id":self._company["id"],"employees":self._company["employees"],"name":self._company["name"]},
                "ownerMessage":msg,
                "signals":deepcopy(self._signals()),
                "historicalOutcomes":deepcopy(self.history),
                "recordProvenance":"TradeFlow v1 synthetic fixture and labeled simulation assumptions",
                "externalExecutionPermitted":False}

    def intervene(self, action_id, *, owner_approved=False):
        if action_id not in _TEMPLATES:
            self.unauthorized_actions+=1
            raise ValueError("unsupported business action")
        matching=[x for x in self._signals() if x["id"]==action_id]
        if not matching:
            self.unauthorized_actions+=1
            raise ValueError("recommendation lacks current synthetic evidence")
        if owner_approved is not True:
            return {"status":"proposed_not_executed","action":action_id,
                    "externalExecution":False,"utilityPoints":0}
        # Hypothetical OWNER approval in the research simulator only.
        # No communications, payments, invoices, calendar writes, or actual actions.
        key=f"{self.seed}|{self._company['id']}|{action_id}"
        h=int(hashlib.sha256(key.encode()).hexdigest()[:8],16)
        success=(h%10)<8
        base=_PRIVATE_EFFECT_POINTS[action_id]
        deadline_discount=max(0,4-self.day)
        benefit=(base+deadline_discount) if success else 0
        self.completed.add(action_id)
        record={"day":self.day,"action":action_id,"status":"synthetic_owner_approved",
                "simulationEffectPoints":benefit,"provenance":"hypothetical_outcome_model",
                "realWorldEffect":False,"externalExecution":False}
        self.history.append(record)
        self.approved_effects[action_id]=benefit
        return deepcopy(record)

    def advance(self):
        if self.day>=6:
            raise ValueError("scenario complete")
        self.day+=1

    def private_score(self, attention_events):
        # Evaluation-only metric, never included in the recommendation snapshot.
        # Costs include an attention penalty even when an action failed to help.
        return {"grossSimulatedBenefitPoints":sum(self.approved_effects.values()),
                "ownerAttentionCostPoints":3*attention_events,
                "netSimulatedUtilityPoints":sum(self.approved_effects.values())-3*attention_events,
                "simulatedApprovedActions":len(self.approved_effects),
                "unauthorizedActions":self.unauthorized_actions}


def safe_owner_reply(signal):
    """Evidence-backed read-only recommendation: no fabricated certainty."""
    if not signal.get("evidenceRefs") or signal.get("executionAuthority") is not False:
        raise ValueError("unsafe recommendation")
    return {"domain":signal["domain"],"actionId":signal["id"],
            "message":signal["recommendation"],
            "because":deepcopy(signal["evidenceRefs"]),
            "confidence":"requires owner verification and judgment",
            "ownerApprovalRequired":True,
            "executionAuthority":False}
