# TierDecay Protocol — Aider adapter (CONVENTIONS.md)

Aider's architect/editor split IS a two-tier router: the architect model
plans (T3/T2), the editor model applies (T1). TierDecay adds the ledger, the
playbook, and the decay rules on top. State: `.tierdecay/ledger.md`,
`.tierdecay/playbook.md` (add both with `/read-only .tierdecay/`).

## Rules for the architect
- Route before designing: ledger PRIORS override scoring; a live playbook
  entry means the editor model gets the entry verbatim and you keep your
  design minimal (PROBE). Otherwise score ambiguity+depth+blast+risk
  (0–3=T1 · 4–6=T2 · ≥7=T3) and say which tier the task deserved.
- Every design carries explicit ACCEPTANCE criteria the editor must satisfy.
- Critical surfaces (security, auth, money, migrations, public contracts):
  end with a review hunt — boundaries, races, injection, authz, silent data
  loss — and an APPROVE/BLOCK verdict.

## Rules for the editor
- Smallest diff satisfying ACCEPTANCE. Mirror repo conventions. Never touch
  `.tierdecay/`. Report `PLAYBOOK: PB-<n> applied → pass|fail` or `stale`.

## DISTILL (end of every task — architect dictates, user confirms)
- One ledger row: `| date | class | predicted | executed | outcome | esc | playbook |`
- After a high-tier success on a recurring class: ≤15-line playbook entry
  (WHEN/DO/VERIFY, provenance, hits). 2 probe hits → class drops a tier for
  good; probe fail → QUARANTINE + sticky floor; 2 escalations → raise default.
- Cap 150 lines; evict lowest hits, oldest first; decisions only, never
  diffs or secrets.
