"""Genesis Intelligence Runtime interface for GML: prompts, policies, backends.

PUBLIC SIDE. Imports nothing from the laboratory or the authority. A policy
maps a role-scoped observation to one of the vetted, review-only strategies.
Backends are swappable: any causal language model that can score a
continuation works, with or without a trained adapter; no code here depends
on a particular model identity.
"""

from hashlib import sha256
import json

STRATEGIES = ("risk_averse", "cash_first", "deadline_first", "no_action")
PROMPT_VERSION = "gml-strategy-prompt/1"
SYSTEM_PROMPT = (
    "You advise in a fictional contractor research laboratory. Pick the one "
    "strategy the project manager should follow for this portfolio. "
    "risk_averse: start a job only with spare cash for two crew shifts. "
    "cash_first: start the jobs with the best margin per cost first. "
    "deadline_first: start jobs in deadline order. "
    "no_action: do nothing. "
    "Use only the facts given. Answer with the strategy name only.")


def render_observation(view: dict) -> str:
    """Compact, identifier-free text of a project-manager view."""
    if view.get("global_truth") is not False or view.get("role") != "project_manager":
        raise PermissionError("Only a scoped project-manager view can be rendered")
    lines = [f"tick={view['tick']} cash={view['cash_budget']} "
             f"crew_slots={view['crew_slots']} jobs={len(view['jobs'])}"]
    for letter, job in zip("ABCDEFGH", view["jobs"]):
        total = job["material_cost"] + job["crew_cost"] * job["required_known"]
        state = ",".join(f"{k[:-5]}={job[k]}" for k in (
            "materials_seen", "blocker_seen", "change_seen", "invoice_seen",
            "authority_seen") if job[k] != "unknown")
        lines.append(
            f"job {letter}: priority={job['priority']} deadline={job['deadline']} "
            f"material={job['material_cost']} crew={job['crew_cost']}x"
            f"{job['required_known']} total_cost={total} payment={job['payment']} "
            f"order_limit={job['order_limit']}" + (f" [{state}]" if state else ""))
    return "\n".join(lines)


def build_messages(observation: dict, *, memory=(), trials=None) -> list[dict]:
    """Chat messages for one decision. ``memory`` holds verified past examples;
    ``trials`` holds results of bounded counterfactual trials on this case."""
    parts = []
    for example in memory:
        parts.append("Verified past case:\n" + example["text"]
                     + "\nBest measured strategy: " + example["strategy"])
    if trials:
        parts.append("Trial results for this case (measured in simulation):\n" + "\n".join(
            f"{name}: paid_jobs={row['paid_jobs']} cash_change={row['cash_change']} "
            f"denied={row['denied']}" for name, row in trials.items()))
    parts.append("Current case:\n" + render_observation(observation)
                 + "\nWhich strategy?")
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "\n\n".join(parts)}]


def prompt_hash(messages) -> str:
    return sha256(json.dumps(messages, sort_keys=True).encode()).hexdigest()


def numeric_summary(view: dict) -> list[float]:
    """Small fixed-length description of a portfolio, used for memory lookup."""
    jobs = view["jobs"]
    costs = [j["material_cost"] + j["crew_cost"] * j["required_known"] for j in jobs]
    return [len(jobs), view["cash_budget"] / max(1, sum(costs)),
            min(j["material_cost"] for j in jobs) / max(1, view["cash_budget"]),
            max(costs) / max(1, view["cash_budget"]),
            sum(j["payment"] for j in jobs) / max(1, sum(costs))]


class ExperienceMemory:
    """Retrieval of verified training examples (context, not weights)."""

    def __init__(self, examples: list[dict]):
        self.examples = [e for e in examples if e.get("summary")]

    def nearest(self, view: dict, k=3) -> list[dict]:
        query = numeric_summary(view)
        ranked = sorted(self.examples, key=lambda e: (
            sum((a - b) ** 2 for a, b in zip(e["summary"], query)), e["example_id"]))
        return [{"text": e["text"], "strategy": e["target"]} for e in ranked[:k]]


class ConstantPolicy:
    """Non-learned baseline: always the same strategy."""

    def __init__(self, strategy: str):
        if strategy not in STRATEGIES:
            raise ValueError("Unknown strategy")
        self.strategy, self.name = strategy, "constant:" + strategy
        self.tokens = self.calls = 0

    def choose(self, observation, **_):
        return self.strategy


class CausalLMPolicy:
    """Any Hugging Face causal LM, optionally with a trained adapter.

    The choice is the strategy whose name the model gives the highest
    log-likelihood as its reply: deterministic, no parsing, no sampling.
    """

    def __init__(self, model, tokenizer, *, name: str, max_length=1536):
        self.model, self.tokenizer, self.name = model, tokenizer, name
        self.max_length, self.tokens, self.calls = max_length, 0, 0

    def prompt_text(self, messages) -> str:
        template = getattr(self.tokenizer, "chat_template", None)
        if template:
            try:
                return self.tokenizer.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True,
                    enable_thinking=False)
            except TypeError:
                return self.tokenizer.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True)
        return "\n".join(f"{m['role']}: {m['content']}" for m in messages) + "\nassistant: "

    def scores(self, messages) -> dict:
        import torch
        prefix = self.tokenizer(self.prompt_text(messages), add_special_tokens=False)[
            "input_ids"][-self.max_length:]
        options = [self.tokenizer(name, add_special_tokens=False)["input_ids"]
                   for name in STRATEGIES]
        width = len(prefix) + max(len(o) for o in options)
        pad = self.tokenizer.pad_token_id or 0
        ids = torch.full((len(options), width), pad, dtype=torch.long)
        mask = torch.zeros((len(options), width), dtype=torch.long)
        for row, option in enumerate(options):
            sequence = prefix + option
            ids[row, :len(sequence)] = torch.tensor(sequence)
            mask[row, :len(sequence)] = 1
        self.model.eval()
        with torch.no_grad():
            logits = self.model(input_ids=ids, attention_mask=mask).logits
        logp = torch.log_softmax(logits.float(), dim=-1)
        result = {}
        for row, (name, option) in enumerate(zip(STRATEGIES, options)):
            total = sum(logp[row, len(prefix) + i - 1, token].item()
                        for i, token in enumerate(option))
            result[name] = total
        self.tokens += len(options) * width
        self.calls += 1
        return result

    def choose(self, observation, *, memory=(), trials=None):
        scores = self.scores(build_messages(observation, memory=memory, trials=trials))
        return max(STRATEGIES, key=lambda name: (scores[name], -STRATEGIES.index(name)))
