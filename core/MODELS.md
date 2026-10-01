# Model Bindings — the only file that names a model version

Tiers are **roles**, not models. Every adapter, skill, and agent in this repo
binds T0–T3 by role and by **provider alias or model class**, plus an effort
level where the client exposes one; this file records the current
binding policy and any deliberately pinned model IDs. Current bindings do not
depend on a provider version number, price, or plan-availability claim.

CI enforces this: a versioned model string (`Opus 4.8`, `claude-sonnet-4-6`, …)
appearing anywhere outside this file, the changelog, or a historical ledger
fails the `conformance` job.

## Default bindings — four roles, two aliases, four effort levels (updated 2026-10-01)

A tier binding is **(alias, effort)**. The native adapter uses only `opus` and
`sonnet`; effort separates the roles that share an alias. T3 and T2 share
`opus` (`xhigh` vs `high`); T1 and T0 share `sonnet` (`medium` vs `low`). The
roles stay distinct: planning/review, complex execution, standard execution,
and read-only recon. Check access and the resolved model in your client when
starting a session; this policy does not promise availability on any plan.

| Tier | Role | Claude Code alias | Effort |
|---|---|---|---|
| T3 | main thread / oracle: plan, architect, review critical diffs | `opus` | `xhigh` (oracle) |
| T2 | heavy executor: refactors, concurrency, perf | `opus` | `high` |
| T1 | executor: specced features, tests, docs | `sonnet` | `medium` |
| T0 | scout: read-only recon | `sonnet` | `low` |

The main thread's effort is whatever your client is set to; the subagents pin
theirs in `effort:` frontmatter. Effort levels are a cost lever inside one
model: lowering effort cuts thinking and tool-call volume without changing the
model. They are defaults, not measurements — tune them per class from your
ledger, and treat an effort change like a model change (new binding epoch).

### No Haiku-class binding (policy)

TierDecay deliberately never binds a tier to a Haiku-class model. The cheap end
of the ladder is the fast workhorse (`sonnet`) at lower effort. Two reasons:
quality headroom on the executor tiers matters more than the last price step,
and one model family per role keeps prompt-cache reuse and the posterior
interpretable. `tests/test-model-policy.js` fails if any shipped adapter,
plugin, core file other than this one, or the installer names that family.

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
3. Start a new binding epoch. A model or effort change invalidates the
   empirical posterior: a class that decayed to T1 under the old binding may or
   may not hold under the new one. Entries that record `epoch:` are
   re-certified automatically — the router runs them at their provenance tier
   (action `recertify`) until a pass adopts the new epoch — and measured rows
   never cross epochs. `tierdecay status --epoch <new>` lists what is due.

## OpenAI Codex — one session model, four efforts

The Codex adapter binds tiers by **reasoning effort** on the session model,
the same way the Claude Code adapter separates roles that share an alias:

| Tier | Codex role (`.codex/agents/`) | `model_reasoning_effort` | `sandbox_mode` |
|---|---|---|---|
| T3 | orchestrator + `oracle` | `xhigh` | `read-only` |
| T2 | `heavy-executor` | `high` | `workspace-write` |
| T1 | `executor` | `medium` | `workspace-write` |
| T0 | `scout` | `low` | `read-only` |

Roles carry no `model =` line, so they inherit whatever `/model` resolves to
in the session; a Codex model change is therefore a binding change for every
tier (new epoch). To pin a model per role, add `model = "<id>"` to the role
file and record the ID and the date you checked it here. The same no-budget-
family rule applies: do not bind a tier to a "mini"/"nano" class model.

## Google Antigravity — two model classes

| Tier | Subagent (`.agents/agents/`) | `model` | Conversation mode without subagents |
|---|---|---|---|
| T3 | orchestrator + `oracle` | `pro` | Planning |
| T2 | `heavy-executor` | `pro` | Planning |
| T1 | `executor` | `flash` | Fast |
| T0 | `scout` | `flash` | Fast |

`pro` and `flash` are Antigravity's own model classes (`inherit` is the
third value); the concrete models behind them are Google's choice, so record
what your build resolves to when you start an epoch.

## Other providers

The tier roles are provider-agnostic. Map them to whatever your CLI exposes:

| Tier | Gemini | Aider | Generic |
|---|---|---|---|
| T3 / T2 | Pro-class | `--model` (architect) | your frontier / strong model |
| T1 / T0 | Flash-class | `--editor-model` | your fast workhorse (lower effort for T0) |

If your provider has no alias mechanism, this file is where you record the
pinned IDs — and the date you last checked them.
