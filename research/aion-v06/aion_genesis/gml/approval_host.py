"""Host-authenticated *synthetic* approval -> atomic action integration.

Research fixture ONLY. Every consequential state transition, entitlement check,
approval consumption and idempotency receipt uses one SQLite transaction.
No actual business tools, external side effects, or customer data are touched.

Not a production authentication service: registration and world mutation APIs
are trusted fixture setup/administration, NOT to be exposed to the agent.
A real TradeFlow deployment requires authenticated HTTP boundary, protected
secrets, a production transaction executor and independent QA.
"""

from dataclasses import asdict, dataclass
from hashlib import pbkdf2_hmac, sha256
import hmac
from pathlib import Path
import secrets
import sqlite3
import time

from ..asil_v26.safety import (
    ActionIntent, AuthorityEvidence, RegimeAssessment, RiskGovernor,
)
from .strict_approval import (
    ApprovalReceipt, PendingApproval, ResumeContext, StaleApprovalError,
    StrictApprovalLedger, _name, _tick, action_fingerprint,
)

_PBKDF2_ITERATIONS = 210_000
_STATES = frozenset(("granted", "denied", "unknown"))
_REGIMES = frozenset(("normal", "suspected", "shift"))


@dataclass(frozen=True)
class SyntheticCommitReceipt:
    commit_id: str
    approval_id: str
    scope: str
    workflow_id: str
    invoice_id: str
    amount: int
    cash_after: int
    revision_after: int
    replayed: bool = False


