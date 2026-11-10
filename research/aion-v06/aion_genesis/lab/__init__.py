"""AION Genesis v1.0 experimental control plane (synthetic research only).

Layout mirrors the trust boundary:

* ``protocol``, ``policies`` — public side; may be imported by candidates.
* ``hidden/`` and ``referee`` — held-out world state and grading. Nothing in
  ``aion_genesis.runtime``, ``aion_genesis.domains`` or the planner may import
  them. This is module separation inside one process, **not** a security
  boundary; a hostile candidate with code execution could still cheat.
"""
