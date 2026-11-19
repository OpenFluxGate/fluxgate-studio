"""Offline UI directory switch and interrupted-deployment guard tests."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
SCRIPT = Path(__file__).resolve().parents[2] / 'deploy/candidate/activate-ui.sh'
class UIActivation(unittest.TestCase):
    def simulate(self, failure='', pending=False, runtime_env=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            live, stage, binary = root/'.next', root/'stage', root/'bin'
            binary.mkdir()
            for tree, value in [(live,'old'),(stage,'new')]:
                (tree/'standalone/.next/static').mkdir(parents=True)
                (tree/'standalone/server.js').write_text(value)
                (tree/'standalone/.next/BUILD_ID').write_text(value)
                (tree/'standalone/.next/static/test.js').write_text(value)
            if pending: (root/'.activation-pending').write_text('prior')
            if runtime_env: (live/'standalone/.env.production').write_text('mock')
            mocks = {
                'sudo':'#!/bin/bash\nshift\nexec "$@"\n',
                'flock':'#!/bin/bash\nexit 0\n',
                'sleep':'#!/bin/bash\nexit 0\n',
                'systemctl':'''#!/bin/bash
printf '%s\\n' "$*" >> "$ROOT/events"
case "$1" in
show) case "$*" in
*LoadState*) echo loaded;;
*ActiveState*) echo inactive;;
*MainPID*) if [[ -f $ROOT/inactive ]]; then echo 0; else echo 100; fi;;
*WorkingDirectory*) echo "$ROOT/.next/standalone";;
*ExecStart*) echo "/usr/bin/node $ROOT/.next/standalone/server.js";; esac;;
start) rm -f "$ROOT/inactive"; if [[ $FAILURE == term && $(cat "$ROOT/.next/standalone/server.js") == new ]]; then kill -TERM "$PPID"; exit 1; fi
[[ $FAILURE == start && $(cat "$ROOT/.next/standalone/server.js") == new ]] && exit 1;;
stop) if [[ $FAILURE == stop && ! -f $ROOT/stopped ]]; then touch "$ROOT/stopped"; exit 1; fi; touch "$ROOT/inactive";;
esac
exit 0
''',
                'curl':'''#!/bin/bash
[[ ${!#} == http://127.0.0.1:3000/login ]] || exit 1
if [[ $(cat "$ROOT/.next/standalone/server.js") == new ]]; then
  [[ $FAILURE == health ]] && exit 22
  [[ $FAILURE == redirect ]] && { printf 302; exit 0; }
fi
printf 200
''',
            }
            for name, content in mocks.items():
                file=binary/name; file.write_text(content); file.chmod(0o755)
            (binary/'sitecustomize.py').write_text("""import os
rename = os.rename
def switch(source, destination):
    if os.getenv('FAILURE') == 'move' and os.path.basename(source) == 'next':
        raise OSError('simulated second rename failure')
    rename(source, destination)
os.rename = switch
""")
            env=dict(os.environ,PYTHONPATH=str(binary),PATH=str(binary)+':'+os.environ['PATH'],ROOT=str(root),FAILURE=failure)
            result=subprocess.run(['bash',str(SCRIPT),str(root),str(stage)],env=env,text=True,capture_output=True)
            return result.returncode,(live/'standalone/server.js').read_text(),(root/'events').read_text() if (root/'events').exists() else '',result.stderr
    def test_success(self):
        code,value,_,_=self.simulate(); self.assertEqual((code,value),(0,'new'))
    def test_start_rollback(self):
        code,value,_,err=self.simulate('start'); self.assertEqual(value,'old'); self.assertNotEqual(code,0); self.assertIn('restored and healthy',err)
    def test_health_rollback(self):
        code,value,_,err=self.simulate('health'); self.assertEqual(value,'old'); self.assertNotEqual(code,0); self.assertIn('restored and healthy',err)
    def test_login_redirect_does_not_count_as_healthy(self):
        code, value, _, error = self.simulate('redirect')
        self.assertEqual(value, 'old')
        self.assertNotEqual(code, 0)
        self.assertIn('restored and healthy', error)
    def test_switch_failure_rollback(self):
        code,value,_,err=self.simulate('move'); self.assertEqual(value,'old'); self.assertNotEqual(code,0); self.assertIn('restored and healthy',err)
    def test_term_during_start_restores_old(self):
        code,value,_,err=self.simulate('term'); self.assertEqual(value,'old'); self.assertNotEqual(code,0); self.assertIn('restored and healthy',err)
    def test_stop_failure_preserves_old(self):
        code,value,_,_=self.simulate('stop'); self.assertEqual(value,'old'); self.assertNotEqual(code,0)
    def test_pending_blocks_before_service_action(self):
        code,value,events,_=self.simulate(pending=True); self.assertEqual(value,'old'); self.assertNotEqual(code,0); self.assertEqual(events,'')
    def test_runtime_env_blocks_before_service_action(self):
        code,value,events,_=self.simulate(runtime_env=True); self.assertEqual(value,'old'); self.assertNotEqual(code,0); self.assertEqual(events,'')
if __name__=='__main__': unittest.main()
