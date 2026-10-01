# Pilot v1

Real Opus and Sonnet executor runs on a controlled fixture repository, graded
by hidden acceptance tests. Read [`RESULTS.md`](RESULTS.md) first: scope,
numbers, and limitations.

| Path | Content |
|---|---|
| `sandbox/` | the *kvlite* fixture repository |
| `tasks.json`, `hidden/`, `reference.js` | 9 task briefs, hidden acceptance tests, reference solutions |
| `harness.js` | `validate`, `prepare`, `brief`, `grade`, `record`, `final` |
| `usage.js` | billed-usage aggregation from subagent transcripts |
| `analyze.js` | arm summaries, paired bootstrap contrasts, scenario export |
| `playbooks/` | the three entries distilled during the pilot, verbatim |
| `data/` | per-run results, distillation usage, probe feedback, summary, replay scenarios |
| `state/`, `pilot-v1.config.json` | replay state and economic configuration for `tierdecay bench` |
