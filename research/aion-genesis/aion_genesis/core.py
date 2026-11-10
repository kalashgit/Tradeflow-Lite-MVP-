"""Hidden-world experiments and safe expression-tree mechanism composition."""
from copy import deepcopy
from itertools import product
import hashlib
import json
import random

class MechanismError(ValueError):
    pass

def validate(node, variables, max_nodes=48):
    """Return a validated copy. There is no exec, eval, imports, or generated source."""
    if not isinstance(variables, (tuple, list)) or not 2 <= len(variables) <= 6 or len(set(variables)) != len(variables):
        raise MechanismError("invalid variable set")
    visits = [0]
    def walk(expr, depth):
        visits[0] += 1
        if visits[0] > max_nodes or depth > 12 or not isinstance(expr, dict):
            raise MechanismError("expression complexity exceeded")
        op = expr.get("op")
        if op == "var":
            if set(expr) != {"op", "name"} or expr["name"] not in variables:
                raise MechanismError("unknown variable")
            return {"op": "var", "name": expr["name"]}
        if op == "not":
            if set(expr) != {"op", "arg"}:
                raise MechanismError("malformed NOT")
            return {"op": "not", "arg": walk(expr["arg"], depth + 1)}
        if op not in ("and", "or", "xor", "threshold"):
            raise MechanismError("unsupported operator")
        expected = {"op", "args", "k"} if op == "threshold" else {"op", "args"}
        args = expr.get("args")
        if set(expr) != expected or not isinstance(args, list) or not 2 <= len(args) <= 4:
            raise MechanismError("malformed expression arguments")
        items = [walk(arg, depth + 1) for arg in args]
        if op == "threshold":
            if type(expr.get("k")) is not int or not 1 <= expr["k"] <= len(items):
                raise MechanismError("invalid threshold")
            return {"op": op, "args": items, "k": expr["k"]}
        return {"op": op, "args": items}
    return walk(node, 0)

def _run(node, state):
    op = node["op"]
    if op == "var":
        return state[node["name"]]
    if op == "not":
        return 1 - _run(node["arg"], state)
    values = [_run(item, state) for item in node["args"]]
    if op == "and":
        return int(all(values))
    if op == "or":
        return int(any(values))
    if op == "xor":
        return sum(values) % 2
    return int(sum(values) >= node["k"])

def predict(node, state, variables):
    norm = validate(node, variables)
    if set(state) != set(variables) or any(type(state[x]) is not int or state[x] not in (0, 1) for x in variables):
        raise MechanismError("invalid binary state")
    return _run(norm, state)

def states(variables):
    return [dict(zip(variables, bits)) for bits in product((0, 1), repeat=len(variables))]

def fingerprint(node, variables):
    data = json.dumps(validate(node, variables), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode()).hexdigest()

def violations(node, observations, variables):
    return [x for x in observations if predict(node, x["state"], variables) != x["result"]]

def variable(name):
    return {"op": "var", "name": name}

def hidden_expression(kind, variables, rng):
    a, b, c = rng.sample(list(variables), 3)
    if kind in ("and", "or", "xor"):
        return {"op": kind, "args": [variable(a), variable(b)]}
    if kind == "inhibited":
        return {"op": "and", "args": [variable(a), variable(b), {"op": "not", "arg": variable(c)}]}
    if kind == "majority":
        return {"op": "threshold", "args": [variable(a), variable(b), variable(c)], "k": 2}
    if kind == "parity":
        return {"op": "xor", "args": [variable(a), variable(b), variable(c)]}
    if kind == "nested":
        return {"op": "or", "args": [{"op": "and", "args": [variable(a), variable(b)]}, {"op": "not", "arg": variable(c)}]}
    raise ValueError("unsupported hidden mechanism")

class HiddenWorld:
    """Only variables and observations belong in a Qwen prompt, never the private rule."""
    def __init__(self, world_id, variables, rule, split):
        self.world_id = world_id
        self.variables = tuple(variables)
        self.split = split
        self.__rule = deepcopy(rule)
        self.interventions = 0

    def intervene(self, state):
        result = predict(self.__rule, state, self.variables)
        self.interventions += 1
        return {"state": deepcopy(state), "result": result}

    def accuracy(self, candidate):
        if candidate is None:
            return 0.0
        options = states(self.variables)
        return sum(predict(self.__rule, state, self.variables) == predict(candidate, state, self.variables) for state in options) / len(options)

def worlds(seed=71, count=120):
    if count < 2:
        raise ValueError("need multiple worlds")
    rng = random.Random(seed)
    batch = []
    for i in range(count):
        split = "development" if i < count // 2 else "heldout"
        families = ("and", "or", "xor") if split == "development" else ("inhibited", "majority", "parity", "nested")
        variables = ("A", "B", "C", "D") if i % 3 == 0 else ("A", "B", "C")
        rule = hidden_expression(families[i % len(families)], variables, rng)
        batch.append(HiddenWorld("genesis-%04d" % i, variables, rule, split))
    return batch

def choose_intervention(variables, observations, candidate_pool=()):
    already = {tuple(x["state"][v] for v in variables) for x in observations}
    unseen = [s for s in states(variables) if tuple(s[v] for v in variables) not in already]
    if not unseen:
        return None
    valid = []
    for rule in candidate_pool:
        try:
            valid.append(validate(rule, variables))
        except MechanismError:
            continue
    def disagreement(state):
        predictions = [predict(rule, state, variables) for rule in valid]
        yes = sum(predictions)
        return yes * (len(valid) - yes)
    return sorted(unseen, key=lambda state: (-disagreement(state), tuple(state[v] for v in variables)))[0]

class ReferenceProposer:
    """Deterministic fixed-grammar baseline; not an LLM and not mechanism invention."""
    def __init__(self, composed=False):
        self.composed = composed
        self.calls = 0

    def propose(self, *, variables, recent, feedback, previous, analogies=()):
        self.calls += 1
        # Memories are tentative proposals, never verified truth.
        for analogy in analogies:
            try:
                if not violations(analogy, recent, variables):
                    return deepcopy(validate(analogy, variables))
            except (MechanismError, ValueError, KeyError, TypeError):
                continue
        options = []
        for i, a in enumerate(variables):
            for b in variables[i + 1:]:
                options.extend({"op": op, "args": [variable(a), variable(b)]} for op in ("and", "or", "xor"))
                if self.composed:
                    for c in variables:
                        if c in (a, b):
                            continue
                        options.append({"op": "and", "args": [variable(a), variable(b), {"op": "not", "arg": variable(c)}]})
                        options.append({"op": "threshold", "args": [variable(a), variable(b), variable(c)], "k": 2})
                        options.append({"op": "xor", "args": [variable(a), variable(b), variable(c)]})
        return next((deepcopy(rule) for rule in options if not violations(rule, recent, variables)), None)
