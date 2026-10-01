'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./helpers');

test('set then get round-trips through the store file', () => {
  const first = run(['set', 'a', 'hello']);
  assert.equal(first.code, 0);
  const second = run(['get', 'a'], { file: first.file });
  assert.equal(second.stdout, 'hello\n');
});

test('get on a missing key exits 3', () => {
  const result = run(['get', 'nope']);
  assert.equal(result.code, 3);
  assert.match(result.stderr, /no such key/);
});

test('unknown flags are usage errors', () => {
  assert.equal(run(['list', '--bogus']).code, 2);
});

test('set --no-overwrite refuses an existing key', () => {
  const doc = { version: 2, records: { a: { value: 'x', createdAt: null } } };
  assert.equal(run(['set', 'a', 'y', '--no-overwrite'], { doc }).code, 4);
});

test('loading a v1 document migrates it before use', () => {
  const result = run(['get', 'a', '--json'], { doc: { version: 1, records: { a: { value: 'x' } } } });
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).createdAt, null);
});
