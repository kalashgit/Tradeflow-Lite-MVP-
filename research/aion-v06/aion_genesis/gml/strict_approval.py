"""Research-only strict approval resume, inspired by LangGraph 1.2.20.

This is a *host-side* checkpoint/resume gate, not model-weight learning or an
authorization grant. Every approval references one unique pending interrupt,
one exact typed action, one checkpoint, one scope and one state revision.
The model does not get to issue tickets, authenticate reviewers, or execute.

The caller MUST provide current host-authoritative time/revision and a
reviewer-authorizer backed by authenticated identity. This Python prototype
does not implement those external trust boundaries. The real executor MUST
recheck authorisation atomically at commit; `RiskGovernor` is only preflight.
"""

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Callable, Mapping

from ..asil_v26.safety import (
    ActionIntent, AuthorityEvidence, GuardDecision, RegimeAssessment, RiskGovernor,
)

_ID = re.compile(r"[A-Za-z0-9_.:-]{1,120}\Z")


def _name(value: str) -> str:
    if type(value) is not str or not _ID.fullmatch(value):
        raise ValueError("Invalid bounded approval identifier")
    return value


def _tick(value: int) -> int:
    if type(value) is not int or value < 0:
        raise ValueError("Invalid trusted timestamp or revision")
    return value


