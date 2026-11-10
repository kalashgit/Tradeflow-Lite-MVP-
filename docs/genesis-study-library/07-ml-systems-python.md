# 07 — Practical machine learning systems and Python engineering

**Source clarification:** Your Google link #2 resolved to *Designing Machine Learning Systems with Python* (2016) by David Julian (some metadata also credits Vahid Mirjalili), [Google Books metadata](https://books.google.com/books/about/Designing_Machine_Learning_Systems_with.html?id=vxOwDAEACAAJ). It is **not** Chip Huyen's *Designing Machine Learning Systems* (2022), [publisher contents](https://www.oreilly.com/library/view/designing-machine-learning/9781098107956/). This module covers their broadly related subject area via an independent conceptual tutorial rather than pretending to have inspected both full books.

## 1. Define the learning problem before writing code

Ask:
- What decision will improve if this model is right?
- What target can be measured objectively?
- Are enough representative examples available?
- How costly are false positives versus false negatives?
- What simple baseline could solve the task?
- What changes when the data distribution shifts?

Example Genesis task: predict probability a materials shipment arrives after the promised date. Labels require actual delivery outcomes; anecdotes or free-text vendor sentiment are weak substitutes. A classifier should not replace direct tracking evidence when that evidence is available.

**Other model choices:** ranking risky jobs, regression for expected job duration, anomaly detection for duplicated invoice events, classification for document types, extraction of fields. Not all tasks need neural networks.

## 2. Baselines and feature leakage

Baseline 0: simple fixed rule (e.g., risk if `days_since_last_vendor_update > 7`).
Baseline 1: logistic regression or decision tree with ordinary features.
Baseline 2: a carefully selected nonlinearity/boosted-tree model.
Baseline 3: specialized pretrained embedding or LLM-based solution if justified.

Always compare advanced methods to the simple baseline on **held-out and temporally realistic** cases.

**Leakage example:** training a delivery-delay model with `actual_delivery_time` as a feature when predicting before delivery. This creates artificial accuracy. Similarly, using post-action notes to evaluate decisions supposedly made before the notes existed is future leakage.

Use rolling time-based validation when the goal is future prediction. Group by customer/job/vendor as appropriate to avoid memorizing duplicated entity patterns.

## 3. Data lifecycle

```text
Raw source → validation → normalization → dataset version
           → split policy → feature extraction
           → training → evaluation → model artifact
           → canary/shadow testing → deployment
           → monitoring → review/retrain decision
```

Every stage should record provenance, schema version, code commit and relevant parameters. When the model performs worse, you need to locate whether the cause was data drift, code change, policy change or genuine harder cases.

**Data quality tests:** required fields, unique keys, referential integrity, numeric ranges, date ordering, class proportions, unexpected null changes and tenant separation.

## 4. Bias and imbalanced events

If only 2% of shipments are late, a model that always predicts "on time" achieves 98% accuracy while identifying zero late shipments.

Use precision, recall, F1, precision-recall curves, balanced metrics, and especially calibrated probability plus decision-specific costs.

Example: false alert costs an employee 5 minutes; missed high-risk delay could cost an entire project day. Choose threshold according to *measured* costs and uncertainty, rather than maximizing a generic F1 score.

**Calibration:** among shipments assigned 30% delay probability, roughly 30% should actually be delayed over a large representative sample. Evaluate reliability diagrams and proper scoring rules such as Brier score when appropriate.

## 5. Minimal Python training skeleton

Below is instructional pseudo-Python with scikit-learn-like structure; exact APIs should be tested in a real environment and pinned in dependencies.

```python
# Data already partitioned by observation date, then by job/entity.
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss

pipeline = Pipeline([
    ("scale", StandardScaler()),
    ("classifier", LogisticRegression(max_iter=1000))
])
pipeline.fit(X_train, y_train)
probs = pipeline.predict_proba(X_test)[:, 1]
print("average_precision", average_precision_score(y_test, probs))
print("brier", brier_score_loss(y_test, probs))
```

For categorical inputs use a `ColumnTransformer` with explicit encoders; do not fit transformations on the test set. Consider cross-validation within the training period, then a final untouched future test window.

## 6. Production monitoring

Separate categories:
- **Data integrity:** missing fields, invalid currency, schema mismatches, duplicate IDs.
- **Drift:** changes in feature distributions, class mix and behavior.
- **Model performance:** delayed label-based accuracy, calibration, precision/recall.
- **Business performance:** reduction of missed deadlines and administrative effort.
- **Operations:** errors, latency, cost, throughput, queue backlog and provider outages.
- **Safety:** unauthorized tool use, privacy breaches and unsupported claims.

Drift alone is not proof a model needs retraining; determine whether downstream performance actually changed. Retrain only when data rights, label quality and held-out improvement justify it.

## 7. Feature store versus evidence store

A feature such as `average_vendor_delay_days` is a derived statistic at a certain time; it must be versioned and computed from data that would have been available at prediction time.

An **evidence store** supports explanations and audit of particular claims. A **feature store** supports repeatable model inputs. They overlap, but neither can safely replace the other.

## 8. Serving and rollout

Choose between:
- batch daily predictions for dashboards;
- near-real-time predictions when events change;
- synchronous on-demand inference when user waits.

A rollout should start in **shadow mode**, then canary against a small allowlisted set with rollback conditions and owner sign-off as appropriate. Maintain a deterministic fallback if the ML component is unavailable.

Version the model, training dataset, feature schema, decision threshold and prompt/orchestrator configuration together. Otherwise you cannot reproduce a prediction.

## 9. Data rights and policy

Before ingesting employee or customer records, specify purpose, permitted access, retention and deletion handling. Do not use contractor data to train a cross-customer model without a lawful basis, contractual authorization and suitable safeguards. Synthetic benchmark data does not remove the need to review how real deployment processes personal data.

## 10. Exercises

1. Build a synthetic dataset of 2,000 shipments, 10% late, with a noisy ETA feature and a vendor-reliability feature. Split by time. Compare a rule and logistic regression.
2. Deliberately introduce future leakage. Notice the inflated score; remove the feature.
3. Add class imbalance. Compare accuracy against average precision and recall at a cost-sensitive threshold.
4. Simulate drift by changing one vendor's delivery pattern. Observe calibration failure before rebuilding.
5. Package the model behind a function with typed inputs and an explicit `insufficient_data` state.

**Study checkpoint:** explain data leakage, baselines, calibration, drift, model registry and why accuracy alone is a bad metric on rare events.

**Build target:** a small reproducible ML pipeline used only for a narrowly defined auxiliary task, not for controlling the entire business.
