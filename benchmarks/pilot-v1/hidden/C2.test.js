'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, validate } = require('../src/validate');

test('C2 pattern matches string values', () => {
  const schema = compile({ properties: { id: { rules: { pattern: '^[a-z]+-\\d+$' } } } });
  assert.deepEqual(validate(schema, { id: 'abc-12' }), []);
  const [error] = validate(schema, { id: 'ABC' });
  assert.equal(error.code, 'E_PATTERN');
  assert.equal(error.path, '/id');
  assert.equal(error.message, '/id must match /^[a-z]+-\\d+$/');
});
test('C2 pattern ignores non-strings and absence', () => {
  const schema = compile({ rules: { pattern: '^a' } });
  assert.deepEqual(validate(schema, 3), []);
  assert.deepEqual(validate(compile({ properties: { x: { rules: { pattern: '^a' } } } }), {}), []);
});
test('C2 invalid regular expressions fail at compile time', () => {
  for (const bad of ['(', 3, null]) assert.throws(() => compile({ rules: { pattern: bad } }), { name: 'SchemaError' });
});
test('C2 changelog mentions pattern', () => {
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.match(changelog.split('## 1.4.0')[0], /pattern/);
});
