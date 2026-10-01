# Pilot v1 — real model runs on a controlled fixture

**Status:** pilot, 2026-10-01. 36 graded executor runs + 3 distillation runs,
single session, one fixture repository written for the purpose. It measures
the mechanism with real models; it is **not** a production-workload benchmark
and supports no universal savings claim.

## Question

On recurring task classes, how do three routes compare on acceptance and
cost?

| Arm | Model (as resolved) | Playbook entry in the brief |
|---|---|---|
| `t3cold` — static frontier | `claude-opus-5-5` | no |
| `t1cold` — static fast tier | `claude-sonnet-5-5` | no |
| `t1pb` — TierDecay probe | `claude-sonnet-5-5` | yes, distilled by Opus from the class's first solve |

## Setup

- **Fixture:** `sandbox/` — *kvlite*, a zero-dependency Node.js CLI/library
  with real conventions enforced by its own visible suite (sorted registries,
  README usage rows generated from command specs, pure and idempotent
  migrations, message templates, CHANGELOG entries).
- **Classes × instances:** `add-command-cli` (delete, rename, count),
  `add-migration-store` (add-tags, trim-values, rename-legacy-val),
  `add-rule-validator` (minLength, pattern, enum). Instance *i* starts from the
  fixture plus the reference solutions of instances < *i* of its class, so a
  recurring class meets its own history (`harness.js prepare`).
- **Acceptance:** the visible suite plus hidden per-task tests (`hidden/`).
  `harness.js validate` proves every hidden test fails on its baseline and
  passes on its reference solution; CI re-runs that check.
- **Briefs:** identical across arms (`harness.js brief`) except the quoted
  playbook entry. Executors ran as fresh general-purpose subagents, isolated to
  their run directory.
- **Runs:** `t3cold` 1 per task (9); `t1cold` 1 per task plus a repeat on
  instances 2–3 (15); `t1pb` 2 per task on instances 2–3 (12). Distillation: 1
  Opus run per class, given the first instance's brief, accepted diff, and
  report; its entries are in `playbooks/` verbatim (13–14 lines each).
