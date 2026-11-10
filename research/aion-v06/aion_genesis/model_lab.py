"""Model-agnostic, bounded LLM evaluation inside a wholly synthetic business world.

The model gets only public job data and causal evidence from its own prior
decisions. It never receives world parameters, alternate-policy outcomes, or
real company data. Calling a remote inference provider can incur charges; the
CLI defaults to a tiny, explicitly capped experiment.
"""

from collections import deque
from dataclasses import dataclass
import json
import math
import re
from statistics import mean
from typing import Protocol

from .tradeflow_lab import (
    AdaptiveRiskLearner, CostFirst, DriftAwareRiskLearner, StaticRiskRule,
    run_company,
)
from .worlds.tradeflow import Decision, Job, Result, TradeFlowWorld


class ChatModel(Protocol):
    def complete(self, messages: list[dict[str, str]]) -> str: ...


class InvalidModelResponse(ValueError):
    """Model output violated the strictly bounded simulation action contract."""


def parse_decision(raw: str) -> tuple[Decision, float, float, str]:
    """Accept one JSON object, with optional Qwen think block or code fence."""
    if not isinstance(raw, str) or len(raw) > 16_000:
        raise InvalidModelResponse("response must be bounded text")
    value = re.sub(r"\A\s*<think>.*?</think>\s*", "", raw.strip(), flags=re.S)
    fenced = re.fullmatch(r"```(?:json)?\s*([\s\S]*?)\s*```", value, re.I)
    if fenced:
        value = fenced.group(1)
    try:
        data = json.loads(value, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, TypeError) as exc:
        raise InvalidModelResponse("response was not valid standalone JSON") from exc
    if not isinstance(data, dict):
        raise InvalidModelResponse("response must be a JSON object")
    try:
        action = Decision(data["supplier"], data["reserve_crew"])
        material, crew = data["predicted_material_delay"], data["predicted_crew_delay"]
        hypothesis = data["hypothesis"]
    except (KeyError, ValueError, TypeError) as exc:
        raise InvalidModelResponse("missing or unsupported decision fields") from exc
    if any(type(v) not in (float, int) or not math.isfinite(v) or not 0 <= v <= 1
           for v in (material, crew)):
        raise InvalidModelResponse("predicted delays must be probabilities in [0,1]")
    if not isinstance(hypothesis, str) or len(hypothesis) > 320:
        raise InvalidModelResponse("hypothesis must be a short string")
    return action, float(material), float(crew), hypothesis


class ModelDecisionAgent:
    """Bounded short-term episode recall plus transparent long-term counts.

    These counts are operational memory, not model-weight training and not
    causal identification by themselves. A fresh agent is used per company.
    """

    name = "model_agent"

    SYSTEM = (
        "You are an experimental decision policy INSIDE A FICTIONAL electrical "
        "contractor simulation. Choose ONLY one supplier (economy or priority) "
        "and whether to reserve a crew (true/false). No tool use, no external "
        "actions, no customer communications. Infer useful patterns only from "
        "provided observations. Supplier conditions may change. Observation "
        "is not proof of causation; mark uncertainty in your hypothesis. "
        "Reply ONLY as one JSON object with fields: supplier, reserve_crew, "
        "predicted_material_delay, predicted_crew_delay, hypothesis. Both "
        "predictions must be numbers between 0 and 1 and refer to your "
        "chosen action. hypothesis is a short sentence."
    )

    def __init__(self, adapter: ChatModel, recent_window: int = 8,
                 use_memory: bool = True):
        if not 1 <= recent_window <= 30:
            raise ValueError("recent_window must be 1–30")
        self.adapter = adapter
        self.use_memory = use_memory
        self.recent = deque(maxlen=recent_window)
        self.material = {"economy": [0, 0], "priority": [0, 0]}
        self.crew = {f"{int(high)}:{int(reserve)}": [0, 0]
                     for high in (False, True) for reserve in (False, True)}
        self.latest_hypothesis = "No evidence yet; both supplier and crew effects are uncertain."
        self.last_prediction: tuple[float, float] | None = None
        self.calls = 0

    def _prompt(self, job: Job) -> str:
        # Job index and history are observable, but hidden probabilities and
        # regime-change timings are not. No alternate-action outcomes leak.
        public = {
            "job": {
                "index": job.index, "urgent": job.urgent,
                "high_crew_load": job.high_crew_load,
                "material_units": job.material_units,
                "quoted_revenue_cents": job.quoted_revenue,
            },
            "known_costs_cents": {
                "economy_per_material_unit": 12000,
                "priority_per_material_unit": 16500,
                "crew_reservation": 8500,
                "late_penalty_urgent": 45000,
                "late_penalty_nonurgent": 20000,
            },
            "long_term_observation_counts": {
                "material_by_supplier": self.material,
                "crew_by_high_load_and_reserved": self.crew,
                "format": "[observed_jobs, delayed_jobs]",
            } if self.use_memory else None,
            "recent_outcomes": list(self.recent) if self.use_memory else [],
            "previous_hypothesis_unverified": self.latest_hypothesis
            if self.use_memory else None,
            "task": "Choose action and predict both component delays; update your hypothesis.",
        }
        return json.dumps(public, sort_keys=True, separators=(",", ":"))

    def choose(self, job: Job) -> Decision:
        response = self.adapter.complete([
            {"role": "system", "content": self.SYSTEM},
            {"role": "user", "content": self._prompt(job)},
        ])
        decision, material, crew, hypothesis = parse_decision(response)
        self.latest_hypothesis = hypothesis
        self.last_prediction = (material, crew)
        self.calls += 1
        return decision

    def observe(self, job: Job, decision: Decision, outcome: Result):
        if self.last_prediction is None:
            raise RuntimeError("cannot observe without a model prediction")
        m = self.material[decision.supplier]
        m[0] += 1
        m[1] += int(outcome.material_delayed)
        c = self.crew[f"{int(job.high_crew_load)}:{int(decision.reserve_crew)}"]
        c[0] += 1
        c[1] += int(outcome.crew_delayed)
        self.recent.append({
            "job_index": job.index,
            "urgent": job.urgent,
            "high_crew_load": job.high_crew_load,
            "supplier": decision.supplier,
            "reserve_crew": decision.reserve_crew,
            "material_delayed": outcome.material_delayed,
            "crew_delayed": outcome.crew_delayed,
            "net_contribution_cents": outcome.net_contribution,
        })


