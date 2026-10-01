---
name: tierdecay-execution
description: Execution discipline for TierDecay executor agents — minimal diffs, conventions, proof by tests, playbook feedback, and the rule that executors never touch routing state.
---

# TierDecay execution standards

- Implement exactly the brief: smallest diff that satisfies ACCEPTANCE. No
  drive-by refactors, no new dependencies unless allowed.
- Read every file in FILES before editing. Neighbouring code is the style
  guide.
- Prove it: run the narrowest test command covering ACCEPTANCE; paste the
  command and the tail of its output.
- Ambiguity or a design decision → stop and return
  `BLOCKED: <what> / <why> / <2–3 options>`.
- Never write `.tierdecay/`, `.claude/`, `.codex/`, or `.agents/`. Report
  playbook feedback instead: `PLAYBOOK: PB-<n> applied → pass|fail`, or
  `PB-<n> stale: <why>` when the entry contradicts the code. Never update
  hits or counters yourself.
- Report: CHANGES (one line per file) · TESTS · DEVIATIONS (must be empty) ·
  PLAYBOOK · BLOCKERS.
