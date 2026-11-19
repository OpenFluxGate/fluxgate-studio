"""Exercise persisted journal layouts using real files and interrupted renames."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

JOURNAL = Path(__file__).resolve().parents[2] / 'deploy/candidate/transaction.py'


class JournalRecovery(unittest.TestCase):
    def prepare(self, component):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.component = component
        self.backup = self.root / 'rollback.12345678'
        self.backup.mkdir()
        suffix = '.jar' if component == 'api' else ''
        self.next = self.backup / ('next' + suffix)
        self.failed = self.backup / ('failed' + suffix)
        self.previous = self.backup / ('previous' + suffix)
        self.live = self.root / ('fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar' if suffix else '.next')
        self.marker = self.root / '.activation-pending'
        for path, version in [(self.live, 'old'), (self.next, 'new')]:
            if suffix:
                path.write_text(version)
            else:
                (path / 'standalone/.next/static').mkdir(parents=True)
                (path / 'standalone/.next/static/asset.js').write_text(version)
                (path / 'standalone/.next/BUILD_ID').write_text(version)
                (path / 'standalone/server.js').write_text(version)
        self.original_inode = self.live.stat().st_ino
        self.journal('begin', self.backup.name)

    def journal(self, action, *args, success=True):
        proc = subprocess.run([sys.executable, JOURNAL, action, self.component, self.root, *args],
                              capture_output=True, text=True)
        self.assertEqual(proc.returncode == 0, success, proc.stderr)
        return proc

    def interrupt(self, step):
        if step >= 1:
            self.live.rename(self.previous)
        if step >= 2:
            self.next.rename(self.live)
        if step >= 3:
            self.live.rename(self.failed)
        if step >= 4:
            self.previous.rename(self.live)

    def test_resume_every_switch_and_rollback_boundary(self):
        for component in ('api', 'ui'):
            for step in range(5):
                with self.subTest(component=component, step=step):
                    self.prepare(component)
                    self.interrupt(step)
                    self.journal('restore')
                    self.journal('restore')
                    self.assertEqual(self.live.stat().st_ino, self.original_inode)
                    self.assertTrue(self.marker.exists())
                    self.journal('finish')
                    self.assertFalse(self.marker.exists())

    def test_conflicting_artifact_and_tampered_previous_are_preserved(self):
        for component in ('api', 'ui'):
            with self.subTest(component=component):
                self.prepare(component)
                self.interrupt(1)
                self.live.symlink_to(self.next)
                self.journal('restore', success=False)
                self.assertTrue(self.live.is_symlink())
                self.live.unlink()
                old_content = self.previous if component == 'api' else self.previous / 'standalone/server.js'
                old_content.write_text('modified')
                self.journal('restore', success=False)
                self.assertTrue(self.marker.exists())
                self.assertFalse(self.live.exists())

    def test_changed_ui_asset_blocks_restore_even_when_entry_points_match(self):
        self.prepare('ui')
        self.interrupt(2)
        (self.previous / 'standalone/.next/static/asset.js').write_text('tampered')
        self.assertEqual((self.previous / 'standalone/server.js').read_text(), 'old')
        self.assertEqual((self.previous / 'standalone/.next/BUILD_ID').read_text(), 'old')
        self.journal('restore', success=False)
        self.assertTrue(self.marker.exists())
        self.assertEqual((self.live / 'standalone/server.js').read_text(), 'new')

    def test_identical_ui_copy_cannot_replace_journaled_directory(self):
        self.prepare('ui')
        self.interrupt(2)
        original = self.backup / 'old-original'
        self.previous.rename(original)
        shutil.copytree(original, self.previous)
        self.journal('restore', success=False)
        self.assertTrue(self.marker.exists())

    def test_internal_link_preserves_identity_across_rename(self):
        self.prepare('ui')
        self.marker.unlink()
        (self.live / 'standalone/internal.js').symlink_to('.next/static/asset.js')
        self.journal('begin', self.backup.name)
        self.journal('switch')
        self.journal('restore')
        self.journal('finish')
        self.assertTrue((self.live / 'standalone/internal.js').is_symlink())

    def test_next_cache_may_change_without_invalidating_restore(self):
        self.prepare('ui')
        self.interrupt(2)
        cache = self.live / 'standalone/.next/cache'
        cache.mkdir()
        (cache / 'runtime-data').write_text('from runtime')
        self.journal('restore')
        self.journal('finish')
        self.assertFalse(self.marker.exists())

    def test_link_into_runtime_cache_is_rejected(self):
        self.prepare('ui')
        self.marker.unlink()
        cache = self.next / 'standalone/.next/cache'
        cache.mkdir()
        (cache / 'mutable.js').write_text('not fingerprinted')
        (self.next / 'standalone/mutable.js').symlink_to('.next/cache/mutable.js')
        self.journal('begin', self.backup.name, success=False)
        self.assertFalse(self.marker.exists())

    def test_legacy_or_misdirected_journal_requires_review(self):
        self.prepare('api')
        original = json.loads(self.marker.read_text())
        for state in ('/tmp/rollback.12345678',
                      json.dumps(dict(original, backup='../outside')),
                      json.dumps(dict(original, format=1)),
                      json.dumps(dict(original, component='ui'))):
            with self.subTest(state=state):
                self.marker.write_text(state)
                self.journal('restore', success=False)
                self.assertEqual(self.marker.read_text(), state)
                self.assertEqual(self.live.stat().st_ino, self.original_inode)

    def test_same_build_bytes_still_identify_separate_releases(self):
        self.prepare('api')
        self.marker.unlink()
        self.next.write_bytes(self.live.read_bytes())
        self.journal('begin', self.backup.name)
        self.journal('switch')
        self.journal('restore')
        self.assertEqual(self.live.stat().st_ino, self.original_inode)
