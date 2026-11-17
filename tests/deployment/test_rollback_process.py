"""Model process identity separately from on-disk bytes during rollback."""
import os
import hashlib
import tempfile
import subprocess
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
class ProcessRollback(unittest.TestCase):
    def run_case(self,component,mode):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); bin=root/'bin';bin.mkdir()
            if component=='api':
                live=root/'fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar';live.write_text('old')
                stage=root/'stage.jar';stage.write_text('new')
                target=f'/usr/bin/java -jar {live}'
            else:
                stage=root/'stage'
                for tree,ver in [(root/'.next','old'),(stage,'new')]:
                    (tree/'standalone/.next/static').mkdir(parents=True)
                    (tree/'standalone/server.js').write_text(ver)
                    (tree/'standalone/.next/BUILD_ID').write_text(ver)
                    (tree/'standalone/.next/static/a.js').write_text(ver)
                live=root/'.next/standalone/server.js'
                target=f'/usr/bin/node {live}'
            (root/'pid').write_text('10');(root/'running').write_text('old')
            mocks={
              'sudo':'#!/bin/bash\nshift\nexec "$@"\n',
              'flock':'#!/bin/bash\nexit 0\n',
              'chmod':'#!/bin/bash\nexit 0\n',
              'sleep':'#!/bin/bash\nexit 0\n',
              'sha256sum':'#!/bin/bash\nshasum -a 256 "$@"\n',
              'systemctl':'''#!/bin/bash
case "$1" in
show) case "$*" in
*LoadState*) echo loaded;;
*ExecStart*) echo "$TARGET";;
*WorkingDirectory*) echo "$ROOT/.next/standalone";;
*ActiveState*) if [[ $(cat "$ROOT/pid") == 0 ]]; then echo inactive; else echo active; fi;;
*MainPID*) cat "$ROOT/pid";; esac;;
is-active) [[ $(cat "$ROOT/pid") != 0 ]];;
stop)
if [[ $(cat "$ROOT/running") == new && $MODE != success ]]; then
  [[ $MODE == stop_error ]] && exit 1
  exit 0
fi
echo 0 > "$ROOT/pid";;
start)
if [[ $(cat "$ROOT/pid") == 0 ]]; then
  cp "$LIVE" "$ROOT/running"
  if [[ $(cat "$LIVE") == new ]]; then echo 20 > "$ROOT/pid"; else echo 30 > "$ROOT/pid"; fi
fi;;
esac
''',
              'curl':'''#!/bin/bash
[[ $(cat "$ROOT/running") == old ]]
'''}
            for name,text in mocks.items():
                f=bin/name;f.write_text(text);f.chmod(0o755)
            env=dict(os.environ,PATH=str(bin)+':'+os.environ['PATH'],ROOT=str(root),LIVE=str(live),TARGET=target,MODE=mode)
            p=subprocess.run(['bash',str(ROOT/f'deploy/candidate/activate-{component}.sh'),str(root),str(stage),hashlib.sha256(b'new').hexdigest()],env=env,text=True,capture_output=True)
            return p.returncode,live.read_text(),(root/'running').read_text().strip(),(root/'pid').read_text().strip(),(root/'.activation-pending').exists(),p.stderr
    def test_stop_error_never_restores_over_running_new_process(self):
        for component in ['api','ui']:
            with self.subTest(component=component):
                code,disk,running,pid,pending,err=self.run_case(component,'stop_error')
                self.assertNotEqual(code,0);self.assertEqual((disk,running,pid,pending),('new','new','20',True));self.assertIn('rollback stop failed',err)
    def test_success_exit_but_active_pid_is_not_stopped(self):
        for component in ['api','ui']:
            with self.subTest(component=component):
                code,disk,running,pid,pending,err=self.run_case(component,'still_active')
                self.assertNotEqual(code,0);self.assertEqual((disk,running,pid,pending),('new','new','20',True));self.assertIn('process still active',err)
    def test_restored_old_process_has_new_pid(self):
        for component in ['api','ui']:
            with self.subTest(component=component):
                code,disk,running,pid,pending,err=self.run_case(component,'success')
                self.assertNotEqual(code,0);self.assertEqual((disk,running,pid,pending),('old','old','30',False));self.assertIn('restored and healthy',err)
if __name__=='__main__':unittest.main()
