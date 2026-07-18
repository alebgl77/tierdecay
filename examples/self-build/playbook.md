# Repo Playbook (auto-distilled) — TierDecay self-build

<!-- HARD CAP: 150 lines. Eviction: lowest hits, oldest first.   -->
<!-- Written ONLY during DISTILL. Executors read, apply, report. -->

## PATTERNS

### PB-1 · add-adapter-cli
provenance: T1 2026-07 · hits: 0   <!-- downgraded T2→T1 after 2 probe hits; provenance rewritten + counter reset per SPEC §4. T1 is the execution floor — no further probe. -->
history: solved T2 (cline) · probed T1 ✓✓ (goose, windsurf)
WHEN: adding a new CLI/agent adapter under `adapters/<key>/`.
DO:
  1. Recon the CLI's **real** rules file + model controls first (official
     docs/repo); never assert an unverified filename, flag, or env var — hedge.
  2. If the CLI reads `AGENTS.md`, ship that; otherwise its native rules file.
  3. Encode the five phases (or map to native agents/modes) in **<120 lines**.
  4. Map tiers to native model controls; reuse any native two-tier split
     (Cline Plan/Act, Goose `/plan`, Aider architect/editor).
  5. README = install line + model-binding table + one practical tip.
  6. Preserve every SPEC §5 integrity invariant verbatim in spirit.
VERIFY: context file <120 lines; `install.sh <key>` case exists; no fabricated
config details; T3 accuracy review is APPROVE (nits allowed).

## QUARANTINE
(none)
