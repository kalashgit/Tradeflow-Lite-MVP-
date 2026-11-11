"""Experiment A: a small learned causal world model (PyTorch, CPU).

Predicts, from the observed state and a candidate action only, the probability
that (1) the job is eventually paid, (2) the action is denied and (3) ordered
material is delivered within four ticks. Outcomes are labels, never inputs.
"""

from dataclasses import asdict, dataclass
import json
from pathlib import Path
import time

import torch
from torch import nn

ACTIONS = ("wait", "order_material", "assign_crew", "escalate_blocker",
           "request_change_approval", "request_invoice", "resolve_invoice_dispute")
HEADS = ("job_paid", "denied", "delivered_within_4")
_STATUS = (("materials_seen", ("delivery_delayed", "delivered")),
           ("blocker_seen", ("active", "resolution_requested", "resolved")),
           ("change_seen", ("approval_required", "approval_requested", "approved")),
           ("invoice_seen", ("disputed", "review_requested", "verified",
                             "dispute_review_requested", "dispute_resolved")),
           ("authority_seen", ("revoked",)))
FEATURE_VERSION = "gml-step-features/1"


def featurize(view: dict, action: str) -> list[float]:
    cash = max(1.0, float(view["cash_budget"]))
    row = [view["tick"] / 60, view["cash_budget"] / 1000, view["crew_slots"],
           view["job_count"], min(5.0, view["other_open_commitments"] / cash),
           view["operations_committed"] / 20]
    job = view.get("job")
    if job is None:
        row += [0.0] * (12 + sum(len(v) for _, v in _STATUS))
    else:
        remaining = max(0, job["required_known"] - job["work_receipted"])
        spend = (job["material_cost"] if action == "order_material" else
                 job["crew_cost"] if action == "assign_crew" else 0)
        own = job["crew_cost"] * (remaining if action == "order_material"
                                  else max(0, remaining - 1))
        funding = (view["cash_budget"] - spend - own - view["other_open_commitments"]) / cash
        total = job["material_cost"] + job["crew_cost"] * job["required_known"]
        row += [1.0, job["priority"] / 5, min(5.0, job["material_cost"] / cash),
                min(5.0, job["crew_cost"] * remaining / cash), job["payment"] / 1000,
                job["payment"] / max(1, total),
                float(job["material_cost"] <= job["order_limit"]),
                job["work_receipted"] / max(1, job["required_known"]), remaining,
                float(job["paid_receipted"]), float(job["ordered_by_me"]),
                max(-3.0, min(3.0, funding))]
        for key, values in _STATUS:
            row += [float(job[key] == value) for value in values]
    return row + [float(action == name) for name in ACTIONS]


@dataclass
class WorldModelConfig:
    hidden: int = 48
    epochs: int = 120
    lr: float = 3e-3
    weight_decay: float = 1e-4
    batch: int = 256
    seed: int = 0
    feature_version: str = FEATURE_VERSION


class WorldModel(nn.Module):
    def __init__(self, inputs: int, hidden: int):
        super().__init__()
        self.body = nn.Sequential(nn.Linear(inputs, hidden), nn.ReLU(),
                                  nn.Linear(hidden, hidden), nn.ReLU())
        self.heads = nn.Linear(hidden, len(HEADS))

    def forward(self, x):
        return self.heads(self.body(x))


def tensors(examples: list[dict]):
    x = torch.tensor([featurize(e["input"], e["action"]) for e in examples],
                     dtype=torch.float32)
    y = torch.zeros((len(examples), len(HEADS)))
    mask = torch.zeros((len(examples), len(HEADS)))
    for i, example in enumerate(examples):
        for j, head in enumerate(HEADS):
            if head in example["label"]:
                y[i, j], mask[i, j] = float(example["label"][head]), 1.0
    return x, y, mask


def _flat(model) -> torch.Tensor:
    return torch.cat([p.detach().flatten() for p in model.parameters()])


def train(examples: list[dict], config: WorldModelConfig, *, dataset_id: str,
          dataset_sha256: str) -> dict:
    """Fit one model. Returns the model, its untrained twin and a lineage record."""
    torch.manual_seed(config.seed)
    x, y, mask = tensors(examples)
    mean, std = x.mean(0), x.std(0).clamp_min(1e-6)
    model = WorldModel(x.shape[1], config.hidden)
    initial = WorldModel(x.shape[1], config.hidden)
    initial.load_state_dict(model.state_dict())
    before = _flat(model).clone()
    optimiser = torch.optim.Adam(model.parameters(), lr=config.lr,
                                 weight_decay=config.weight_decay)
    loss_fn = nn.BCEWithLogitsLoss(reduction="none")
    xs, losses, started = (x - mean) / std, [], time.perf_counter()
    generator = torch.Generator().manual_seed(config.seed)
    for _ in range(config.epochs):
        order, total = torch.randperm(len(xs), generator=generator), 0.0
        for start in range(0, len(xs), config.batch):
            batch = order[start:start + config.batch]
            loss = (loss_fn(model(xs[batch]), y[batch]) * mask[batch]).sum() / mask[
                batch].sum().clamp_min(1)
            optimiser.zero_grad()
            loss.backward()
            optimiser.step()
            total += loss.item() * len(batch)
        losses.append(round(total / len(xs), 6))
    lineage = {
        "kind": "world_model", "config": asdict(config), "dataset_id": dataset_id,
        "dataset_sha256": dataset_sha256, "examples": len(examples),
        "inputs": x.shape[1], "parameters": int(before.numel()),
        "parameter_delta_l2": round((_flat(model) - before).norm().item(), 6),
        "loss_first_epoch": losses[0], "loss_last_epoch": losses[-1],
        "train_seconds": round(time.perf_counter() - started, 3),
        "torch_version": torch.__version__, "device": "cpu",
    }
    return {"model": model, "initial": initial, "mean": mean, "std": std,
            "lineage": lineage, "losses": losses}


def save(folder, fitted: dict) -> None:
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    torch.save({"state": fitted["model"].state_dict(), "mean": fitted["mean"],
                "std": fitted["std"]}, folder / "model.pt")
    torch.save({"state": fitted["initial"].state_dict(), "mean": fitted["mean"],
                "std": fitted["std"]}, folder / "initial.pt")
    (folder / "lineage.json").write_text(json.dumps(
        {**fitted["lineage"], "losses": fitted["losses"]}, sort_keys=True, indent=1))


def load(folder, which="model.pt"):
    folder = Path(folder)
    lineage = json.loads((folder / "lineage.json").read_text())
    blob = torch.load(folder / which, weights_only=True)
    model = WorldModel(lineage["inputs"], lineage["config"]["hidden"])
    model.load_state_dict(blob["state"])
    model.eval()
    return {"model": model, "mean": blob["mean"], "std": blob["std"], "lineage": lineage}


def predict(loaded: dict, examples: list[dict]) -> torch.Tensor:
    """Probabilities, shape (examples, heads)."""
    x, _, _ = tensors(examples)
    with torch.no_grad():
        return torch.sigmoid(loaded["model"]((x - loaded["mean"]) / loaded["std"]))
