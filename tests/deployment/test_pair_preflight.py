"""Offline CLI checks against copied, mixed and restored deployment trees."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


CLI = Path(__file__).resolve().parents[2] / "deploy/candidate/pair-preflight.py"


class PairPreflight(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.args = ["verify"]
        for side in ("previous", "candidate"):
            api, ui = self.artifacts(side)
            static = ui / "standalone/.next/static/chunk.js"
            static.parent.mkdir(parents=True)
            api.write_text(f"{side} API bytes")
            static.write_text(f"{side} asset bytes")
            (ui / "standalone/.next/BUILD_ID").write_text("shared-build-id")
            (ui / "standalone/server.js").write_text("shared-server")
            captured = self.run_cli("capture", "--api", api, "--ui", ui)
            self.assertEqual(captured.returncode, 0, captured.stderr)
            self.args.extend([f"--{side}-api", api, f"--{side}-ui", ui, f"--{side}-pin",
                              json.loads(captured.stdout)["pair_sha256"]])

    def artifacts(self, side):
        root = self.root / side
        return root / "live.jar", root / ".next"

    def run_cli(self, *args):
        return subprocess.run([sys.executable, CLI, *args], capture_output=True, text=True)

    def test_verify_candidate_and_rollback_copies(self):
        live_api, live_ui = self.artifacts("installed")
        live_api.parent.mkdir()
        for side in ("candidate", "previous"):
            with self.subTest(side=side):
                api, ui = self.artifacts(side)
                shutil.copy2(api, live_api)
                if live_ui.exists():
                    shutil.rmtree(live_ui)
                shutil.copytree(ui, live_ui)
                result = self.run_cli(*self.args, "--inspect", side, "--inspect-api", live_api,
                                      "--inspect-ui", live_ui)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)["inspected_pair"], side)

    def test_reject_both_directions_of_mixed_installation(self):
        for api_side, ui_side in (("previous", "candidate"), ("candidate", "previous")):
            for expected in ("previous", "candidate"):
                with self.subTest(api_side=api_side, expected=expected):
                    result = self.run_cli(*self.args, "--inspect", expected,
                                          "--inspect-api", self.artifacts(api_side)[0],
                                          "--inspect-ui", self.artifacts(ui_side)[1])
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("inspected artifacts", result.stderr)

    def test_stale_static_after_copy_and_stale_rollback_jar(self):
        static = self.artifacts("candidate")[1] / "standalone/.next/static/chunk.js"
        original = static.read_bytes()
        static.write_text("stale asset")
        self.assertIn("candidate artifact pair differs", self.run_cli(*self.args).stderr)
        static.write_bytes(original)
        self.artifacts("previous")[0].write_text("wrong backup contents")
        self.assertIn("previous artifact pair differs", self.run_cli(*self.args).stderr)

    def test_missing_static_and_unverifiable_ui_entries(self):
        api, ui = self.artifacts("previous")
        external = self.root / "private"
        external.write_text("sensitive-test-value")
        entry = ui / "standalone/extra"
        entry.symlink_to(external)
        for kind in ("symlink", "fifo", "dotenv", "missing-static"):
            with self.subTest(kind=kind):
                if kind == "fifo":
                    entry.unlink()
                    os.mkfifo(entry)
                elif kind == "dotenv":
                    entry.unlink()
                    (ui / "standalone/.env.production").write_text("sensitive-test-value")
                elif kind == "missing-static":
                    (ui / "standalone/.env.production").unlink()
                    (ui / "standalone/.next/static/chunk.js").unlink()
                result = self.run_cli("capture", "--api", api, "--ui", ui)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("sensitive-test-value", result.stderr + result.stdout)

    def test_incomplete_inspection_refused(self):
        self.assertNotEqual(self.run_cli(*self.args, "--inspect", "candidate").returncode, 0)


if __name__ == "__main__":
    unittest.main()
