# TierDecay — Core Specification (tool-agnostic)

Every adapter implements this spec. Vocabulary: **orchestrator** (highest
tier, plans/routes/verifies), **executors** (do the work), **ledger** and
**playbook** (the two state files). Default paths for non-native adapters:
`.tierdecay/ledger.md` and `.tierdecay/playbook.md`.

## 1. Tiers

| Tier | Role | Bind to |
|---|---|---|
| T3 | Planning, architecture, novel algorithms, review of critical diffs | Your frontier model |
| T2 | Complex execution: refactors, concurrency, migrations, perf | Your strong workhorse |
| T1 | Standard execution: specced features, tests, docs, mechanical edits | Your fast/cheap model |
| T0 | Read-only recon: files, symbols, conventions, risks | Your cheapest model |

## 2. Protocol (every non-trivial request)

1. **RECON** — T0 maps the terrain; the orchestrator never explores raw.
2. **PLAN** — decompose into tasks. Route each task:
   - class in ledger **PRIORS** (≥3 rows) → empirical default tier, skip scoring;
   - class has a live **playbook** entry → **PROBE** one tier below provenance;
   - otherwise → score the rubric (§3).
3. **DISPATCH** — every task gets a self-contained brief:
   `OBJECTIVE / CONTEXT / FILES / CONSTRAINTS / ACCEPTANCE / REPORT`.
   No dispatch without acceptance criteria.
4. **VERIFY** — check the diff against acceptance; run tests. Diffs touching
   security, auth, money, migrations, or public contracts → T3 review
   (verdict: APPROVE / APPROVE-WITH-NITS / BLOCK + minimal fix).
5. **ESCALATE** — 2 failures at a tier ⇒ one tier up, failure reports
   attached verbatim. Symmetric de-escalation for overspecified tasks.
6. **DISTILL** — close every task with one ledger row. After a T2/T3 success
   on a recurring class, write a ≤15-line playbook entry.

## 3. Rubric (cold-start prior only)

Score four axes, sum:

| Axis | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Spec ambiguity | fully specified | minor gaps | needs design decisions | — |
| Reasoning depth | mechanical | standard logic | multi-constraint | novel / proof-like |
| Blast radius | 1 file | 2–5 files | >5 or core module | — |
| Risk surface | cosmetic | user-visible bug | data/perf/concurrency | security, money, irreversible |

**0–3 → T1 · 4–6 → T2 · ≥7 or any axis maxed → T3** (T3 specs, T2
implements, T3 reviews). Tie-breaks: strong tests → down; critical path → up.

## 4. Tier decay

- **Class signature**: 2–4 hyphenated tokens, `verb-object-surface`. Reuse
  existing signatures before minting new ones.
- **Ledger row** (every task): `date | class | predicted | executed | outcome
  | escalations | playbook`. At ≥3 rows a class enters PRIORS; the posterior
  overrides the rubric in both directions (2 escalations raise a default).
- **Distill** only plausibly-recurring classes. Distill decisions —
  invariants, ordering, the trap — never diffs, secrets, or volatile values.
- **Probe**: next occurrence runs one tier below provenance, entry quoted in
  the brief. Pass → hits+1; **2 hits → permanent downgrade**, counter resets,
  decay iterates (T3→T2→T1). Fail → entry quarantined, failed tier becomes a
  **sticky floor**, escalate normally.

## 5. Integrity invariants (non-negotiable in every adapter)

1. Only the orchestrator writes the ledger and playbook. Executor diffs
   touching them are rejected at VERIFY.
2. Any acceptance failure while an entry was referenced ⇒ instant quarantine.
3. Playbook hard cap 150 lines; evict lowest hits, oldest first.
4. A quarantined entry is never applied until revised.
5. Executors report playbook feedback (`applied → pass|fail` / `stale: why`)
   but never self-update counters.

## 6. Single-agent degradation (CLIs without subagents)

Phases replace agents: the one agent announces its current phase
(RECON/PLAN/EXECUTE/VERIFY/DISTILL) and applies that phase's constraints.
Model tiering happens through whatever the CLI offers — per-session model
flags, `/model` commands, profiles, or architect/editor splits. Where no
switching exists, decay still pays through fewer turns and tighter context on
playbook hits.
