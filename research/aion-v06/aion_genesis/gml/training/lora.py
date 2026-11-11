"""Experiment B: LoRA supervised fine-tuning of a causal LM policy (PEFT).

Model-agnostic: the base is any Hugging Face causal LM id or local folder.
A run is only reported as trained when the saved adapter reloads onto a fresh
base, reproduces the trained logits, and differs from the base's logits.
"""

from dataclasses import asdict, dataclass, field
import json
import os
from pathlib import Path
import resource
import time

from ..contracts import file_hash
from ..runtime import CausalLMPolicy


@dataclass
class LoraConfig:
    base_model: str = "Qwen/Qwen3-0.6B"
    revision: str | None = None
    rank: int = 8
    alpha: int = 16
    dropout: float = 0.05
    target_modules: tuple = ()        # empty: detect attention projections
    lr: float = 2e-4
    epochs: float = 2.0
    max_steps: int = 0                # 0: derived from epochs
    batch_size: int = 4
    max_length: int = 512
    seed: int = 0
    threads: int = 0                  # 0: leave the library default
    max_wall_seconds: int = 3000      # stop cleanly when the budget is spent
    algorithm: str = "sft"
    extra: dict = field(default_factory=dict)


def _targets(model, wanted) -> list[str]:
    if wanted:
        return list(wanted)
    names = {name.split(".")[-1] for name, _ in model.named_modules()}
    for group in (("q_proj", "k_proj", "v_proj", "o_proj"), ("c_attn",), ("query", "value")):
        if set(group) <= names:
            return list(group)
    raise ValueError("No known attention projection modules to adapt")


def load_base(config: LoraConfig):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    if config.threads:
        torch.set_num_threads(config.threads)
    tokenizer = AutoTokenizer.from_pretrained(config.base_model, revision=config.revision)
    model = AutoModelForCausalLM.from_pretrained(
        config.base_model, revision=config.revision, torch_dtype=torch.float32)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    revision = getattr(model.config, "_commit_hash", None) or config.revision or "local"
    return model, tokenizer, str(revision)


def load_policy(config: LoraConfig, adapter_dir=None, *, name=None) -> CausalLMPolicy:
    """Base model, optionally with a saved adapter, as a runtime policy."""
    model, tokenizer, _ = load_base(config)
    if adapter_dir is not None:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, str(adapter_dir))
    model.eval()
    return CausalLMPolicy(model, tokenizer,
                          name=name or ("adapter" if adapter_dir else "base"))


def _encode(policy: CausalLMPolicy, example: dict, max_length: int):
    tokenizer = policy.tokenizer
    prompt = tokenizer(policy.prompt_text(example["messages"]),
                       add_special_tokens=False)["input_ids"]
    answer = tokenizer(example["target"], add_special_tokens=False)["input_ids"]
    if tokenizer.eos_token_id is not None:
        answer = answer + [tokenizer.eos_token_id]
    prompt = prompt[-(max_length - len(answer)):]
    return prompt + answer, [-100] * len(prompt) + answer


