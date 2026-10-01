# Benchmarks

- [`pilot-v1/`](pilot-v1/RESULTS.md) — real Opus and Sonnet executor runs on a
  controlled fixture repository with hidden acceptance tests. Small and
  scoped; read its limitations.
- `synthetic-v1.jsonl` — the regression fixture below.

## Synthetic routing replay

`synthetic-v1.jsonl` is a small, deterministic, deliberately synthetic fixture.
It is not collected from users, does not estimate production savings, and is
not a real-workload benchmark.

Run it with a calibrated local config and the fixture state:

```bash
node bin/tierdecay.js replay \
  --scenario benchmarks/synthetic-v1.jsonl \
  --ledger tests/fixtures/measured-ledger.md \
  --playbook tests/fixtures/legacy-playbook.md \
  --config benchmarks/synthetic-v1.config.json \
  --policy shadow
```

The expected report is byte-reproducible on supported platforms. Its final
hash identifies parsed state plus the explicit economic configuration; it is
not a hash of raw Markdown formatting.

For this fixture in `shadow`: 3 scenarios, fully loaded/resource loss `10.2`,
0 failures, 0 escalations, 0 incidents, 2 probes, 1 safety promotion, 0
refusals, regret `0`, and final state hash
`70994ee7f08c73a20930d5c5406b3df67904503675fd910813afe56c5221ebaf`.
