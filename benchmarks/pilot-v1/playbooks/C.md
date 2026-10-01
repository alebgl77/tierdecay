### PB-3 · add-rule-validator
provenance: T3 2026-10 · hits: 0
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
