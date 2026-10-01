'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./helpers');
const seed = () => ({ version: 2, records: { a: { value: 'x', createdAt: '2026-01-02' }, b: { value: 'y', createdAt: null } } });

test('A2 rename moves the whole record and persists', () => {
  const result = run(['rename', 'a', 'c'], { doc: seed() });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'renamed a -> c\n');
  assert.equal(result.saved.records.a, undefined);
  assert.deepEqual(result.saved.records.c, { value: 'x', createdAt: '2026-01-02' });
});
test('A2 rename of a missing key exits 3', () => {
  const result = run(['rename', 'zz', 'c'], { doc: seed() });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /no such key: zz/);
});
test('A2 rename onto an existing key exits 4 unless --force', () => {
  const blocked = run(['rename', 'a', 'b'], { doc: seed() });
  assert.equal(blocked.code, 4);
  assert.match(blocked.stderr, /key exists: b/);
  const forced = run(['rename', 'a', 'b', '--force'], { doc: seed() });
  assert.equal(forced.code, 0);
  assert.equal(forced.saved.records.b.value, 'x');
  assert.equal(forced.saved.records.a, undefined);
});
test('A2 changelog mentions rename', () => {
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.match(changelog.split('## 1.4.0')[0], /rename/);
});