class AtomicApprovalHost:
    """One explicitly synthetic invoice workflow per scope/workflow ID.

    All world state used for authority, money, invoice and checkpoint is stored
    beside approval_interrupts in the same SQLite DB. This matters: a separate
    RPC or an external side effect cannot share this SQLite atomicity.
    """

    def __init__(self, database_path: str | Path):
        self.path = str(database_path)
        self.ledger = StrictApprovalLedger(
            self.path, reviewer_authorizer=self._reviewer_authorized)
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS host_workflows (
                    scope TEXT NOT NULL,
                    workflow_id TEXT NOT NULL,
                    checkpoint_id TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    invoice_id TEXT NOT NULL,
                    amount INTEGER NOT NULL CHECK(amount > 0),
                    currency TEXT NOT NULL CHECK(currency='EUR'),
                    invoice_paid INTEGER NOT NULL DEFAULT 0 CHECK(invoice_paid IN (0,1)),
                    paid_count INTEGER NOT NULL DEFAULT 0,
                    cash INTEGER NOT NULL CHECK(cash >= 0),
                    crew INTEGER NOT NULL CHECK(crew >= 0),
                    revision INTEGER NOT NULL,
                    tick INTEGER NOT NULL,
                    route TEXT NOT NULL,
                    authority TEXT NOT NULL CHECK(authority IN ('granted','denied','unknown')),
                    regime TEXT NOT NULL CHECK(regime IN ('normal','suspected','shift')),
                    commit_state TEXT NOT NULL CHECK(commit_state IN ('clear','ambiguous')),
                    PRIMARY KEY(scope, workflow_id)
                );
                CREATE TABLE IF NOT EXISTS host_reviewers (
                    scope TEXT NOT NULL, reviewer_id TEXT NOT NULL,
                    salt BLOB NOT NULL, secret_hash BLOB NOT NULL,
                    active INTEGER NOT NULL, can_approve INTEGER NOT NULL,
                    PRIMARY KEY(scope, reviewer_id)
                );
                CREATE TABLE IF NOT EXISTS host_sessions (
                    token_sha TEXT PRIMARY KEY,
                    scope TEXT NOT NULL, reviewer_id TEXT NOT NULL,
                    expires_at REAL NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS host_commits (
                    approval_id TEXT PRIMARY KEY,
                    commit_id TEXT NOT NULL UNIQUE,
                    scope TEXT NOT NULL, workflow_id TEXT NOT NULL,
                    invoice_id TEXT NOT NULL,
                    action_sha TEXT NOT NULL,
                    reviewer_id TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    cash_after INTEGER NOT NULL,
                    revision_after INTEGER NOT NULL
                );
            """)

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        return db

    def _transaction(self, fn):
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            result = fn(db)
            db.execute("COMMIT")
            return result
        except BaseException:
            db.execute("ROLLBACK")
            raise
        finally:
            db.close()

    @staticmethod
    def _world(db, scope, workflow_id):
        row = db.execute(
            "SELECT * FROM host_workflows WHERE scope=? AND workflow_id=?",
            (scope, workflow_id)).fetchone()
        if row is None:
            raise PermissionError("unknown_scoped_workflow")
        return row

    @staticmethod
    def _intent(row):
        return ActionIntent(
            row["scope"], row["actor"], row["subject"], "pay_invoice",
            row["tick"], row["revision"], row["cash"], row["amount"],
            row["crew"], 0, row["route"])

    @staticmethod
    def _args(row):
        return {"invoice_id": row["invoice_id"], "amount": row["amount"],
                "currency": row["currency"]}

    @staticmethod
    def _authority(row):
        return AuthorityEvidence(
            row["scope"], row["actor"], row["subject"], "pay_invoice",
            row["revision"], row["tick"], row["authority"],
            "host:current_revision:" + str(row["revision"]))

    @staticmethod
    def _regime(row):
        return RegimeAssessment(row["regime"], (), ())

    def setup_synthetic_workflow(
        self, *, scope: str, workflow_id: str, checkpoint_id: str,
        actor: str = "project_manager", subject: str = "JOB1",
        invoice_id: str = "INV1", amount: int = 25,
        cash: int = 100, crew: int = 2, tick: int = 2,
        revision: int = 7, route: str = "fast",
    ) -> None:
        """Trusted synthetic setup. Not an externally callable business API."""
        for field in (scope, workflow_id, checkpoint_id, actor, subject, invoice_id):
            _name(field)
        for num in (cash, crew, tick, revision):
            _tick(num)
        if type(amount) is not int or amount <= 0 or route not in ("fast", "deep"):
            raise ValueError("invalid_synthetic_workflow")
        self._transaction(lambda db: db.execute(
            """INSERT INTO host_workflows
               (scope, workflow_id, checkpoint_id, actor, subject, invoice_id,
                amount, currency, cash, crew, revision, tick, route, authority,
                regime, commit_state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (scope, workflow_id, checkpoint_id, actor, subject, invoice_id,
             amount, "EUR", cash, crew, revision, tick, route,
             "granted", "normal", "clear")))

    def register_fixture_reviewer(
        self, *, scope: str, reviewer_id: str, password: str,
        can_approve: bool = True,
    ) -> None:
        """Trusted fixture-admin method; cannot be called by a model tool."""
        _name(scope)
        _name(reviewer_id)
        if type(password) is not str or not 12 <= len(password) <= 256:
            raise ValueError("synthetic_identity_requires_strong_password")
        if type(can_approve) is not bool:
            raise ValueError("invalid_reviewer_role")
        salt = secrets.token_bytes(16)
        digest = pbkdf2_hmac(
            "sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
        self._transaction(lambda db: db.execute(
            "INSERT INTO host_reviewers VALUES (?,?,?,?,?,?)",
            (scope, reviewer_id, salt, digest, 1, int(can_approve))))

    def login(self, *, scope: str, reviewer_id: str, password: str,
              ttl_seconds: int = 900) -> str:
        """Real password verification in a **local fictional** identity store."""
        _name(scope)
        _name(reviewer_id)
        if type(password) is not str or len(password) > 256 or (type(ttl_seconds) is not int
                                         or not 1 <= ttl_seconds <= 3600):
            raise PermissionError("invalid_credentials")
        with self._connect() as db:
            record = db.execute(
                "SELECT * FROM host_reviewers WHERE scope=? AND reviewer_id=?",
                (scope, reviewer_id)).fetchone()
        if record is None or not record["active"] or not record["can_approve"]:
            raise PermissionError("invalid_credentials")
        actual = pbkdf2_hmac(
            "sha256", password.encode(), record["salt"], _PBKDF2_ITERATIONS)
        if not hmac.compare_digest(actual, record["secret_hash"]):
            raise PermissionError("invalid_credentials")
        token = secrets.token_urlsafe(32)
        token_sha = sha256(token.encode()).hexdigest()
        self._transaction(lambda db: db.execute(
            "INSERT INTO host_sessions VALUES (?,?,?,?,0)",
            (token_sha, scope, reviewer_id, time.time() + ttl_seconds)))
        return token

    def _reviewer_authorized(self, reviewer_id: str, ticket: PendingApproval) -> bool:
        """Internal ledger hook; direct ledger use is not an exposed endpoint."""
        with self._connect() as db:
            record = db.execute(
                "SELECT active,can_approve FROM host_reviewers "
                "WHERE scope=? AND reviewer_id=?",
                (ticket.scope, reviewer_id)).fetchone()
        return bool(record and record["active"] and record["can_approve"])

    @staticmethod
    def _authenticated(db, token: str, expected_scope: str) -> str:
        if type(token) is not str or not 30 <= len(token) <= 512:
            raise PermissionError("authenticated_reviewer_session_required")
        token_sha = sha256(token.encode()).hexdigest()
        record = db.execute(
            """SELECT s.reviewer_id FROM host_sessions s JOIN host_reviewers r
               ON r.scope=s.scope AND r.reviewer_id=s.reviewer_id
               WHERE s.token_sha=? AND s.scope=? AND s.revoked=0
                 AND s.expires_at>? AND r.active=1 AND r.can_approve=1""",
            (token_sha, expected_scope, time.time())).fetchone()
        if record is None:
            raise PermissionError("authenticated_reviewer_session_required")
        return record["reviewer_id"]

    def revoke_session(self, token: str) -> None:
        sha = sha256(token.encode()).hexdigest()
        self._transaction(lambda db: db.execute(
            "UPDATE host_sessions SET revoked=1 WHERE token_sha=?", (sha,)))

    def set_reviewer_active(self, scope: str, reviewer_id: str, active: bool):
        _name(scope)
        _name(reviewer_id)
        if type(active) is not bool:
            raise ValueError("active_must_be_boolean")
        self._transaction(lambda db: db.execute(
            "UPDATE host_reviewers SET active=? WHERE scope=? AND reviewer_id=?",
            (int(active), scope, reviewer_id)))

    def snapshot(self, scope: str, workflow_id: str) -> dict:
        """Safe synthetic host snapshot for tests and the approval UI."""
        _name(scope)
        _name(workflow_id)
        with self._connect() as db:
            row = self._world(db, scope, workflow_id)
            return {k: row[k] for k in (
                "scope", "workflow_id", "checkpoint_id", "invoice_id", "amount",
                "invoice_paid", "paid_count", "cash", "crew", "revision", "tick",
                "authority", "regime", "commit_state")}

    def _change(self, scope: str, workflow_id: str, *, field: str, value):
        # Administrative test-only changes must bump the same world revision.
        if field not in ("amount", "cash", "crew", "authority", "regime",
                         "commit_state", "checkpoint_id", "tick"):
            raise ValueError("unauthorized_fixture_mutation")
        def txn(db):
            row = self._world(db, scope, workflow_id)
            if field == "tick" and value <= row["tick"]:
                raise ValueError("time_must_advance")
            db.execute(
                f"UPDATE host_workflows SET {field}=?,revision=revision+1 "
                "WHERE scope=? AND workflow_id=?", (value, scope, workflow_id))
        self._transaction(txn)

    def change_invoice_amount(self, scope: str, workflow_id: str, amount: int):
        if type(amount) is not int or amount <= 0:
            raise ValueError("invalid_amount")
        self._change(scope, workflow_id, field="amount", value=amount)

    def change_cash(self, scope: str, workflow_id: str, cash: int):
        _tick(cash)
        self._change(scope, workflow_id, field="cash", value=cash)

    def change_authority(self, scope: str, workflow_id: str, state: str):
        if state not in _STATES:
            raise ValueError("invalid_authority_state")
        self._change(scope, workflow_id, field="authority", value=state)

    def change_regime(self, scope: str, workflow_id: str, state: str):
        if state not in _REGIMES:
            raise ValueError("invalid_regime")
        self._change(scope, workflow_id, field="regime", value=state)

    def change_checkpoint(self, scope: str, workflow_id: str, checkpoint: str):
        _name(checkpoint)
        self._change(scope, workflow_id, field="checkpoint_id", value=checkpoint)

    def advance_tick(self, scope: str, workflow_id: str, tick: int):
        _tick(tick)
        self._change(scope, workflow_id, field="tick", value=tick)

    def mark_commit_uncertain(self, scope: str, workflow_id: str):
        self._change(scope, workflow_id, field="commit_state", value="ambiguous")

    def request_approval(
        self, *, scope: str, workflow_id: str, interrupt_key: str,
        expires_after_ticks: int = 2,
    ) -> PendingApproval:
        """The host binds a proposed invoice payment to *authoritative* state."""
        if type(expires_after_ticks) is not int or not 1 <= expires_after_ticks <= 10:
            raise ValueError("invalid_expiry_window")
        _name(scope)
        _name(workflow_id)
        _name(interrupt_key)
        with self._connect() as db:
            row = self._world(db, scope, workflow_id)
            if row["invoice_paid"]:
                raise PermissionError("invoice_already_paid")
            decision = RiskGovernor().assess(
                self._intent(row), self._authority(row), self._regime(row),
                commit_state=row["commit_state"])
            if not decision.admissible:
                raise PermissionError("proposal_rejected:" + decision.reason)
            return self.ledger.issue(
                self._intent(row), self._args(row), workflow_id=workflow_id,
                interrupt_key=interrupt_key, checkpoint_id=row["checkpoint_id"],
                issued_tick=row["tick"],
                expires_tick=row["tick"] + expires_after_ticks)

    def respond(self, *, approval_id: str, decision: str,
                session_token: str) -> ApprovalReceipt:
        """Human-only host entrypoint: session -> current state -> strict resume."""
        _name(approval_id)
        with self._connect() as db:
            ticket = db.execute(
                "SELECT * FROM approval_interrupts WHERE approval_id=?",
                (approval_id,)).fetchone()
            if ticket is None:
                raise StaleApprovalError("interrupt_not_pending")
            reviewer_id = self._authenticated(db, session_token, ticket["scope"])
            row = self._world(db, ticket["scope"], ticket["workflow_id"])
            context = ResumeContext(
                row["scope"], row["workflow_id"], row["checkpoint_id"],
                row["revision"], row["tick"], reviewer_id)
            intent, args = self._intent(row), self._args(row)
        return self.ledger.resume({approval_id: decision}, context, intent, args)

    def commit_approved(self, receipt: ApprovalReceipt) -> SyntheticCommitReceipt:
        """The only simulated effect: one invoice paid + cash decremented.

        **BEGIN IMMEDIATE** serializes *fresh* host-state, authorization, review
        status, cash, invoice update and one-use commit receipt. There is no
        trusted decision input from Qwen. No side effect leaves this DB.
        """
        if not isinstance(receipt, ApprovalReceipt) or not receipt.approved:
            raise PermissionError("verified_human_approval_required")

        def txn(db):
            a = db.execute(
                "SELECT * FROM approval_interrupts WHERE approval_id=?",
                (receipt.approval_id,)).fetchone()
            if a is None:
                raise PermissionError("unknown_approval")
            existing = db.execute(
                "SELECT * FROM host_commits WHERE approval_id=?",
                (receipt.approval_id,)).fetchone()
            if existing is not None:
                # Explicit, safe idempotent receipt lookup; never a second write.
                if (existing["scope"], existing["workflow_id"],
                    existing["action_sha"], existing["reviewer_id"]) != (
                        receipt.scope, receipt.workflow_id,
                        receipt.action_sha, receipt.reviewer_id) or (
                        a["status"], a["scope"], a["workflow_id"],
                        a["checkpoint_id"], a["revision"], a["answered_tick"],
                        a["action_sha"], a["reviewer_id"]) != (
                        "executed", receipt.scope, receipt.workflow_id,
                        receipt.checkpoint_id, receipt.revision,
                        receipt.answered_tick, receipt.action_sha,
                        receipt.reviewer_id):
                    raise PermissionError("replayed_receipt_mismatch")
                return SyntheticCommitReceipt(
                    existing["commit_id"], receipt.approval_id,
                    existing["scope"], existing["workflow_id"],
                    existing["invoice_id"], existing["amount"],
                    existing["cash_after"], existing["revision_after"], True)
            if (a["status"] != "approved" or not receipt.approved
                    or a["scope"] != receipt.scope
                    or a["workflow_id"] != receipt.workflow_id
                    or a["checkpoint_id"] != receipt.checkpoint_id
                    or a["revision"] != receipt.revision
                    or a["answered_tick"] != receipt.answered_tick
                    or a["action_sha"] != receipt.action_sha
                    or a["reviewer_id"] != receipt.reviewer_id):
                raise PermissionError("approval_not_verified_or_not_current")

            reviewer = db.execute(
                "SELECT active,can_approve FROM host_reviewers "
                "WHERE scope=? AND reviewer_id=?",
                (receipt.scope, receipt.reviewer_id)).fetchone()
            if reviewer is None or not (reviewer["active"] and reviewer["can_approve"]):
                raise PermissionError("reviewer_authority_revoked")

            row = self._world(db, receipt.scope, receipt.workflow_id)
            intent, args = self._intent(row), self._args(row)
            if (row["checkpoint_id"] != receipt.checkpoint_id
                    or row["revision"] != receipt.revision
                    or row["tick"] != receipt.answered_tick
                    or row["tick"] < a["issued_tick"]
                    or row["tick"] > a["expires_tick"]
                    or (a["actor"], a["subject"], a["capability"]) !=
                       (intent.actor, intent.subject, intent.capability)
                    or a["action_sha"] != action_fingerprint(intent, args)):
                raise StaleApprovalError("authoritative_state_or_action_changed")
            if row["invoice_paid"]:
                raise PermissionError("invoice_already_paid")
            decision = RiskGovernor().assess(
                intent, self._authority(row), self._regime(row),
                commit_state=row["commit_state"])
            if not decision.admissible:
                raise PermissionError("final_authority_gate:" + decision.reason)
            if row["cash"] < row["amount"]:
                raise PermissionError("insufficient_cash")

            cash_after = row["cash"] - row["amount"]
            revision_after = row["revision"] + 1
            commit_id = "syncommit:" + sha256(
                (receipt.approval_id + receipt.action_sha).encode()).hexdigest()[:24]
            db.execute(
                """UPDATE host_workflows SET invoice_paid=1,
                   paid_count=paid_count+1, cash=?, revision=?
                   WHERE scope=? AND workflow_id=? AND invoice_paid=0""",
                (cash_after, revision_after, receipt.scope, receipt.workflow_id))
            db.execute(
                "UPDATE approval_interrupts SET status='executed' "
                "WHERE approval_id=? AND status='approved'", (receipt.approval_id,))
            db.execute(
                """INSERT INTO host_commits
                   (approval_id, commit_id, scope, workflow_id, invoice_id,
                    action_sha, reviewer_id, amount, cash_after, revision_after)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (receipt.approval_id, commit_id, receipt.scope,
                 receipt.workflow_id, row["invoice_id"], receipt.action_sha,
                 receipt.reviewer_id, row["amount"], cash_after, revision_after))
            return SyntheticCommitReceipt(
                commit_id, receipt.approval_id, receipt.scope,
                receipt.workflow_id, row["invoice_id"],
                row["amount"], cash_after, revision_after)

        return self._transaction(txn)
