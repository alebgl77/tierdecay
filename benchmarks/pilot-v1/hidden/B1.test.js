'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate, CURRENT_VERSION } = require('../src/migrations');
const { run } = require('./helpers');

test('B1 schema reaches v3 and adds empty tags', () => {
  assert.equal(CURRENT_VERSION >= 3, true);
  const doc = migrate({ version: 2, records: { a: { value: 'x', createdAt: null } } });
  assert.deepEqual(doc.records.a.tags, []);
});
test('B1 existing tags are preserved', () => {
  const doc = migrate({ version: 2, records: { a: { value: 'x', createdAt: null, tags: ['k'] } } });
  assert.deepEqual(doc.records.a.tags, ['k']);
});
test('B1 a v1 document migrates through v2 and v3', () => {
  const doc = migrate({ version: 1, records: { a: { value: 'x' } } });
  assert.equal(doc.records.a.createdAt, null);
  assert.deepEqual(doc.records.a.tags, []);
});
test('B1 saved store files carry the new version', () => {
  const result = run(['set', 'k', 'v'], { doc: { version: 2, records: {} } });
  assert.equal(result.code, 0);
  assert.equal(result.saved.version, CURRENT_VERSION);
});
