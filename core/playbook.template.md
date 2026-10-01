# Repo Playbook (auto-distilled)

<!-- HARD CAP: 150 lines. Eviction: lowest hits, oldest first.      -->
<!-- Written ONLY during DISTILL. Executors read, apply, report.    -->

Apply a PATTERN when a task matches its WHEN. Report
`PLAYBOOK: PB-<n> applied → pass|fail` or `PB-<n> stale: <why>`.
Never apply anything under QUARANTINE.

## Entry format

```
### PB-<n> · <class-signature>
provenance: T<x> <YYYY-MM> · hits: <k>
risk: <0-3>
epoch: <binding-epoch>
floor: none
WHEN: <conditions matching a task to this class>
DO:   <3–10 imperative steps / invariants, order matters>
VERIFY: <the check that proves it worked>
```

## PATTERNS
(none yet — first entry appears after the first high-tier success on a
recurring class)

## QUARANTINE
(entries that caused an acceptance failure — revise before reuse)

`floor` may be `none` or T1–T3 and records the failed probe tier. It cannot be
above provenance. A quarantined entry is never a lower-tier candidate.
`risk` (0–3, the class's rubric risk) sets the hits a downgrade needs: 3 / 4 / 5
for risk 0 / 1 / 2; risk 3 never decays; an entry without it counts as risk 2.
`epoch` names the model/effort binding the entry's hits were earned under; when
the binding changes, the entry is re-certified at its provenance tier first.
