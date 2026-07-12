---
name: repo-playbook
description: Repo-specific execution patterns distilled from higher-tier (Opus/Fable) solutions via the tier-decay protocol. Preloaded into executor and heavy-executor at startup. Written ONLY by the main thread — executors read, apply, and report; they never edit this file.
---

# Repo Playbook (auto-distilled)

<!-- HARD CAP: 150 lines. Eviction: lowest hits, oldest first.        -->
<!-- Written only by the orchestrator (main thread) per tier-decay §5. -->

Executors: if a dispatch brief matches a PATTERN below, follow it and report
`PLAYBOOK: PB-<n> applied → pass|fail`. If an entry contradicts the current
codebase, do NOT improvise — report `PLAYBOOK: PB-<n> stale: <why>`.
Never apply anything under QUARANTINE.

## Entry format

```
### PB-<n> · <class-signature>
provenance: T<x> <YYYY-MM> · hits: <k>
WHEN: <conditions matching a task to this class>
DO:   <3–10 imperative steps / invariants, order matters>
VERIFY: <the check that proves it worked>
```

## PATTERNS

(none yet — the system writes its first entry after its first [T2]/[T3]
success on a recurring class)

## QUARANTINE

(entries that caused an acceptance failure — do not apply until the
orchestrator revises them)
