"""Versioned, capped, reproducible model tournament for AION's synthetic world.

An endpoint that cannot complete a real preflight remains unverified. Fixtures
exercise the same wiring but are explicitly NOT language-model inference.
No customer data, internet search, purchases, scheduling, or external actions.
"""

from dataclasses import dataclass
from hashlib import sha256
import json
import os
import re
from time import perf_counter
from typing import Any

from .model_compare import compare_model_reports
from .model_lab import CostFirstFixtureModel, FixtureChatModel, benchmark_model
from .provider import CompatibleChatAdapter, InferenceConfig


class TournamentConfigurationError(ValueError):
    pass


class ResearchBudgetExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class Candidate:
    identifier: str
    kind: str
    base_url_env: str | None = None
    model_env: str | None = None
    api_key_env: str | None = None
    max_completion_tokens: int = 350
    timeout_seconds: int = 30

    def __post_init__(self):
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}", self.identifier):
            raise TournamentConfigurationError("candidate ID must be short and alphanumeric")
        if self.kind not in ("compatible", "fixture_static", "fixture_cost_first"):
            raise TournamentConfigurationError("unsupported candidate kind")
        for field in ("base_url_env", "model_env", "api_key_env"):
            value = getattr(self, field)
            if value is not None and not re.fullmatch(r"[A-Z][A-Z0-9_]*", value):
                raise TournamentConfigurationError("credential references must be environment names")
        if self.kind == "compatible" and not (self.base_url_env and self.model_env):
            raise TournamentConfigurationError("live candidates require endpoint/model env names")
        if not 32 <= self.max_completion_tokens <= 4096 or not 1 <= self.timeout_seconds <= 180:
            raise TournamentConfigurationError("invalid completion or request time bounds")


def parse_candidates(config: dict, mode: str) -> list[Candidate]:
    if mode not in ("live", "fixture"):
        raise TournamentConfigurationError("tournament mode must be explicit")
    if not isinstance(config, dict) or config.get("schema") != 1:
        raise TournamentConfigurationError("candidate manifest must use schema 1")
    raw = config.get("candidates")
    if not isinstance(raw, list) or not 2 <= len(raw) <= 6:
        raise TournamentConfigurationError("tournament needs 2–6 candidates")
    result = []
    for item in raw:
        if not isinstance(item, dict):
            raise TournamentConfigurationError("invalid candidate entry")
        # Never accept raw API keys or passwords in configuration files.
        allowed = {"id", "kind", "base_url_env", "model_env", "api_key_env",
                   "max_completion_tokens", "timeout_seconds"}
        if set(item) - allowed:
            raise TournamentConfigurationError("unsupported or secret-bearing manifest key")
        try:
            candidate = Candidate(
                identifier=item["id"], kind=item["kind"],
                base_url_env=item.get("base_url_env"), model_env=item.get("model_env"),
                api_key_env=item.get("api_key_env"),
                max_completion_tokens=item.get("max_completion_tokens", 350),
                timeout_seconds=item.get("timeout_seconds", 30),
            )
        except (KeyError, TypeError) as exc:
            raise TournamentConfigurationError("invalid candidate manifest fields") from exc
        if (mode == "live") != (candidate.kind == "compatible"):
            raise TournamentConfigurationError("cannot mix live models with fixtures")
        result.append(candidate)
    if len({c.identifier for c in result}) != len(result):
        raise TournamentConfigurationError("candidate identifiers must be unique")
    return result


def resolve_candidate(candidate: Candidate):
    if candidate.kind == "fixture_static":
        return FixtureChatModel(), "deterministic_static_fixture"
    if candidate.kind == "fixture_cost_first":
        return CostFirstFixtureModel(), "deterministic_cost_first_fixture"
    # No implicit localhost fallback: a missing model endpoint should fail
    # before ANY remote (possibly billed) call occurs.
    base_url = os.getenv(candidate.base_url_env)
    model = os.getenv(candidate.model_env)
    if not base_url or not model:
        raise TournamentConfigurationError(
            f"candidate {candidate.identifier} has no configured endpoint/model")
    key = os.getenv(candidate.api_key_env) if candidate.api_key_env else None
    configuration = InferenceConfig(base_url=base_url, model=model,
                                    api_key=key, timeout_seconds=candidate.timeout_seconds,
                                    max_completion_tokens=candidate.max_completion_tokens)
    return CompatibleChatAdapter(configuration), model


