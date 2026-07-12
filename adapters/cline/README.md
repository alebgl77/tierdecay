# Cline adapter

```bash
../../install.sh cline
```
Copies `AGENTS.md` to your repo root (Cline auto-detects it) and seeds
`.tierdecay/`. Prefer a repo-local rule? Move the file to `.clinerules/tierdecay.md`
instead — Cline merges every `.md` in that directory and lets you toggle it from
the Rules panel (the scale icon by the model selector).

Cline binds two model slots, so the four tiers compress onto its Plan/Act split:

| TierDecay | Cline slot | Bind to |
|-----------|-----------|---------|
| T3        | Plan-mode model | strongest (Opus-class) |
| T2        | (no native slot) | Plan model, or swap Act to a mid-tier model |
| T1 / T0   | Act-mode model  | fast/cheap (Sonnet-class) |

Enable it under Settings → **"Use different models for Plan and Act"**, then set
each dropdown. Switching Plan↔Act auto-swaps the model and keeps history.

Tip: run RECON+PLAN entirely in Plan mode (it's read-only, so it physically
can't touch code or `.tierdecay/`), and only switch to Act once the task is
routed — the mode switch itself moves you to the right tier.
