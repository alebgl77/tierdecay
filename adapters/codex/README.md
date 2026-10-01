# OpenAI Codex adapter

```bash
/path/to/tierdecay/install.sh codex   # run from the repo you want to equip
```

Native, not a pointer file: Codex gets the same four tiers, the same guard,
and the same advisor as Claude Code.

| Installed | Codex mechanism | Role in TierDecay |
|---|---|---|
| `AGENTS.md` | project instructions (root, merged with nested files; 32 KiB budget) | orchestrator protocol: precedence, rubric, brief, VERIFY, DISTILL |
| `.codex/agents/{scout,executor,heavy-executor,oracle}.toml` | custom subagent roles | T0–T3, differing by `model_reasoning_effort` and `sandbox_mode` |
| `.agents/skills/tierdecay-{routing,distill,execution}/` | Agent Skills (`$tierdecay-routing` …) | on-demand detail, loaded only when used |
| `.codex/config.toml` | project config (`[agents]`, `[mcp_servers.tierdecay]`) | parallel executors + the read-only advisor over MCP |
| `.codex/hooks.json` + `.codex/hooks/tierdecay-guard.sh` | `PreToolUse` hook on `apply_patch` and `Bash` | blocks executor roles from writing `.tierdecay/`, `.claude/` |
| `.tierdecay/` | shared state | ledger, playbook, protocol, `MODELS.md`, router config |

## Tier binding: one model, four efforts

| Tier | Role | `model_reasoning_effort` | `sandbox_mode` |
|---|---|---|---|
| T3 | orchestrator + `oracle` | `xhigh` | `read-only` |
| T2 | `heavy-executor` | `high` | `workspace-write` |
| T1 | `executor` | `medium` | `workspace-write` |
| T0 | `scout` | `low` | `read-only` |

Roles inherit the session model, so a Codex model upgrade changes every tier
at once — start a new binding epoch in `.tierdecay/MODELS.md` when it
happens. To pin a model per tier, add `model = "<id>"` to the role file and
record it in `MODELS.md` (a pin is a new epoch). No tier is bound to a
"mini"/budget family by default; effort is the cost axis.

Generate the table from the engine: `tierdecay export --format codex`.

## After installing

1. **Trust the project** in Codex — project `.codex/config.toml`, roles, and
   hooks load only in trusted projects.
2. **Review and trust the hook** with `/hooks`. Codex does not run a new
   project hook until you approve it; until then, integrity rests on the
   protocol and on VERIFY.
3. **Put the CLI on PATH** for the MCP server:
   `npm install -g github:alebgl77/tierdecay#v0.5.0`
   (or remove the `[mcp_servers.tierdecay]` table; the protocol works without it).
4. Optional single-session tiers: copy `profiles/tierdecay-t*.config.toml` to
   `$CODEX_HOME` (default `~/.codex`) and run `codex --profile tierdecay-t1`.

Requires Node.js ≥ 18 (the guard is a fail-closed Node script).

## How the guard reads Codex events

Codex hook payloads mirror Claude Code's: `tool_name`, `tool_input`, and a
top-level `agent_type` inside subagents. The shared guard runs with
`--executors-only`, so it acts only for `executor` and `heavy-executor`
(the orchestrator keeps its bookkeeping rights; `scout` and `oracle` are
read-only by sandbox). For `apply_patch` it parses every
`*** Add/Update/Delete File:` and `*** Move to:` header and resolves each
target against the session cwd; for `Bash` it applies the same
state-write detection as on Claude Code. A block is exit code 2 with the
reason on stderr, which Codex feeds back to the model.

The copy under `.codex/hooks/` is generated from the Claude Code guard by
`node scripts/build-plugin.js`; CI fails if they drift.

## Verify

```bash
tierdecay doctor   # ledger, playbook, cap, permissions, bookkeeping; exit 1 on failure
# MCP smoke test: the handshake Codex performs
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | tierdecay mcp
```