class MeteredAdapter:
    """Global budgets count attempted calls, including failed calls and preflight."""

    def __init__(self, delegate, ledger: dict, max_total_calls: int, deadline: float):
        self.delegate = delegate
        self.ledger = ledger
        self.max_total_calls = max_total_calls
        self.deadline = deadline
        self.calls = 0
        self.elapsed_seconds = 0.0

    def complete(self, messages: list[dict[str, str]]) -> str:
        if self.ledger["attempted_calls"] >= self.max_total_calls or perf_counter() >= self.deadline:
            raise ResearchBudgetExceeded("experiment time/call budget exhausted")
        self.ledger["attempted_calls"] += 1
        self.calls += 1
        started = perf_counter()
        try:
            return self.delegate.complete(messages)
        finally:
            self.elapsed_seconds += perf_counter() - started


def _preflight(adapter: MeteredAdapter) -> None:
    answer = adapter.complete([
        {"role": "system", "content": "Reply exactly AION_OK. No explanation."},
        {"role": "user", "content": "Check deterministic model connectivity."},
    ])
    # Reasoning-tag outputs may be exposed by Qwen-compatible endpoints.
    if "</think>" in answer:
        answer = answer.rsplit("</think>", 1)[1]
    if answer.strip() != "AION_OK":
        raise RuntimeError("preflight instruction check failed")


def _validate_plan(candidates: list[Candidate], *, jobs: int, shift_at: int,
                   pilot_seed: int, pilot_companies: int, holdout_seed: int,
                   holdout_companies: int, ablate_memory: bool,
                   max_total_calls: int, max_wall_seconds: int):
    if not 5 <= jobs <= 80 or not 0 < shift_at < jobs:
        raise TournamentConfigurationError("invalid job count or hidden shift timing")
    if not 1 <= pilot_companies <= 5 or not 1 <= holdout_companies <= 5:
        raise TournamentConfigurationError("each cohort must contain 1–5 companies")
    if max(pilot_seed, holdout_seed) < min(pilot_seed + pilot_companies,
                                          holdout_seed + holdout_companies):
        raise TournamentConfigurationError("pilot and holdout seed ranges must be disjoint")
    episode_calls = jobs * (2 if ablate_memory else 1)
    if episode_calls * max(pilot_companies, holdout_companies) > 200:
        raise TournamentConfigurationError("individual cohort exceeds 200-call safety limit")
    required = len(candidates) * (1 + episode_calls * (pilot_companies + holdout_companies))
    if not 1 <= max_total_calls <= 500 or required > max_total_calls:
        raise TournamentConfigurationError(f"plan requires {required} calls; max-total-calls too low")
    if not 10 <= max_wall_seconds <= 7200:
        raise TournamentConfigurationError("wall-time cap must be 10–7200 seconds")
    return required


