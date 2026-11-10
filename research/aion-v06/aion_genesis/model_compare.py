"""Read-only paired comparison of model-evaluation reports.

This does not promote a 'winner': it tests that the candidates actually faced
the same fictional cohort and gives descriptive, paired differences only.
"""

from statistics import mean


def compare_model_reports(reports: list[dict], allow_fixture: bool = False) -> dict:
    if not 2 <= len(reports) <= 12:
        raise ValueError("Provide 2–12 model trial reports")
    reference = reports[0]
    keys = ("start_seed", "companies", "jobs_per_company", "shift_at", "memory_ablation_enabled")
    cohort = reference["cohort"]
    expected = tuple(cohort[k] for k in keys)
    expected_protocol = reference["protocol"]
    names = set()
    for report in reports:
        if report["version"] != "0.5.0" or report["protocol"] != expected_protocol:
            raise ValueError("Experiment and prompt protocols must match")
        if tuple(report["cohort"][k] for k in keys) != expected:
            raise ValueError("Candidate reports have different cohorts or memory conditions")
        if not (report["controls"]["synthetic_only"] and
                report["controls"]["same_jobs_and_shocks"] and
                report["controls"]["hidden_world_rules_withheld"]):
            raise ValueError("Insufficient evidence-isolation controls")
        if report["inference_kind"] != "configured_chat_endpoint" and not allow_fixture:
            raise ValueError("Fixture is not real model evidence")
        if report["model"] in names:
            raise ValueError("Use distinct model identifiers to compare candidates")
        names.add(report["model"])
        episodes = report["model_episode_summaries"]
        if len(episodes) != cohort["companies"] or [e["seed"] for e in episodes] != [
            e["seed"] for e in reference["model_episode_summaries"]
        ]:
            raise ValueError("Per-company paired evidence was missing or mismatched")
    rows = []
    champion = reference
    for report in reports:
        episodes = report["model_episode_summaries"]
        reference_episodes = champion["model_episode_summaries"]
        differences = [a["net_contribution"] - b["net_contribution"]
                       for a, b in zip(episodes, reference_episodes)]
        rows.append({
            "model": report["model"],
            "mean_net_contribution_cents": report["model_policy"]["mean_net_contribution_cents"],
            "mean_ontime_rate": report["model_policy"]["mean_ontime_rate"],
            "mean_material_brier": report["model_policy"]["material_brier_lower_is_better"],
            "mean_crew_brier": report["model_policy"]["crew_brier_lower_is_better"],
            "difference_from_first_model_per_company_cents": differences,
            "mean_difference_from_first_model_cents": round(mean(differences), 2),
            "paired_companies_better_than_first": sum(x > 0 for x in differences),
        })
    rows.sort(key=lambda r: r["mean_net_contribution_cents"], reverse=True)
    return {
        "protocol": expected_protocol,
        "cohort": {k: cohort[k] for k in keys},
        "ranking_is_descriptive_only": True,
        "automatic_model_promotion": False,
        "all_candidates_are_real_endpoints": all(
            r["inference_kind"] == "configured_chat_endpoint" for r in reports),
        "first_model": reference["model"],
        "candidates": rows,
        "warnings": [
            "Same seeds and prompt protocol are necessary, not sufficient, for fairness",
            "No statistical winner claimed from this small pilot",
            "Latency, token usage, hosting cost, model settings and independent holdout are not yet compared",
            "Fixture outcomes never count as evidence of language-model capabilities",
        ],
    }
