'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./helpers');
const seed = () => ({ version: 2, records: { a: { value: 'x', createdAt: null }, b: { value: 'y', createdAt: null } } });

test('A1 delete removes the key and persists', () => {
  const result = run(['delete', 'a'], { doc: seed() });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'deleted a\n');
  assert.equal(result.saved.records.a, undefined);
  assert.ok(result.saved.records.b);
});
test('A1 delete on a missing key exits 3 without writing', () => {
  const result = run(['delete', 'zz'], { doc: seed() });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /^error: no such key: zz\n$/);
});
test('A1 delete requires exactly one key', () => {
  assert.equal(run(['delete'], { doc: seed() }).code, 2);
  assert.equal(run(['delete', 'a', 'b'], { doc: seed() }).code, 2);
});
test('A1 changelog mentions delete', () => {
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.match(changelog.split('## 1.4.0')[0], /delete/);
});