@dataclass(frozen=True)
class ModelEpisode:
    seed: int
    jobs: int
    net_contribution: int
    after_shift_contribution: int
    ontime_rate: float
    material_brier: float
    crew_brier: float
    calls: int
    trace: list[dict]

    def summary(self):
        return {k: getattr(self, k) for k in (
            "seed", "jobs", "net_contribution", "after_shift_contribution",
            "ontime_rate", "material_brier", "crew_brier", "calls",
        )}


def run_model_episode(seed: int, agent: ModelDecisionAgent, jobs: int = 20,
                      shift_at: int = 8) -> ModelEpisode:
    if not 5 <= jobs <= 80 or not 0 < shift_at < jobs:
        raise ValueError("model experiment must fit the bounded synthetic world")
    world = TradeFlowWorld(seed, jobs=jobs, shift_at=shift_at)
    trace = []
    for job in world.jobs():
        decision = agent.choose(job)  # Failure is fatal: no silent fallback or paid retries.
        prediction = agent.last_prediction
        if prediction is None:
            raise RuntimeError("model did not provide prediction")
        outcome = world.execute(job, decision)
        trace.append({
            "job_index": job.index, "supplier": decision.supplier,
            "reserve_crew": decision.reserve_crew,
            "predicted_material_delay": prediction[0],
            "predicted_crew_delay": prediction[1],
            "material_delayed": outcome.material_delayed,
            "crew_delayed": outcome.crew_delayed,
            "late": outcome.late, "net_contribution_cents": outcome.net_contribution,
            "hypothesis": agent.latest_hypothesis,
        })
        agent.observe(job, decision, outcome)
    return ModelEpisode(
        seed=seed, jobs=jobs,
        net_contribution=sum(x["net_contribution_cents"] for x in trace),
        after_shift_contribution=sum(x["net_contribution_cents"] for x in trace[shift_at:]),
        ontime_rate=mean(not x["late"] for x in trace),
        material_brier=mean((x["predicted_material_delay"] - x["material_delayed"])**2
                            for x in trace),
        crew_brier=mean((x["predicted_crew_delay"] - x["crew_delayed"])**2
                        for x in trace),
        calls=agent.calls, trace=trace,
    )


