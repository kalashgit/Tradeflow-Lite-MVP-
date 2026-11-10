"""Synthetic TradeFlow adapter demo for the generic Situation Engine."""

import argparse
import json
from pathlib import Path

from .domains.electrical_contractor import DEMO_EVENTS, ElectricalContractorPack
from .situation_engine import SituationStore


def main():
    parser = argparse.ArgumentParser(description="AION v0.8 evidence-backed situation research")
    parser.add_argument("command", choices=("seed", "brief"))
    parser.add_argument("--db", required=True)
    parser.add_argument("--output")
    parser.add_argument("--budget", type=int, default=3)
    args = parser.parse_args()
    store = SituationStore(args.db)
    try:
        if args.command == "seed":
            inserted = sum(store.observe(event) for event in DEMO_EVENTS)
            # Preferences are given by the fictional operator, not inferred
            # from a user's actual business or from external signals.
            store.set_goal("DEMO-OWNER", "schedule", 4)
            store.set_goal("DEMO-OWNER", "cashflow", 3)
            store.set_goal("DEMO-OWNER", "compliance", 5)
            result = {"seeded_synthetic_events": inserted}
        else:
            result = store.investigate("DEMO-OWNER", ElectricalContractorPack(),
                                       attention_budget=args.budget)
    finally:
        store.close()
    encoded = json.dumps(result, sort_keys=True, indent=2)
    if args.output:
        Path(args.output).write_text(encoded + "\n", encoding="utf-8")
    print(encoded)


if __name__ == "__main__":
    main()
