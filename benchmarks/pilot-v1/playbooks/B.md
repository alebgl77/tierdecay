### PB-2 · add-migration-store
provenance: T3 2026-10 · hits: 0
risk: 1
epoch: pilot-v1
WHEN: a kvlite task adds a schema migration (new store version N) that adds or changes a field on persisted records.
DO: 1) Read src/migrations/index.js and the highest-numbered src/migrations/NNN-*.js first, then copy that file's shape exactly ('use strict', a one-line `// vN:` comment, module.exports).
2) Create src/migrations/<3-digit zero-padded N>-<kebab-name>.js that exports { version: N (the last registered version + 1), name: '<kebab-name>' (same as the filename suffix), up(doc) }.
3) up(doc) must be pure and idempotent, and test/conventions.test.js checks both. Build a new records object, spread each record into a new one, then return { ...doc, records }. Never mutate the input.
4) Keep existing values: set the default only when the field is missing or has the wrong type (use a type guard such as Array.isArray). Leave valid existing values exactly as they are.
5) Add the require to the end of the MIGRATIONS array in src/migrations/index.js, keeping versions in ascending order. CURRENT_VERSION comes from the last entry, so never hardcode it.
6) TRAP: code that creates new records skips migrations. Find every place that builds a fresh record (for example the `previous || {…}` default in src/commands/set.js) and add the new field's default there too. This is part of the job, not a deviation.
7) Docs: add a `| N | name | effect |` row to docs/MIGRATIONS.md. Add a bullet "Migration `NNN-name`: …" under `## Unreleased` in CHANGELOG.md.
8) Do not modify existing tests and do not add dependencies.
VERIFY: `npm test` reports 0 failures, including the conventions test. Loading a v1 document and a previous-version document gives version N with the field on every record and existing values unchanged. Running up twice gives the same result as running it once.
