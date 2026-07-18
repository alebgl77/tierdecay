# Cursor adapter

```bash
/path/to/tierdecay/install.sh cursor   # run from the repo you want to equip
```
Copies `AGENTS.md` to your repo root — Cursor reads it natively at the root and
in nested subdirectories ([docs](https://cursor.com/docs/rules)) — and seeds
`.tierdecay/`.

Want an always-on, version-controlled rule as well? Copy the shipped
[`tierdecay.mdc`](tierdecay.mdc) to `.cursor/rules/tierdecay.mdc` — an
`alwaysApply: true` Project Rule ("Always Apply" type) that pins the protocol
into every request. It's a thin pointer to `AGENTS.md` (single source of
truth), not a copy — no drift surface. The legacy `.cursorrules` root file
still loads but is being deprecated — don't build on it.

## Model binding (no native planner/executor pair — a per-message picker)

Cursor exposes one model picker per conversation/surface, not a four-tier split,
so the tiers compress onto the models you select:

| TierDecay | Cursor mechanism |
|-----------|------------------|
| T3 | Top frontier model (Claude Opus-class / GPT-5.x) in the picker; use **Plan mode** for RECON/PLAN |
| T2 | Mid model (Claude Sonnet-class / Cursor Composer) |
| T1 / T0 | Cheapest default in the picker — read-only recon rides the same tier |

Recent builds (Cursor 2.x/3) can expose **per-surface / per-mode default models**
(Agent / Ask / Plan) — bind T3 to the Agent/Plan surface and a cheaper model to
Ask where your build allows. Confirm the feature in your version; it's evolving.

Tip: **don't use `Auto` model mode when you want the decay signal** — Auto picks
a model per request, so the `executed` tier in your ledger stops reflecting a
choice you made. Pick the tier explicitly, or accept that Auto-run rows are
noise in the posterior.
