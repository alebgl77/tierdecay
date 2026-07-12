# Windsurf (Devin Desktop) adapter

```bash
../../install.sh windsurf
```
Copies `AGENTS.md` to your repo root (Windsurf/Devin Desktop reads it, same
as Codex/Cursor) and seeds `.tierdecay/`. For enforcement rather than a
one-time read, also drop the file under `.devin/rules/` (legacy fallback
`.windsurf/rules/`) with Always-On activation.

## Model binding (no native two-tier mode — flat per-message picker)

| TierDecay | Windsurf mechanism |
|-----------|--------------------|
| T3 | Top "Thinking"/Max Claude Opus-class model in the chat dropdown, or hand the task to the cloud Devin agent via ACP |
| T2 | Mid-tier Claude Sonnet "Thinking" model |
| T1 / T0 | Cheapest fast default in the dropdown — check the live list in your build |

No CLI flag, env var, or config file was found that sets a default model
non-interactively — binding a tier means picking it in the dropdown per
message, or naming it inside a `.devin/rules/` entry with Model-Decision
activation so the agent requests it itself.

Tip: workflows (`.windsurf/workflows/*.md`) are never auto-invoked — they
only run via an explicit `/workflow-name` — so don't lean on them for phase
discipline; a Rules file is the mechanism that can fire without a human
typing a slash command.

Caveat: official docs describe Cascade as deprecated in favor of "Devin
Local" around July 2026; check your app's current branding before assuming
either name is what's running.
