---
name: tierdecay-distill
description: Close a task under the TierDecay protocol — append the ledger row, update playbook hits, quarantine on failure, apply the confidence-gated decay, and distill a reusable entry after a high-tier success. Orchestrator only; executors never run this.
---

# TierDecay DISTILL (orchestrator only)

Executors never write `.tierdecay/`. Run this after VERIFY, once per task.

1. **Ledger row.** One row per task in `.tierdecay/ledger.md` (keep the last
   50): `date | class | predicted | executed | outcome | esc | playbook`.
   For a measured ledger, prefer
   `tierdecay observe --observation row.json --append .tierdecay/ledger.md`
   (validated, locked, atomic) or the MCP `tierdecay_record` tool when the
   server runs with `--allow-ledger-append true`.
2. **Referenced entry failed?** Move it to QUARANTINE with a one-line cause;
   the failed tier becomes its sticky `floor:`. Never apply, export, or probe
   a quarantined entry until revised.
3. **Probe passed?** `hits +1`. When hits reach **3 / 4 / 5 for the entry's
   `risk:` 0 / 1 / 2** (risk 3 never decays; no `risk:` = 2), rewrite
   `provenance:` to the tier that passed and reset hits to 0.
4. **Recertification passed?** Set `epoch:` to the current binding epoch,
   `hits: 0`.
5. **Distill** only after a T2/T3 success on a class that will recur: a
   ≤15-line entry with `provenance`, `risk`, `epoch`, `WHEN`, `DO`, `VERIFY`.
   Decisions only — invariants, ordering, the trap — never diffs, secrets, or
   volatile values. If the lower tier already passes cold, routing alone
   captures the saving: do not distill.
6. **Hygiene.** Playbook hard cap 150 lines; evict lowest hits, oldest first.
   Run `tierdecay status` (or `tierdecay_status`) for owed bookkeeping and
   `tierdecay export --format skills --out .agents/skills` to refresh skills.
