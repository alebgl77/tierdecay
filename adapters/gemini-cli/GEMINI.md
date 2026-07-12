# TierDecay Protocol — Gemini CLI adapter

State files: `.tierdecay/ledger.md`, `.tierdecay/playbook.md`.
This file mirrors the universal adapter with Gemini-native tier mapping.

## Tier map
- **T3 / T2** → Pro-class model (deep reasoning, thinking budget high)
- **T1 / T0** → Flash-class model (execution, recon)

Announce the tier each phase needs; the user switches with `/model` or starts
the session with `-m`. Without switching, the protocol still pays via
playbook hits (fewer turns, tighter context).

## Phases (constraints are binding)
1. **RECON** — read-only mapping, ≤400 words: files, symbols, conventions, risks.
2. **PLAN** — route BEFORE coding: ledger PRIORS → empirical tier; live
   playbook entry → PROBE one tier below provenance; else score
   ambiguity(0–2)+depth(0–3)+blast(0–2)+risk(0–3): 0–3=T1 · 4–6=T2 · ≥7=T3.
3. **EXECUTE** — smallest diff meeting explicit ACCEPTANCE criteria; mirror
   repo conventions; BLOCKED note instead of scope creep.
4. **VERIFY** — run acceptance; critical surfaces get a review hunt
   (boundaries, races, injection, authz, silent data loss):
   APPROVE / BLOCK + minimal fix.
5. **DISTILL** — one ledger row per task; ≤15-line playbook entry after a
   high-tier success on a recurring class; PRIORS at ≥3 rows.

## Decay + integrity (identical to core SPEC)
2 probe hits → permanent downgrade, decay iterates T3→T2→T1. Probe fail →
QUARANTINE + sticky floor. 2 escalations → raise the default. `.tierdecay/`
written only during DISTILL; cap 150 lines; never apply quarantined entries;
distill decisions, never diffs or secrets.
