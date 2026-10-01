'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, validate } = require('../src/validate');

test('C3 enum accepts listed primitives by strict equality', () => {
  const schema = compile({ rules: { enum: ['a', 1, null] } });
  assert.deepEqual(validate(schema, 'a'), []);
  assert.deepEqual(validate(schema, null), []);
  const [error] = validate(schema, '1');
  assert.equal(error.code, 'E_ENUM');
  assert.equal(error.message, '/ must be one of "a", 1, null');
});
test('C3 enum ignores absence', () => {
  assert.deepEqual(validate(compile({ properties: { x: { rules: { enum: ['a'] } } } }), {}), []);
});
test('C3 enum rejects bad parameters at compile time', () => {
  for (const bad of [[], 'a', [{}], [[1]]]) assert.throws(() => compile({ rules: { enum: bad } }), { name: 'SchemaError' });
});
test('C3 changelog mentions enum', () => {
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.match(changelog.split('## 1.4.0')[0], /enum/);
});
