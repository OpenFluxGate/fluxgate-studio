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
            root = Path(tmp).resolve()
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
*ActiveState*) echo inactive;;
*MainPID*) if [[ -f $ROOT/inactive ]]; then echo 0; elif [[ -f $ROOT/probe-pid ]]; then cat "$ROOT/probe-pid"; else echo 100; fi;;
*ExecStart*) echo "/usr/bin/java -jar ${TARGET}";; esac;;
start) rm -f "$ROOT/inactive" "$ROOT/probe-pid"; if [[ $FAILURE == start && $(cat "$LIVE") == new ]]; then exit 1; fi;;
stop) if [[ $FAILURE == stop && ! -f $ROOT/stopped ]]; then touch "$ROOT/stopped"; exit 1; fi; touch "$ROOT/inactive";;
esac
''',
                'curl': '''#!/bin/bash
[[ ${!#} == http://127.0.0.1:8081/actuator/health ]] || exit 1
while [[ $# -gt 0 ]]; do
  if [[ $1 == --output ]]; then output=$2; shift; fi
  shift
done
body='{"status":"UP"}'
status=200
if [[ $(cat "$LIVE") == new ]]; then
  case $FAILURE in
    health) exit 22 ;;
    status-redirect) status=302 ;;
    status-no-content) status=204 ;;
    body-down) body='{"status":"DOWN"}' ;;
    body-malformed) body=invalid ;;
    unstable-pid)
      value=100
      if [[ -f $ROOT/probe-pid ]]; then value=$(cat "$ROOT/probe-pid"); fi
      echo "$((value + 1))" > "$ROOT/probe-pid" ;;
  esac
fi
printf %s "$body" > "$output"
printf %s "$status"
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
    def test_http_status_json_and_main_pid_gate(self):
        for failure in ('status-redirect', 'status-no-content', 'body-down', 'body-malformed', 'unstable-pid'):
            with self.subTest(failure=failure):
                code, data, _, error = self.simulate(failure=failure)
                self.assertNotEqual(code, 0)
                self.assertEqual(data, 'old')
                self.assertIn('restored and healthy', error)

    def test_stop_failure_preserves_old(self):
        code,data,_,err = self.simulate(failure='stop')
        self.assertNotEqual(code,0)
        self.assertEqual(data,'old')
        self.assertIn('restored and healthy',err)

if __name__ == '__main__':
    unittest.main()
