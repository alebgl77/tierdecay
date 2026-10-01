'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, validate } = require('../src/validate');

test('C1 minLength on strings and arrays', () => {
  const schema = compile({ rules: { minLength: 3 } });
  const [error] = validate(schema, 'ab');
  assert.equal(error.code, 'E_MIN_LENGTH');
  assert.equal(error.message, '/ must have length >= 3 (got 2)');
  assert.equal(validate(schema, [1, 2]).length, 1);
  assert.deepEqual(validate(schema, 'abc'), []);
});
test('C1 minLength ignores other types and absence', () => {
  const schema = compile({ properties: { a: { rules: { minLength: 1 } } } });
  assert.deepEqual(validate(schema, {}), []);
  assert.deepEqual(validate(compile({ rules: { minLength: 1 } }), 7), []);
});
test('C1 minLength rejects bad parameters at compile time', () => {
  for (const bad of [-1, 1.5, '2', null]) assert.throws(() => compile({ rules: { minLength: bad } }), { name: 'SchemaError' });
  compile({ rules: { minLength: 0 } });
});
test('C1 changelog mentions minLength', () => {
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.match(changelog.split('## 1.4.0')[0], /minLength/);
});
