#!/usr/bin/env python3
import argparse
import json
import os
import tempfile
from pathlib import Path
import re
import sys


MODEL_NAME = re.compile(
    r"(?i:claude-(?:[a-z]+-)*\d[\w.-]*|gpt-\d[\w.-]*|"
    r"\b(?:opus|sonnet|haiku|fable)\b|(?:opus|sonnet|haiku|fable)\s*\d|"
    r"model\s*[=:]\s*[\"']?inherit\b|-m\s+gpt)|\bSol\b|\bAstra\b"
)

HISTORY = re.compile(r'^\s*(?:(?:[-+*]|\d+[.)])\s+)*(?:Burn|Measured)(?::|\s+\d{4}(?:[-/]\d{1,2}){0,2}\b)', re.I)
EFFORTS = {'low', 'medium', 'high', 'xhigh', 'max'}


def scalar(value):
    quote = None
    for index, char in enumerate(value):
        if char in "\"'":
            if quote == char:
                quote = None
            elif quote is None:
                quote = char
        if char == '#' and index and value[index - 1].isspace() and quote is None:
            value = value[:index]
            break
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value


def validate_roles(roles):
    models = roles['models']
    for name, model in models.items():
        if not isinstance(model, str) or not re.fullmatch(r'[\w.\-]+', model):
            raise ValueError(f'invalid model id for {name}: {model!r}')
    def reference(context, model):
        if not isinstance(model, str) or model not in models:
            raise ValueError(f"{context}: unknown model {model!r}")
    def effort(context, value):
        if not isinstance(value, str) or value not in EFFORTS:
            raise ValueError(f'{context}: invalid effort {value!r}')
    for tier, config in roles['tiers'].items():
        reference(f'tier {tier}', config['model'])
        effort(f'tier {tier}', config['effort'])
    for flow, config in roles.get('flows', {}).items():
        for step, model in config.items():
            reference(f'flow {flow} {step}', model)
    reference('main_session', roles['main_session']['model'])
    effort('main_session', roles['main_session']['effort'])


def load_roles(path):
    source = path.read_text(encoding='utf-8')
    block = re.search(r'^<!-- model-roles:data -->[ \t]*\n\s*```yaml[ \t]*\n(.*?)^```[ \t]*$', source, re.M | re.S)
    if not block:
        raise ValueError('missing marked yaml block')
    root = {}
    stack = [(-2, root)]
    for number, line in enumerate(block[1].splitlines(), 1):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if re.match(r'-(?:\s|$)', line.lstrip()):
            raise ValueError('inline lists only')
        match = re.fullmatch(r'( *)([\w-]+):(?: +(.*))?', line)
        if not match or len(match[1]) % 2:
            raise ValueError(f'unsupported YAML at block line {number}')
        indent, key, value = len(match[1]), match[2], match[3]
        if value is not None:
            value = None if value.startswith('#') else scalar(value)
        while stack[-1][0] >= indent:
            stack.pop()
        if indent != stack[-1][0] + 2:
            raise ValueError(f'invalid indentation at block line {number}')
        parent = stack[-1][1]
        if key in parent:
            raise ValueError(f'duplicate YAML key: {key}')
        if value is None:
            parent[key] = {}
            stack.append((indent, parent[key]))
        elif value.startswith('[') and value.endswith(']'):
            parent[key] = [scalar(item) for item in value[1:-1].split(',') if item.strip()]
        else:
            parent[key] = value
    validate_roles(root)
    return root


def agent_targets(root, roles):
    targets = {}
    for tier, config in roles['tiers'].items():
        model = roles['models'][config['model']]
        effort = config['effort']
        if not isinstance(model, str) or not isinstance(effort, str) or not isinstance(config['agents'], list):
            raise ValueError(f'invalid tier: {tier}')
        for name in config['agents']:
            if not re.fullmatch(r'[\w-]+', name):
                raise ValueError(f'invalid agent name: {name}')
            if name in targets:
                raise ValueError(f'agent in multiple tiers: {name}')
            targets[name] = (model, effort)
    files = {path.stem: path for path in (root / 'agents').glob('*.md')}
    errors = [f'agents/{name}.md: in no tier' for name in sorted(files.keys() - targets.keys())]
    errors += [f'agents/{name}.md: missing agent file' for name in sorted(targets.keys() - files.keys())]
    if errors:
        raise ValueError('\n'.join(errors))
    return [(files[name], *targets[name]) for name in sorted(targets)]


