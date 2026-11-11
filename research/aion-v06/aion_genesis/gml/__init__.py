"""Genesis Machine Learning (GML-01): experience → parameters → evaluation.

Six modules with one-way dependencies:

    laboratory  (worlds, hidden truth)      ─┐
    academy     (curriculum, proposals)      ├─> factory (datasets) ─> training
    runtime     (policies, model backends)  ─┘                          │
    authority   (sealed tests, statistics, verdicts)  <─────────────────┘

``authority`` and the hidden side of ``laboratory`` are never imported by
``runtime`` or ``training``; a test enforces it. Same-process separation is
not a security boundary and nothing here is externally custodied.
"""

GML_VERSION = "gml-01.0"
