# TierDecay Protocol — Goose adapter

<!-- Goose reads AGENTS.md by default (fallback list is .goosehints + AGENTS.md
     when CONTEXT_FILE_NAMES isn't set), so no extra config is needed for this
     file to load. State files: .tierdecay/ledger.md and .tierdecay/playbook.md
     (created by install.sh). If your CONTEXT_FILE_NAMES override drops
     AGENTS.md, either add it back or move this file to .goosehints instead
     (that path needs the Developer extension enabled). -->

Goose's native **Plan mode** is a two-tier router: `/plan <task>` drafts using
the planner model, `/endplan` hands off to the default model for everything
after. TierDecay maps its phases onto that split and adds the ledger, the
playbook, and the decay rules on top.

## Tier map

- **T3** frontier reasoning (planning, architecture, critical review) →
  `GOOSE_PLANNER_PROVIDER` + `GOOSE_PLANNER_MODEL`, active only between
  `/plan` and `/endplan`.
- **T2 / T1** execution (refactors, specced features, tests, mechanical
  edits) → `GOOSE_PROVIDER` + `GOOSE_MODEL`, the session default. Goose has no
  separate mid-tier slot — T2 and T1 both ride the default model; treat the
  distinction as a routing note in your PLAN write-up, not a model swap.
- **T0** read-only recon → also `GOOSE_MODEL`, run before considering `/plan`
  at all. `GOOSE_FAST_MODEL` exists but is Goose's own internal auxiliary
  model for tool-selection/classification/session-titles — in recent versions
  it is not exposed as a general tier you route your own subtasks to, so
  don't dispatch RECON to it.

Announce which tier a phase needs before starting it. If the terminal isn't
in Plan mode and the task scored T3, say so and invoke `/plan` yourself
rather than reasoning at default-model quality. Check your docs: the Desktop
app is reported not to expose the `/plan` keyword the same way the CLI does.

Caveat: an older "lead/worker" auto-switch (`GOOSE_LEAD_MODEL`) shows up in
search results from a 2025 blog post; it does not appear in current source or
docs, so treat it as superseded by Plan mode, not a separate mechanism.

## Phases

1. **RECON** — read-only, default model. Map files, symbols, conventions,
   risks in ≤400 words. No edits, no opinions.
2. **PLAN** — route every task BEFORE touching code:
   - class in `.tierdecay/ledger.md` PRIORS → use its empirical default tier,
     skip scoring;
   - live entry in `.tierdecay/playbook.md` → PROBE one tier below the
     entry's provenance, entry quoted in your notes;
   - else score ambiguity(0–2) + depth(0–3) + blast(0–2) + risk(0–3):
     0–3 = T1 · 4–6 = T2 · ≥7 or any axis maxed = T3.
   A T3 verdict → `/plan` for this task; T1/T2 stay in the default session.
3. **EXECUTE** — `/endplan` first if you were in Plan mode. Smallest diff
   meeting explicit ACCEPTANCE criteria (write them first if the user gave
   none). Mirror repo conventions. Never expand scope: surface a BLOCKED note
   with 2–3 options instead of improvising.
4. **VERIFY** — run the acceptance checks. Critical surfaces (security, auth,
   money, migrations, public contracts) get a T3-style review hunt — inverted
   logic, boundaries, races, injection, authz gaps, silent data loss. Verdict:
   APPROVE / APPROVE-WITH-NITS / BLOCK + minimal fix.
5. **DISTILL** — close EVERY task with one ledger row:
   `| date | class | predicted | executed | outcome | esc | playbook |`.
   **Class signature**: 2–4 hyphenated tokens `verb-object-surface`; reuse an
   existing one before minting a new one. Full protocol: `.tierdecay/PROTOCOL.md`.
   After a T2/T3-grade success on a recurring class, add a ≤15-line playbook
   entry (WHEN / DO / VERIFY + provenance + hits). Update PRIORS at ≥3 rows.

## Decay + integrity (identical to core SPEC)

- 2 probe hits → the class's default tier drops permanently (rewrite the
  entry's provenance to the new tier); counter resets, decay iterates
  T3→T2→T1. Probe fail → QUARANTINE + one-line cause; the failed tier is a
  sticky floor. One escalation = 2 failed acceptance runs at a tier ⇒ retry one
  tier up; 2 escalations → raise the default.
- `.tierdecay/` is written ONLY during DISTILL, never inside a task diff.
- Any acceptance failure while an entry was referenced → QUARANTINE it
  immediately (probe or not). Never apply a QUARANTINE entry. An entry
  contradicting the codebase is reported `stale`, not improvised around.
- Playbook cap 150 lines: evict lowest hits, oldest first.
- Distill decisions (invariants, ordering, the trap) — never diffs, secrets,
  or volatile business values. When in doubt, don't distill.