def updated_frontmatter(source, model, effort):
    match = re.match(r'\A---\r?\n(.*?)^---[ \t]*(?:\r?\n|$)', source, re.M | re.S)
    if not match:
        raise ValueError('missing leading frontmatter')
    newline = '\r\n' if source.startswith('---\r\n') else '\n'
    frontmatter = match[1]
    changes = []
    for key, value in [('model', model), ('effort', effort)]:
        pattern = re.compile(r'^' + key + r':[^\r\n]*(?:\r?\n|$)', re.M)
        fields = list(pattern.finditer(frontmatter))
        if len(fields) > 1:
            raise ValueError(f'duplicate frontmatter field: {key}')
        replacement = f'{key}: {value}{newline}'
        if not fields:
            frontmatter += replacement
            changes.append(f'{key}: (missing) -> {value}')
        elif fields[0][0] != replacement:
            old = fields[0][0].strip()
            frontmatter = pattern.sub(lambda _: replacement, frontmatter)
            changes.append(f'{old} -> {value}')
    return source[:match.start(1)] + frontmatter + source[match.end(1):], changes


def model_hits(root):
    paths = {root / 'CLAUDE.md'}
    for directory in ('rules', 'skills', 'commands'):
        paths.update(path for path in (root / directory).rglob('*') if path.is_file() and path.suffix not in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.pyc'))
    paths.update((root / 'agents').glob('*.md'))
    paths.update(path for path in (root / 'scripts').rglob('*') if path.suffix in ('.sh', '.py'))
    for path in sorted(paths):
        relative = path.relative_to(root)
        if (relative == Path('rules/model-roles.md')
                or relative.parts[:2] in (('skills', 'synced'), ('skills', '.trash'))
                or relative == Path('scripts/sync-model-roles.py')
                or relative == Path('scripts/tests/test_sync_model_roles.py')
                or path.name == '.DS_Store'
                or not path.is_file()):
            continue
        source = path.read_text(encoding='utf-8')
        start = 0
        if relative.parts[0] == 'agents':
            frontmatter = re.match(r'\A---\r?\n.*?^---[ \t]*(?:\r?\n|$)', source, re.M | re.S)
            if frontmatter:
                start = source[:frontmatter.end()].count('\n')
        for number, line in enumerate(source.splitlines(), 1):
            if number <= start or (HISTORY.match(line) and '-m ' not in line.lower()):
                continue
            if MODEL_NAME.search(line):
                yield f'{relative}:{number}: {line.strip()}'


def settings_drift(root, roles):
    settings = json.loads((root / 'settings.json').read_text(encoding='utf-8'))
    session = roles['main_session']
    expected = {'model': roles['models'][session['model']], 'effortLevel': session['effort']}
    return [f'settings.json: {key}: {settings.get(key)!r} -> {value!r} (manual step)'
            for key, value in expected.items() if settings.get(key) != value]


def atomic_write(path, source):
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='',
                                     dir=path.parent, delete=False) as stream:
        temp = Path(stream.name)
        stream.write(source)
    os.chmod(temp, path.stat().st_mode)
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser(description='Sync agent model and effort from rules/model-roles.md.')
    parser.add_argument('--root', type=Path, default=Path.home() / '.claude')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        root = args.root.expanduser().resolve()
        roles = load_roles(root / 'rules/model-roles.md')
        targets = agent_targets(root, roles)
        updates = []
        for path, model, effort in targets:
            with path.open(encoding='utf-8', newline='') as stream:
                source = stream.read()
            try:
                updated, changes = updated_frontmatter(source, model, effort)
            except ValueError as error:
                raise ValueError(f'{path.relative_to(root)}: {error}') from error
            if changes:
                updates.append((path, updated, changes))
        drift = settings_drift(root, roles)
        hits = list(model_hits(root)) if args.check else []
        for path, updated, changes in updates:
            print(f'{path.relative_to(root)}: ' + '; '.join(changes))
            if not args.check:
                atomic_write(path, updated)
        for message in drift:
            print(message)
        for hit in hits:
            print(hit)
        if args.check:
            if updates or hits or drift:
                print(f'Check failed: {len(updates)} agent(s) drifted; {len(hits)} forbidden model reference(s); {len(drift)} settings drift(s).')
                return 1
            print(f'Check passed: {len(targets)} agents in sync; no forbidden model references; settings.json in sync.')
        else:
            print(f'Sync complete: {len(updates)} agent(s) updated; {len(targets)} agents checked.')
        return 0
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
