"""HIDDEN SIDE of the laboratory: world state, true dynamics and oracles.

Imported only by ``lab.referee`` and ``lab.runner``. Candidate code paths
(``aion_genesis.runtime``, ``aion_genesis.domains``, the planner, policies)
must never import this package; ``tests/test_genesis_lab.py`` enforces that.
"""

from .worlds import FAMILIES, make_world

__all__ = ["FAMILIES", "make_world"]
