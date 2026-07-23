---
name: tier-decay
description: Post-completion distillation protocol that converts Opus/Fable solutions into cheaper-tier playbook entries and recalibrates routing from real outcomes. Use after completing any [T2] or [T3] task, when logging a task outcome to the routing ledger, when a playbook probe passes or fails, or when a class keeps escalating.
---

# Tier Decay — amortize reasoning

Goal: every problem CLASS is solved at a high tier **at most once**. Afterwards
it exists as a documented pattern executable one tier lower. Expensive tokens
are capital expenditure; this protocol is the amortization schedule. The
routing rubric is only the cold-start prior — the ledger is the posterior.

## 1. Ledger — one row per task, every tier

Append to the LOG table in `.claude/routing-ledger.md`:

`| date | class | predicted | executed | outcome | escalations | playbook |`

**Class signature**: 2–4 hyphenated tokens, `<verb>-<object>-<surface>`
(e.g. `add-endpoint-rest`, `write-migration-postgres`, `fix-flaky-test-jest`).
Before minting a new class, scan the LOG and reuse an existing signature —
matching power depends on signature discipline.

When a class reaches **≥3 rows**, compute/update its row in the PRIORS table:
its empirical default tier now OVERRIDES the scoring rubric.

## 2. Distill — after [T2]/[T3] success only

Distill iff the class will plausibly recur (expected ≥2 future occurrences).
Write a **≤15-line** entry into the `repo-playbook` skill, following its
format. Distill the DECISIONS — invariants, order of operations, the trap and
its avoidance — never diffs, never secrets, never volatile business values.
A wrong pattern costs more than no pattern: when in doubt, don't distill.

## 3. Probe — the downgrade test

On the NEXT occurrence of a distilled class, dispatch **one tier below the
entry's provenance tier**, with the entry quoted verbatim in the brief's
CONTEXT and acceptance criteria mandatory.

- **Pass** → `hits +1` on the entry. At `hits ≥ 2`, the class's default tier
  is permanently lowered in PRIORS **and the entry's `provenance:` is rewritten
  to the new lower tier**. Decay is iterative: the counter resets and — because
  a live entry outranks PRIORS (`model-routing` §0) — the class probes the next
  tier down on later occurrences (T3→T2→T1), until provenance reaches T1.
- **Fail** → escalate normally, move the entry to QUARANTINE with a one-line
  failure cause. The failed tier becomes the class's **floor** (sticky tier);
  revise or delete the entry on next encounter.

## 4. Upgrade symmetry

A class with **≥2 escalations** from its current default gets its default
RAISED one tier in PRIORS. Calibration runs both directions.

## 5. Hygiene — context rot is the failure mode

- Playbook hard cap **150 lines**: at cap, evict lowest-hits, oldest-first.
- **Only the main thread writes under `.claude/**`.** Any executor diff
  touching it is rejected at VERIFY — a poisoned playbook self-replicates.
  Executors are also blocked in-tool by their `tierdecay-guard.sh` hook, and
  `settings.json` ask-gates state writes; treat an unexpected approval prompt
  as the alarm, not noise.
- Any acceptance failure while an entry was referenced → immediate quarantine.
- Entries are pattern-level and repo-specific; generic best practices belong
  in `execution-standards`, not here.

## 6. Economics

Break-even ≈ first reuse: one Opus-priced solve buys every future
Sonnet-priced execution of its class. Health check: the `executed` column in
the LOG should drift toward T1 over time for recurring classes — that drift
IS the optimization working.
