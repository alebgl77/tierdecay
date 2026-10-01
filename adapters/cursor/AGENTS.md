# TierDecay Protocol — Cursor adapter

<!-- Cursor reads AGENTS.md at the repo root AND in nested subdirectories
     (auto-applied to files under that dir) — verified against cursor.com/docs/rules.
     For enforcement rather than a one-time read, instead ship a Project Rule at
     .cursor/rules/tierdecay.mdc with front-matter `alwaysApply: true` (the
     "Always Apply" rule type). The legacy `.cursorrules` root file still loads
     but is being deprecated — prefer AGENTS.md or a Project Rule.
     State files: .tierdecay/ledger.md and .tierdecay/playbook.md (from install.sh). -->

Cursor has no native planner/executor model-binding pair (unlike Cline's
Plan/Act or Goose's `/plan`). Model choice is the per-conversation / per-surface
model picker, plus Agent/Ask/Plan modes. So you are effectively a single agent:
**phases replace subagents** — announce your current phase and obey its
constraints, same as the universal AGENTS.md adapter.

## Tiers (map to Cursor's model picker)

- **T3** frontier reasoning — a top model in the picker (e.g. Claude Opus-class
  or GPT-5.x) for planning, architecture, novel algorithms, review of critical
  diffs. Use **Plan mode** for the RECON/PLAN phases.
- **T2** strong workhorse — a mid model (Claude Sonnet-class / Cursor Composer)
  for refactors, concurrency, migrations, perf.
- **T1** fast/cheap — the cheapest default model for specced features, tests,
  docs, mechanical edits.
- **T0** cheapest — same fast/cheap tier, read-only recon.

Switching a tier means picking the model per message, or — in recent builds
(Cursor 2.x/3) that expose **per-surface / per-mode default models** — binding
T3 to the Agent/Plan surface and a cheaper model to Ask; confirm what your
build supports. **With Cursor's router (`Auto`)**, bind tiers to its goals
instead of to models: T1 → Auto (Cost), T2 → Auto (Balance), T3 → Auto
(Intelligence) or an explicit frontier pick; log the goal you chose as the
`executed` tier. Cursor's router learns across all its users; TierDecay
supplies what it cannot see — this repo's per-class posterior
(`tierdecay export --format cursor`). Without switching, successful playbook
hits may still reduce turns and context; net savings depend on fully loaded
costs, including failures and escalations.

## Phases

1. **RECON** — read-only (Plan/Ask mode). Map relevant files, symbols,
   conventions, risks in ≤400 words. No edits, no opinions.
2. **PLAN** — route every task BEFORE touching code:
   - class has a live entry in `.tierdecay/playbook.md` (not quarantined, floor
     not reached) → PROBE one tier below the entry's provenance, entry quoted in
     your working notes. A live entry outranks PRIORS so decay keeps iterating;
   - else class listed in `.tierdecay/ledger.md` PRIORS (≥3 rows) → use its
     empirical default tier, skip scoring;
   - otherwise score: ambiguity(0–2) + depth(0–3) + blast-radius(0–2) +
     risk(0–3) → 0–3 = T1 · 4–6 = T2 · ≥7 or any axis maxed = T3.
3. **EXECUTE** — Agent mode. Smallest diff satisfying explicit ACCEPTANCE
   criteria (write them first if the user gave none). Mirror the codebase's
   conventions. Never expand scope: surface a BLOCKED note with 2–3 options
   instead of improvising architecture.
4. **VERIFY** — run the acceptance tests. Critical surfaces (security, auth,
   money, migrations, public contracts) get an explicit T3-style review pass:
   hunt inverted logic, boundaries, races, injection, authz gaps, silent data
   loss. Verdict: APPROVE / APPROVE-WITH-NITS / BLOCK + minimal fix.
5. **DISTILL** — close EVERY task with one ledger row:
   `| date | class | predicted | executed | outcome | esc | playbook |`.
   **Class signature**: 2–4 hyphenated tokens `verb-object-surface`; reuse an
   existing one before minting a new one. Full protocol: `.tierdecay/PROTOCOL.md`.
   After a T2/T3-grade success on a recurring class, add a ≤15-line playbook
   entry (WHEN / DO / VERIFY + provenance + hits + risk + epoch). Update PRIORS at ≥3 rows.

## Decay rules

- Probe pass → hits+1. **3 / 4 / 5 hits (entry `risk:` 0 / 1 / 2; none = 2;
  risk 3 never decays) → the class's default tier drops** (rewrite the entry's
  provenance); the counter resets and decay iterates (T3→T2→T1).
- Entry `epoch:` ≠ current binding epoch (`.tierdecay/MODELS.md`) → RECERTIFY at
  provenance, entry quoted; pass → adopt the epoch, `hits: 0`.
- Probe fail → move the entry to QUARANTINE with a one-line cause; the failed
  tier is that class's sticky floor.
- One **escalation** = 2 failed acceptance runs at a tier ⇒ retry one tier up
  with both failure reports attached. 2 escalations from a class's default →
  raise the default. The rubric is only the cold-start prior; the ledger is the
  posterior.

## Integrity (non-negotiable)

- `.tierdecay/` is written ONLY during DISTILL, never as part of a task diff.
- Any acceptance failure while a playbook entry was referenced → move it to
  QUARANTINE immediately (probe or not). Never apply a QUARANTINE entry. An
  entry contradicting the current codebase is reported `stale`, not improvised
  around.
- Playbook cap 150 lines: evict lowest hits, oldest first.
- Distill decisions (invariants, ordering, the trap) — never diffs, secrets,
  or volatile business values. When in doubt, don't distill.
