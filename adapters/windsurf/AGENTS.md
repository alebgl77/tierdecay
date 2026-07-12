# TierDecay Protocol — Windsurf adapter

<!-- Windsurf reads AGENTS.md at the repo root, same as Codex/Cursor/OpenCode.
     Note: Cognition rebranded Windsurf -> "Devin Desktop" (~Jun 2026) and the
     Cascade agent -> "Devin Local"; docs state the underlying rules/workflows
     conventions carry over unchanged. Confirm current branding in your build.
     State files: .tierdecay/ledger.md and .tierdecay/playbook.md (from install.sh). -->

Windsurf/Devin Desktop has no native plan/act or lead/worker split inside the
agent itself — model choice is a flat per-message dropdown. You are
effectively a single agent, so **phases replace subagents**: announce your
current phase and obey its constraints, same as the universal AGENTS.md
adapter.

## Tiers (map to the in-chat model dropdown)

- **T3** frontier reasoning — top "Thinking"/Max-class model (or hand the
  task to the cloud Devin agent via ACP) for architecture, novel algorithms,
  review of critical diffs.
- **T2** strong workhorse — a mid-tier "Thinking" model for refactors,
  concurrency, migrations, perf.
- **T1** fast/cheap — the cheapest default model in the dropdown (check your
  build's list) for specced features, tests, docs, mechanical edits.
- **T0** cheapest — same fast/cheap tier, read-only recon.

No confirmed CLI flag or config file forces a default model non-interactively
— switching means picking it in the dropdown per message, or naming it inside
a `.devin/rules/` file (legacy fallback: `.windsurf/rules/`) with Always-On or
Model-Decision activation so the agent requests it itself. **Announce which
tier the next phase needs** before starting it if the active model doesn't
match.

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
   loss. Verdict: APPROVE / BLOCK + minimal fix.
5. **DISTILL** — close EVERY task with one ledger row:
   `| date | class | predicted | executed | outcome | esc | playbook |`.
   After a T2/T3-grade success on a recurring class, add a ≤15-line playbook
   entry (WHEN / DO / VERIFY + provenance + hits). Update PRIORS at ≥3 rows.

## Decay rules

- Probe pass → hits+1. **2 hits → the class's default tier drops
  permanently**; the counter resets and decay iterates (T3→T2→T1).
- Probe fail → move the entry to QUARANTINE with a one-line cause; the failed
  tier is that class's sticky floor; escalate normally.
- 2 escalations from a class's default → raise the default. The rubric is
  only the cold-start prior; the ledger is the posterior.

## Integrity (non-negotiable)

- `.tierdecay/` is written ONLY during DISTILL, never as part of a task diff.
- Never apply a QUARANTINE entry. An entry contradicting the current codebase
  is reported `stale`, not improvised around.
- Playbook cap 150 lines: evict lowest hits, oldest first.
- Distill decisions (invariants, ordering, the trap) — never diffs, secrets,
  or volatile business values. When in doubt, don't distill.