def train_adapter(examples: list[dict], config: LoraConfig, out_dir, *, dataset_id: str,
                  dataset_sha256: str) -> dict:
    """Run supervised LoRA training and verify the saved adapter by reloading it."""
    import torch
    from peft import LoraConfig as PeftLora, PeftModel, get_peft_model
    if config.algorithm != "sft":
        raise ValueError("Only supervised fine-tuning is enabled; preference optimisation "
                         "and reinforcement learning need separately validated labels")
    if not examples:
        raise ValueError("No training examples")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(config.seed)
    started = time.perf_counter()
    base, tokenizer, revision = load_base(config)
    probe = CausalLMPolicy(base, tokenizer, name="base")
    probe_messages = examples[0]["messages"]
    base_scores = probe.scores(probe_messages)
    model = get_peft_model(base, PeftLora(
        r=config.rank, lora_alpha=config.alpha, lora_dropout=config.dropout,
        target_modules=_targets(base, config.target_modules), task_type="CAUSAL_LM"))
    policy = CausalLMPolicy(model, tokenizer, name="training")
    trainable = [p for p in model.parameters() if p.requires_grad]
    initial = torch.cat([p.detach().flatten().clone() for p in trainable])
    encoded = [_encode(policy, e, config.max_length) for e in examples]
    steps_per_epoch = max(1, -(-len(encoded) // config.batch_size))
    total_steps = config.max_steps or max(1, int(steps_per_epoch * config.epochs))
    optimiser = torch.optim.AdamW(trainable, lr=config.lr)
    generator = torch.Generator().manual_seed(config.seed)
    pad = tokenizer.pad_token_id or 0
    losses, step, stopped, tokens_seen = [], 0, "completed", 0
    model.train()
    while step < total_steps and stopped == "completed":
        order = torch.randperm(len(encoded), generator=generator).tolist()
        for start in range(0, len(order), config.batch_size):
            if step >= total_steps:
                break
            if time.perf_counter() - started > config.max_wall_seconds:
                stopped = "wall_time_budget_exhausted"
                break
            batch = [encoded[i] for i in order[start:start + config.batch_size]]
            width = max(len(ids) for ids, _ in batch)
            ids = torch.full((len(batch), width), pad, dtype=torch.long)
            labels = torch.full((len(batch), width), -100, dtype=torch.long)
            mask = torch.zeros((len(batch), width), dtype=torch.long)
            for row, (tokens, target) in enumerate(batch):
                ids[row, :len(tokens)] = torch.tensor(tokens)
                labels[row, :len(target)] = torch.tensor(target)
                mask[row, :len(tokens)] = 1
            loss = model(input_ids=ids, attention_mask=mask, labels=labels).loss
            optimiser.zero_grad()
            loss.backward()
            optimiser.step()
            losses.append(round(loss.item(), 5))
            tokens_seen += int(mask.sum())
            step += 1
    model.eval()
    final = torch.cat([p.detach().flatten() for p in trainable])
    delta = (final - initial).norm().item()
    trained_scores = policy.scores(probe_messages)
    adapter_dir = out_dir / "adapter"
    model.save_pretrained(str(adapter_dir))
    del model, policy, base
    # Independent reload onto a fresh base: the adapter on disk is what counts.
    fresh, fresh_tokenizer, _ = load_base(config)
    reloaded = CausalLMPolicy(PeftModel.from_pretrained(fresh, str(adapter_dir)),
                              fresh_tokenizer, name="reloaded")
    reloaded_scores = reloaded.scores(probe_messages)
    gap = max(abs(reloaded_scores[k] - trained_scores[k]) for k in trained_scores)
    moved = max(abs(reloaded_scores[k] - base_scores[k]) for k in base_scores)
    manifest = {
        "schema": "GenesisAdapterManifest/1", "algorithm": config.algorithm,
        "base_model": config.base_model, "base_revision": revision,
        "tokenizer_revision": revision, "config": asdict(config),
        "dataset_id": dataset_id, "dataset_sha256": dataset_sha256,
        "examples": len(examples), "steps": step, "stopped": stopped,
        "trainable_parameters": int(initial.numel()),
        "parameter_delta_l2": round(delta, 6),
        "loss_first": losses[0] if losses else None,
        "loss_last_mean_5": round(sum(losses[-5:]) / max(1, len(losses[-5:])), 5)
        if losses else None,
        "losses": losses,
        "reload_max_logprob_gap": round(gap, 6),
        "reloaded_vs_base_max_logprob_shift": round(moved, 6),
        "parameters_changed": delta > 0,
        "reload_reproduces_trained_model": gap < 1e-3,
        "adapter_changes_outputs": moved > 1e-6,
        "adapter_files": {p.name: file_hash(p) for p in sorted(adapter_dir.iterdir())
                          if p.is_file()},
        "wall_seconds": round(time.perf_counter() - started, 1),
        "approx_training_tokens": int(tokens_seen),
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
        "cpu_count": os.cpu_count(), "device": "cpu", "torch_version": torch.__version__,
    }
    manifest["training_verified"] = bool(
        step > 0 and manifest["parameters_changed"]
        and manifest["reload_reproduces_trained_model"]
        and manifest["adapter_changes_outputs"])
    (out_dir / "training_manifest.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=1))
    return manifest
