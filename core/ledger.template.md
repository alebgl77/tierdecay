# Routing Ledger

Written ONLY during the DISTILL phase / by the orchestrator.
The rubric is the cold-start prior; this file is the posterior.

## PRIORS — empirical default tiers (override the rubric; requires ≥3 rows)

| class | default tier | evidence (rows, escalations, probe hits) |
|---|---|---|

## LOG — one row per task, newest first (keep last 50)

| date | class | predicted | executed | outcome | esc | playbook |
|---|---|---|---|---|---|---|

This safe default is a legacy ledger and remains non-numerical. Before enabling
measured routing, deliberately migrate the whole table to the canonical header
documented in `ROUTER.md`; partial measured rows are rejected.
