"""Genesys operational failures reach the Academy as remediation requests, not labels."""

import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from aion_genesis.gml import operational_intake as intake

ROOT = Path(__file__).resolve().parents[3]


class OperationalIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.failures = Path(cls.folder.name) / "failures.jsonl"
        if shutil.which("node") is None:
            raise unittest.SkipTest("node is required to produce benchmark failures")
        subprocess.run(["node", "scripts/run-genesys-operational-benchmark.cjs", "--mode=baseline",
                        "--failures=" + str(cls.failures)], cwd=ROOT, check=True,
                       capture_output=True, timeout=300)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def test_real_benchmark_failures_validate_and_group_by_capability(self):
        failures = intake.load(self.failures)
        self.assertGreater(len(failures), 0)
        queue = intake.build_queue(failures)
        self.assertEqual(queue["training_labels_created"], 0)
        self.assertEqual(sum(len(p["evidence_failure_ids"]) for p in queue["proposals"]), len(failures))
        for proposal in queue["proposals"]:
            self.assertFalse(proposal["evaluation_cases_reusable_for_training"])
            self.assertIn("NEW development", proposal["requested_work"])
            self.assertTrue(proposal["evaluation_case_ids"])

    def test_tampered_or_trainable_failures_are_rejected(self):
        record = intake.load(self.failures)[0]
        edited = {**record, "failureClass": "nothing_wrong"}
        with self.assertRaises(ValueError):
            intake.validate(edited)
        trainable = {**record, "trainingEligible": True}
        with self.assertRaises(ValueError):
            intake.validate(trainable)
        with self.assertRaises(ValueError):
            intake.validate({**record, "schema": "Other/1"})

    def test_unsafe_writes_rank_first(self):
        record = intake.load(self.failures)[0]
        base = {k: v for k, v in record.items() if k != "id"}

        def seal(body):
            from hashlib import sha256
            return {**body, "id": "GOF-" + sha256(intake._canonical(body).encode()).hexdigest()[:20]}

        unsafe = seal({**base, "failureClass": "unsafe_write", "category": "unauthorized"})
        queue = intake.build_queue([intake.validate(record), intake.validate(unsafe)])
        self.assertEqual(queue["proposals"][0]["failure_class"], "unsafe_write")

    def test_cli_writes_a_queue(self):
        out = Path(self.folder.name) / "queue.json"
        self.assertEqual(intake.main(["--failures", str(self.failures), "--out", str(out)]), 0)
        self.assertEqual(json.loads(out.read_text())["schema"], intake.QUEUE_SCHEMA)


if __name__ == "__main__":
    unittest.main()
