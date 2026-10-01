# kvlite

Tiny JSON-file key/value store with a CLI, schema migrations, and value
validation rules. Zero dependencies; Node.js 18+.

The store file is `$KVLITE_FILE`, or `./kvlite.json` when unset.

## Commands

| command | usage | summary |
|---|---|---|
| get | `kvlite get <key> [--json]` | Print the value stored under a key |
| list | `kvlite list [--json]` | Print every key, sorted |
| set | `kvlite set <key> <value> [--no-overwrite]` | Store a value under a key |

Exit codes: `0` success · `2` usage error · `3` not found · `4` conflict ·
`5` schema error.

## Development

```bash
npm test
```

Contributor conventions live in the code comments of each registry
(`src/commands/index.js`, `src/migrations/index.js`, `src/rules/index.js`) and
are enforced by `test/conventions.test.js`. User-visible changes go in
`CHANGELOG.md` under `Unreleased`.
