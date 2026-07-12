# AGENTS.md adapter — Codex CLI · Cursor · OpenCode · Copilot · Zed

One file, every CLI that adopted the AGENTS.md standard.

## Install
```bash
../../install.sh agents        # from the repo you want to equip
```
Copies `AGENTS.md` to your repo root and seeds `.tierdecay/ledger.md` +
`.tierdecay/playbook.md` from the core templates. If you already have an
AGENTS.md, append this one below it.

## Model binding per CLI (T3 / T2 / T1 — check current model IDs)
| CLI | Mechanism |
|---|---|
| Codex CLI | `/model` in-session, or profiles in `~/.codex/config.toml` (`codex --profile heavy`) |
| Cursor | model picker per conversation; rules stay active across models |
| OpenCode | per-agent `model` in `opencode.json` — closest to Claude Code's native binding |
| Copilot CLI | session model selection |
| Zed | per-thread model picker |

Single-agent CLIs run TierDecay in phase mode (see AGENTS.md §Phases): the
agent announces the tier a phase needs and you switch — or ignore switching
entirely and still collect the playbook's turn/context savings.