- **Cost:** exact input-side usage (input, cache writes, cache reads) per API
  call from the subagent transcripts, priced at first-party list prices
  (Opus 4/20, Sonnet 2/10 USD per MTok; cache reads 0.20 for both; 5-minute
  cache writes 1.25× input). **Warm** cost prices each run's first-call cache
  write (the subagent's fixed system prompt and tools, identical across arms)
  as a cache read, removing the dependence of raw cost on which run went
  first. Total spend of the pilot: about 7.3 USD raw.

## Results

**Acceptance: 36 / 36.** Every run in every arm passed the visible suite and
the hidden tests. The classes sit below the fast tier's ceiling, so this pilot
cannot show the playbook rescuing a failing tier.

| Arm | Runs | Accepted | Warm USD / task (mean ± sd) | Raw USD / task | API calls | Tool uses | Wall s |
|---|---|---|---|---|---|---|---|
| `t3cold` | 9 | 9 | 0.1795 ± 0.0097 | 0.3014 | 6.78 | 7.67 | 34.3 |
| `t1cold` | 15 | 15 | 0.1167 ± 0.0120 | 0.1643 | 6.00 | 6.40 | 22.9 |
| `t1pb` | 12 | 12 | 0.1113 ± 0.0125 | 0.1428 | 5.50 | 5.92 | 27.6 |

Task-paired contrasts (warm USD; 95% interval from a deterministic cluster
bootstrap over tasks, 10 000 resamples, `analyze.js`):

| Contrast | Tasks | Ratio | 95% interval | Lower in |
|---|---|---|---|---|
| fast tier cold vs frontier cold | 9 | **0.657** | 0.626 – 0.694 | 9 / 9 tasks |
| TierDecay probe vs frontier cold | 6 | **0.633** | 0.581 – 0.685 | 6 / 6 tasks |
| TierDecay probe vs fast tier cold | 6 | 0.970 | 0.897 – 1.049 | 4 / 6 tasks |
| same, API calls | 6 | 0.943 | 0.853 – 1.063 | 4 / 6 tasks |

**Economics** (SPEC notation, warm USD per task): `C_distill` = 0.0789.
Against a static frontier route, `C_hi` = 0.1758, `C_lo` = 0.1113, Δ = 0.0645:
distillation is recovered at **n ≥ 2** reuses. Against a static fast-tier
route, Δ = 0.0035 (not significant): break-even would need **23** reuses.

**Replay of the protocol** on these measured outcomes
(`tierdecay bench`, `data/scenarios.jsonl`, `state/`, `pilot-v1.config.json`):
first instance of each class routed by the rubric (score 4 → T2 = `opus`),
later instances probed at T1 with the entry. Protocol fully loaded loss
1228.4 milli-USD against 1615.3 for always-frontier — a **24.0%** saving; the
per-task oracle (always fast tier here) is 1040.9 (35.6%). `orderSpread` is 0
over 20 permutations: with no failures, order cannot matter. `optimize`
stayed at always-T3: with an empty measured ledger it fails closed until each
cell has `minSamples` observations — by design.

**Playbook feedback.** All 12 probes reported the entry applied and passing,
and 11 of 12 also flagged at least one inaccurate or inapplicable step
(`data/probe-feedback.jsonl`); 2 returned the `stale` verdict outright. The
recurring defects were facts generalised from one instance: a docs table
described as sorted that is not, a `run(ctx, { args })` signature that omits
`flags`, and a "default the new field in `set.js`" step that only applies to
additive migrations. No defect caused an acceptance failure.

## What this supports — and what it does not

- **Fact (this fixture):** routing recurring classes to the fast tier cut
  per-task cost by about a third at equal acceptance. That is the saving
  TierDecay's decay captures, and it is the bulk of the value measured here.
- **Fact (this fixture):** once the fast tier already passes cold, the
  distilled entry adds no significant saving (ratio 0.97, interval spans 1).
  `SPEC.md` §4 now says so: an entry pays for itself only where the lower tier
  fails or struggles without it.
- **Fact:** entries distilled from a single instance carry instance-specific
  claims; the `stale` channel caught them. Confidence-gated decay (3 / 4 / 5
  hits by risk) keeps such entries probing longer before a permanent
  downgrade.
- **Not shown:** behaviour on classes the fast tier fails cold (where the
  playbook should matter), production repositories, long horizons, other
  CLIs, Cursor's or any native router, effort-level variation (the subagent
  tool used here does not expose effort), and hidden thinking tokens (see
  limitations).

## Limitations

- One author designed the fixture, the tasks, the traps, and the hidden tests.
- Small n: 6–9 tasks per contrast, 1–2 repeats per cell.
- Output tokens: transcripts record `output_tokens` at stream start and omit
  hidden thinking, so output is estimated from visible content (4 chars per
  token) and is a lower bound. Estimated output was 7–13% of cost (raw vs
  warm). The two models have different default effort levels and the
  harness's effort setting was not recorded, so the direction of the bias
  between arms is unknown.
- Subagents run with the harness's general-purpose system prompt, not the
  TierDecay executor definitions, and without effort control.
- The distiller was told to write `provenance: T3`; the replay state uses T2,
  which is what the rubric assigns these classes and what the native binding
  maps to the same `opus` alias.

## Reproduce

```bash
node benchmarks/pilot-v1/harness.js validate          # fixture integrity
node benchmarks/pilot-v1/analyze.js                    # tables above, from data/
node bin/tierdecay.js bench \
  --scenario benchmarks/pilot-v1/data/scenarios.jsonl \
  --ledger benchmarks/pilot-v1/state/ledger.md \
  --playbook benchmarks/pilot-v1/state/playbook.md \
  --config benchmarks/pilot-v1/pilot-v1.config.json --permutations 20 --seed 7
```

To collect new runs: `harness.js prepare TASK DIR`, `harness.js brief TASK DIR
[playbooks/X.md]`, run one subagent per brief with the model under test, then
`harness.js record RUN_ID DIR TRANSCRIPT DURATION_MS TOOL_USES`.
`distill-prompt.example.md` is the distillation prompt (paths elided).
