"""Read-only synthetic owner dialogue selection using local Qwen or a mock transport.

A model may prioritize only an already evidenced, explicitly allowlisted action
and may ask only prewritten verification questions. It CANNOT execute anything.
Human-readable advice is rendered from verified simulation templates, never
model-invented financial figures, citations or authority.
"""
from copy import deepcopy
import json
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from .contractor_twin import safe_owner_reply

QUESTIONS={
    "verify_bank_balance":"Can you confirm your opening cash figure against an authorized bank record?",
    "verify_payroll_commitments":"Can we verify upcoming payroll dates and amounts from the payroll source?",
    "confirm_customer_contact":"Would you like to approve a draft customer follow-up before anything is sent?",
    "confirm_crew_capacity":"Can we confirm crew availability and job commitments before accepting extra work?",
}
MODEL_ID_DEFAULT="qwen3:0.6b"


class LocalOwnerReasoner:
    def __init__(self,model=MODEL_ID_DEFAULT,endpoint="http://127.0.0.1:11434",transport=None):
        parsed=urlsplit(endpoint)
        if parsed.scheme!="http" or parsed.hostname not in ("127.0.0.1","localhost","::1") or parsed.username or parsed.password or parsed.path not in ("","/") or parsed.query or parsed.fragment:
            raise ValueError("Only private loopback Ollama is authorized")
        if not isinstance(model,str) or not model or len(model)>128:
            raise ValueError("Invalid model")
        self.model=model
        self.endpoint=endpoint.rstrip("/")
        self.transport=transport or self._post
        self.calls=0
        self.prompt_tokens=0
        self.completion_tokens=0

    def _post(self,body):
        request=Request(self.endpoint+"/api/chat",method="POST",
                        data=json.dumps(body).encode("utf-8"),
                        headers={"Content-Type":"application/json"})
        with urlopen(request,timeout=90) as response:
            return json.load(response)

    def advise(self,snapshot,max_actions=2):
        if type(max_actions) is not int or not 1<=max_actions<=3:
            raise ValueError("Invalid owner attention limit")
        if snapshot.get("externalExecutionPermitted") is not False or "synthetic" not in snapshot.get("recordProvenance","").lower():
            raise ValueError("Refuse any non-synthetic or executable snapshot")
        allowed={item["id"]:item for item in snapshot["signals"]
                 if item.get("evidenceRefs") and item.get("executionAuthority") is False}
        enum=sorted(allowed)
        if not enum:
            return {"status":"no_evidenced_actions","cards":[],"questions":[],
                    "modelCalled":False,"externalActions":False}
        schema={
          "type":"object",
          "properties":{
            "actions":{"type":"array","items":{"type":"string","enum":enum},
                       "minItems":0,"maxItems":max_actions,"uniqueItems":True},
            "questions":{"type":"array","items":{"type":"string","enum":sorted(QUESTIONS)},
                         "minItems":0,"maxItems":2,"uniqueItems":True},
          },
          "required":["actions","questions"],"additionalProperties":False
        }
        owner=snapshot["ownerMessage"]
        public={
          "syntheticBusiness":{"id":snapshot["business"]["id"],
                               "employees":snapshot["business"]["employees"]},
          "day":snapshot["day"],
          "ownerTranscript":owner["text"],
          "unverifiedSpokenClaims":owner["claims"],
          "allowedActions":[
             {"id":key,"domain":allowed[key]["domain"],
              "priority":allowed[key]["priority"],
              "sourceRefs":allowed[key]["evidenceRefs"],
              "advisoryText":allowed[key]["recommendation"]}
             for key in enum],
          "previousHypotheticalOutcomes":snapshot["historicalOutcomes"][-5:],
        }
        system=(
          "You are AION in a FICTIONAL electrical contractor simulation. "
          "Prioritize the most consequential 0-2 evidenced advisory actions across "
          "cash, delivery, safety, team, opportunities, customers and growth. "
          "Never turn an owner's unverified spoken claim into a verified financial record. "
          "Choose ONLY action IDs and verification question codes from the given lists. "
          "Output exactly the JSON Schema. No execution, no invented numbers, no prose."
        )
        body={
          "model":self.model,"think":False,"stream":False,"format":schema,
          "options":{"temperature":0,"num_predict":256},
          "messages":[{"role":"system","content":system},
                      {"role":"user","content":json.dumps(public,sort_keys=True)}]
        }
        self.calls+=1
        try:
            answer=self.transport(body)
            if not isinstance(answer,dict) or answer.get("done") is not True or answer.get("done_reason","stop")!="stop":
                raise ValueError("Model generation incomplete")
            tokens_in=answer.get("prompt_eval_count",0)
            tokens_out=answer.get("eval_count",0)
            self.prompt_tokens+=max(tokens_in,0) if type(tokens_in) is int else 0
            self.completion_tokens+=max(tokens_out,0) if type(tokens_out) is int else 0
            response=json.loads(answer.get("message",{}).get("content",""))
            ids=response.get("actions")
            codes=response.get("questions")
            if (set(response)!={"actions","questions"} or not isinstance(ids,list) or
                not isinstance(codes,list) or len(ids)>max_actions or len(codes)>2 or
                len(ids)!=len(set(ids)) or len(codes)!=len(set(codes)) or
                any(x not in allowed for x in ids) or any(x not in QUESTIONS for x in codes)):
                raise ValueError("Model selected unauthorized or duplicate action")
            return {"status":"model_selection_verified",
                    "cards":[safe_owner_reply(allowed[x]) for x in ids],
                    "questions":[QUESTIONS[x] for x in codes],
                    "modelCalled":True,"externalActions":False,
                    "actionIDs":ids,
                    "modelGeneratedFinancialFactsAccepted":False}
        except (ValueError,TypeError,KeyError,AttributeError,RecursionError):
            # Trustworthy deterministic fallback; NEVER execute an unverified model choice.
            ids=sorted(enum,key=lambda key:(-allowed[key]["priority"],key))[:max_actions]
            return {"status":"validated_fallback","cards":[safe_owner_reply(allowed[x]) for x in ids],
                    "questions":[QUESTIONS["verify_bank_balance"]] if owner["claims"] else [],
                    "modelCalled":True,"externalActions":False,"actionIDs":ids,
                    "modelGeneratedFinancialFactsAccepted":False}
