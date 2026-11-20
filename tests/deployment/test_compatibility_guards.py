import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / 'deploy/compatibility/local-docker.sh'


class LocalDockerGuardTests(unittest.TestCase):
    def guard(self, endpoint, host='', context='', confirmed='true'):
        with tempfile.TemporaryDirectory() as directory:
            docker = Path(directory) / 'docker'
            docker.write_text('#!/bin/sh\ncase "$1 $2" in\n'
                              '"context show") echo selected;;\n'
                              '"context inspect") printf "%s\\n" "$TEST_ENDPOINT";;\n'
                              '*) exit 99;; esac\n')
            docker.chmod(0o755)
            env = dict(os.environ, PATH=directory + ':' + os.environ['PATH'],
                       DOCKER_HOST=host, DOCKER_CONTEXT=context, TEST_ENDPOINT=endpoint,
                       FLUXGATE_LOCAL_DOCKER_CONFIRMED=confirmed)
            return subprocess.run(['sh', '-c', '. "$1"; require_local_docker || exit; '
                                    'printf "%s" "$DOCKER_HOST"', 'guard', str(GUARD)],
                                   env=env, capture_output=True, text=True)

    def test_operator_confirmation_is_required(self):
        self.assertNotEqual(self.guard('unix:///tmp/local.sock', confirmed='').returncode, 0)

    def test_local_context_is_pinned(self):
        result = self.guard('unix:///tmp/local-docker.sock')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, 'unix:///tmp/local-docker.sock')

    def test_ssh_context_rejected_even_with_local_host(self):
        self.assertNotEqual(self.guard('ssh://production', 'unix:///tmp/local.sock').returncode, 0)

    def test_tcp_host_rejected_even_with_local_context(self):
        self.assertNotEqual(self.guard('unix:///tmp/local.sock', 'tcp://production:2376').returncode, 0)

    def test_tcp_and_missing_context_rejected(self):
        for endpoint in ['tcp://127.0.0.1:2375', 'tcp://production:2376', '']:
            with self.subTest(endpoint=endpoint):
                self.assertNotEqual(self.guard(endpoint).returncode, 0)

    def test_explicit_local_context_takes_precedence(self):
        result = self.guard('unix:///tmp/context.sock', 'unix:///tmp/host.sock', 'selected')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, 'unix:///tmp/context.sock')

    def test_local_host_override_is_pinned(self):
        result = self.guard('unix:///tmp/context.sock', 'unix:///tmp/host.sock')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, 'unix:///tmp/host.sock')

    def test_both_runners_guard_before_container_creation_and_exit_on_signal(self):
        for script in [ROOT / 'deploy/compatibility/run-probe.sh',
                       ROOT / 'deploy/compatibility/redis/run-redis-probe.sh']:
            text = script.read_text()
            self.assertLess(text.index('require_local_docker'), text.index('docker run'))
            self.assertIn('docker rm -fv', text)
            self.assertIn("trap 'exit 143' TERM", text)
            self.assertIn("trap 'exit 130' INT", text)
            self.assertIn('trap cleanup EXIT', text)


if __name__ == '__main__':
    unittest.main()
