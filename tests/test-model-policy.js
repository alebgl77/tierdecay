#!/usr/bin/env node
'use strict';

// Structural checks only: this does not launch or validate a live Claude client.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const nativeRoot = path.join(repoRoot, 'adapters', 'claude-code', '.claude');
const settings = JSON.parse(fs.readFileSync(path.join(nativeRoot, 'settings.json'), 'utf8'));
assert.equal(settings.model, 'opus', 'main thread must use opus');
assert.ok(Array.isArray(settings.permissions?.ask),
  'settings.permissions.ask must be an array');
assert.ok(settings.permissions.ask.every(rule => typeof rule === 'string'),
  'settings.permissions.ask entries must be strings');
for (const rule of ['Edit(.claude/**)', 'Edit(.tierdecay/**)']) {
  assert.ok(settings.permissions.ask.includes(rule), `missing state approval rule: ${rule}`);
}

const aliases = { oracle: 'opus', 'heavy-executor': 'opus', executor: 'sonnet', scout: 'sonnet' };
// A tier binding is (alias, effort). Effort separates roles that share an
// alias: T3 oracle > T2 heavy executor on opus; T1 executor > T0 scout on sonnet.
const efforts = { oracle: 'xhigh', 'heavy-executor': 'high', executor: 'medium', scout: 'low' };
const guardHook = [
  'hooks:',
  '  PreToolUse:',
  '    - matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash"',
  '      hooks:',
  '        - type: command',
  '          command: \'"${CLAUDE_PROJECT_DIR}/.claude/hooks/tierdecay-guard.sh"\'',
].join('\n');

for (const [name, alias] of Object.entries(aliases)) {
  const source = fs.readFileSync(path.join(nativeRoot, 'agents', `${name}.md`), 'utf8')
    .replace(/\r\n/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(match, `${name}: missing frontmatter delimiters`);
  const frontmatter = match[1];
  for (const [field, expected] of [['name', name], ['model', alias], ['effort', efforts[name]]]) {
    const values = [...frontmatter.matchAll(new RegExp(`^${field}: (.+)$`, 'gm'))];
    assert.equal(values.length, 1, `${name}: expected one ${field} field`);
    assert.equal(values[0][1], expected, `${name}: incorrect ${field}`);
  }
  if (name === 'executor' || name === 'heavy-executor') {
    assert.ok(frontmatter.includes(guardHook), `${name}: guard hook registration drifted`);
    assert.ok(frontmatter.includes('skills:\n  - execution-standards\n  - repo-playbook'),
      `${name}: execution skills are not preloaded`);
  } else {
    assert.match(frontmatter, /^tools: Read, Grep, Glob$/m, `${name}: tools must stay read-only`);
  }
  console.log(`${name}: ${alias} @ ${efforts[name]}, frontmatter and guard/read-only structure OK`);
}

assert.ok(fs.statSync(path.join(nativeRoot, 'hooks', 'tierdecay-guard.sh')).isFile(),
  'registered guard hook must exist');

// Policy: no tier is ever bound to a Haiku-class model. The cheap end of the
// ladder is the `sonnet` alias at lower effort. MODELS.md (core and its plugin
// copy) states the policy and CHANGELOG.md is history; every other shipped
// binding surface is checked here.
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const bindingSurfaces = [
  ...walk(path.join(repoRoot, 'adapters')),
  ...walk(path.join(repoRoot, 'plugins')),
  ...walk(path.join(repoRoot, 'core')),
  path.join(repoRoot, 'bin', 'tierdecay.js'),
  path.join(repoRoot, 'install.sh'),
  path.join(repoRoot, '.claude-plugin', 'marketplace.json')
].filter((file) => fs.existsSync(file) && path.basename(file) !== 'MODELS.md'
  && (/\.(md|mdc|json|js|sh)$/.test(file) || path.basename(path.dirname(file)) === 'bin'));
for (const file of bindingSurfaces) {
  assert.ok(!/haiku/i.test(fs.readFileSync(file, 'utf8')), `${path.relative(repoRoot, file)} must not bind or mention a Haiku-class model`);
}
console.log(`No Haiku binding across ${bindingSurfaces.length} shipped files.`);
console.log('Native model policy and hook registration are structurally conformant (not live integration).');
