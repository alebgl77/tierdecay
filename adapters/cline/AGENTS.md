# TierDecay Protocol — Cline adapter

<!-- Cline auto-detects AGENTS.md at the repo root. You can instead drop this
     file in .clinerules/ (a DIRECTORY Cline merges) as tierdecay.md; either
     surfaces in the Rules panel and can be toggled. State files:
     .tierdecay/ledger.md and .tierdecay/playbook.md (created by install.sh). -->

Cline's native **Plan / Act** split IS a two-mode router: Plan mode is
read-only (explores, designs, cannot edit or run), Act mode executes (edits,
runs commands). TierDecay maps its phases onto that split and adds the ledger,
the playbook, and the decay rules on top.

## Tier map (Cline exposes two bindable model slots, not four)

Enable Settings → **"Use different models for Plan and Act"** and bind:

- **T3** frontier reasoning (planning, architecture, critical review) →
  **Plan-mode model** (your strongest, e.g. Opus-class).
- **T1** mechanical, high-volume, low-risk edits → **Act-mode model**
  (fast/cheap, e.g. Sonnet-class).
- **T0** read-only recon runs in **Plan mode** — Cline's only read-only mode,
  so it borrows the T3 model: read-only safety beats model cost here. Keep
  recon ≤400 words to bound the expense; Cline has no cheap read-only slot.
- **T2** mid-tier judgment has **no native slot** — either run it in Plan mode
  (borrowing the T3 model, higher cost) or manually swap the Act model to a
  mid-tier one before executing. Cline has no notion of four tiers; four-way
  granularity is enforced by convention, not by a setting.

Switching Plan↔Act auto-swaps the active model and carries history over, so a
phase transition already moves you to the right tier. When you can't switch,
the protocol still pays via playbook hits (fewer turns, tighter context).

## Phases (constraints are binding)

1. **RECON** — Plan mode, read-only. Map files, symbols, conventions, risks in
   ≤400 words. No edits, no opinions.
2. **PLAN** — still Plan mode. Route every task BEFORE Act:
   - live entry in `.tierdecay/playbook.md` (not quarantined, floor not
     reached) → PROBE one tier below the entry's provenance, entry quoted in
     your notes; a live entry outranks PRIORS;
   - else class in `.tierdecay/ledger.md` PRIORS → use its empirical default
     tier, skip scoring;
   - else score ambiguity(0–2) + depth(0–3) + blast(0–2) + risk(0–3):
     0–3 = T1 · 4–6 = T2 · ≥7 or any axis maxed = T3.
   Announce the tier the task deserves; switch to Act only once routed.
3. **EXECUTE** — Act mode. Smallest diff meeting explicit ACCEPTANCE criteria
   (write them first if the user gave none). Mirror repo conventions. Never
   expand scope: surface a BLOCKED note with 2–3 options instead of improvising.
4. **VERIFY** — Act mode. Run the acceptance checks. Critical surfaces
   (security, auth, money, migrations, public contracts) get a T3-style review
   hunt — inverted logic, boundaries, races, injection, authz gaps, silent data
   loss. Verdict: APPROVE / APPROVE-WITH-NITS / BLOCK + minimal fix.
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
- `.tierdecay/` is written ONLY during DISTILL, never inside a task diff — and
  Plan mode can't write anyway, so keep DISTILL bookkeeping in Act mode.
- Any acceptance failure while an entry was referenced → QUARANTINE it
  immediately (probe or not). Never apply a QUARANTINE entry. An entry
  contradicting the codebase is reported `stale`, not improvised around.
- Playbook cap 150 lines: evict lowest hits, oldest first.
- Distill decisions (invariants, ordering, the trap) — never diffs, secrets,
  or volatile business values. When in doubt, don't distill.