def action_fingerprint(intent: ActionIntent, tool_args: Mapping) -> str:
    """Bind the entire bounded action, including monetary/tool parameters."""
    if not isinstance(intent, ActionIntent) or type(tool_args) is not dict:
        raise TypeError("A typed action intent and literal tool arguments are required")
    try:
        blob = json.dumps({"intent": asdict(intent), "tool_args": tool_args},
                          sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise ValueError("Noncanonical tool arguments") from exc
    if len(blob) > 16384:
        raise ValueError("Action payload exceeds research limit")
    return sha256(blob.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ResumeContext:
    """Must originate from the trusted host, never the model's response."""
    scope: str
    workflow_id: str
    checkpoint_id: str
    current_revision: int
    current_tick: int
    reviewer_id: str

    def __post_init__(self):
        for value in (self.scope, self.workflow_id, self.checkpoint_id, self.reviewer_id):
            _name(value)
        _tick(self.current_revision)
        _tick(self.current_tick)


@dataclass(frozen=True)
class PendingApproval:
    approval_id: str
    scope: str
    workflow_id: str
    interrupt_key: str
    checkpoint_id: str
    actor: str
    subject: str
    capability: str
    revision: int
    issued_tick: int
    expires_tick: int
    action_sha: str
    status: str


@dataclass(frozen=True)
class ApprovalReceipt:
    approval_id: str
    scope: str
    workflow_id: str
    checkpoint_id: str
    revision: int
    answered_tick: int
    action_sha: str
    reviewer_id: str
    approved: bool
    requires_atomic_executor_recheck: bool = True


class StaleApprovalError(ValueError):
    """An answer is missing, mismatched, expired, superseded or already consumed."""


class StrictApprovalLedger:
    """SQLite-backed, one-use approval IDs. All state changes are transactional.

    The authorizer must be an authenticated *host* function:
    (reviewer_id, PendingApproval) -> bool.
    Do not inject a model-generated callback. IDs themselves are not credentials.
    """

    def __init__(self, db_path: str | Path,
                 *, reviewer_authorizer: Callable[[str, PendingApproval], bool]):
        if not callable(reviewer_authorizer):
            raise ValueError("An independent reviewer authorizer is required")
        self.db_path = str(db_path)
        self.reviewer_authorizer = reviewer_authorizer
        with self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS approval_interrupts (
                approval_id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                interrupt_key TEXT NOT NULL,
                checkpoint_id TEXT NOT NULL,
                actor TEXT NOT NULL,
                subject TEXT NOT NULL,
                capability TEXT NOT NULL,
                revision INTEGER NOT NULL,
                issued_tick INTEGER NOT NULL,
                expires_tick INTEGER NOT NULL,
                action_sha TEXT NOT NULL,
                status TEXT NOT NULL,
                reviewer_id TEXT,
                answered_tick INTEGER,
                UNIQUE(scope, workflow_id, interrupt_key)
            )""")

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=10000")
        return db

    def _transaction(self, callback):
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            result = callback(db)
            db.execute("COMMIT")
            return result
        except BaseException:
            db.execute("ROLLBACK")
            raise
        finally:
            db.close()

    @staticmethod
    def _ticket(row):
        return PendingApproval(*(row[key] for key in (
            "approval_id", "scope", "workflow_id", "interrupt_key", "checkpoint_id",
            "actor", "subject", "capability", "revision", "issued_tick",
            "expires_tick", "action_sha", "status")))

    def issue(self, intent: ActionIntent, tool_args: dict, *,
              workflow_id: str, interrupt_key: str, checkpoint_id: str,
              issued_tick: int, expires_tick: int) -> PendingApproval:
        """One ID per logical interrupt, idempotent only while still pending."""
        for value in (workflow_id, interrupt_key, checkpoint_id):
            _name(value)
        _tick(issued_tick)
        _tick(expires_tick)
        if expires_tick <= issued_tick or intent.tick != issued_tick:
            raise ValueError("Approval expiry and world tick must be well defined")
        digest = action_fingerprint(intent, tool_args)

        def issue_in_transaction(db):
            existing = db.execute(
                "SELECT * FROM approval_interrupts WHERE scope=? AND workflow_id=? AND interrupt_key=?",
                (intent.scope, workflow_id, interrupt_key)).fetchone()
            if existing:
                ticket = self._ticket(existing)
                if (ticket.status != "pending" or ticket.checkpoint_id != checkpoint_id
                        or ticket.revision != intent.revision or ticket.issued_tick != issued_tick
                        or ticket.expires_tick != expires_tick or ticket.action_sha != digest):
                    raise StaleApprovalError("interrupt_key_already_used_or_mutated")
                return ticket
            approval_id = secrets.token_hex(16)
            db.execute("""INSERT INTO approval_interrupts
                (approval_id, scope, workflow_id, interrupt_key, checkpoint_id,
                 actor, subject, capability, revision, issued_tick, expires_tick,
                 action_sha, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (approval_id, intent.scope, workflow_id, interrupt_key,
                 checkpoint_id, intent.actor, intent.subject, intent.capability,
                 intent.revision, issued_tick, expires_tick, digest, "pending"))
            return self._ticket(db.execute(
                "SELECT * FROM approval_interrupts WHERE approval_id=?",
                (approval_id,)).fetchone())

        return self._transaction(issue_in_transaction)

    def pending_ids(self, *, scope: str, workflow_id: str) -> tuple[str, ...]:
        """A scoped host query, not a model-visible list of approvals."""
        _name(scope)
        _name(workflow_id)
        with self._connect() as db:
            rows = db.execute(
                "SELECT approval_id FROM approval_interrupts WHERE scope=? "
                "AND workflow_id=? AND status='pending' ORDER BY rowid",
                (scope, workflow_id)).fetchall()
            return tuple(r["approval_id"] for r in rows)

    def resume(self, answers: dict, context: ResumeContext,
               intent: ActionIntent, tool_args: dict) -> ApprovalReceipt:
        """Strictly one explicitly named pending ID per resume, no bare answers.

        Unknown/stale/replayed answers raise *before any database write*.
        To answer two parallel interrupts, call with each named ID separately.
        Each valid result is a receipt, NOT execution permission.
        """
        if type(answers) is not dict or len(answers) != 1:
            raise StaleApprovalError("named_single_interrupt_answer_required")
        approval_id, answer = next(iter(answers.items()))
        _name(approval_id)
        if answer not in ("approve", "reject") or type(answer) is not str:
            raise ValueError("Unknown reviewer response")
        if not isinstance(context, ResumeContext):
            raise TypeError("Trusted host resume context required")
        digest = action_fingerprint(intent, tool_args)

        def consume(db):
            row = db.execute(
                "SELECT * FROM approval_interrupts WHERE approval_id=?",
                (approval_id,)).fetchone()
            if row is None or row["status"] != "pending":
                raise StaleApprovalError("interrupt_not_pending")
            ticket = self._ticket(row)
            if (ticket.scope != context.scope or ticket.scope != intent.scope
                    or ticket.workflow_id != context.workflow_id
                    or ticket.checkpoint_id != context.checkpoint_id
                    or ticket.revision != context.current_revision
                    or ticket.revision != intent.revision
                    or ticket.action_sha != digest
                    or (ticket.actor, ticket.subject, ticket.capability) !=
                       (intent.actor, intent.subject, intent.capability)):
                raise StaleApprovalError("checkpoint_scope_revision_or_action_changed")
            if not ticket.issued_tick <= context.current_tick <= ticket.expires_tick:
                raise StaleApprovalError("interrupt_expired_or_future")
            if not self.reviewer_authorizer(context.reviewer_id, ticket):
                raise PermissionError("reviewer_not_authorized")
            db.execute("""UPDATE approval_interrupts
                SET status=?, reviewer_id=?, answered_tick=?
                WHERE approval_id=? AND status='pending'""",
                ("approved" if answer == "approve" else "rejected",
                 context.reviewer_id, context.current_tick, approval_id))
            return ApprovalReceipt(
                approval_id, ticket.scope, ticket.workflow_id, ticket.checkpoint_id,
                ticket.revision, context.current_tick, ticket.action_sha,
                context.reviewer_id, answer == "approve")

        return self._transaction(consume)

    def verify_receipt(self, receipt: ApprovalReceipt) -> bool:
        """Verify a receipt was actually persisted by this host-side ledger."""
        if not isinstance(receipt, ApprovalReceipt):
            return False
        with self._connect() as db:
            row = db.execute(
                "SELECT * FROM approval_interrupts WHERE approval_id=?",
                (receipt.approval_id,)).fetchone()
        return bool(row is not None and row["status"] == "approved"
                    and row["scope"] == receipt.scope
                    and row["workflow_id"] == receipt.workflow_id
                    and row["checkpoint_id"] == receipt.checkpoint_id
                    and row["revision"] == receipt.revision
                    and row["answered_tick"] == receipt.answered_tick
                    and row["action_sha"] == receipt.action_sha
                    and row["reviewer_id"] == receipt.reviewer_id
                    and receipt.approved)


def guard_resumed_action(ledger: StrictApprovalLedger,
                         receipt: ApprovalReceipt, intent: ActionIntent,
                         tool_args: dict, authority: AuthorityEvidence | None,
                         regime: RegimeAssessment | None, *,
                         current_context: ResumeContext | None = None,
                         commit_state: str = "clear") -> GuardDecision:
    """Post-resume preflight only; executor must make an atomic final check."""
    if not ledger.verify_receipt(receipt):
        return GuardDecision(False, "unverified_or_rejected_approval_receipt")
    if not isinstance(current_context, ResumeContext):
        return GuardDecision(False, "trusted_current_checkpoint_missing")
    if ((receipt.scope, receipt.workflow_id, receipt.checkpoint_id, receipt.revision,
         receipt.answered_tick) !=
        (current_context.scope, current_context.workflow_id,
         current_context.checkpoint_id, current_context.current_revision,
         current_context.current_tick)):
        return GuardDecision(False, "approval_checkpoint_or_state_changed")
    if (receipt.scope != intent.scope or receipt.revision != intent.revision
            or receipt.answered_tick != intent.tick
            or receipt.action_sha != action_fingerprint(intent, tool_args)):
        return GuardDecision(False, "approval_binding_stale_or_changed")
    return RiskGovernor().assess(intent, authority, regime, commit_state=commit_state)
