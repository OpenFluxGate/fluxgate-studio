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
                        self.assertEqual(step['if'], steps[hold]['if'])
                        self.assertIn("github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.STUDIO_SAFE_DEPLOY_ENABLED == 'true'", step['if'])
                remote=steps[activate]['with']['script']
                self.assertIn('sha256sum -c SHA256SUMS',remote)
                self.assertIn('test ! -e "$root/.activation-pending"',remote)
                self.assertIn('sudo -n systemd-run',remote)
                self.assertIn('--wait',remote)
                self.assertNotIn('--scope',remote)
                self.assertIn('vars.STUDIO_SAFE_DEPLOY_ENABLED',str(steps[gate]))
                self.assertIn('vars.STUDIO_AUDIT_RETENTION_REVIEWED',str(steps[gate]))
    def test_candidate_bundles_match_the_pull_request_head_before_any_live_step(self):
        workflows = ROOT / '.github' / 'workflows'
        source = '${{ github.event.pull_request.head.sha || github.sha }}'
        paths = None
        for component, filename in [('api', 'deploy-admin-api.yml'), ('ui', 'deploy-studio-ui.yml')]:
            with self.subTest(component=component):
                doc = yaml.load((workflows / filename).read_text(), Loader=yaml.BaseLoader)
                triggers = doc['on']
                self.assertEqual(set(triggers), {'push', 'pull_request'})
                self.assertEqual(triggers['push']['paths'], triggers['pull_request']['paths'])
                if paths is not None:
                    self.assertEqual(paths, triggers['pull_request']['paths'])
                paths = triggers['pull_request']['paths']
                steps = doc['jobs']['build-and-deploy']['steps']
                checkout = next(s for s in steps if s.get('name') == 'Checkout')
                self.assertEqual(checkout['with']['ref'], source)
                self.assertEqual(checkout['with']['persist-credentials'], 'false')
                bundle = next(s for s in steps if s.get('name') == 'Prepare verified deployment bundle')
                for entry in ('git rev-parse HEAD', 'recovery-common.sh', 'transaction.py',
                              'artifact_identity.py', 'SOURCE_COMMIT', 'SHA256SUMS'):
                    self.assertIn(entry, bundle['run'])
                upload = next(s for s in steps if s.get('uses', '').startswith('actions/upload-artifact@'))
                self.assertRegex(upload['uses'], r'@[0-9a-f]{40}$')
                self.assertEqual(upload['with']['name'], f'studio-{component}-{source}')
                self.assertEqual(upload['with']['path'], '.deployment/')
                self.assertEqual(upload['with']['include-hidden-files'], 'true')
                self.assertEqual(upload['with']['if-no-files-found'], 'error')
                gate = next(s for s in steps if s.get('name') == 'Hold production activation pending operational review')
                self.assertLess(steps.index(bundle), steps.index(upload))
                self.assertLess(steps.index(upload), steps.index(gate))
                if component == 'ui':
                    self.assertIn(" -name '.env*'", bundle['run'])
                    build = next(s for s in steps if s.get('name') == 'Build Next.js (standalone)')
                    self.assertEqual(build['env']['NEXT_PUBLIC_API_URL'],
                                     "${{ github.event_name == 'push' && secrets.NEXT_PUBLIC_API_URL || '' }}")

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
