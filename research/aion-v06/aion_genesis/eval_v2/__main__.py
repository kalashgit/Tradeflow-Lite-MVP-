"""CLI for the separate mock-workflow lab, its replay and human review."""

import argparse
import json
from pathlib import Path

from ..lab.ledger import read_ledger
from .calibration import blank_labels, calibrate, make_review_packet
from .runner import render_markdown, verify_run, write_run


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("run", help="Run fictional matched mock workflows")
    a.add_argument("--suite", required=True, choices=("dev", "validation"))
    a.add_argument("--out", required=True)
    v = sub.add_parser("verify", help="Verify immutable artifacts and replay decisions")
    v.add_argument("--out", required=True)
    p = sub.add_parser("packet", help="Create blinded synthetic public-only human rating cases")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--limit", type=int, default=18)
    p.add_argument("--reviewer-id", help="Also output one blank rating template")
    c = sub.add_parser("calibrate", help="Check independent human label agreement")
    c.add_argument("--packet", required=True)
    c.add_argument("--labels", nargs="+", required=True)
    c.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    if args.cmd == "run":
        result = write_run(args.suite, args.out)
        print(render_markdown(result))
    elif args.cmd == "verify":
        print(json.dumps(verify_run(args.out), sort_keys=True))
    elif args.cmd == "packet":
        verify_run(args.run_dir)
        path = Path(args.run_dir)
        result = json.loads((path / "result.json").read_text("utf-8"))
        records = read_ledger(path / "ledger.jsonl")
        packet = make_review_packet(result, records, args.limit)
        dest = Path(args.out)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n")
        if args.reviewer_id:
            template = blank_labels(packet, args.reviewer_id)
            dest.with_suffix(".blank-ratings.json").write_text(
                json.dumps(template, indent=2, sort_keys=True) + "\n")
        print(json.dumps({"packet": str(dest), "items": len(packet["items"]),
                          "human_ratings_received": False}))
    else:
        packet = json.loads(Path(args.packet).read_text("utf-8"))
        labels = [json.loads(Path(name).read_text("utf-8")) for name in args.labels]
        report = calibrate(packet, labels)
        target = Path(args.out)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        print(json.dumps({"output": str(target),
                          "items_to_adjudicate": len(report["items_needing_adjudication"]),
                          "adjudication_complete": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