def benchmark_model(adapter: ChatModel, model_name: str, *, start_seed: int = 300,
                    companies: int = 1, jobs: int = 20, shift_at: int = 8,
                    max_calls: int = 40, fixture: bool = False,
                    ablate_memory: bool = False) -> dict:
    if not 1 <= companies <= 5 or not 5 <= jobs <= 80 or not 0 < shift_at < jobs:
        raise ValueError("out-of-range model experiment")
    total_calls = companies * jobs * (2 if ablate_memory else 1)
    if not 1 <= max_calls <= 200 or total_calls > max_calls:
        raise ValueError("max_calls is an explicit upper bound; reduce cohort or increase cap")
    episodes = [run_model_episode(seed, ModelDecisionAgent(adapter), jobs, shift_at)
                for seed in range(start_seed, start_seed + companies)]
    control_episodes = (
        [run_model_episode(seed, ModelDecisionAgent(adapter, use_memory=False), jobs, shift_at)
         for seed in range(start_seed, start_seed + companies)]
        if ablate_memory else None
    )
    base_factories = (CostFirst, StaticRiskRule, AdaptiveRiskLearner, DriftAwareRiskLearner)
    baseline = {factory.name: [run_company(s, factory(), jobs, shift_at)
                               for s in range(start_seed, start_seed + companies)]
                for factory in base_factories}
    report = {
        "version": "0.5.0",
        "protocol": "tradeflow_model_prompt_v1",
        "model": model_name,
        "inference_kind": "DETERMINISTIC_FIXTURE_NOT_AN_LLM" if fixture else "configured_chat_endpoint",
        "cohort": {"start_seed": start_seed, "companies": companies,
                   "jobs_per_company": jobs, "shift_at": shift_at,
                   "inference_calls": total_calls, "max_calls": max_calls,
                   "memory_ablation_enabled": ablate_memory},
        "model_policy": {
            "mean_net_contribution_cents": round(mean(e.net_contribution for e in episodes), 2),
            "mean_after_shift_contribution_cents": round(mean(
                e.after_shift_contribution for e in episodes), 2),
            "mean_ontime_rate": round(mean(e.ontime_rate for e in episodes), 4),
            "material_brier_lower_is_better": round(mean(e.material_brier for e in episodes), 4),
            "crew_brier_lower_is_better": round(mean(e.crew_brier for e in episodes), 4),
        },
        "model_episode_summaries": [e.summary() for e in episodes],
        "baselines": {name: {
            "mean_net_contribution_cents": round(mean(r.net_contribution for r in runs), 2),
            "mean_after_shift_contribution_cents": round(mean(
                r.after_shift_contribution for r in runs), 2),
            "mean_ontime_rate": round(mean(r.ontime_rate for r in runs), 4),
        } for name, runs in baseline.items()},
        "first_episode_trace": episodes[0].trace,
        "controls": {
            "synthetic_only": True, "same_jobs_and_shocks": True,
            "hidden_world_rules_withheld": True, "real_business_actions": False,
            "model_weights_modified": False, "cross_company_memory": False,
            "performance_improvement_established": False,
        },
        "limitations": [
            "Operational memory is in the prompt, not neural weight updates",
            "Observational feedback does not prove causal understanding",
            "Tiny bounded pilot is not a statistically powered model comparison",
            "The deterministic fixture validates wiring only, never model intelligence" if fixture
            else "Real inference reliability and cost depend on the configured model endpoint",
        ],
    }
    if control_episodes is not None:
        report["no_memory_control"] = {
            "mean_net_contribution_cents": round(mean(
                e.net_contribution for e in control_episodes), 2),
            "mean_ontime_rate": round(mean(e.ontime_rate for e in control_episodes), 4),
            "material_brier_lower_is_better": round(mean(
                e.material_brier for e in control_episodes), 4),
            "crew_brier_lower_is_better": round(mean(e.crew_brier for e in control_episodes), 4),
            "paired_contribution_deltas_cents": [
                e.net_contribution - c.net_contribution
                for e, c in zip(episodes, control_episodes)
            ],
            "interpretation": "Paired ablation of observation memory; not causal proof of intelligence",
        }
    return report


class FixtureChatModel:
    """Purely mechanical parser fixture, not evidence of AI or learned behavior."""

    def complete(self, messages: list[dict[str, str]]) -> str:
        if messages[0]["content"].startswith("Reply exactly AION_OK"):
            return "AION_OK"
        public = json.loads(messages[-1]["content"])["job"]
        return json.dumps({
            "supplier": "priority" if public["urgent"] else "economy",
            "reserve_crew": bool(public["urgent"] and public["high_crew_load"]),
            "predicted_material_delay": 0.15,
            "predicted_crew_delay": 0.25,
            "hypothesis": "Fixture rule; does not infer from prior observations.",
        })


class CostFirstFixtureModel:
    """Second non-AI fixture, deliberately choosing the cheap baseline."""

    def complete(self, messages: list[dict[str, str]]) -> str:
        if messages[0]["content"].startswith("Reply exactly AION_OK"):
            return "AION_OK"
        return json.dumps({
            "supplier": "economy", "reserve_crew": False,
            "predicted_material_delay": 0.15,
            "predicted_crew_delay": 0.25,
            "hypothesis": "Constant fixture decision; observations are ignored.",
        })
