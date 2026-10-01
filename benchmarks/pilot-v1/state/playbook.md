# Repo Playbook — pilot-v1 replay state

The three entries distilled during the pilot (verbatim in `../playbooks/`), with
provenance set to T2: the rubric scores these classes 4 (T2), and the native
binding maps T2 and T3 to the same `opus` alias, so the measured Opus runs are
the T2 outcome.

## PATTERNS

### PB-1 · add-command-cli
provenance: T2 2026-10 · hits: 0
risk: 1
epoch: pilot-v1
WHEN: brief asks to add a new subcommand to the kvlite Node CLI (command registry under src/commands, zero deps, existing tests frozen).
DO: 1) Before editing, read the header comment in src/commands/index.js, one sibling command, src/errors and test/cli.test.js.
2) Create src/commands/<name>.js in the same shape as its siblings: 'use strict'; export { name, summary, spec: { positionals: [...], flags: {...} }, run(ctx, { args }) } returning 0.
3) Set the argument count only in spec.positionals. The dispatcher already turns a wrong count into a usage error (exit 2), so don't check argc yourself or call process.exit.
4) Report failures by throwing the matching KvError subclass from ../errors (e.g. NotFoundError gives exit 3). Leave the "error: " prefix off the message because the dispatcher adds it. Print success output with ctx.io.out.
5) For commands that change data, validate first, then change ctx.store, then call ctx.store.save() BEFORE returning.
6) Add require('./<name>') to the COMMANDS array in src/commands/index.js and keep the array in alphabetical order.
7) Add a README command-table row in alphabetical position: | name | `kvlite <name> <args> [--flags]` | summary |. Its usage and summary must match the module's spec and summary exactly. Under CHANGELOG "## Unreleased", add "- Added `<name>` command."
8) Add new tests to the end of test/cli.test.js covering the success, error-exit and usage-exit paths. Don't change existing tests.
VERIFY: `npm test` run from the repo root reports 0 failed and includes the new tests. Running the new command by hand gives exactly the stdout, stderr and exit codes the brief requires.

### PB-2 · add-migration-store
provenance: T2 2026-10 · hits: 0
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

### PB-3 · add-rule-validator
provenance: T2 2026-10 · hits: 0
risk: 1
epoch: pilot-v1
WHEN: brief asks to add a schema validation rule (new `E_*` code + failure message) to kvlite's validator.
DO: 1) Before editing, read src/rules/index.js, one sibling rule in src/rules/, src/messages.js, src/errors.js, docs/RULES.md and the conventions test.
2) Create src/rules/<rule>.js mirroring siblings ('use strict'; export {name, code, checkParam, check, examples}). checkParam throws SchemaError (from ../errors) for every param the brief rejects. Param validation happens at compile time, never inside check().
3) check(value, param) returns null on pass and a details object on failure. Return null for undefined and for types the rule does not apply to, because absence is `required`'s job.
4) The details keys must supply every template placeholder except {path}, which is filled automatically. format() throws if any placeholder is missing.
5) Always include `examples` {params, badParams, valid, invalid}. valid and invalid are [param, value] pairs. The conventions test requires this block. Cover the boundary, other types, null and undefined.
6) Register the rule with require in src/rules/index.js, add the template to src/messages.js and add a row to the docs/RULES.md table. Keep all three sorted alphabetically.
7) Add a line under `## Unreleased` in CHANGELOG.md and one new test in test/validate.test.js. Never change existing tests.
VERIFY: `npm test` reports 0 failures and includes the new test, and a failing value produces exactly the brief's message text (e.g. `/ must ... (got N)`).

## QUARANTINE

(none)
