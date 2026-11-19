#!/usr/bin/env python3
"""Durable, same-filesystem activation journal for the two Studio services."""
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

from artifact_identity import file_hash, ui_tree_hash


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def publish(path, value):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
        file.write(value.encode())
        file.flush()
        os.fsync(file.fileno())
    try:
        os.link(file.name, path)  # Atomic publication without overwriting existing state.
    finally:
        os.unlink(file.name)
    sync_dir(path.parent)


def identity(path):
    if not os.path.lexists(path):
        return None
    entry = path.lstat()
    contents = file_hash(path) if component == 'api' else ui_tree_hash(path)
    current = path.lstat()
    require((entry.st_dev, entry.st_ino) == (current.st_dev, current.st_ino),
            'artifact replaced during inspection')
    return [entry.st_dev, entry.st_ino, contents]


def move(source, dest):
    require(not os.path.lexists(dest), 'conflicting destination')
    os.rename(source, dest)
    sync_dir(source.parent)
    sync_dir(dest.parent)


def load():
    require(stat.S_ISREG(marker.lstat().st_mode) and marker.stat().st_size < 4096,
            'invalid activation marker')
    journal = json.loads(marker.read_text())
    require(isinstance(journal, dict) and journal.get('format') == 2
            and journal.get('component') == component, 'unsupported or mismatched activation journal')
    return journal


def classify():
    observed = [identity(p) for p in (live, previous, candidate, failed)]
    states = {'original': [old, None, new, None], 'between': [None, old, new, None],
              'switched': [new, old, None, None], 'restoring': [None, old, None, new],
              'restored': [old, None, None, new]}
    for state, layout in states.items():
        if observed == layout:
            return state
    raise ValueError('unrecognized artifact layout or contents; preserving journal')


def valid_id(value):
    return (isinstance(value, list) and len(value) == 3
            and type(value[0]) is int and value[0] >= 0
            and type(value[1]) is int and value[1] > 0
            and isinstance(value[2], str) and re.fullmatch(r'[0-9a-f]{64}', value[2]))


def main():
    global component, marker, live, previous, candidate, failed, old, new
    action, component, root_arg, *args = sys.argv[1:]
    require(component in ('api', 'ui'), 'unknown component')
    root = Path(root_arg)
    require(root.is_absolute() and root == root.resolve(), 'canonical absolute root required')
    live = root / ('fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar' if component == 'api' else '.next')
    marker = root / '.activation-pending'
    journal = {} if action == 'begin' else load()
    name = args[0] if action == 'begin' else journal['backup']
    require(isinstance(name, str) and re.fullmatch(r'rollback\.[a-zA-Z0-9]{8}', name),
            'invalid rollback directory name')
    backup = root / name
    require(stat.S_ISDIR(backup.lstat().st_mode) and backup.stat().st_dev == root.stat().st_dev,
            'invalid rollback directory')
    suffix = '.jar' if component == 'api' else ''
    previous, candidate, failed = (backup / (n + suffix) for n in ('previous', 'next', 'failed'))
    if action == 'begin':
        old, new = identity(live), identity(candidate)
        require(valid_id(old) and valid_id(new) and old[:2] != new[:2], 'invalid source artifacts')
        require(classify() == 'original', 'unexpected initial state')
        # Flush staged files and the old serving tree before publishing the intent.
        os.sync()
        publish(marker, json.dumps(dict(format=2, component=component, backup=name, old=old, new=new)))
        return
    old, new = journal['old'], journal['new']
    require(valid_id(old) and valid_id(new) and old[:2] != new[:2], 'invalid journal identity')
    state = classify()
    ticket = backup / 'restored-boot-id'
    if action == 'switch':
        require(state == 'original', 'switch requires original state')
        move(live, previous)
        move(candidate, live)
    elif action == 'restore':
        if state == 'switched':
            move(live, failed)
        if state in ('switched', 'restoring', 'between'):
            move(previous, live)
        require(classify() in ('original', 'restored'), 'restore did not complete')
    elif action == 'arm':
        require(state in ('original', 'restored'), 'old artifact required')
        # A reboot can interrupt confirmation. Refresh its proof for this boot.
        if os.path.lexists(ticket):
            require(stat.S_ISREG(ticket.lstat().st_mode), 'invalid boot ticket')
            ticket.unlink()
        publish(ticket, Path('/proc/sys/kernel/random/boot_id').read_text())
    elif action == 'armed':
        if not os.path.lexists(ticket):
            return  # No boot restoration in progress.
        require(stat.S_ISREG(ticket.lstat().st_mode) and
                ticket.read_text() == Path('/proc/sys/kernel/random/boot_id').read_text()
                and state in ('original', 'restored'), 'invalid boot recovery proof')
        print('armed')
    elif action in ('commit', 'finish'):
        require(state in (('switched',) if action == 'commit' else ('original', 'restored')),
                'unexpected completion state')
        marker.unlink()
        sync_dir(root)
    else:
        require(action == 'inspect', 'unknown transaction operation')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, RuntimeError) as error:
        sys.exit(f'Activation journal: {error}')
