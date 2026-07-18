# TierDecay Protocol — universal AGENTS.md adapter

<!-- Works with every CLI that reads AGENTS.md: Codex CLI, Cursor, OpenCode,
     GitHub Copilot, Zed, and friends. State files: .tierdecay/ledger.md and
     .tierdecay/playbook.md (created by install.sh). -->

You operate under the TierDecay protocol: solve each problem class at a high
tier at most once; afterwards it is a documented pattern executed cheaper.
You are a single agent, so **phases replace subagents** — announce your
current phase and obey its constraints.

## Tiers (map to your CLI's models)

- **T3** frontier reasoning — planning, architecture, novel algorithms,
  review of critical diffs.
- **T2** strong workhorse — refactors, concurrency, migrations, perf.
- **T1** fast/cheap — specced features, tests, docs, mechanical edits.
- **T0** cheapest — read-only recon.

When your CLI supports switching (profiles, `/model`, per-session flags),
**tell the user which tier the next phase needs before starting it** if the
session model doesn't match. When it doesn't support switching, follow the
protocol anyway — playbook hits still cut turns and context.

## Phases

1. **RECON** — read-only. Map relevant files, symbols, conventions, risks in
   ≤400 words. No edits, no opinions.
2. **PLAN** — route every task BEFORE touching code:
   - class listed in `.tierdecay/ledger.md` PRIORS → use its empirical
     default tier, skip scoring;
   - class has a live entry in `.tierdecay/playbook.md` → PROBE one tier
     below the entry's provenance, entry quoted in your working notes;
   - otherwise score: ambiguity(0–2) + depth(0–3) + blast-radius(0–2) +
     risk(0–3) → 0–3 = T1 · 4–6 = T2 · ≥7 or any axis maxed = T3.
3. **EXECUTE** — smallest diff satisfying explicit ACCEPTANCE criteria
   (write them first if the user gave none). Mirror the codebase's
   conventions. Never expand scope: surface a BLOCKED note with 2–3 options
   instead of improvising architecture.
4. **VERIFY** — run the acceptance tests. Critical surfaces (security, auth,
   money, migrations, public contracts) get an explicit T3-style review pass:
   hunt inverted logic, boundaries, races, injection, authz gaps, silent data
   loss. Verdict: APPROVE / APPROVE-WITH-NITS / BLOCK + minimal fix.
5. **DISTILL** — close EVERY task with one ledger row:
   `| date | class | predicted | executed | outcome | esc | playbook |`.
   **Class signature**: 2–4 hyphenated tokens `verb-object-surface`; scan the
   LOG and reuse an existing signature before minting a new one — the posterior
   only converges if signatures are stable. Full protocol: `.tierdecay/PROTOCOL.md`.
   After a T2/T3-grade success on a recurring class, add a ≤15-line playbook
   entry (WHEN / DO / VERIFY + provenance + hits). Update PRIORS at ≥3 rows.

## Decay rules

- Probe pass → hits+1. **2 hits → the class's default tier drops
  permanently**; the counter resets and decay iterates (T3→T2→T1).
- Probe fail → move the entry to QUARANTINE with a one-line cause; the failed
  tier is that class's sticky floor; escalate normally.
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
