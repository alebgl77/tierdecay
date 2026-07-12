<!-- Keep it short. Delete sections that don't apply. -->

## Summary

<!-- What changed and why, in a sentence or two. Link any relevant issue. -->

## Type of change

- [ ] Adapter (new or updated `adapters/` folder)
- [ ] Docs (README, CONTRIBUTING, adapter READMEs)
- [ ] Core spec (`core/SPEC.md` rubric or protocol)
- [ ] Fix (corrects wrong or misleading behaviour)
- [ ] Chore (CI, assets, housekeeping)

## Contribution checklist

- [ ] Every SPEC §5 integrity invariant still holds after this change:
  - [ ] only the orchestrator writes the ledger/playbook; executor diffs touching them are rejected at VERIFY
  - [ ] any acceptance failure while an entry was referenced quarantines that entry
  - [ ] playbook stays hard-capped at 150 lines (evict lowest hits, oldest first)
  - [ ] a quarantined entry is never applied until revised
  - [ ] executors report playbook feedback but never self-update counters
- [ ] Each adapter context file stays under ~120 lines (it lives in every prompt).
- [ ] If a new adapter was introduced, an `install.sh` case was added for it.
- [ ] No invented benchmarks, fake numbers, or decay curves that don't come from a real ledger.
- [ ] README / docs updated if behaviour changed.
