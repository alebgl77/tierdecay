'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, validate } = require('../src/validate');

test('nested paths are JSON Pointers with escaping', () => {
  const schema = compile({ properties: { 'a/b': { properties: { c: { rules: { required: true } } } } } });
  const [error] = validate(schema, { 'a/b': {} });
  assert.equal(error.path, '/a~1b/c');
  assert.equal(error.message, '/a~1b/c is required');
});

test('bad schema parameters fail at compile time', () => {
  assert.throws(() => compile({ rules: { type: 'str' } }), { name: 'SchemaError' });
  assert.throws(() => compile({ rules: { nope: 1 } }), { name: 'SchemaError' });
});

test('type reports expected and actual', () => {
  const [error] = validate(compile({ rules: { type: 'string' } }), 3);
  assert.equal(error.code, 'E_TYPE');
  assert.equal(error.message, '/ must be of type string (got number)');
});
