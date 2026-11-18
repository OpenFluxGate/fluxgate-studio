"""Offline workflow integration contracts. No remote operations."""
import re
import subprocess
import os
import unittest
from pathlib import Path
import yaml
ROOT=Path(__file__).resolve().parents[2]
class WorkflowContracts(unittest.TestCase):
    def test_stacked_pr_builds_use_the_same_core_as_compose(self):
        workflows = ROOT / '.github' / 'workflows'
        compose = yaml.load((ROOT / 'docker-compose.yml').read_text(), Loader=yaml.BaseLoader)
        context = compose['services']['admin-api']['build']['additional_contexts']['fluxgate_core']
        source = re.fullmatch(r'\$\{FLUXGATE_CORE_SOURCE:-https://github\.com/(OpenFluxGate/fluxgate)\.git#([a-f0-9]{40})\}', context)
        self.assertIsNotNone(source, 'The default Compose build must pin a full Core commit.')
        repository, revision = source.groups()
        for filename in ('admin-api-ci', 'deploy-admin-api', 'ui-ci', 'dependency-review', 'deployment-safety'):
            with self.subTest(workflow=filename):
                workflow = yaml.load((workflows / f'{filename}.yml').read_text(), Loader=yaml.BaseLoader)
                self.assertIn('pull_request', workflow['on'])
                self.assertNotIn('branches', workflow['on']['pull_request'] or {})
                if filename in ('admin-api-ci', 'deploy-admin-api'):
                    job = next(iter(workflow['jobs'].values()))
                    paired = next(step['with'] for step in job['steps'] if step.get('with', {}).get('path') == '.paired-core')
                    self.assertEqual((repository, revision), (paired['repository'], paired['ref']))

    def test_integrated_workflows(self):
        for name in ['deploy-admin-api.yml','deploy-studio-ui.yml']:
            with self.subTest(name=name):
                doc=yaml.load((ROOT/'.github/workflows'/name).read_text(),Loader=yaml.BaseLoader)
                self.assertEqual(doc['permissions']['contents'],'read')
                self.assertEqual(doc['concurrency']['cancel-in-progress'],'false')
                steps=doc['jobs']['build-and-deploy']['steps']
                names=[x.get('name') for x in steps]
                gate=names.index('Require verified production activation')
                hold=names.index('Hold production activation pending operational review')
                self.assertLess(hold,gate)
                held=subprocess.run(['bash','-c',steps[hold]['run']],capture_output=True)
                self.assertNotEqual(held.returncode,0)
                upload=names.index('Upload staging bundle without stopping service')
                activate=names.index('Activate staged release with server-owned lifetime')
                self.assertLess(gate,upload); self.assertLess(upload,activate)
                for step in steps:
                    script=step.get('run',step.get('with',{}).get('script',''))
                    self.assertNotIn('rm -rf',script)
                    self.assertNotIn('systemctl stop',script)
                    result=subprocess.run(['bash','-n'],input=script,text=True,capture_output=True)
                    self.assertEqual(result.returncode,0,result.stderr)
                    if step.get('uses','').startswith('appleboy/'):
                        self.assertEqual(step['with']['fingerprint'],'${{ secrets.LIGHTSAIL_HOST_FINGERPRINT }}')
                        self.assertEqual(step['if'],"github.event_name == 'push' && github.ref == 'refs/heads/main'")
                remote=steps[activate]['with']['script']
                self.assertIn('sha256sum -c SHA256SUMS',remote)
                self.assertIn('test ! -e "$root/.activation-pending"',remote)
                self.assertIn('sudo -n systemd-run',remote)
                self.assertIn('--wait',remote)
                self.assertNotIn('--scope',remote)
                self.assertIn('vars.STUDIO_SAFE_DEPLOY_ENABLED',str(steps[gate]))
                self.assertIn('vars.STUDIO_AUDIT_RETENTION_REVIEWED',str(steps[gate]))
    def test_missing_or_invalid_fingerprint_fails_gate(self):
        for name in ['deploy-admin-api.yml','deploy-studio-ui.yml']:
            doc=yaml.load((ROOT/'.github/workflows'/name).read_text(),Loader=yaml.BaseLoader)
            gate=next(x for x in doc['jobs']['build-and-deploy']['steps'] if x.get('name')=='Require verified production activation')
            for fingerprint in ['', 'unverified']:
                env=dict(os.environ,ENABLED='true',RETENTION_REVIEWED='true',HOST_FINGERPRINT=fingerprint)
                p=subprocess.run(['bash','-e','-c',gate['run']],env=env,capture_output=True,text=True)
                self.assertNotEqual(p.returncode,0)
    def test_api_version_matches_upload(self):
        text=(ROOT/'.github/workflows/deploy-admin-api.yml').read_text()
        self.assertIn('fluxgate-studio-admin-api-0.5.0.jar',text)
        self.assertNotIn('0.0.1-SNAPSHOT.jar',text)
    def test_ui_assets_packaged(self):
        text=(ROOT/'.github/workflows/deploy-studio-ui.yml').read_text()
        for item in ['npm run lint','npm run typecheck','npm run test','standalone/.next/static','standalone/public','ui.tar.gz']:
            self.assertIn(item,text)
if __name__=='__main__': unittest.main()
