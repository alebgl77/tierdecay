# Self-build: TierDecay's own routing ledger

We used TierDecay to build three of its own adapters — **Cline, Goose, and
Windsurf** — in a single session, and kept the ledger. It lives here as an
honest, reproducible artifact: exactly the thing the main README asks *you* to
produce — *"post your ledger, not ours."*

## What happened

The class `add-adapter-cli` was solved once at **T2** (the Cline adapter),
distilled into playbook entry **PB-1**, then the next two adapters (Goose,
Windsurf) were **probed one tier lower at T1** with PB-1 in context. Both probes
passed a T3 accuracy review → two hits → the class's default tier drops to
**T1**. Adding an adapter is now a cheap, T1-tier task.

```
add-adapter-cli:   T2  ─solve+distill→  T1 (probe ✓)  ─→  T1 (probe ✓)  ⇒  default T1
```

## Honesty notes

- **Models.** Tiers were bound to what this session actually had:
  **T3/T2 = Opus 4.8, T1/T0 = Sonnet.** TierDecay maps tiers to whatever models
  you run — the ledger header states it plainly.
- **Single session, not a benchmark.** This demonstrates the *mechanism* (a real
  class decaying T2 → T1), not a multi-week cost study. Your own decay curve
  comes from your own repo over time.
- **Reproducible.** The adapters produced are in
  [`adapters/cline`](../../adapters/cline/),
  [`adapters/goose`](../../adapters/goose/), and
  [`adapters/windsurf`](../../adapters/windsurf/); each was accuracy-reviewed at
  T3, and each CLI-specific claim was checked against the tool's live docs.

## Files
- [`ledger.md`](ledger.md) — the routing ledger (PRIORS + LOG)
- [`playbook.md`](playbook.md) — the distilled `PB-1` entry
