'use strict';

// Ordered list of schema migrations. Each module exports
// { version, name, up(doc) } where `version` is the schema version the
// migration PRODUCES. Versions are contiguous starting at 2. `up` must be pure
// (never mutate its input — return a new document) and idempotent.
const MIGRATIONS = [
  require('./002-add-created-at'),
];

const CURRENT_VERSION = MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 1;

function migrate(doc) {
  let current = doc;
  for (const migration of MIGRATIONS) {
    if (current.version < migration.version) {
      current = { ...migration.up(current), version: migration.version };
    }
  }
  return current;
}

module.exports = { MIGRATIONS, CURRENT_VERSION, migrate };
