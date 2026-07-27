# Model Bindings — the only file that names a model version

Tiers are **roles**, not models. Every adapter, skill, and agent in this repo
binds T0–T3 by role and by **provider alias**; this file is the single place
where roles map to concrete, named models. A new model release is therefore a
one-file edit here — not a sweep across the tree.

CI enforces this: a versioned model string (`Opus 4.8`, `claude-sonnet-4-6`, …)
appearing anywhere outside this file, the changelog, or a historical ledger
fails the `conformance` job.

## Current bindings (Anthropic — updated 2026-07-24)

| Tier | Role | Claude Code alias | Concrete model today |
|---|---|---|---|
| T3 | frontier reasoning: plan, architect, review | `fable` | Claude Fable 5 |
| T2 | strong workhorse: refactors, concurrency, perf | `opus` | Claude Opus 5 |
| T1 | fast/cheap: specced features, tests, docs | `sonnet` | Claude Sonnet 5 |
| T0 | cheapest: read-only recon | `haiku` | Claude Haiku 4.5 |

## Prefer aliases over pinned IDs

Claude Code's `model:` aliases (`fable`, `opus`, `sonnet`, `haiku`) resolve to
the **latest model in each family at session start**. That is the whole
mechanism: when a new Opus ships, an agent bound to `opus` picks it up with no
edit anywhere. The adapters use aliases for exactly this reason.

Pin an exact ID only when you need reproducibility — a benchmark, a regression
you are bisecting, or a ledger you intend to compare across weeks:

```yaml
model: claude-opus-5   # pinned; will NOT track future releases
```

A pin is a deliberate cost: it freezes that tier until someone updates it. Note
the pin in your ledger so the row stays interpretable later.

## When a new model ships

1. Update the table above (one row, plus the date).
2. Nothing else — aliases already point at it. Skills, agents, and adapter prose
   name roles, not versions, so they need no edit.
3. If the new model changes a tier's *economics* (e.g. the mid tier becomes as
   cheap as the fast tier), reconsider which alias each tier binds to — that is
   a routing decision, and it belongs in the table above too.
4. Re-run your probes. A model change invalidates the empirical posterior: a
   class that decayed to T1 under the old fast model may or may not hold under
   the new one. Treat a tier rebinding like a playbook revision — the next
   occurrence of each decayed class is a fresh probe, not a settled default.

## Other providers

The tier roles are provider-agnostic. Map them to whatever your CLI exposes:

| Tier | Gemini | Aider | Generic |
|---|---|---|---|
| T3 / T2 | Pro-class | `--model` (architect) | your frontier / strong model |
| T1 / T0 | Flash-class | `--editor-model` | your fast / cheapest model |

If your provider has no alias mechanism, this file is where you record the
pinned IDs — and the date you last checked them.
