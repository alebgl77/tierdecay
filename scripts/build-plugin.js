#!/usr/bin/env node
'use strict';

// Generate the Claude Code plugin (plugins/tierdecay) from the native adapter
// and the engine, and mirror the shared guard into the Codex adapter, so no
// install path can drift from its source.
//
//   node scripts/build-plugin.js          write generated files
//   node scripts/build-plugin.js --check  exit 1 if any generated file differs
//
// Hand-written plugin files (README.md, hooks/hooks.json,
// hooks/session-start.sh, bin/tierdecay-init, skills/init/SKILL.md) are not
// touched; generated files are listed in GENERATED below.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ADAPTER = path.join(ROOT, 'adapters', 'claude-code');
const PLUGIN = path.join(ROOT, 'plugins', 'tierdecay');
const PLUGIN_NAME = 'tierdecay';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// Plugin agents ignore `hooks:` frontmatter (the plugin registers the guard in
// hooks/hooks.json instead) and reference plugin skills by namespaced name.
function pluginAgent(source) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) throw new Error('agent without frontmatter');
  const kept = [];
  let inHooks = false;
  for (const line of match[1].split('\n')) {
    if (/^hooks:/.test(line)) { inHooks = true; continue; }
    if (inHooks && /^\s/.test(line)) continue;
    inHooks = false;
    kept.push(line.replace(/^ {2}- execution-standards$/, `  - ${PLUGIN_NAME}:execution-standards`));
  }
  return `---\n${kept.join('\n')}\n---\n${source.slice(match[0].length)}`;
}

function manifest() {
  return `${JSON.stringify({
    name: PLUGIN_NAME,
    version: pkg.version,
    description: 'Per-repo learning layer for Claude Code model routing: four tiered subagents bound by alias and effort, a routing ledger, a self-distilled playbook, confidence-gated tier decay, and a state-write guard.',
    author: { name: 'Alexandre Beguel' },
    homepage: 'https://github.com/alebgl77/tierdecay',
    repository: 'https://github.com/alebgl77/tierdecay',
    license: 'MIT',
    keywords: ['model-routing', 'subagents', 'cost', 'playbook', 'agent-skills', 'effort']
  }, null, 2)}\n`;
}

const GENERATED = [
  ['.claude-plugin/plugin.json', () => manifest()],
  ['ORCHESTRATOR.md', () => read(path.join(ADAPTER, 'CLAUDE.md'))],
  ...['scout', 'executor', 'heavy-executor', 'oracle'].map((name) => [
    `agents/${name}.md`, () => pluginAgent(read(path.join(ADAPTER, '.claude', 'agents', `${name}.md`)))
  ]),
  ...['model-routing', 'tier-decay', 'execution-standards'].map((name) => [
    `skills/${name}/SKILL.md`, () => read(path.join(ADAPTER, '.claude', 'skills', name, 'SKILL.md'))
  ]),
  ['hooks/tierdecay-guard.sh', () => read(path.join(ADAPTER, '.claude', 'hooks', 'tierdecay-guard.sh')), 0o755],
  ['templates/routing-ledger.md', () => read(path.join(ADAPTER, '.claude', 'routing-ledger.md'))],
  ['templates/repo-playbook/SKILL.md', () => read(path.join(ADAPTER, '.claude', 'skills', 'repo-playbook', 'SKILL.md'))],
  ['templates/MODELS.md', () => read(path.join(ROOT, 'core', 'MODELS.md'))],
  ['bin/tierdecay', () => read(path.join(ROOT, 'bin', 'tierdecay.js')), 0o755],
  ...fs.readdirSync(path.join(ROOT, 'core', 'engine')).filter((f) => f.endsWith('.js')).sort().map((file) => [
    `core/engine/${file}`, () => read(path.join(ROOT, 'core', 'engine', file))
  ])
];

// Copies outside the plugin, relative to the repository root.
const MIRRORED = [
  ['adapters/codex/.codex/hooks/tierdecay-guard.sh', () => read(path.join(ADAPTER, '.claude', 'hooks', 'tierdecay-guard.sh')), 0o755]
];

function main(check) {
  const stale = [];
  const outputs = [
    ...GENERATED.map(([relative, render, mode]) => [path.join(PLUGIN, relative), relative, render, mode]),
    ...MIRRORED.map(([relative, render, mode]) => [path.join(ROOT, relative), relative, render, mode])
  ];
  for (const [target, relative, render, mode] of outputs) {
    const content = render();
    const current = fs.existsSync(target) ? read(target) : null;
    if (check) {
      if (current !== content) stale.push(relative);
      else if (mode && process.platform !== 'win32' && (fs.statSync(target).mode & 0o111) === 0) stale.push(`${relative} (not executable)`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (current !== content) fs.writeFileSync(target, content);
    if (mode) fs.chmodSync(target, mode);
  }
  if (check && stale.length) {
    process.stderr.write(`generated files are out of date; run node scripts/build-plugin.js\n  ${stale.join('\n  ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${check ? 'checked' : 'generated'} ${GENERATED.length} plugin files and ${MIRRORED.length} adapter mirror(s)\n`);
}

main(process.argv.includes('--check'));