def run_tournament(candidates: list[Candidate], mode: str, *,
                   pilot_seed: int = 300, pilot_companies: int = 1,
                   holdout_seed: int = 9000, holdout_companies: int = 1,
                   jobs: int = 8, shift_at: int = 3,
                   ablate_memory: bool = True, max_total_calls: int = 70,
                   max_wall_seconds: int = 600) -> dict[str, Any]:
    if mode not in ("live", "fixture") or len(candidates) < 2:
        raise TournamentConfigurationError("explicit mode and 2+ candidates required")
    if any((mode == "live") != (candidate.kind == "compatible") for candidate in candidates):
        raise TournamentConfigurationError("tournament mode must match every candidate kind")
    required = _validate_plan(candidates, jobs=jobs, shift_at=shift_at,
                              pilot_seed=pilot_seed, pilot_companies=pilot_companies,
                              holdout_seed=holdout_seed, holdout_companies=holdout_companies,
                              ablate_memory=ablate_memory, max_total_calls=max_total_calls,
                              max_wall_seconds=max_wall_seconds)
    plan = {
        "candidate_ids": [c.identifier for c in candidates],
        "mode": mode, "pilot_start_seed": pilot_seed,
        "pilot_companies": pilot_companies,
        "holdout_start_seed": holdout_seed,
        "holdout_companies": holdout_companies,
        "jobs": jobs, "shift_at": shift_at,
        "memory_ablation": ablate_memory,
        "prespecified_attempted_calls": required,
        "max_total_calls": max_total_calls,
        "max_wall_seconds": max_wall_seconds,
    }
    digest = sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    report = {
        "version": "0.6.0", "status": "pending",
        "protocol_sha256": digest, "plan": plan,
        "environment_status": "unverified", "attempted_calls": 0,
        "candidate_results": [], "failures": [],
        "automatic_model_promotion": False,
        "external_business_actions": False,
    }
    # Resolve EVERY candidate's configuration before any network activity.
    resolved = []
    try:
        for candidate in candidates:
            resolved.append((candidate, *resolve_candidate(candidate)))
    except (TournamentConfigurationError, ValueError) as exc:
        report["status"] = "blocked_configuration"
        report["failures"].append({"stage": "configuration", "error_type": type(exc).__name__,
                                   "message": str(exc)})
        return report

    report["resolved_models"] = {c.identifier: model for c, _, model in resolved}
    report["run_fingerprint_sha256"] = sha256(json.dumps({
        "plan": plan, "resolved_models": report["resolved_models"],
        "prompt_protocol": "tradeflow_model_prompt_v1",
    }, sort_keys=True).encode()).hexdigest()

    ledger = {"attempted_calls": 0}
    deadline = perf_counter() + max_wall_seconds
    for candidate, backend, resolved_model in resolved:
        adapter = MeteredAdapter(backend, ledger, max_total_calls, deadline)
        entry = {"id": candidate.identifier, "resolved_model": resolved_model,
                 "preflight": "pending", "pilot": None, "holdout": None}
        report["candidate_results"].append(entry)
        stage = "preflight"
        try:
            _preflight(adapter)
            entry["preflight"] = "passed"
            stage = "pilot"
            entry["pilot"] = benchmark_model(
                adapter, candidate.identifier, start_seed=pilot_seed,
                companies=pilot_companies, jobs=jobs, shift_at=shift_at,
                max_calls=pilot_companies * jobs * (2 if ablate_memory else 1),
                fixture=(mode == "fixture"), ablate_memory=ablate_memory,
            )
            stage = "holdout"
            entry["holdout"] = benchmark_model(
                adapter, candidate.identifier, start_seed=holdout_seed,
                companies=holdout_companies, jobs=jobs, shift_at=shift_at,
                max_calls=holdout_companies * jobs * (2 if ablate_memory else 1),
                fixture=(mode == "fixture"), ablate_memory=ablate_memory,
            )
        except (RuntimeError, ValueError, TimeoutError, OSError) as exc:
            # Preserve attempted-call counts without exposing model output,
            # credentials, or potentially sensitive endpoint error strings.
            report["failures"].append({"candidate": candidate.identifier,
                                       "stage": stage, "error_type": type(exc).__name__})
            entry["status"] = "failed"
        else:
            entry["status"] = "complete"
        entry["attempted_calls"] = adapter.calls
        entry["inference_seconds"] = round(adapter.elapsed_seconds, 4)

    report["attempted_calls"] = ledger["attempted_calls"]
    report["environment_status"] = (
        "fixture_transport_only" if mode == "fixture" else
        "endpoint_preflight_passed_all" if all(
            x["preflight"] == "passed" for x in report["candidate_results"]
        ) else "endpoint_preflight_incomplete"
    )
    if report["failures"]:
        report["status"] = "incomplete"
        return report
    report["pilot_comparison"] = compare_model_reports(
        [x["pilot"] for x in report["candidate_results"]], allow_fixture=(mode == "fixture"))
    report["holdout_comparison"] = compare_model_reports(
        [x["holdout"] for x in report["candidate_results"]], allow_fixture=(mode == "fixture"))
    report["status"] = "complete_fixture_wiring" if mode == "fixture" else "complete_endpoint_run"
    report["interpretation"] = (
        "Fixtures are scripted and are not evidence of learning or language-model capability"
        if mode == "fixture" else
        "Paired endpoint responses completed; actual model identity and broad learning improvement remain unproven"
    )
    return report
