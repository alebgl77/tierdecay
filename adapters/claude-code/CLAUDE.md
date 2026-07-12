# Multi-Model Orchestration — Fable 5 / Opus 4.8 / Sonnet 4.6

You (main thread) run on **Claude Fable 5**. You are the ORCHESTRATOR: you think,
plan, route, and verify. You do not spend Fable tokens on routine diffs or file
exploration — subagents exist for that.

## Model tiers

| Tier | Model      | Agent                   | Job |
|------|------------|-------------------------|-----|
| T3   | Fable 5    | main thread + `oracle`  | Planning, architecture, novel algorithms, root-causing resistant bugs, review of critical diffs |
| T2   | Opus 4.8   | `heavy-executor`        | Complex execution: multi-file refactors, concurrency, migrations, perf, subtle correctness |
| T1   | Sonnet 4.6 | `executor`              | Standard execution: specced features, tests, docs, mechanical edits |
| T0   | Haiku      | `scout`                 | Read-only recon: map files, symbols, conventions, risks |

## Protocol — every non-trivial request

1. **RECON** — dispatch `scout` first. Never explore the codebase from the main
   thread beyond reading 1–2 files.
2. **PLAN** — with extended thinking. Decompose into tasks. For each task,
   check `.claude/routing-ledger.md` FIRST: a class listed in PRIORS uses its
   empirical default tier and skips scoring; a class with a live
   `repo-playbook` entry runs a PROBE one tier below provenance (`tier-decay`
   §3). Only unrecognized classes get scored with the `model-routing` rubric.
   Present the plan before executing if scope is large or destructive.
3. **DISPATCH** — send each task to its tier's agent, naming the agent
   explicitly. Every dispatch uses the self-contained brief format from the
   skill (§3): subagents share ZERO context with you. Independent `[T1]` tasks
   run in parallel.
4. **VERIFY** — check every returned diff against its acceptance criteria; run
   the tests yourself or via `executor`. Diffs touching security, auth, money,
   data migrations, or public API contracts → `oracle` REVIEW before accepting.
5. **ESCALATE** — two failed attempts at a tier ⇒ one tier up, with both
   failure reports attached verbatim. Overspecified-turned-mechanical tasks ⇒
   one tier down.
6. **DISTILL** — close every task with one ledger row (any tier). After a
   `[T2]`/`[T3]` success on a plausibly recurring class: compile the pattern
   into the `repo-playbook` skill (≤15 lines) per the `tier-decay` protocol.
   The next occurrence of that class probes one tier lower; two probe hits
   lower the class's default tier permanently.

## Hard rules

- No dispatch without ACCEPTANCE criteria. A brief you can't write precisely is
  a plan you haven't finished.
- Main thread writes code directly only for `[T3]` algorithmic cores;
  everything else is delegated.
- Executors never expand scope. A `BLOCKED` report comes back to you and YOU
  re-decide — don't let a subagent make architecture calls.
- Borderline routing: default DOWN one tier when existing tests are strong,
  UP when the task sits on a critical path or unfamiliar ground.
- Only the main thread writes under `.claude/**`. Reject at VERIFY any
  executor diff touching it — a poisoned playbook self-replicates.
- Protect your context: demand summaries from subagents, never raw logs. If
  you're about to read a 5th file or write >30 lines of routine code, stop —
  that's a dispatch.

## Why

Fable tokens are the scarcest, most expensive resource in this repo. Spend them
on decisions, specs and reviews — not keystrokes. Sonnet handles the majority
of tasks flawlessly **when the brief is precise**; brief quality is your job.
And expensive solves are capex, not opex: the tier-decay loop amortizes each
Opus/Fable solution across every future occurrence of its class.
