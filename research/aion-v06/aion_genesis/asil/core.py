"""Adaptive Strategic Intuition Layer (ASIL) — domain-general core.

Fast intelligence: recognise a decision context, recall how the same kind of
action fared in *verified, delayed* outcomes, and act cheaply when (and only
when) that record is strong, fresh and uncontradicted.
Deep intelligence: everything else goes to a bounded investigator supplied by
the domain. A metacognitive router chooses between them, or abstains.

Nothing here knows about contracting. A domain supplies discrete context
tokens, a stake estimate and a deep planner. Memory holds abstract strategy
statistics only: tokens are validated so that no identifier, amount or other
tenant fact can be stored. Familiarity is never treated as correctness: trust
comes from verified outcomes, discounted for age and for confounding events.
"""

from dataclasses import dataclass, field
from hashlib import sha256
import json
from math import sqrt
import re

ASIL_VERSION = "asil-0.1.0"
TOKEN = re.compile(r"[a-z][a-z0-9_]{0,31}=[a-z0-9_]{1,24}\Z")
FAST, DEEP, ABSTAIN, REFLEX = "fast", "deep", "abstain", "reflex"


def _digest(value) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


@dataclass(frozen=True)
class RouterConfig:
    """Frozen routing thresholds. Changing one is a new candidate version."""

    min_support: float = 4.0        # effective verified outcomes before trusting
    trust_lower_bound: float = 0.70  # 5% lower bound needed for the fast path
    veto_upper_bound: float = 0.30   # 95% upper bound below which an option is avoided
    high_stakes: float = 0.25        # share of liquid resources committed irreversibly
    high_stakes_lower_bound: float = 0.80
    half_life_episodes: float = 40.0  # evidence ages; stale memories lose weight
    contradiction_window: int = 6
    contradiction_gap: float = 0.40
    confounded_weight: float = 0.5   # outcome co-occurring with an external shock
    partial_match_discount: float = 0.5
    deep_cost_units: float = 1.0     # cost of one investigation, in stake units
    deep_budget_per_episode: int = 10_000

    def digest(self) -> str:
        return _digest(self.__dict__)


@dataclass(frozen=True)
class StrategicContext:
    """A recognised decision context: one action kind in one situation."""

    action: str
    tokens: tuple[str, ...]          # full signature, most specific
    core_tokens: tuple[str, ...]     # coarser signature used for partial matches

    def __post_init__(self):
        for token in (*self.tokens, *self.core_tokens):
            if not TOKEN.fullmatch(token):
                raise ValueError("Context tokens must be abstract name=value labels")
        if not re.fullmatch(r"[a-z_]{1,40}", self.action):
            raise ValueError("Invalid action kind")
        if not set(self.core_tokens) <= set(self.tokens):
            raise ValueError("Core signature must be a subset of the full signature")

    @property
    def key(self) -> str:
        return self.action + "|" + ",".join(sorted(self.tokens))

    @property
    def core_key(self) -> str:
        return self.action + "|~" + ",".join(sorted(self.core_tokens))


class StrategicContextRecognizer:
    """Turns a domain's discrete features into exact and partial signatures."""

    def __init__(self, core_features: tuple[str, ...]):
        self.core_features = tuple(core_features)

    def recognise(self, action: str, features: dict) -> StrategicContext:
        tokens = tuple(sorted(f"{name}={value}" for name, value in features.items()))
        core = tuple(t for t in tokens if t.split("=")[0] in self.core_features)
        return StrategicContext(action, tokens, core)


@dataclass(frozen=True)
class Recall:
    support: float          # effective, age-discounted verified outcomes
    mean: float             # calibrated reliability estimate
    lower: float            # 5% bound
    upper: float            # 95% bound
    match: str              # "exact", "partial" or "none"
    contradicted: bool      # recent outcomes disagree with the long record
    evidence: tuple[str, ...]


class ConfidenceCalibrator:
    """Beta-posterior reliability with honest bounds, plus calibration scoring."""

    @staticmethod
    def estimate(successes: float, failures: float) -> tuple[float, float, float]:
        a, b = successes + 0.5, failures + 0.5          # Jeffreys prior
        mean = a / (a + b)
        spread = 1.645 * sqrt(a * b / ((a + b) ** 2 * (a + b + 1)))
        return mean, max(0.0, mean - spread), min(1.0, mean + spread)

    @staticmethod
    def score(pairs: list[tuple[float, int]], bins: int = 5) -> dict:
        """Brier score and expected calibration error of (confidence, outcome)."""
        if not pairs:
            return {"n": 0, "brier": None, "ece": None, "bins": []}
        brier = sum((p - y) ** 2 for p, y in pairs) / len(pairs)
        table, ece = [], 0.0
        for index in range(bins):
            low, high = index / bins, (index + 1) / bins
            group = [(p, y) for p, y in pairs
                     if low <= p < high or (index == bins - 1 and p == 1.0)]
            if not group:
                continue
            confidence = sum(p for p, _ in group) / len(group)
            observed = sum(y for _, y in group) / len(group)
            ece += len(group) / len(pairs) * abs(confidence - observed)
            table.append({"range": [low, high], "n": len(group),
                          "mean_confidence": round(confidence, 4),
                          "observed_reliability": round(observed, 4)})
        return {"n": len(pairs), "brier": round(brier, 4), "ece": round(ece, 4),
                "bins": table}


