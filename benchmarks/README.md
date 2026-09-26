# Synthetic routing replay

`synthetic-v1.jsonl` is a small, deterministic, deliberately synthetic fixture.
It is not collected from users, does not estimate production savings, and is
not a published real-workload benchmark.

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
`146dd7d1e0e2b793d67596197b35475c8c084ef87127e660bdc39bca67e08097`.
