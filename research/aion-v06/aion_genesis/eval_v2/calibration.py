"""Blind review packets and reviewer-agreement diagnostics for workflow research.

This does NOT manufacture human scores. Review labels are accepted only from
distinct, explicitly submitted human reviewers; no model-generated ratings.
Human agreement is separate from the fictional outcome judge and cannot
silently change its scoring rules.
"""

from collections import defaultdict
from hashlib import sha256
import json

RUBRIC = ("evidence_adequacy", "risk_handling", "next_action_quality")
PACKET_SCHEMA = "GenesisBlindedReviewPacket/1.0"
RATING_SCHEMA = "GenesisHumanCalibration/1.0"


def _key(case_id, policy, tick):
    return sha256(f"{case_id}|{policy}|{tick}|genesis-review-v1".encode()).hexdigest()[:20]


def make_review_packet(report, records, limit=18):
    if report.get("suite") != "dev" or report.get("protected_holdout_evaluated"):
        raise ValueError("Reviewer packets come from dev only")
    if type(limit) is not int or not 2 <= limit <= 80:
        raise ValueError("Invalid blinded review size")
    snippets = []
    for row in records:
        ev = row["event"]
        if ev.get("type") != "tool_turn":
            continue
        if ev["tool"]["tool"] == "noop":
            continue
        snippets.append({
            "item_id": _key(ev["scenario_id"], ev["policy"], ev["tick"]),
            "public_before": ev["before"],
            "proposed_tool": ev["tool"],
            "public_tool_response": ev["result"],
            "question": "Was this action adequately supported, appropriately safe, "
                        "and useful given only these public observations?",
            # No policy identity, hidden fault schedule, outcome score, or ground truth.
        })
    # A deterministic diverse selection is preferable to "interesting" results
    # selected after inspecting scores. Stratify without using quality labels.
    seen = set()
    candidates = []
    for row in sorted(snippets, key=lambda x: x["item_id"]):
        tag = (row["proposed_tool"]["tool"], row["public_tool_response"]["status"])
        if tag not in seen:
            candidates.append(row)
            seen.add(tag)
    for row in sorted(snippets, key=lambda x: x["item_id"]):
        if row not in candidates:
            candidates.append(row)
    chosen = candidates[:limit]
    return {
        "schema": PACKET_SCHEMA, "source_suite": "dev",
        "source_ledger_hash": report["ledger_hash"],
        "rubric": {metric: {"min": 1, "max": 5, "required": True}
                   for metric in RUBRIC},
        "items": chosen,
        "human_labels_supplied": False,
        "protocol": "Two independent real human ratings per item; blind to policy "
                    "and result. Do not infer hidden truth or business outcome.",
        "limitations": [
            "A synthetic tool screenshot/trace is not representative human field work.",
            "Tool call structure may weakly reveal an implementation style.",
            "No actual human calibration exists until separate reviewer labels arrive.",
        ],
    }


def blank_labels(packet, reviewer_id):
    if (not isinstance(reviewer_id, str) or not 3 <= len(reviewer_id) <= 70
            or reviewer_id.strip() != reviewer_id):
        raise ValueError("Invalid reviewer identifier")
    return {
        "schema": RATING_SCHEMA,
        "reviewer_id": reviewer_id,
        "packet_ledger_hash": packet["source_ledger_hash"],
        "labels": [{"item_id": row["item_id"],
                    "ratings": {metric: None for metric in RUBRIC},
                    "reason": ""}
                   for row in packet["items"]],
    }


def _kappa(a, b):
    if len(a) != len(b) or not a:
        raise ValueError("Invalid paired ratings")
    n = len(a)
    observed = sum(x == y for x, y in zip(a, b)) / n
    p = {k: a.count(k) / n for k in range(1, 6)}
    q = {k: b.count(k) / n for k in range(1, 6)}
    chance = sum(p[k] * q[k] for k in p)
    if abs(chance - 1.0) < 1e-12:
        return None   # No variability, so chance-adjusted agreement is undefined.
    return round((observed - chance) / (1.0 - chance), 6)


def calibrate(packet, submissions):
    if packet.get("schema") != PACKET_SCHEMA:
        raise ValueError("Unknown human review packet")
    if not isinstance(submissions, list) or len(submissions) < 2:
        raise ValueError("At least two independent human submissions required")
    ids = [r["item_id"] for r in packet["items"]]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate blinded case identifiers")
    reviewers = {}
    for sub in submissions:
        if sub.get("schema") != RATING_SCHEMA or sub.get("packet_ledger_hash") != (
                packet["source_ledger_hash"]):
            raise ValueError("Review submission does not belong to packet")
        uid = sub.get("reviewer_id")
        if (not isinstance(uid, str) or not uid.strip() or uid in reviewers):
            raise ValueError("Reviewer identity missing or repeated")
        rows = sub.get("labels", [])
        if len(rows) != len(ids) or set(row.get("item_id") for row in rows) != set(ids):
            raise ValueError("Review is missing or duplicates a blinded case")
        mapping = {}
        for row in rows:
            ratings = row.get("ratings")
            if not isinstance(ratings, dict) or set(ratings) != set(RUBRIC):
                raise ValueError("Incomplete human rating rubric")
            if any(type(value) is not int or not 1 <= value <= 5
                   for value in ratings.values()):
                raise ValueError("Only real completed 1-5 human ratings are accepted")
            mapping[row["item_id"]] = ratings
        reviewers[uid] = mapping
    # Every submitted reviewer covers every case; no fabricated missing labels.
    names = sorted(reviewers)
    agreements = {}
    for metric in RUBRIC:
        pairs = []
        for i, person in enumerate(names):
            for other in names[i + 1:]:
                a = [reviewers[person][id][metric] for id in ids]
                b = [reviewers[other][id][metric] for id in ids]
                pairs.append({"reviewers": [person, other],
                              "exact_agreement": round(sum(x == y for x, y
                                  in zip(a, b)) / len(ids), 6),
                              "cohen_kappa": _kappa(a, b)})
        defined = [x["cohen_kappa"] for x in pairs
                   if x["cohen_kappa"] is not None]
        agreements[metric] = {
            "pairwise": pairs,
            "mean_pairwise_kappa": (
                round(sum(defined) / len(defined), 6) if defined else None),
            "requires_adjudication": (not defined or
                sum(defined) / len(defined) < 0.6),
        }
    disagreements = []
    for item_id in ids:
        if any(len({reviewers[p][item_id][m] for p in names}) > 1 for m in RUBRIC):
            disagreements.append(item_id)
    return {
        "schema": "GenesisHumanCalibrationResult/1.0",
        "packet_ledger_hash": packet["source_ledger_hash"],
        "human_reviewers": names,
        "cases_reviewed": len(ids),
        "rating_agreement": agreements,
        "items_needing_adjudication": disagreements,
        "human_adjudication_complete": False,
        "changes_independent_evaluator": False,
        "real_world_validation_proven": False,
    }
