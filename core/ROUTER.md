# TierDecay deterministic router (v0.3)

The router is an optional, local advisor over TierDecay's Markdown state. It
uses Node.js built-ins only, never edits the ledger or playbook, never calls a
network service, and never reads the clock or a random source. Markdown remains
the source of truth.

## Safety model

`shadow` is the default policy. It may calculate an optimized recommendation,
but `effective` is byte-for-byte the legacy decision. `optimize` is explicit
opt-in and requires an enabled, calibrated economic configuration. Critical or
risk-3 work always routes to T3. T0 is read-only and can never be returned.

A lower-tier candidate exists only when the request names a live, exact-class
playbook entry. A probe can move at most one tier below that entry's provenance.
Quarantine and sticky floors fail closed. Ambiguous live entries, contradictory
floors, duplicate observations, partial measurement rows, unknown tiers, empty
epochs, or invalid/capped numeric values are errors rather than guessed state.

## CLI

From this checkout:

```bash
node bin/tierdecay.js route \
  --request request.json --ledger .tierdecay/ledger.md \
  --playbook .tierdecay/playbook.md \
  --config .tierdecay/router-config.json --policy shadow

node bin/tierdecay.js observe --observation observation.json

node bin/tierdecay.js replay \
  --scenario scenarios.jsonl --ledger .tierdecay/ledger.md \
  --playbook .tierdecay/playbook.md \
  --config calibrated-router-config.json --policy shadow
```

Run the CLI from the checksum-verified TierDecay distribution; the installer
adds only `.tierdecay/ROUTER.md` and the disabled local configuration. `route`
and `replay` emit canonical one-line JSON with keys sorted, numbers serialized
to six decimal places, and no timestamp. `observe` emits one validated Markdown
row to stdout; the orchestrator decides whether to append it. `-` means stdin
and may be used only once per invocation.

Exit codes: `0` valid decision or documented shadow fallback; `2` invalid
request/config; `3` ambiguous or incoherent Markdown state; `4` replay missing
potential outcomes; `5` unexpected internal failure.

## Request and observation

JSON schemas live in `core/schemas/`. A request supplies an exact class
signature, risk `0..3`, explicit critical/recurring flags, a positive horizon,
the current model-binding epoch, the four cold-start rubric axes, and optionally
the exact `PB-n` entry quoted in the task brief.

An enabled configuration names that same `bindingEpoch`, a non-empty
`costUnit`, finite caps and penalties, and explicit `maximumFailures` /
`maximumEscalations`. An epoch mismatch is an error: measurements from an old
alias/policy binding are never reused under a newly calibrated policy.

Measured ledger rows extend the seven legacy columns with:

`obs_id | resource_cost | failures | incident_loss | risk | epoch`

All six fields are required together. `predicted` is the initial route and is
part of the statistical cell. Legacy seven-column ledgers remain valid, but
their rows are never silently converted into numerical measurements.

## Statistical cells and score

Evidence is isolated by exact `(class, risk, epoch, predicted)` cell and then
by executed tier. Observations are sorted by `obs_id`. Normalized measurements
are `x=resource_cost/costCap`, `f=failures>0`,
`e=esc/maximumEscalations`, and `d=incident_loss/incidentCap`. Each bounded
mean uses the Hoeffding width `sqrt(ln(2/delta)/(2n))`.

The fully loaded mean and bounds use the same linear score:

```text
costCap*x
+ failurePenalty*f
+ escalationPenalty*maximumEscalations*e
+ riskWeight*riskExposure[risk]*f
+ incidentCap*d
```

An established lower tier requires the minimum sample count,
`upper(lower)+margin < lower(incumbent)`, and a failure upper bound below the
risk threshold. Otherwise the conservative one-step exploration proxy is:

```text
(horizon-1) * max(0, mean(incumbent)-lower(lower))
- (max(0, upper(lower)-mean(incumbent)) + probeOverhead)
```

It can probe only recurring work with horizon at least two, within
`maxProbeRisk`, and strictly above `minimumVoi`. Ties retain the higher tier.
No universal savings claim follows from this heuristic.

## Replay

Replay is sequential: it routes a scenario, selects that tier's potential
outcome, adds the resulting observation to in-memory state, and proceeds to the
next line. It never writes Markdown. Each JSONL record must provide outcomes
for T1, T2, and T3; otherwise exit code 4 refuses causal comparison. The report
contains cumulative fully loaded loss, raw resource cost, failures,
escalations, incidents, probes, promotions, refusals, regret against the best
provided potential outcome, the legacy loss, decisions, and a final SHA-256
state hash.

`benchmarks/synthetic-v1.jsonl` is deterministic synthetic data for regression
testing only. TierDecay has no published benchmark on real workloads.
