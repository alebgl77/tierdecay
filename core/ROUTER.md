# TierDecay deterministic router (v0.4)

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
An entry whose `epoch:` differs from the request epoch never yields a lower
candidate: the decision is `recertify` at its provenance tier (and under
`optimize`, a promotion when the new epoch has no safe evidence).
Quarantine and sticky floors are resolved across the entire exact class and
cannot be bypassed by omitting or changing an ID. Ambiguous live/quarantined
state, contradictory floors, duplicate observations, partial measurement rows,
unknown tiers, empty epochs, or invalid numeric values are errors.

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

node bin/tierdecay.js status --epoch my-bindings-2026-10
node bin/tierdecay.js export --format claude      # or cursor | json
node bin/tierdecay.js export --format skills --out .claude/skills
node bin/tierdecay.js bench --scenario scenarios.jsonl \
  --config calibrated-router-config.json --permutations 50 --seed 7
```

Without `--ledger`/`--playbook`, commands read `.tierdecay/`; when only the
native `.claude/routing-ledger.md` exists they read it and
`.claude/skills/repo-playbook/SKILL.md` instead.

Run the CLI from the checksum-verified TierDecay distribution; the installer
adds only `.tierdecay/ROUTER.md` and the disabled local configuration. `route`
and `replay` emit canonical one-line JSON with keys sorted, numbers serialized
to six decimal places, and no timestamp. `observe` emits one validated Markdown
row to stdout; the orchestrator decides whether to append it. `-` means stdin
and may be used only once per invocation.

Exit codes: `0` valid decision or documented shadow fallback; `2` invalid
request/config/arguments; `3` ambiguous or incoherent Markdown state; `4`
replay missing potential outcomes; `5` unexpected internal failure.

## Status, export, and bench

`status` prints, per known class, the default route a request without special
risk would get (quarantine, recertify, probe, exploit, prior, or rubric), the
entry's hits against its risk-gated requirement (`requiredHits` 3 / 4 / 5 for
risk 0 / 1 / 2, null for risk 3; entries without `risk:` count as 2), and the
bookkeeping the orchestrator owes next. It is read-only.

`export` hands that posterior to the tool that actually picks the model.
`claude` and `cursor` print Markdown routing tables (Claude Code agent, alias,
and effort; Cursor model or Auto goal); `json` prints the same data with every
binding. `skills --out DIR` writes one Agent Skills directory
(`tierdecay-pb-<n>-<class>/SKILL.md`) per live entry and deletes only the
directories it generated earlier whose entry is no longer live; quarantined
entries are never exported. Exports never touch the ledger or playbook.

`bench` runs `replay` under `--permutations` orders (the first is file order,
the rest are seeded Fisher–Yates shuffles) for the protocol (`shadow`
effective decisions) and `optimize`, with in-memory playbook evolution: a
failure while an entry is referenced quarantines it and records the failed
tier as its floor, a pass adds a hit, enough hits rewrite provenance, and a
passing recertification adopts the epoch. It reports mean, standard
deviation, min, and max of every cumulative metric, the saving against an
always-T3 policy, `orderSpread = (max - min) / mean` of the fully loaded loss,
and order-free baselines (always T1/T2/T3 and the per-scenario oracle). The
same evolution is available to `replay` programmatically
(`evolvePlaybook: true`); the CLI `replay` keeps the v0.3 output.

## Request and observation

JSON schemas live in `core/schemas/`. A request supplies an exact class
signature, risk `0..3`, explicit critical/recurring flags, a positive horizon,
the current model-binding epoch, the four cold-start rubric axes, and optionally
the exact `PB-n` entry quoted in the task brief. `risk` must equal
`rubric.riskSurface`; the single value drives safety guards and statistical
cells. Critical work or risk 3 is T3 before any possible descent.

An enabled configuration names that same `bindingEpoch`, a non-empty
`costUnit`, finite caps and penalties, and explicit `maximumFailures` /
`maximumEscalations`. An epoch mismatch is an error: measurements from an old
alias/policy binding are never reused under a newly calibrated policy.

Measured ledger rows extend the seven legacy columns with:

`obs_id | resource_cost | failures | incident_loss | risk | epoch`

All six fields are required together. Numerical evidence is attributed to the
tier actually `executed`; `predicted` remains audit metadata. Replay records the
applied recommendation in both fields. Legacy seven-column ledgers remain
valid, but are never silently converted into numerical measurements. Their
historical `date` field is opaque and only required to be non-empty; measured
rows require a valid ISO `YYYY-MM-DD` date.

## Statistical cells and score

Evidence is isolated by exact `(class, risk, epoch, executed)` cells.
Observations are sorted by `obs_id`. Normalized measurements
are `x=resource_cost/costCap`, `f=failures>0`,
`e=esc/maximumEscalations`, and `d=incident_loss/incidentCap`. Each bounded
mean uses the Hoeffding width
`sqrt(ln(2/(confidenceDelta/12))/(2n))`. `confidenceDelta` is the
family-wise budget for four metrics across at most three tiers in one decision;
it is not a sequential or adaptive guarantee.

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

Before descent, the router considers only tiers at or above the incumbent; this
safety and economic selection never descends. A tier is admissible only when
`n >= minSamples` and its failure upper bound is at or below the threshold for
the request's risk. The first admissible tier is the safety baseline. If no tier is
admissible, the router fails closed at T3. It then compares every higher
admissible tier with the still-selected tier: a candidate replaces it only when
`candidate.upper + margin < selected.lower`, or when their means are exactly
equal, in which case the higher tier wins. It can probe only recurring work
with horizon at least two, within `maxProbeRisk`, and strictly above
`minimumVoi`. No universal savings claim follows from this heuristic.

## Replay

Replay is sequential: it routes a scenario, selects that tier's potential
outcome, adds the resulting observation to in-memory state, and proceeds to the
next line. It never writes Markdown. Each JSONL record must provide outcomes
for T1, T2, and T3; otherwise exit code 4 refuses causal comparison. The report
contains cumulative fully loaded loss, raw resource cost, failures,
escalations, incidents, probes, promotions, refusals, regret against the best
provided potential outcome, the legacy loss, decisions, and a final SHA-256
state hash. A replay scenario date must be an ISO `YYYY-MM-DD` string. When it
is absent, replay uses the deterministic date `1970-01-01` rather than reading
the clock.

Caps apply only to observations in the active `bindingEpoch`; lexical types,
non-negativity, finiteness, safe counters, and unique IDs are validated across
all epochs. `observe` requires strict JSON types and a valid ISO
`YYYY-MM-DD` date. Exact `pass` requires zero failures; exact `fail` requires
at least one; other
non-empty outcome labels remain allowed. Legacy routing does not load a router
configuration.

`benchmarks/synthetic-v1.jsonl` is deterministic synthetic data for regression
testing only. `benchmarks/pilot-v1/` is a small real-model pilot on a controlled
fixture repository (36 graded runs); see its `RESULTS.md` for scope and
limits. It is not a production-workload benchmark.
