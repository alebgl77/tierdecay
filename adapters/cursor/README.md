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

**Cursor's router (`Auto`).** Since Cursor split Auto into Cost / Balance /
Intelligence goals (July 2026), TierDecay complements it rather than fighting
it: bind T1 → Auto (Cost), T2 → Auto (Balance), T3 → Auto (Intelligence) or an
explicit frontier model, and log the goal you chose as the `executed` tier.
Cursor's router is trained across its whole user base; TierDecay contributes
the per-repo, per-class posterior it cannot see. Generate the table with
`node /path/to/tierdecay/bin/tierdecay.js export --format cursor`. The concrete
model behind an Auto goal is Cursor's choice, so take measured costs from your
Cursor usage view, not from the tier label. Confirm the goal names in your
build; the feature is evolving.
