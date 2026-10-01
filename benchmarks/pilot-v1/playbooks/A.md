### PB-1 · add-command-cli
provenance: T3 2026-10 · hits: 0
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
