import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'sync-model-roles.py'
ROLES = '''<!-- model-roles:data -->
```yaml
models:
  claude: claude-opus-9-1
main_session:
  model: claude
  effort: medium
flows:
  feature:
    design: claude
    implement: claude
    review: claude
tiers:
  judgment:
    model: claude
    effort: medium
    agents: [planner]
```
'''


class SyncModelRolesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ('rules', 'agents', 'skills/nested', 'commands'):
            (self.root / directory).mkdir(parents=True)
        self.write('rules/model-roles.md', ROLES)
        self.write('settings.json', '{"model": "claude-opus-9-1", "effortLevel": "medium"}')
        self.write('agents/planner.md', '---\nname: planner\nmodel: old\neffort: low\n---\nmodel: body stays\n')

    def write(self, path, text):
        (self.root / path).write_text(text, encoding='utf-8')

    def run_script(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root), *args], capture_output=True, text=True)

    def snapshot(self):
        return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.rglob('*') if p.is_file()}

    def test_check_is_read_only_and_sync_is_idempotent(self):
        before = self.snapshot()
        self.assertEqual(self.run_script('--check').returncode, 1)
        self.assertEqual(self.snapshot(), before)
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        text = (self.root / 'agents/planner.md').read_text()
        self.assertIn('model: claude-opus-9-1\neffort: medium', text)
        self.assertTrue(text.endswith('model: body stays\n'))
        self.assertEqual(self.run_script('--check').returncode, 0)
        self.assertIn('0 agent(s) updated', self.run_script().stdout)

    def test_missing_and_unassigned_agents_fail_without_writes(self):
        self.write('agents/extra.md', '---\n---\n')
        self.write('rules/model-roles.md', ROLES.replace('[planner]', '[planner, missing]'))
        before = self.snapshot()
        for args in [(), ('--check',)]:
            result = self.run_script(*args)
            self.assertEqual(result.returncode, 1)
            self.assertIn('extra.md: in no tier', result.stderr)
            self.assertIn('missing.md: missing agent file', result.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_scan_locations_patterns_and_history_exemptions(self):
        self.run_script()
        bad = ['CLAUDE-opus-5-5', 'claude-3-7-sonnet', 'claude-future-9-1', 'gpt-6.1-sol', 'opus 5',
               'SONNET 5', 'haiku 5', 'fable 5', 'Sol', 'Astra', 'model=haiku',
               'opus', 'SONNET', 'Haiku', 'fAbLe', 'opus5', 'SONNET5', 'haiku5', 'fable5',
               'model: "inherit"', "model='sonnet'", '-m gpt',
               'quote burn 2026 Sol', 'quote Burn 2026 Astra',
               'Burn 2026-09-19: run -m gpt-6', 'Burning Sol', 'Measured result Sol']
        good = [' - Burn: Sol', '  1. Measured 2026-09-19: Astra', 'Solar Astral',
                'claude-code claude-codex-jobs', 'Measured 2026: sonnet 5',
                '1.0 SOL', 'sol', 'SOL', 'astra', 'ASTRA', 'solana', 'opuscula', 'haikus']
        self.write('skills/nested/SKILL.md', '\n'.join(bad + good))
        for directory in ('scripts/nested', 'skills/synced', 'skills/.trash'):
            (self.root / directory).mkdir(parents=True)
        for path in ('commands/example.md', 'rules/example.md', 'CLAUDE.md',
                     'scripts/nested/example.sh', 'scripts/nested/example.py',
                     'skills/nested/example.html', 'skills/nested/example.mjs'):
            self.write(path, 'gpt-6\n')
        self.write('skills/synced/example.md', 'gpt-6\n')
        self.write('skills/.trash/example.md', 'gpt-6\n')
        self.write('scripts/sync-model-roles.py', 'gpt-6\n')
        (self.root / 'scripts/tests').mkdir()
        self.write('scripts/tests/test_sync_model_roles.py', 'gpt-6\n')
        self.write('agents/planner.md', (self.root / 'agents/planner.md').read_text() + 'model: opus\n')
        before = self.snapshot()
        result = self.run_script('--check')
        self.assertEqual(result.returncode, 1)
        self.assertIn(f'{len(bad) + 8} forbidden model reference(s)', result.stdout)
        for number in range(1, len(bad) + 1):
            self.assertIn(f'skills/nested/SKILL.md:{number}:', result.stdout)
        self.assertIn('agents/planner.md:7:', result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_value_parsing_and_marked_block(self):
        source = ROLES.replace('models:', 'models: # catalog').replace('claude-opus-9-1', '"claude-opus-9-1"  # pinned')
        source = source.replace('effort: medium', "effort: 'medium'  # effort")
        source = source.replace('[planner]', '["planner"]  # inline')
        self.write('rules/model-roles.md', '```yaml\nwrong: block\n```\n' + source)
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.run_script('--check').returncode, 0)

    def test_invalid_ids_efforts_and_all_model_references(self):
        cases = [
            (ROLES.replace('claude-opus-9-1', '"claude-opus-9-1'), 'invalid model id'),
            (ROLES.replace('claude-opus-9-1', 'bad model'), 'invalid model id'),
            (ROLES.replace('effort: medium', 'effort: ultra'), 'invalid effort'),
            (ROLES.replace('    model: claude', '    model: gemini'), "tier judgment: unknown model 'gemini'"),
            (ROLES.replace('    review: claude', '    review: gemini'), "flow feature review: unknown model 'gemini'"),
            (ROLES.replace('  model: claude', '  model: gemini', 1), "main_session: unknown model 'gemini'"),
            (ROLES.replace('    agents: [planner]', '    agents:\n      - planner'), 'inline lists only'),
            (ROLES.replace('<!-- model-roles:data -->\n', ''), 'missing marked yaml block'),
        ]
        for source, message in cases:
            with self.subTest(message=message):
                self.write('rules/model-roles.md', source)
                before = self.snapshot()
                result = self.run_script()
                self.assertEqual(result.returncode, 1)
                self.assertIn(message, result.stderr)
                self.assertEqual(self.snapshot(), before)

    def test_settings_drift_is_read_only_in_both_modes(self):
        self.write('settings.json', '{"model": "old", "effortLevel": "low"}')
        before = (self.root / 'settings.json').read_bytes()
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('manual step', result.stdout)
        result = self.run_script('--check')
        self.assertEqual(result.returncode, 1)
        self.assertIn('2 settings drift(s)', result.stdout)
        self.assertEqual((self.root / 'settings.json').read_bytes(), before)

    def test_all_changes_computed_before_writing(self):
        self.write('rules/model-roles.md', ROLES.replace('[planner]', '[planner, zlast]'))
        self.write('agents/zlast.md', 'not frontmatter\n')
        before = self.snapshot()
        result = self.run_script()
        self.assertEqual(result.returncode, 1)
        self.assertIn('zlast.md: missing leading frontmatter', result.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_sync_uses_replace_and_preserves_permissions(self):
        path = self.root / 'agents/planner.md'
        path.chmod(0o640)
        inode = path.stat().st_ino
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotEqual(path.stat().st_ino, inode)
        self.assertEqual(path.stat().st_mode & 0o777, 0o640)

    def test_wrapper_rejects_missing_model_before_launch(self):
        wrapper = SCRIPT.parent / 'codex-exec-bg.sh'
        config = self.root / 'codex-config'
        config.mkdir()
        env = dict(os.environ, CODEX_HOME=str(config), CODEX_JOBS_DIR=str(self.root / 'jobs'))
        for source in ('', 'model = ""\n', '[profiles.example]\nmodel = "profile-only"\n'):
            (config / 'config.toml').write_text(source)
            for flags in ([], ['--no-tools']):
                result = subprocess.run(['bash', str(wrapper), *flags, 'test prompt'],
                                        capture_output=True, text=True, env=env)
                self.assertEqual(result.returncode, 2)
                self.assertIn('no configured model', result.stderr)
                self.assertEqual(list((self.root / 'jobs').iterdir()), [])

    def test_wrapper_accepts_profile_only_model(self):
        wrapper = SCRIPT.parent / 'codex-exec-bg.sh'
        config = self.root / 'codex-config'
        config.mkdir()
        (config / 'config.toml').write_text('[profiles.example]\nmodel = "profile-only"\n')
        binary = self.root / 'bin'
        binary.mkdir()
        stub = binary / 'codex'
        stub.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
        stub.chmod(0o755)
        env = dict(os.environ, CODEX_HOME=str(config), HOME=str(self.root),
                   CODEX_JOBS_DIR=str(self.root / 'jobs'),
                   PATH=str(binary) + os.pathsep + os.environ['PATH'])
        for flags in (['-p', 'example'], ['--profile', 'example'], ['--profile=example'], ['-pexample']):
            with self.subTest(flags=flags):
                result = subprocess.run(['bash', str(wrapper), *flags, 'test prompt'],
                                        capture_output=True, text=True, env=env)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn('no configured model', result.stderr)
                logs = list((self.root / 'jobs').glob('*.jsonl'))
                self.assertTrue(any(flags[0] in path.read_text() for path in logs))

    def test_missing_fields_and_crlf(self):
        path = self.root / 'agents/planner.md'
        path.write_bytes(b'---\r\nname: planner\r\n---\r\nbody\r\n')
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(path.read_bytes(), b'---\r\nname: planner\r\nmodel: claude-opus-9-1\r\neffort: medium\r\n---\r\nbody\r\n')

    def test_invalid_frontmatter_and_yaml_fail_without_writes(self):
        for source in ['body\n---\nmodel: old\n---\n', '---\nmodel: old\nmodel: duplicate\n---\n']:
            self.write('agents/planner.md', source)
            before = self.snapshot()
            self.assertEqual(self.run_script().returncode, 1)
            self.assertEqual(self.snapshot(), before)
        self.write('rules/model-roles.md', ROLES.replace('    effort:', '   effort:'))
        self.assertEqual(self.run_script().returncode, 1)


if __name__ == '__main__':
    unittest.main()
