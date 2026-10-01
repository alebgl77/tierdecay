# Roadmap

TierDecay's direction: **the per-repository learning layer that every AI coding
agent consults before it spends frontier tokens** — open, deterministic,
auditable in git, and portable across vendors. This roadmap is a plan, not a
promise; items move when measurements say they should. Each milestone ships
only with tests, and claims ship only with evidence.

Status legend: ✅ shipped · 🚧 in progress · 🧭 planned · 🔬 research

## Shipped

| Version | Date | Theme | Highlights |
|---|---|---|---|
| ✅ 0.1.0 | 2026-07-12 | Protocol | Four-tier rubric, ledger posterior, distilled playbook, Claude Code / AGENTS.md / Gemini / Aider adapters, installer |
| ✅ 0.2.0 | 2026-09-03 | Coverage & safety | Cline, Goose, Windsurf, Cursor adapters; executor state-write guard; dry-run/uninstall; CI matrix |
| ✅ 0.2.1 | 2026-09-03 | Production-safe | Four roles on two aliases; Ubuntu/macOS/Windows regressions; release readiness gate |
| ✅ 0.3.0 | 2026-09-26 | Deterministic router | Zero-dependency advisor: shadow/optimize policies, bounded statistics, sequential replay |
| ✅ 0.4.0 | 2026-10-01 | Evidence | Real-model pilot (36 graded runs), confidence-gated decay, recertification, effort axis, Claude Code plugin |
| ✅ 0.5.0 | 2026-10-01 | Every agent, production Linux | Codex and Antigravity native adapters, MCP server, doctor, locked ledger append, OCI image, GitHub Action, SBOM, automated releases |

Full detail: [`CHANGELOG.md`](CHANGELOG.md).

## Next

### 🧭 0.6 — Pilot v2: where the playbook should matter (2026-Q4)

- Task classes the fast tier **fails cold** — the regime pilot v1 did not
  reach — to measure when a distilled entry turns a failure into a pass.
- Effort sweeps per tier (`low` → `xhigh`) on the same classes, through CLIs
  that expose effort headlessly.
- The same fixture driven through Codex and Antigravity, so cross-tool claims
  rest on cross-tool data.
- Hidden thinking tokens captured where the client exposes final usage.

### 🧭 0.7 — Team posterior (2027-Q1)

- `tierdecay merge`: conflict-free union of ledgers across branches and
  clones (rows keyed by `obs_id`, deterministic order), so a team learns once.
- Playbook merge rules that never resurrect a quarantined entry.
- Optional signed rows (who recorded what, with which binding epoch).

### 🧭 0.8 — Observability (2027-Q2)

- Export ledger rows as OpenTelemetry GenAI spans (tier, model alias, effort,
  cost, outcome) for existing Grafana / Tempo / Loki stacks.
- A ready-made decay-curve dashboard: share of recurring classes at T1 over
  time, cost per accepted task, quarantine rate.

### 🔬 0.9 — Calibration without hand tuning (2027)

- `tierdecay calibrate`: propose an economic configuration from measured
  rows, with a dry-run diff and no silent activation.
- Sequential tests (e.g. SPRT) and Beta posteriors as an alternative to
  Hoeffding cells, evaluated with `bench` under permutations before adoption.

### 🧭 1.0 — Stable contracts (2027-H2)

- Versioned ledger/playbook schema with migration tooling and a
  compatibility promise.
- MCP resources and prompts (brief templates, owed bookkeeping) next to the
  tools; native router hints wherever vendors open an interface for them.

## Principles that do not change

- Markdown state in git is the source of truth; the engine stays read-only
  except for the locked, validated ledger append.
- Safety precedes optimization: quarantine on any failure, sticky floors,
  risk-3 never decays, `optimize` stays opt-in and fails closed.
- No tier is bound to the cheapest model family.
- No benchmark number without the data and the harness to reproduce it.

Proposals and evidence are welcome: open an issue with the
`feature_request` template, or share an anonymised ledger.
