#!/usr/bin/env python3
"""Stage two previously downloaded Studio Actions bundles from the same verified workflow commit."""
import argparse
from contextlib import ExitStack
import hashlib
import os
from pathlib import Path
import re
import stat
import sys
import tarfile


COMMON_HELPERS = {"artifact_identity.py", "recovery-common.sh", "transaction.py"}
SHARED = {"SOURCE_COMMIT", "activate.sh"} | COMMON_HELPERS
CHUNK = 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def parse_sums(data, expected):
    sums = {}
    for line in data.splitlines(keepends=True):
        match = re.fullmatch(rb"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)\n", line)
        require(match, "invalid SHA256SUMS entry")
        digest, name = (field.decode("ascii") for field in match.groups())
        require(name in expected and name not in sums, "unexpected or duplicate checksum filename")
        sums[name] = digest
    require(set(sums) == expected, "incomplete SHA256SUMS")
    return sums


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def copy_bundle(source, target, artifact, commit, cleanup):
    expected = SHARED | {artifact}
    directory = os.open(source, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        require(set(os.listdir(directory)) == expected | {"SHA256SUMS"}, "unexpected bundle contents")
        target.mkdir(mode=0o700)
        cleanup.callback(target.rmdir)
        for name in sorted(expected | {"SHA256SUMS"}):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
            with os.fdopen(fd, "rb") as original:
                info = os.fstat(fd)
                require(stat.S_ISREG(info.st_mode) and info.st_size > 0, "expected nonempty regular file")
                if name in {"SOURCE_COMMIT", "SHA256SUMS"}:
                    require(info.st_size <= 1024, "oversized bundle metadata")
                path = target / name
                with path.open("xb") as copied:
                    cleanup.callback(path.unlink)
                    for block in iter(lambda: original.read(CHUNK), b""):
                        copied.write(block)
                    copied.flush()
                    os.fsync(copied.fileno())
    finally:
        os.close(directory)
    sums = parse_sums((target / "SHA256SUMS").read_bytes(), expected)
    require((target / "SOURCE_COMMIT").read_bytes() == (commit + "\n").encode(), "source commit mismatch")
    for name, expected_hash in sums.items():
        digest = hashlib.sha256()
        with (target / name).open("rb") as copied:
            for block in iter(lambda: copied.read(CHUNK), b""):
                digest.update(block)
        require(digest.hexdigest() == expected_hash, f"checksum mismatch for {name}")
    sync_directory(target)
    return sums


def check_ui_archive(path):
    root = ".next/standalone"
    files = set()
    entries = {}
    with tarfile.open(path, "r|gz") as archive:
        for item in archive:
            parts = item.name.split("/")
            require(parts[:2] == [".next", "standalone"] and not {"", ".", ".."}.intersection(parts)
                    and "\\" not in item.name, "unexpected archive path")
            require(not any(part.startswith(".env") for part in parts), "environment file in UI archive")
            require(item.isdir() or item.type in (tarfile.REGTYPE, tarfile.AREGTYPE),
                    "links and special UI archive entries are unsupported")
            require(item.name not in entries and not item.mode & 0o6000, "duplicate or privileged archive entry")
            entries[item.name] = item.isdir()
            if item.isfile() and item.size:
                files.add(item.name)
    # Detect contradictory file/directory declarations regardless of archive order.
    for name in entries:
        parent = name.rpartition("/")[0]
        while parent.startswith(root):
            require(entries.get(parent, True), "non-directory archive path component")
            parent = parent.rpartition("/")[0]
    require({root + "/server.js", root + "/.next/BUILD_ID"} <= files
            and any(name.startswith(root + "/.next/static/") for name in files),
            "incomplete UI standalone archive")


def stage(commit, api, ui, destination):
    require(re.fullmatch("[a-f0-9]{40}", commit), "expected a full lowercase source commit SHA")
    # mkdir claims a new destination exclusively. Consumers require the final SOURCE_COMMIT marker.
    with ExitStack() as cleanup:
        destination.mkdir(mode=0o700)
        cleanup.callback(destination.rmdir)
        api_hashes = copy_bundle(api, destination / "api", "api.jar", commit, cleanup)
        ui_hashes = copy_bundle(ui, destination / "ui", "ui.tar.gz", commit, cleanup)
        for name in sorted(COMMON_HELPERS):
            require(api_hashes[name] == ui_hashes[name], f"shared helper differs across bundles: {name}")
        check_ui_archive(destination / "ui/ui.tar.gz")
        sync_directory(destination)
        sync_directory(destination.parent)
        # Hard link publishes a complete marker atomically without replacing an existing path.
        os.link(destination / "api/SOURCE_COMMIT", destination / "SOURCE_COMMIT")
        cleanup.callback((destination / "SOURCE_COMMIT").unlink)
        sync_directory(destination)
        cleanup.pop_all()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    for option in ("--api-bundle", "--ui-bundle", "--destination"):
        parser.add_argument(option, required=True, type=Path)
    args = parser.parse_args()
    stage(args.commit, args.api_bundle, args.ui_bundle, args.destination)
    print(f"Staged API and UI bundles for {args.commit} in {args.destination}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, tarfile.TarError, EOFError) as error:
        sys.exit(f"staging failed: {error}")
