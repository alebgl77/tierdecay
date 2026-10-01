# Google Antigravity adapter

```bash
/path/to/tierdecay/install.sh antigravity   # run from the repo you want to equip
```

Antigravity reads project customizations from `.agents/`. The adapter uses
four of them, so the orchestrator follows the same protocol as on Claude
Code and Codex:

| Installed | Antigravity mechanism | Role in TierDecay |
|---|---|---|
| `.agents/rules/tierdecay.md` | workspace rule, `trigger: always_on` | orchestrator protocol: precedence, rubric, brief, VERIFY, DISTILL |
| `.agents/agents/{scout,executor,heavy-executor,oracle}.md` | custom subagents (`model`, `commandExecutionPolicy`) | T0–T3 |
| `.agents/skills/tierdecay-{routing,distill,execution}/` | Agent Skills | on-demand detail, loaded only when relevant |
| `.agents/mcp_config.json` | workspace MCP servers | the read-only advisor (`tierdecay_route`, `tierdecay_playbook`, …) |
| `.tierdecay/` | shared state | ledger, playbook, protocol, `MODELS.md`, router config |

## Tier binding

| Tier | Subagent | `model` | `commandExecutionPolicy` | Conversation mode without subagents |
|---|---|---|---|---|
| T3 | orchestrator + `oracle` | `pro` | `off` (read-only reviewer) | Planning |
| T2 | `heavy-executor` | `pro` | `sandbox` | Planning |
| T1 | `executor` | `flash` | `sandbox` | Fast |
| T0 | `scout` | `flash` | `off` | Fast |

`pro` and `flash` are Antigravity's model classes, so a model upgrade on
Google's side is a binding change: start a new epoch in
`.tierdecay/MODELS.md` and let entries recertify. If your build exposes other
model names in subagent frontmatter, edit `model:` and record the binding in
`MODELS.md`. Generate the table from the engine:
`tierdecay export --format antigravity`.

## After installing

1. **Put the CLI on PATH** for the MCP server:
   `npm install -g github:alebgl77/tierdecay#v0.5.0`. If Antigravity does not
   inherit your shell `PATH`, replace `"command": "tierdecay"` in
   `.agents/mcp_config.json` with the absolute path (`command -v tierdecay`).
   Without the CLI, delete the file: the rule and skills work on their own.
2. Start the orchestrating conversation in **Planning** mode on a `pro`-class
   model; it delegates T1/T0 work to the `flash` subagents.
3. Workflows are being retired in favour of skills, so TierDecay ships none;
   the three skills cover routing, distillation, and execution standards.

## Integrity without a hook

Antigravity supports hooks (`.agents/hooks.json`), but its payload format for
subagent tool calls is not documented well enough to identify the calling
subagent reliably, and a guard that cannot tell the orchestrator from an
executor either blocks bookkeeping or lets executors through. The adapter
therefore ships **no active hook**. Integrity rests on three layers:

- executors run with `commandExecutionPolicy: sandbox` and are instructed
  never to write `.tierdecay/` or `.agents/`;
- VERIFY rejects any subagent diff that touches them;
- `tierdecay doctor` (locally or in CI via the GitHub Action) fails on an
  unparsable ledger or playbook, an exceeded cap, or world-writable state.

A hook that blocks every agent would also block the orchestrator's own
bookkeeping, so the shared guard (`adapters/claude-code/.claude/hooks/tierdecay-guard.sh`,
which accepts Claude-compatible `PreToolUse` payloads) will be wired in once
Antigravity documents a subagent identifier in hook input.

## Verify

```bash
tierdecay doctor   # exit 1 on any failing check
```
