'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate, MIGRATIONS } = require('../src/migrations');

test('B2 migration 004 trims string values only', () => {
  assert.ok(MIGRATIONS.some((m) => m.version === 4 && m.name === 'trim-values'));
  const doc = migrate({ version: 3, records: { a: { value: '  x \n', createdAt: null, tags: [] }, b: { value: 3, createdAt: null, tags: [] } } });
  assert.equal(doc.records.a.value, 'x');
  assert.equal(doc.records.b.value, 3);
});
test('B2 keys and other fields are untouched', () => {
  const doc = migrate({ version: 3, records: { ' k ': { value: 'v ', createdAt: ' 2026 ', tags: [' t '] } } });
  assert.deepEqual(doc.records[' k '], { value: 'v', createdAt: ' 2026 ', tags: [' t '] });
});
test('B2 runs after v3 on an old document', () => {
  const doc = migrate({ version: 1, records: { a: { value: ' y ' } } });
  assert.deepEqual(doc.records.a, { value: 'y', createdAt: null, tags: [] });
});
