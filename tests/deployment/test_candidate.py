"""Offline activation state machine tests, no production calls."""
import hashlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / 'deploy/candidate/activate-api.sh'

class Activation(unittest.TestCase):
    def simulate(self, failure='', bad_hash=False, wrong_target=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            live = root / 'fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar'
            live.write_text('old')
            staged = root / '0.5.0.jar'
            staged.write_text('new')
            binary = root / 'bin'
            binary.mkdir()
            mocks = {
                'sudo': '#!/bin/bash\nshift\nexec "$@"\n',
                'systemctl': '''#!/bin/bash
printf '%s\\n' "$*" >> "$ROOT/events"
case "$1" in
show) case "$*" in
*LoadState*) echo loaded;;
*ExecStart*) echo "/usr/bin/java -jar ${TARGET}";; esac;;
start) if [[ $FAILURE == start && $(cat "$LIVE") == new ]]; then exit 1; fi;;
stop) if [[ $FAILURE == stop && ! -f $ROOT/stopped ]]; then touch "$ROOT/stopped"; exit 1; fi;;
esac
''',
                'curl': '''#!/bin/bash
if [[ $FAILURE == health && $(cat "$LIVE") == new ]]; then exit 22; fi
exit 0
''',
                'sleep': '#!/bin/bash\nexit 0\n',
                # macOS has no flock/GNU chmod; mock these local-only contracts.
                'flock': '#!/bin/bash\nexit 0\n',
                'chmod': '#!/bin/bash\nexit 0\n',
                'sha256sum': '#!/bin/bash\nshasum -a 256 "$@"\n',
            }
            for name, content in mocks.items():
                file = binary / name
                file.write_text(content)
                file.chmod(0o755)
            env = dict(os.environ, PATH=str(binary)+':'+os.environ['PATH'], ROOT=str(root), LIVE=str(live), TARGET='wrong' if wrong_target else str(live), FAILURE=failure)
            digest = '0'*64 if bad_hash else hashlib.sha256(b'new').hexdigest()
            result = subprocess.run(['bash',str(SCRIPT),str(root),str(staged),digest],env=env,text=True,capture_output=True)
            return result.returncode, live.read_text(), (root/'events').read_text() if (root/'events').exists() else '', result.stderr

    def test_success(self):
        code, data, events, _ = self.simulate()
        self.assertEqual((code,data),(0,'new'))
        self.assertIn('stop fluxgate-admin-api', events)
    def test_checksum_never_stops_service(self):
        code,data,events,_ = self.simulate(bad_hash=True)
        self.assertNotEqual(code,0)
        self.assertEqual(data,'old')
        self.assertNotIn('stop ', events)
    def test_wrong_unit_target_never_stops(self):
        code,data,events,_ = self.simulate(wrong_target=True)
        self.assertNotEqual(code,0)
        self.assertEqual(data,'old')
        self.assertNotIn('stop ',events)
    def test_failed_start_restores_old_bytes(self):
        code,data,_,err = self.simulate(failure='start')
        self.assertNotEqual(code,0)
        self.assertEqual(data,'old')
        self.assertIn('restored and healthy',err)
    def test_failed_health_restores_old_bytes(self):
        code,data,_,err = self.simulate(failure='health')
        self.assertNotEqual(code,0)
        self.assertEqual(data,'old')
        self.assertIn('restored and healthy',err)
    def test_stop_failure_preserves_old(self):
        code,data,_,err = self.simulate(failure='stop')
        self.assertNotEqual(code,0)
        self.assertEqual(data,'old')
        self.assertIn('restored and healthy',err)

if __name__ == '__main__':
    unittest.main()
