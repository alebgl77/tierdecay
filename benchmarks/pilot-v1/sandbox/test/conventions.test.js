'use strict';

// Repository conventions. These run on every change; read the registry
// comments in src/*/index.js for the rationale.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { COMMANDS } = require('../src/commands');
const { MIGRATIONS } = require('../src/migrations');
const { RULES } = require('../src/rules');
const { MESSAGES, format } = require('../src/messages');
const { usage } = require('../src/usage');
const { deepFreeze } = require('./helpers');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sorted = (names) => [...names].sort();
const modules = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js') && f !== 'index.js');

test('commands: registry is sorted and complete', () => {
  const names = COMMANDS.map((c) => c.name);
  assert.deepEqual(names, sorted(names));
  assert.deepEqual(sorted(modules('src/commands').map((f) => f.replace(/\.js$/, ''))), sorted(names));
});

test('commands: module shape', () => {
  for (const command of COMMANDS) {
    assert.equal(typeof command.summary, 'string', command.name);
    assert.ok(Array.isArray(command.spec.positionals), command.name);
    assert.equal(typeof command.spec.flags, 'object', command.name);
    assert.equal(typeof command.run, 'function', command.name);
  }
});

test('commands: README documents every command with its exact usage', () => {
  const readme = read('README.md');
  for (const command of COMMANDS) {
    const row = `| ${command.name} | \`${usage(command)}\` | ${command.summary} |`;
    assert.ok(readme.includes(row), `README.md is missing row: ${row}`);
  }
});

test('commands: no direct console or process.exit use', () => {
  for (const file of [...modules('src/commands').map((f) => `src/commands/${f}`), 'src/cli.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /console\.|process\.exit\(|process\.std(out|err)\.write/, file);
  }
});

test('migrations: contiguous versions from 2, files named NNN-name.js', () => {
  MIGRATIONS.forEach((migration, index) => assert.equal(migration.version, index + 2));
  const files = sorted(modules('src/migrations'));
  assert.deepEqual(files, MIGRATIONS.map((m) => `${String(m.version).padStart(3, '0')}-${m.name}.js`));
});

test('migrations: pure and idempotent', () => {
  const sample = { version: 1, records: { a: { value: ' x ', tags: ['t'] }, b: { value: 3, val: 'old' }, c: { val: 'legacy' } } };
  let doc = sample;
  for (const migration of MIGRATIONS) {
    const input = deepFreeze(JSON.parse(JSON.stringify(doc)));
    const once = migration.up(input);
    const twice = migration.up(deepFreeze(JSON.parse(JSON.stringify(once))));
    assert.deepEqual(twice, once, `${migration.name} is not idempotent`);
    doc = { ...once, version: migration.version };
  }
});

test('migrations: documented and changelogged', () => {
  const docs = read('docs/MIGRATIONS.md');
  const changelog = read('CHANGELOG.md');
  for (const migration of MIGRATIONS) {
    assert.match(docs, new RegExp(`^\\| ${migration.version} \\| ${migration.name} \\|`, 'm'), `docs/MIGRATIONS.md lacks ${migration.name}`);
    const id = `${String(migration.version).padStart(3, '0')}-${migration.name}`;
    assert.ok(changelog.includes(id), `CHANGELOG.md does not mention ${id}`);
  }
});

test('rules: registry sorted and complete, codes follow the name', () => {
  const names = RULES.map((r) => r.name);
  assert.deepEqual(names, sorted(names));
  assert.deepEqual(sorted(modules('src/rules').map((f) => f.replace(/\.js$/, ''))), sorted(names));
  for (const rule of RULES) {
    assert.equal(rule.code, `E_${rule.name.replace(/([A-Z])/g, '_$1').toUpperCase()}`, rule.name);
  }
});

test('rules: examples behave and messages render', () => {
  for (const rule of RULES) {
    assert.ok(MESSAGES[rule.code], `no message template for ${rule.code}`);
    for (const param of rule.examples.params) rule.checkParam(param);
    for (const bad of rule.examples.badParams) assert.throws(() => rule.checkParam(bad), { name: 'SchemaError' }, `${rule.name} accepted ${JSON.stringify(bad)}`);
    for (const [param, value] of rule.examples.valid) assert.equal(rule.check(value, param), null, `${rule.name} rejected valid example`);
    for (const [param, value] of rule.examples.invalid) {
      const details = rule.check(value, param);
      assert.ok(details, `${rule.name} accepted invalid example ${JSON.stringify(value)}`);
      format(rule.code, { ...details, path: '/x' });
    }
  }
});

test('rules: undefined is valid for every rule except required', () => {
  for (const rule of RULES.filter((r) => r.name !== 'required')) {
    for (const param of rule.examples.params) assert.equal(rule.check(undefined, param), null, rule.name);
  }
});

test('rules: documented in docs/RULES.md', () => {
  const docs = read('docs/RULES.md');
  for (const rule of RULES) assert.match(docs, new RegExp(`^\\| ${rule.name} \\| ${rule.code} \\|`, 'm'), rule.name);
});

test('CHANGELOG keeps an Unreleased section on top', () => {
  assert.match(read('CHANGELOG.md'), /^# Changelog\n\n## Unreleased\n/);
});
