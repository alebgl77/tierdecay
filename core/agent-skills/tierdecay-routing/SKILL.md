---
name: tierdecay-routing
description: Route a coding task to the tier this repository has earned for its class (TierDecay). Use when planning multi-step work, choosing which agent, model, or reasoning effort runs a task, writing a dispatch brief, or escalating after failures.
---

# TierDecay routing

Tiers are roles: **T3** frontier planning, architecture, review of critical
diffs · **T2** heavy execution (refactors, concurrency, migrations, perf) ·
**T1** standard execution (specced features, tests, docs) · **T0** read-only
recon. Bindings (model × reasoning effort) live in `.tierdecay/MODELS.md`.

## 1. Decide — deterministic precedence

Prefer the `tierdecay` MCP tools when the client exposes them
(`tierdecay_playbook`, then `tierdecay_route`); otherwise apply the same order
by hand from `.tierdecay/ledger.md` and `.tierdecay/playbook.md`:

1. Critical work (security, money, irreversible) or risk 3 → **T3**.
2. Class has a QUARANTINE entry → **T3**, revise the entry first.
3. Live entry with an `epoch:` other than the current binding epoch →
   **RECERTIFY** at the entry's provenance tier, entry quoted.
4. Live entry → **PROBE** one tier below its provenance, entry quoted
   verbatim in the brief, unless that is below its sticky `floor:`.
5. Class in ledger PRIORS (≥3 rows) → its empirical tier.
6. Otherwise score the rubric: ambiguity 0–2, reasoning depth 0–3, blast
   radius 0–2, risk surface 0–3. **0–3 → T1 · 4–6 → T2 · ≥7 or any axis
   maxed → T3**. Strong tests → down one; critical path → up one.

Class signature: 2–4 hyphenated tokens, `verb-object-surface`
(`add-endpoint-rest`). Reuse an existing signature before minting one.

## 2. Dispatch — self-contained brief

```
OBJECTIVE:   <one sentence>
CONTEXT:     <recon findings; the playbook entry verbatim when probing>
FILES:       <exact in-scope paths>
CONSTRAINTS: <perf, deps, style, compatibility>
ACCEPTANCE:  <tests / observable behaviour — non-negotiable>
REPORT:      CHANGES · TESTS · DEVIATIONS · PLAYBOOK (PB-n applied → pass|fail | stale: why) · BLOCKERS
```

No dispatch without acceptance criteria.

## 3. Escalate

Two failed acceptance runs at a tier → one tier up with both failure reports
attached verbatim. A BLOCKED report returns to the orchestrator, never to
another executor.
