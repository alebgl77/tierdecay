# Goose adapter

```bash
/path/to/tierdecay/install.sh goose   # run from the repo you want to equip
```
Copies `AGENTS.md` to your repo root — Goose reads it by default alongside
`.goosehints` — and seeds `.tierdecay/`.

| TierDecay | Goose knob | Bind to |
|-----------|-----------|---------|
| T3        | `GOOSE_PLANNER_PROVIDER` / `GOOSE_PLANNER_MODEL` | strongest (frontier-class), active only inside `/plan` … `/endplan` |
| T2 / T1   | `GOOSE_PROVIDER` / `GOOSE_MODEL` | your default session model — no separate mid-tier slot exists |
| T0        | same as T2/T1 | `GOOSE_FAST_MODEL` is Goose's own internal aux model (tool-selection, titles) — in recent versions it's not a general tier you route to |

Set the base pair first (`GOOSE_PROVIDER`/`GOOSE_MODEL` are required, no
default), then the planner pair; both persist in `~/.config/goose/config.yaml`.

Tip: `/plan` is the phase boundary — enter it only for tasks PLAN scores T3,
exit with `/endplan` before EXECUTE, and the model swap does the routing for
you. Check your docs for exact Desktop-vs-CLI availability of `/plan` before
relying on it in a non-terminal session.
