# Routing Ledger — TierDecay self-build (2026-07-12)

Real ledger from using TierDecay to build its own **Cline, Goose, and Windsurf**
adapters in a single session. Tiers were bound to the models actually available
in this session — **T3/T2 = Opus 4.8** (orchestrator, heavy execution, review),
**T1/T0 = Sonnet** (probes, recon). This is a single-session record of the
*mechanism*, not a multi-week production history: the point is a real class
decaying, not a benchmark.

## PRIORS — empirical default tiers (override the rubric; requires ≥3 rows)

| class | default tier | evidence (rows · escalations · probe hits) |
|---|---|---|
| add-adapter-cli | T1 | 3 rows · 0 escalations · 2 probe hits (T2 → T1) |

## LOG — one row per task, newest first (keep last 50)

| date | class | predicted | executed | outcome | esc | playbook |
|---|---|---|---|---|---|---|
| 2026-07-12 | add-adapter-cli | T1 (probe) | T1 | pass · review APPROVE-WITH-NITS | 0 | PB-1 applied → pass (windsurf) |
| 2026-07-12 | add-adapter-cli | T1 (probe) | T1 | pass · review APPROVE-WITH-NITS | 0 | PB-1 applied → pass (goose) |
| 2026-07-12 | add-adapter-cli | T2 | T2 | pass · review APPROVE-WITH-NITS | 0 | PB-1 written (cline) |

Read bottom-up: the class was first solved at **T2** (Cline), distilled into
`PB-1`, then **probed at T1** for Goose and Windsurf. Both probes passed a T3
accuracy review → two hits → the class's default tier is now **T1**. The one
recurring nit (each adapter's `install.sh` case) was orchestrator wiring, added
during DISTILL — not an adapter defect.
