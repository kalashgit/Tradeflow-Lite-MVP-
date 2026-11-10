"""Fail-closed contract for an EXTERNALLY custodial protected holdout.

A protected benchmark must not be packaged into a public development
repository or run on pull-request workers that candidate authors control.
This module can register a REQUEST, never access protected seed/truth/data.
Actual custody, access control and blinded result release must be configured
in an independent deployment. That infrastructure is NOT in place here.
"""

from hashlib import sha256
import json
import re


_SHA = re.compile(r"^[0-9a-f]{40}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def create_request(candidate_sha, protocol_hash, reviewer_group, *,
                   purpose="release_readiness"):
    if not isinstance(candidate_sha, str) or _SHA.fullmatch(candidate_sha) is None:
        raise ValueError("Candidate must be pinned to an exact Git SHA")
    if not isinstance(protocol_hash, str) or _DIGEST.fullmatch(protocol_hash) is None:
        raise ValueError("Research protocol must be pinned by a SHA256 hash")
    if (not isinstance(reviewer_group, str) or
            not 3 <= len(reviewer_group) <= 80):
        raise ValueError("An independent reviewer group is required")
    if purpose not in ("release_readiness", "independent_scientific_review"):
        raise ValueError("Unsupported holdout request purpose")
    body = {"schema": "GenesisExternalHoldoutRequest/1.0",
            "candidate_sha": candidate_sha, "protocol_hash": protocol_hash,
            "reviewer_group": reviewer_group, "purpose": purpose,
            "stage": "REQUEST_NOT_APPROVAL", "execution_allowed": False,
            "protected_seeds_in_repo": False,
            "independent_custodian_configured": False,
            "result_visibility": "none"}
    body["request_digest"] = sha256(json.dumps(
        body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return body


def run_protected_holdout(*args, **kwargs):
    raise PermissionError(
        "No protected holdout executor is available in development. "
        "An independent custodian must authorize and execute a sealed, "
        "single-use evaluation outside this public repository.")
