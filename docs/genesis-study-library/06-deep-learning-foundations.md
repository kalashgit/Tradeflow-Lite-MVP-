# 06 — Deep learning fundamentals for building your own AI

**Primary reference:** Goodfellow, Bengio & Courville, *Deep Learning* (MIT Press, 2016). Authors provide the [complete official HTML text](https://www.deeplearningbook.org/), which can be read free; their site explicitly says an easily copied PDF is not authorized by their publisher. The explanations and examples here are original.

**Purpose:** understand the mechanics well enough to choose between prompting, retrieval, adapting existing models, and eventually researching model-training architectures.

## 1. Linear algebra is the vocabulary

Represent a feature vector `x ∈ R^d`; a linear layer computes `z = Wx + b`. A nonlinear activation `h = σ(z)` allows stacked layers to model complex functions; without nonlinearities, multiple linear layers collapse to one linear mapping.

For matrix dimensions, if `W ∈ R^(m×d)` and `x ∈ R^d`, output `z ∈ R^m`. Understand shape checking, matrix multiplication, dot product, vector norm, transpose and eigenvalues/singular values conceptually.

**Exercise:** calculate a two-feature linear prediction by hand. Then implement it in NumPy and assert numerical equality.

## 2. Probability and information

Probability models uncertainty. Maximum-likelihood training seeks parameters that maximize `p(data | θ)`, equivalent to minimizing negative log likelihood.

Classification with softmax:
`p(y=i|x) = exp(z_i) / Σ_j exp(z_j)`.

Cross-entropy for a one-hot target `y`:
`L = -Σ_i y_i log p_i`.

Interpretation: the objective penalizes assigning low probability to the correct answer. Training loss reduction doesn't automatically imply grounded business facts or reliable tool use.

**Overfitting** happens when a model captures quirks of training examples rather than general structure. Fixes include more representative data, regularization, early stopping, held-out validation, and suitable capacity.

## 3. Gradient descent and backpropagation

To minimize loss `L(θ)`, gradient descent updates:
`θ ← θ - η ∇_θ L`.

The chain rule propagates sensitivity backward through a computation graph. Automatic differentiation executes this efficiently.

Illustration with scalar model `ŷ = wx`, squared loss `L=(wx-y)^2`:
`dL/dw = 2x(wx-y)`.

For `x=2, y=6, w=1`, the prediction is 2, the gradient is `2*2*(2-6)=-16`, and with learning rate `η=0.1` the next weight is 2.6. The prediction moves toward 6.

Excessive learning rates can diverge, too-small rates converge slowly. Stochastic minibatches make estimates noisy; optimization methods such as Adam adapt step sizes but do not eliminate generalization concerns.

## 4. Representation learning

A model learns intermediate features that transform raw input into usable representations. Earlier layers may detect local patterns; deeper layers combine them into more abstract structure. Do not confuse a learned embedding with a human-interpretable fact.

An embedding maps content to vectors where some semantic relationships are easier to measure. But vector closeness is not guaranteed truth, recency, permission or causal relevance.

For Genesis, embeddings help find related job notes and documents. Exact schema fields must still decide identity, status, money and permissions.

## 5. Attention and modern transformers (supplement beyond the 2016 book)

The 2016 *Deep Learning* book predates the 2017 Transformer architecture. Modern LLM details here are **additional contemporary background**, not content attributed to that book.

Scaled dot-product attention:

`Attention(Q,K,V) = softmax(QK^T / sqrt(d_k))V`.

Queries select information from keys, and the weighted values are combined. Attention mechanisms help integrate context across token positions; they don't confer durable memory after the inference call ends.

Important constraints:
- self-attention cost can scale poorly with sequence length;
- context positions, tokenization and attention patterns affect quality;
- long context does not guarantee reliable retrieval;
- training-data associations can create plausible but false outputs.

Learn residual connections, layer normalization, positional encodings, feed-forward blocks, autoregressive next-token prediction, pretraining and instruction tuning conceptually.

## 6. Pretraining, supervised fine-tuning and preference training

**Pretraining:** learn general patterns from huge datasets, often via next-token prediction.

**Supervised fine-tuning:** train on curated input/output pairs for a target behavior.

**Preference optimization:** use comparisons or rewards to shape outputs toward preferred behavior; methods differ in assumptions and implementation.

These procedures differ from application memory. Adding a new job file to a database does not change the model's weights. A business action being successful does not automatically train the model. Claiming self-improvement requires tracking an actual policy, retrieval or parameter change and validating generalization.

## 7. LoRA and parameter-efficient tuning (supplement)

LoRA adapts a weight matrix using low-rank factors rather than updating all original parameters:
`W' = W + BA`, with `B ∈ R^(m×r)`, `A ∈ R^(r×n)`, and `r` much smaller than full dimensions.

Potential advantages: reduced trainable parameter count and smaller specialized adapters. Limitations: training still requires data engineering, evaluation, compute and care about overfitting and data leakage.

For Genesis, try RAG and structured tool use first. Consider adapters only if specialized language or structured decisions remain deficient on held-out tests.

## 8. Representation quality versus business correctness

An embedding that clusters similar vendor documents may not distinguish which shipment belongs to which job. A fluent fine-tuned model may state incorrect amounts with conviction. The application must enforce semantic correctness through IDs, ledger queries, constraints, verified evidence and action guards.

Do not mistake perplexity improvement for user outcome improvement. Downstream task metrics decide whether a model change matters.

## 9. Minimal neural network lab

Implement:
1. NumPy linear model with manual gradient; compare to finite-difference numerical gradient.
2. Two-layer MLP on synthetic data, separate train/validation/test splits.
3. Binary classifier with cross-entropy; report precision, recall, calibration and confusion matrix.
4. Compare overparameterized model with weight decay/early stopping on held-out examples.
5. Build an embedding retrieval demo, then inject a stale but semantically similar record and measure failure.

**Finite-difference gradient check:**
`[L(w+ε)-L(w-ε)]/(2ε)` should approximately match the analytic gradient when numerical conditions are suitable.

## 10. What not to learn first

Training a foundation model from scratch requires huge data, evaluation, infrastructure and careful safety work. For a bootstrapped startup, it is generally the wrong first step compared with building a demonstrably better vertical product from existing models. Research a novel model architecture independently if it remains a long-term objective; keep a separate hypothesis and compute budget.

## 11. Review questions

- Why is a nonlinear activation essential?
- Explain what a gradient actually measures.
- What is the difference between training loss and task success?
- Why does an embedding not count as a verified fact?
- How does LoRA differ from retrieval?
- Why is Transformer attention not the same as persistent memory?
- What evidence would prove a new model architecture is better than a baseline?
- How do you detect leakage between train and test sets?

**Build target:** a reproducible training notebook with locked seeds, explicit data splits, baseline comparisons, numerical gradient checks and downstream evaluation.