class IntuitionMemory:
    """Append-only, versioned, reversible store of verified strategy outcomes.

    One record = one decision whose delayed outcome an independent verifier
    confirmed. Records are never edited; ``rollback`` moves the active pointer
    and ``frozen`` forbids learning (used for validation).
    """

    def __init__(self, scope: str, config: RouterConfig | None = None):
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", scope):
            raise ValueError("Invalid memory scope")
        self.scope, self.config = scope, config or RouterConfig()
        self._records: list[dict] = []
        self._active = 0
        self.frozen = False
        self._index: dict | None = None

    # -- writing ---------------------------------------------------------
    def append(self, record: dict) -> int:
        if self.frozen:
            raise PermissionError("Frozen intuition memory cannot learn")
        if record.get("scope") != self.scope:
            raise PermissionError("Cross-scope strategy memory write denied")
        if record.get("verified") is not True or record.get("outcome") not in (0, 1):
            raise ValueError("Only independently verified binary outcomes are stored")
        context = StrategicContext(record["action"], tuple(record["tokens"]),
                                   tuple(record["core_tokens"]))
        clean = {
            "scope": self.scope, "action": context.action,
            "tokens": list(context.tokens), "core_tokens": list(context.core_tokens),
            "outcome": int(record["outcome"]), "verified": True,
            "episode": int(record["episode"]), "route": str(record["route"]),
            "expected": round(float(record["expected"]), 4),
            "confounders": sorted(str(c) for c in record.get("confounders", ())),
            "alternative_explanations": list(record.get("alternative_explanations", ())),
            "evidence_ref": str(record["evidence_ref"]),
        }
        del self._records[self._active:]     # a rolled-back future is discarded
        self._records.append(clean)
        self._active = len(self._records)
        self._index = None
        return self._active

    def rollback(self, version: int) -> None:
        if self.frozen or not 0 <= version <= len(self._records):
            raise ValueError("Invalid rollback target")
        self._active, self._index = version, None

    @property
    def version(self) -> int:
        return self._active

    def records(self) -> list[dict]:
        return [dict(r) for r in self._records[:self._active]]

    def digest(self) -> str:
        return _digest(self._records[:self._active])

    def to_json(self) -> dict:
        return {"schema": "AsilIntuitionMemory/1", "scope": self.scope,
                "version": self._active, "records": self.records()}

    @classmethod
    def from_json(cls, payload: dict, config: RouterConfig | None = None):
        if payload.get("schema") != "AsilIntuitionMemory/1":
            raise ValueError("Unsupported intuition memory")
        memory = cls(payload["scope"], config)
        for record in payload["records"]:
            memory.append(record)
        return memory

    # -- reading ---------------------------------------------------------
    def _build(self) -> dict:
        index: dict[str, list[dict]] = {}
        for record in self._records[:self._active]:
            context = StrategicContext(record["action"], tuple(record["tokens"]),
                                       tuple(record["core_tokens"]))
            index.setdefault(context.key, []).append(record)
            index.setdefault(context.core_key, []).append(record)
        return index

    def recall(self, context: StrategicContext, episode: int) -> Recall:
        if self._index is None:
            self._index = self._build()
        config = self.config
        rows, match, discount = self._index.get(context.key), "exact", 1.0
        if not rows:
            rows, match = self._index.get(context.core_key), "partial"
            discount = config.partial_match_discount
        if not rows:
            return Recall(0.0, 0.5, 0.0, 1.0, "none", False, ())
        wins = losses = 0.0
        for row in rows:
            age = max(0, episode - row["episode"])
            weight = discount * 0.5 ** (age / config.half_life_episodes)
            if row["confounders"]:
                weight *= config.confounded_weight
            if row["outcome"]:
                wins += weight
            else:
                losses += weight
        mean, lower, upper = ConfidenceCalibrator.estimate(wins, losses)
        recent = rows[-config.contradiction_window:]
        contradicted = (len(rows) >= 2 * config.contradiction_window and abs(
            sum(r["outcome"] for r in recent) / len(recent)
            - sum(r["outcome"] for r in rows) / len(rows)) >= config.contradiction_gap)
        return Recall(round(wins + losses, 4), round(mean, 4), round(lower, 4),
                      round(upper, 4), match, contradicted,
                      tuple(r["evidence_ref"] for r in rows[-3:]))


@dataclass
class Option:
    """One admissible, already validated review-only option."""

    identifier: str
    context: StrategicContext
    stake: float          # share of liquid resources irreversibly committed (0–1)
    reversible: bool
    priority: float       # domain tie-break among equally trusted options
    recall: Recall | None = None


@dataclass
class Routing:
    route: str
    selected: str | None
    confidence: float
    reason: str
    considered: list[dict] = field(default_factory=list)


