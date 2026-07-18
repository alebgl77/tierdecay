---
name: model-routing
description: Complexity-based routing of tasks across Fable 5 (T3), Opus 4.8 (T2), Sonnet 4.6 (T1) and Haiku recon (T0). Use when planning any multi-step work, when deciding which subagent should execute a task, when writing a dispatch brief, or when an executor fails and escalation is needed.
---

# Model Routing

## 0. Ledger pre-check — posterior beats prior

Before scoring anything, read `.claude/routing-ledger.md`, in this order:
- Class has a live **repo-playbook** entry (not quarantined, floor not
  reached) → dispatch one tier below the entry's provenance as a PROBE, entry
  quoted in the brief (`tier-decay` §3). **A live entry outranks PRIORS** — this
  is what keeps decay iterating.
- Else task matches a class in **PRIORS** (≥3 logged rows) → use its empirical
  default tier, skip the rubric.
- Otherwise → score below. The rubric is only the cold-start prior.

## 1. Scoring rubric

Score the task on four axes; sum the points.

| Axis            | 0               | 1                | 2                              | 3                          |
|-----------------|-----------------|------------------|--------------------------------|----------------------------|
| Spec ambiguity  | fully specified | minor gaps       | requires design decisions      | —                          |
| Reasoning depth | mechanical      | standard logic   | multi-constraint / algorithmic | novel algorithm, proof-like|
| Blast radius    | 1 file          | 2–5 files        | >5 files or shared/core module | —                          |
| Risk surface    | cosmetic        | user-visible bug | data / perf / concurrency      | security, money, irreversible |

Route:
- **0–3 → [T1]** `executor` (Sonnet 4.6)
- **4–6 → [T2]** `heavy-executor` (Opus 4.8)
- **≥7, or any axis at its maximum → [T3]**: Fable produces the spec (main
  thread, or `oracle` SOLVE) → `heavy-executor` implements it → `oracle`
  REVIEWs the diff.

Tie-breaks: strong existing test coverage → down one tier. Critical path, or
first task in an unfamiliar area → up one tier.

## 2. Fast lane (skip scoring when obvious)

- **[T1]** boilerplate, CRUD, tests of specified behavior, docs, renames,
  config, dependency bumps, bugfix with a clean repro.
- **[T2]** cross-module refactor, async/concurrency, migrations, perf work,
  gnarly bug without repro, implementing an already-designed API.
- **[T3]** architecture choices, novel algorithms, security-sensitive design,
  cross-cutting invariants — anything where being wrong is expensive to
  discover.

## 3. Dispatch brief — mandatory template

Subagents have ZERO shared context. Every dispatch contains:

```
OBJECTIVE:   <one sentence>
CONTEXT:     <distilled scout findings: paths, conventions, constraints>
FILES:       <exact in-scope paths — everything else is out of scope>
CONSTRAINTS: <perf, deps, style, backward-compat>
ACCEPTANCE:  <tests to pass / observable behavior — non-negotiable>
REPORT:      <required output format>
```

A brief you can't write precisely is a task you haven't finished planning.

## 4. Escalation ladder

- `BLOCKED` or 2 failed acceptance runs at a tier → escalate ONE tier, attach
  both failure reports verbatim (failures are data, not noise).
- `oracle` BLOCKs a diff → the authoring tier fixes using oracle's
  minimal-fix notes; re-review only the delta.
- De-escalation: a [T2] task that decomposes into mechanical parts → split
  and fan out to [T1] in parallel.
- Every outcome — success, escalation, probe pass/fail — becomes a ledger row
  (`tier-decay` §1). Two escalations raise a class's default; two probe hits
  lower it. The router learns this repo.

## 5. Parallelism

Run independent [T1] tasks as parallel/background dispatches. Never
parallelize two tasks touching the same file. [T2]+ tasks run sequentially
unless provably disjoint.

## 6. Cost discipline

Fable = decisions, specs, reviews. If the main thread is about to write >30
lines of routine code or read a 5th file, stop — that is a dispatch.
