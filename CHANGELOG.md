# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog][keepachangelog],
and this project adheres to [Semantic Versioning][semver].

## [Unreleased]

### Added

- `cline`, `goose`, and `windsurf` adapters — each ships an `AGENTS.md` mapped
  to the tool's native model controls (Cline Plan/Act, Goose `/plan` planner
  model, Windsurf per-message model picker) — plus their `install.sh` cases.
  Built by dogfooding TierDecay on itself; the real routing ledger from that
  session is in `examples/self-build/`.

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [0.1.0] - 2026-07-12

Initial public release.

### Added

- Core spec (`core/SPEC.md`): a tool-agnostic rubric and protocol for routing
  a task to one of four tiers (T0 scout, T1 cheap executor, T2 heavy
  executor, T3 frontier orchestrator/reviewer), scored on a 4-axis rubric —
  ambiguity, depth, blast radius, risk.
- Ledger template (`core/ledger.template.md`): the empirical posterior —
  per-class predicted-vs-executed tier log that overrides the rubric's
  cold-start prior once evidence accumulates.
- Playbook template (`core/playbook.template.md`): the compilation target —
  high-tier solutions distilled into ≤15-line, low-tier-executable entries,
  hard-capped at 150 lines with lowest-hits/oldest-first eviction.
- `claude-code` adapter (`adapters/claude-code/`): native 4-agent pipeline
  (orchestrator/oracle, heavy-executor, executor, scout) bound to
  frontier/strong/fast/cheapest models, shipped as `CLAUDE.md` plus a
  `.claude/` directory of subagents and skills with the playbook preloaded
  into both executors via `skills:` frontmatter.
- `agents-md` adapter (`adapters/agents-md/`): a universal `AGENTS.md` for
  Codex CLI, Cursor, OpenCode, GitHub Copilot, and Zed, running the protocol
  in single-agent mode with phases replacing subagents.
- `gemini-cli` adapter (`adapters/gemini-cli/`): `GEMINI.md` mapping Pro to
  T2/T3 and Flash to T1/T0.
- `aider` adapter (`adapters/aider/`): `CONVENTIONS.md` layering the ledger,
  playbook, and decay rules on top of Aider's architect/editor split.
- `install.sh`: a Bash installer that copies the right adapter (auto-detects
  one from project signals, via `auto`) into a target repo.
- Visual assets (`assets/`): logo, hero image, three-files diagram,
  economics staircase, review and loop illustrations, and a social card.
- Integrity guarantees documented in the spec: only the orchestrator writes
  the ledger and playbook; executor diffs touching them are rejected at
  VERIFY; any acceptance failure while an entry was referenced quarantines
  it; a failed probe sets a sticky floor.
- Project documentation: `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, and `LICENSE` (MIT).

[keepachangelog]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html
[unreleased]: https://github.com/alebgl77/tierdecay/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alebgl77/tierdecay/releases/tag/v0.1.0
