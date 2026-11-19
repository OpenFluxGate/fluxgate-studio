"""Fingerprint immutable Studio release inputs for preflight and durable activation."""
import hashlib
import json
import os
import stat


def encoded(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def stamp(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def file_hash(path):
    original = path.lstat()
    if not stat.S_ISREG(original.st_mode):
        raise ValueError("expected a regular artifact file")
    digest = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        if stamp(os.fstat(fd)) != stamp(original):
            raise ValueError("artifact changed before inspection")
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
        if stamp(os.fstat(stream.fileno())) != stamp(original):
            raise ValueError("artifact changed during inspection")
    if stamp(path.lstat()) != stamp(original):
        raise ValueError("artifact replaced during inspection")
    return digest.hexdigest()


def ui_tree_hash(ui):
    tree = ui / "standalone"
    if ui.is_symlink() or tree.is_symlink() or not tree.is_dir():
        raise ValueError("expected an extracted .next/standalone tree")
    tree = tree.resolve(strict=True)
    cache = tree / ".next/cache"
    entries = []
    files = set()
    checked = [(ui, stamp(ui.lstat()))]

    def visit(path):
        info = path.lstat()
        if path == cache:
            if not stat.S_ISDIR(info.st_mode):
                raise ValueError("Next.js runtime cache must be a directory")
            return  # Next.js may populate this directory after successful activation.
        checked.append((path, stamp(info)))
        name = path.relative_to(tree).as_posix()
        if path.name.startswith(".env"):
            raise ValueError("deployment-local environment file requires separate review")
        if stat.S_ISDIR(info.st_mode):
            entries.append([name, "dir"])
            for child in sorted(path.iterdir()):
                visit(child)
        elif stat.S_ISREG(info.st_mode):
            entries.append([name, "file", info.st_mode & 0o111, file_hash(path)])
            if info.st_size:
                files.add(name)
        elif stat.S_ISLNK(info.st_mode):
            target = os.readlink(path)
            resolved = path.resolve(strict=True)
            if (os.path.isabs(target) or tree not in resolved.parents
                    or resolved == cache or cache in resolved.parents):
                raise ValueError("UI link must resolve inside the immutable standalone tree")
            entries.append([name, "link", target])
        else:
            raise ValueError("unsupported entry in UI tree")

    visit(tree)
    if not {"server.js", ".next/BUILD_ID"} <= files or not any(
        name.startswith(".next/static/") for name in files
    ):
        raise ValueError("standalone UI needs server.js, BUILD_ID and a nonempty static asset")
    if any(stamp(path.lstat()) != before for path, before in checked):
        raise ValueError("release files changed during inspection")
    return hashlib.sha256(encoded(entries)).hexdigest()
