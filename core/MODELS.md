# Model Bindings — the only file that names a model version

Tiers are **roles**, not models. Every adapter, skill, and agent in this repo
binds T0–T3 by role and by **provider alias**; this file records the current
binding policy and any deliberately pinned model IDs. Current bindings do not
depend on a provider version number, price, or plan-availability claim.

CI enforces this: a versioned model string (`Opus 4.8`, `claude-sonnet-4-6`, …)
appearing anywhere outside this file, the changelog, or a historical ledger
fails the `conformance` job.

## Default bindings — four roles, two aliases (updated 2026-09-03)

The native adapter uses only `opus` and `sonnet`. T3 and T2 share `opus`; T1
and T0 share `sonnet`. The roles stay distinct even where the model is the
same: planning/review, complex execution, standard execution, and read-only
recon. Check access and the resolved model in your client when starting a
session; this policy does not promise availability on any particular plan.

| Tier | Role | Claude Code alias |
|---|---|---|
| T3 | main thread / oracle: plan, architect, review critical diffs | `opus` |
| T2 | heavy executor: refactors, concurrency, perf | `opus` |
| T1 | executor: specced features, tests, docs | `sonnet` |
| T0 | scout: read-only recon | `sonnet` |

## Prefer aliases over pinned IDs

The shipped `model:` fields request `opus` or `sonnet`, not a versioned ID.
Alias resolution belongs to the client/provider, so model-family updates do
not require rewriting the agent files. Verify the resolved model when a
session starts and record it when comparing results.

Pin an exact ID only when you need reproducibility — a benchmark, a regression
you are bisecting, or a ledger you intend to compare across weeks.

A pin is a deliberate cost: it freezes that tier until someone updates it. Note
the pin in your ledger so the row stays interpretable later.

## When a new model ships

1. Check the model actually resolved by your client; do not infer it from a
   release announcement or an alias name alone.
2. Keep the two-alias policy unless you deliberately revise it. Skills, agents,
   and adapter prose name roles, not versions, so they need no version edit.
3. Re-run your probes. A model change invalidates the empirical posterior: a
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