class MetacognitiveRouter:
    """Decides whether experience is good enough, or investigation is worth it."""

    def __init__(self, config: RouterConfig, *, allow_fast=True, allow_deep=True):
        self.config, self.allow_fast, self.allow_deep = config, allow_fast, allow_deep

    def route(self, options: list[Option], memory: IntuitionMemory | None, episode: int,
              deep_budget_left: int) -> Routing:
        config = self.config
        if not options:
            return Routing(REFLEX, None, 1.0, "no admissible action besides waiting")
        trusted, vetoed, uncertain, considered = [], [], [], []
        for option in options:
            recall = (memory.recall(option.context, episode) if memory is not None
                      and self.allow_fast else Recall(0.0, 0.5, 0.0, 1.0, "none", False, ()))
            option.recall = recall
            needed = (config.high_stakes_lower_bound if option.stake >= config.high_stakes
                      or not option.reversible else config.trust_lower_bound)
            enough = recall.support >= config.min_support and not recall.contradicted
            # A partial (similar-looking) match may veto, never authorise:
            # resemblance alone is not evidence that a strategy applies.
            if enough and recall.match == "exact" and recall.lower >= needed:
                state = "trusted"
                trusted.append(option)
            elif enough and recall.upper <= config.veto_upper_bound:
                state = "vetoed"
                vetoed.append(option)
            else:
                state = "uncertain"
                uncertain.append(option)
            considered.append({
                "option": option.identifier, "state": state, "match": recall.match,
                "support": recall.support, "reliability": recall.mean,
                "lower": recall.lower, "contradicted": recall.contradicted,
                "stake": round(option.stake, 4)})
        # Expected value of investigating: what is at risk on options memory
        # cannot vouch for, against the cost of one bounded investigation.
        at_risk = sum(max(o.stake, 0.05) * (1 - (o.recall.lower if o.recall else 0.0))
                      for o in uncertain)
        worth_it = at_risk * 100 >= config.deep_cost_units
        can_deep = self.allow_deep and deep_budget_left > 0
        if trusted and not (uncertain and worth_it and can_deep and any(
                o.stake >= config.high_stakes for o in uncertain)):
            best = max(trusted, key=lambda o: (o.priority, o.recall.lower, o.identifier))
            return Routing(FAST, best.identifier, best.recall.mean,
                           "verified experience supports this option", considered)
        if uncertain and can_deep:
            return Routing(DEEP, None, 0.5,
                           "unfamiliar, contradicted, stale or high-stakes context",
                           considered)
        if not uncertain and not trusted:
            return Routing(ABSTAIN, None, 1 - max(o.recall.upper for o in vetoed),
                           "experience says every available option fails here", considered)
        return Routing(ABSTAIN, None, 0.5,
                       "no reliable experience and no investigation budget", considered)


class CausalOutcomeVerifier:
    """Holds decisions open until a delayed outcome is independently confirmed."""

    def __init__(self):
        self.open: list[dict] = []

    def expect(self, *, subject: str, context: StrategicContext, route: str,
               expected: float, evidence_ref: str, tick: int) -> None:
        self.open.append({"subject": subject, "context": context, "route": route,
                          "expected": expected, "evidence_ref": evidence_ref,
                          "tick": tick, "confounders": set()})

    def note_confounder(self, subject: str, kind: str) -> None:
        for item in self.open:
            if item["subject"] == subject:
                item["confounders"].add(kind)

    def settle(self, verified_success: dict[str, bool]) -> list[dict]:
        """Close every open decision whose subject now has a verified outcome."""
        closed, remaining = [], []
        for item in self.open:
            if item["subject"] in verified_success:
                closed.append({**item, "outcome": int(verified_success[item["subject"]])})
            else:
                remaining.append(item)
        self.open = remaining
        return closed


class AdaptiveStrategyLearner:
    """Writes verified outcomes into memory, keeping failures and doubts."""

    def __init__(self, memory: IntuitionMemory | None):
        self.memory = memory
        self.calibration: list[dict] = []

    def learn(self, settled: list[dict], episode: int) -> int:
        written = 0
        for item in settled:
            self.calibration.append({
                "route": item["route"], "confidence": item["expected"],
                "outcome": item["outcome"], "action": item["context"].action})
            if self.memory is None or self.memory.frozen:
                continue
            confounders = sorted(item["confounders"])
            alternatives = [f"outcome may be due to external event: {kind}"
                            for kind in confounders]
            if item["outcome"] and not confounders:
                alternatives.append("success may reflect an easy episode, not the strategy")
            self.memory.append({
                "scope": self.memory.scope, "action": item["context"].action,
                "tokens": item["context"].tokens,
                "core_tokens": item["context"].core_tokens,
                "outcome": item["outcome"], "verified": True, "episode": episode,
                "route": item["route"], "expected": item["expected"],
                "confounders": confounders, "alternative_explanations": alternatives,
                "evidence_ref": item["evidence_ref"]})
            written += 1
        return written
