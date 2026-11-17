"""Offline workflow contract tests. Never connect to SSH or production."""
import subprocess
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def workflow(name):
    return yaml.load((ROOT / '.github/workflows' / name).read_text(), Loader=yaml.BaseLoader)


def step(doc, name):
    return next(x for x in doc['jobs']['build-and-deploy']['steps'] if x.get('name') == name)


def run_script(script, prefix=''):
    return subprocess.run(['bash', '-c', prefix + '\n' + script], capture_output=True, text=True)


class DeploymentContracts(unittest.TestCase):
    def setUp(self):
        self.api = workflow('deploy-admin-api.yml')
        self.ui = workflow('deploy-studio-ui.yml')
        self.docs = [self.api, self.ui]

    def test_no_inflight_cancellation_and_component_specific_groups(self):
        for doc in self.docs:
            self.assertEqual(doc['concurrency']['cancel-in-progress'], 'false')
            self.assertIn('github.workflow', doc['concurrency']['group'])

    def test_artifact_and_remote_checks_precede_stop(self):
        for doc in self.docs:
            names = [x.get('name') for x in doc['jobs']['build-and-deploy']['steps']]
            self.assertLess(names.index('Verify deployment artifact'), names.index('Stop existing service'))
            self.assertLess(names.index('Check remote deployment prerequisites'), names.index('Stop existing service'))

    def test_pr_api_never_runs_remote_steps(self):
        for s in self.api['jobs']['build-and-deploy']['steps']:
            if s.get('uses', '').startswith('appleboy/'):
                self.assertEqual(s['if'], "github.event_name == 'push' && github.ref == 'refs/heads/main'")
        self.assertNotIn('pull_request', self.ui['on'])

    def test_ui_checks_same_checkout_before_build(self):
        script = step(self.ui, 'Validate UI before deployment')['run']
        for command in ['lint', 'format:check', 'typecheck', 'test']:
            self.assertIn('npm run ' + command, script)
        self.assertIn("node-version", step(self.ui, 'Set up Node.js')['with'])

    def test_all_inline_scripts_parse(self):
        for doc in self.docs:
            for s in doc['jobs']['build-and-deploy']['steps']:
                script = s.get('run', s.get('with', {}).get('script'))
                if script:
                    result = subprocess.run(['bash', '-n'], input=script, text=True, capture_output=True)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_health_success_and_retry(self):
        for doc in self.docs:
            script = step(doc, 'Start service')['with']['script']
            result = run_script(script, 'sudo() { return 0; }; sleep() { :; }; count=0; curl() { count=$((count+1)); [ "$count" -ge 3 ]; };')
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_health_exhaustion_is_failure(self):
        for doc in self.docs:
            script = step(doc, 'Start service')['with']['script']
            result = run_script(script, 'sudo() { return 0; }; sleep() { :; }; curl() { return 22; };')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Deployment health check failed', result.stderr)

    def test_start_failure_does_not_probe_health(self):
        for doc in self.docs:
            result = run_script(step(doc, 'Start service')['with']['script'], 'sudo() { return 1; }; curl() { echo BAD; };')
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('BAD', result.stdout)

    def test_stop_failure_is_not_ignored(self):
        for doc in self.docs:
            result = run_script(step(doc, 'Stop existing service')['with']['script'], 'sudo() { return 1; }; rm() { echo BAD; }; mkdir() { echo BAD; };')
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('BAD', result.stdout)

    def test_ui_static_copy_failure_is_not_ignored(self):
        result = run_script(step(self.ui, 'Copy static files')['with']['script'], 'mkdir() { :; }; cp() { return 1; };')
        self.assertNotEqual(result.returncode, 0)

    def test_missing_service_fails_preflight(self):
        for doc in self.docs:
            result = run_script(step(doc, 'Check remote deployment prerequisites')['with']['script'], 'systemctl() { :; }; sudo() { echo not-found; };')
            self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
