# GML-01 — real Qwen3-0.6B LoRA run (GitHub Actions, CPU)

Source: workflow run 43006889605, job `qwen-lora-cpu` (130477853858), commit
`d3f0eaa`, 2026-11-11 10:53–12:03 UTC, free GitHub-hosted runner, public
weights, no secrets. Figures below are copied from that job's log. The full
artifact (`gml-01-qwen-43006889605`: adapter weights, training manifest,
datasets, trajectories, result.json; zip SHA-256
`c32fc1abd0f6955701f637cf177e630ec697849b4d68679a0e66fab7ba3b1f0d`) is kept
by GitHub for 30 days; it could not be downloaded into the development
sandbox, so it is not committed here.

Training: 118 supervised LoRA steps on 235 verified examples; loss
1.088 → 0.253; adapter saved, reloaded onto a fresh base and verified.
Integrity verification passed.

| Arm (protected test, 120 scenarios) | Success | Mean regret | Denied |
|---|---:|---:|---:|
| Frozen base | 62/120 | 595.2 | 0 |
| Base + verified memory | 86/120 | 234.6 | 0 |
| Base + counterfactual trial results | 73/120 | 564.5 | 0 |
| **Trained adapter** | **96/120** | 120.2 | 0 |
| Trained adapter + memory | 97/120 | 109.4 | 0 |
| Constant: always `risk_averse` | 96/120 | 120.2 | 0 |

Automated verdict: PASS (trained minus base +0.283, 95% CI 0.183 to 0.383).

**Reading it honestly.** The adapter makes the same choice on every protected
scenario and scores exactly what the constant policy scores (difference
0.000). Parameter training worked and beat the frozen base and the base with
memory, but what the weights learned is the dominant answer in the training
data, not a decision that depends on the situation. The preregistered
criterion compared only against the base, so it passed; it was too weak.
**Recommendation: do not approve this adapter as a new research model
version.** The next protocol must require a gain over the best constant
policy on a task where no single answer dominates.
