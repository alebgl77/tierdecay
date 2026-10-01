'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./helpers');
const seed = () => ({ version: 2, records: { ab: { value: 1, createdAt: null }, ac: { value: 2, createdAt: null }, b: { value: 3, createdAt: null } } });

test('A3 count prints the number of keys', () => {
  const result = run(['count'], { doc: seed() });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '3\n');
});
test('A3 count --prefix filters keys', () => {
  assert.equal(run(['count', '--prefix', 'a'], { doc: seed() }).stdout, '2\n');
  assert.equal(run(['count', '--prefix', 'zz'], { doc: seed() }).stdout, '0\n');
});
test('A3 count --json emits an object', () => {
  assert.deepEqual(JSON.parse(run(['count', '--json', '--prefix', 'a'], { doc: seed() }).stdout), { count: 2 });
});
test('A3 count on an empty store is 0 and positionals are rejected', () => {
  assert.equal(run(['count']).stdout, '0\n');
  assert.equal(run(['count', 'x'], { doc: seed() }).code, 2);
});
test('A3 changelog mentions count', () => {
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.match(changelog.split('## 1.4.0')[0], /count/);
});
