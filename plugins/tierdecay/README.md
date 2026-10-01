# TierDecay — Claude Code plugin

The native TierDecay adapter packaged as a Claude Code plugin: install it once
from the marketplace instead of copying files into every repository.

```text
/plugin marketplace add alebgl77/tierdecay
/plugin install tierdecay@tierdecay
```

Then, in each project you want to opt in:

```text
/tierdecay:init
```

`/tierdecay:init` seeds `.claude/routing-ledger.md`,
`.claude/skills/repo-playbook/SKILL.md`, and `.tierdecay/MODELS.md`. It never
overwrites an existing file. Start a new session afterwards and run the main
thread on `/model opus`.

## What the plugin provides

| Component | Role |
|---|---|
| `tierdecay:scout` · `sonnet` · effort `low` | T0 read-only recon |
| `tierdecay:executor` · `sonnet` · effort `medium` | T1 specced execution; preloads `tierdecay:execution-standards` and the project's `repo-playbook` |
| `tierdecay:heavy-executor` · `opus` · effort `high` | T2 complex execution |
| `tierdecay:oracle` · `opus` · effort `xhigh` | T3 review / solve, read-only |
| skills `model-routing`, `tier-decay`, `execution-standards` | routing rubric, decay protocol, executor discipline |
| skill `init` | opt a project in |
| `SessionStart` hook | loads the orchestrator protocol in opted-in projects only (one line elsewhere) |
| `PreToolUse` hook | blocks TierDecay executors from writing `.claude/` or `.tierdecay/` |
| `tierdecay`, `tierdecay-init` on the Bash `PATH` | the deterministic advisor (`status`, `export`, `route`, `bench`, …) and the seeding script |

No tier is bound to the cheapest model family: the cheap end of the ladder is
`sonnet` at lower effort (policy in `templates/MODELS.md`).

## Differences from the copied-files adapter

- **Guard scope.** Plugin agents ignore `hooks:` frontmatter, so the guard is a
  plugin-wide `PreToolUse` hook run with `--executors-only`: it enforces when
  the hook payload's `agent_type` is `executor` or `heavy-executor` (with or
  without the `tierdecay:` prefix) and lets everything else through. The
  native adapter attaches the same script to the executors themselves. In both
  cases VERIFY still rejects any executor diff that touches routing state.
- **Approval prompts.** A plugin cannot ship your project's permission rules.
  `tierdecay-init` prints the two `ask` rules to add to `.claude/settings.json`
  for parity with the native adapter.
- **Main-thread model.** A plugin cannot set the session model; use
  `/model opus`.

## Maintenance

Everything except this README, `hooks/hooks.json`, `hooks/session-start.sh`,
`bin/tierdecay-init`, and `skills/init/` is generated from
`adapters/claude-code/` and `core/` by `node scripts/build-plugin.js`; CI runs
it with `--check`, so the plugin and the copied-files adapter cannot drift.
