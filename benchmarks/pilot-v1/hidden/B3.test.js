'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate, MIGRATIONS } = require('../src/migrations');

test('B3 migration 005 renames legacy val to value', () => {
  assert.ok(MIGRATIONS.some((m) => m.version === 5 && m.name === 'rename-legacy-val'));
  const doc = migrate({ version: 4, records: { a: { val: 'old', createdAt: null, tags: [] } } });
  assert.deepEqual(doc.records.a, { value: 'old', createdAt: null, tags: [] });
});
test('B3 value wins when both exist and val is dropped', () => {
  const doc = migrate({ version: 4, records: { a: { value: 'new', val: 'old', createdAt: null, tags: [] } } });
  assert.deepEqual(doc.records.a, { value: 'new', createdAt: null, tags: [] });
});
test('B3 on old documents v4 trimming runs before the v5 rename, so legacy values stay untrimmed', () => {
  const doc = migrate({ version: 1, records: { a: { val: ' legacy ' } } });
  assert.equal(doc.records.a.value, ' legacy ');
  assert.equal('val' in doc.records.a, false);
});
