import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


CLI = Path(__file__).resolve().parents[2] / "deploy/candidate/stage-bundles.py"
COMMIT = "abcde12345" * 4
REQUIRED = (".next/standalone/server.js", ".next/standalone/.next/BUILD_ID",
            ".next/standalone/.next/static/chunk.js")


class BundleStaging(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.dest = self.root / "verified"
        self.api, self.ui = self.root / "api", self.root / "ui"
        for directory in (self.api, self.ui):
            directory.mkdir()
            for name in ("activate.sh", "artifact_identity.py", "recovery-common.sh", "transaction.py"):
                (directory / name).write_text("#!/bin/sh\nexit 7\n")
            (directory / "SOURCE_COMMIT").write_text(COMMIT + "\n")
        (self.api / "api.jar").write_bytes(b"API")
        self.archive()
        self.sums(self.api)
        self.sums(self.ui)

    def archive(self, names=REQUIRED, link=None):
        with tarfile.open(self.ui / "ui.tar.gz", "w:gz") as archive:
            for name in names:
                item = tarfile.TarInfo(name)
                item.size = 1
                archive.addfile(item, io.BytesIO(b"x"))
            if link:
                item = tarfile.TarInfo(".next/standalone/link")
                item.type = tarfile.SYMTYPE
                item.linkname = link
                archive.addfile(item)

    def sums(self, directory):
        lines = [f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
                 for path in sorted(directory.iterdir()) if path.name != "SHA256SUMS"]
        (directory / "SHA256SUMS").write_text("".join(lines))

    def run_cli(self, **changes):
        values = {"commit": COMMIT, "api-bundle": self.api, "ui-bundle": self.ui, "destination": self.dest}
        values.update(changes)
        args = [arg for key, value in values.items() for arg in ("--" + key, value)]
        return subprocess.run([sys.executable, CLI, *args], capture_output=True, text=True)

    def rejects(self, **changes):
        result = self.run_cli(**changes)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse(self.dest.exists(), result.stderr)

    def test_stages_exact_copies_then_refuses_overwrite(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.dest / "SOURCE_COMMIT").read_text(), COMMIT + "\n")
        for name, original in (("api", self.api), ("ui", self.ui)):
            for path in original.iterdir():
                copy = self.dest / name / path.name
                self.assertEqual(copy.read_bytes(), path.read_bytes())
                self.assertFalse(copy.stat().st_mode & 0o111)
        (self.dest / "local").write_text("retained")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual((self.dest / "local").read_text(), "retained")

    def test_rejects_mixed_commit_even_if_hashes_match(self):
        self.rejects(commit="abcde123")
        for source in ("1" * 40 + "\n", COMMIT, COMMIT + "\n\n"):
            (self.ui / "SOURCE_COMMIT").write_text(source)
            self.sums(self.ui)
            self.rejects()

    def test_rejects_different_shared_helpers_despite_valid_manifests(self):
        for name in ("artifact_identity.py", "transaction.py", "recovery-common.sh"):
            with self.subTest(name=name):
                (self.ui / name).write_bytes(b"other")
                self.sums(self.ui)
                self.rejects()
                (self.ui / name).write_bytes((self.api / name).read_bytes())

    def test_rejects_missing_extra_symlinked_or_corrupted_payload(self):
        artifact = self.api / "api.jar"
        artifact.rename(self.root / "elsewhere")
        self.rejects()
        artifact.symlink_to(self.root / "elsewhere")
        self.rejects()
        artifact.unlink()
        artifact.write_bytes(b"changed")
        self.rejects()
        artifact.write_bytes(b"API")
        (self.api / "extra").touch()
        self.rejects()
        (self.api / "extra").unlink()
        link = self.root / "download"
        link.symlink_to(self.api, target_is_directory=True)
        self.rejects(**{"api-bundle": link})

    def test_rejects_malformed_duplicate_missing_or_traversing_checksums(self):
        sums = self.api / "SHA256SUMS"
        original = sums.read_bytes()
        for replacement in (original + original.splitlines(True)[0], original.split(b"\n", 1)[1],
                            original.replace(b"  api.jar", b"  ../api.jar"),
                            original.replace(b"  api.jar", b" *api.jar"), original.rstrip(b"\n")):
            with self.subTest(manifest=replacement):
                sums.write_bytes(replacement)
                self.rejects()

    def test_rejects_unsafe_or_incomplete_ui_archive_without_extraction(self):
        for names, link in ((REQUIRED + ("../outside",), None), (REQUIRED, "/etc"),
                            (REQUIRED + (".next/standalone/.env.production",), None),
                            (REQUIRED + (".next/standalone/server.js/child",), None),
                            (REQUIRED + (REQUIRED[0],), None), (REQUIRED[:2], None)):
            with self.subTest(names=names, link=link):
                self.archive(names, link)
                self.sums(self.ui)
                self.rejects()
        self.assertFalse((self.root / "outside").exists())


if __name__ == "__main__":
    unittest.main()
