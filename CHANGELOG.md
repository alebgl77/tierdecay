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
- `cursor` adapter — ships an `AGENTS.md` Cursor reads natively at the repo root
  and in nested subdirectories (or a Project Rule at `.cursor/rules/tierdecay.mdc`
  with `alwaysApply: true`), mapping tiers onto Cursor's per-conversation /
  per-surface model picker (Agent/Ask/Plan modes). Adds an `install.sh` case,
  `.cursor/` auto-detection, and CI matrix + conformance coverage.
- `install.sh` flags: `--help`, `--version`, `--dry-run` (preview every write),
  `--uninstall` (removes context files, never touches learned state).
- Non-native installs now ship the full spec as `.tierdecay/PROTOCOL.md`, so
  class-signature discipline and the §5 invariants travel with every adapter.
- CI: an `install-matrix` job (ubuntu + macos × 8 targets) asserting install
  **and** idempotent re-install (learned state must survive); a `conformance`
  job (120-line caps, adapter↔installer parity, normative-token presence in
  every non-native adapter); an offline `docs` job (mermaid fence balance,
  internal link resolution); a `release.yml` workflow guarding
  tag↔CHANGELOG↔CITATION coherence; `dependabot.yml` for actions updates.
- Claude Code adapter: a `PreToolUse` guard hook
  (`.claude/hooks/tierdecay-guard.sh`) wired into both executors' frontmatter
  blocks executor calls referencing `.claude/` or `.tierdecay/` at the tool
  layer (Write/Edit/MultiEdit/NotebookEdit/Bash).

### Changed

- `install.sh` rewritten around non-destructive `copy_safe`/`copy_tree`
  helpers: one collision policy everywhere (sidecar `*.tierdecay`, pending
  sidecars preserved), no reliance on `cp -n` semantics.
- `detect()` now reads project signals (`.claude/`, `.cursor/`, `.clinerules/`,
  `.windsurf/`, `.goosehints`, `GEMINI.md`, `CONVENTIONS.md`, `AGENTS.md`)
  before machine-global binaries, and can resolve cursor/cline/goose/windsurf.
- SPEC: PROBE now explicitly outranks PRIORS while a live entry exists, and a
  downgrade rewrites the entry's provenance — the T3→T2→T1 iteration has an
  operational path; escalation trigger (2 failed acceptance runs = 1
  escalation) defined; `≤400 words` recon cap and `keep last 50` ledger
  retention lifted into the spec.
- All 6 non-native adapters now carry invariant §5.2 (quarantine on ANY
  acceptance failure), the escalation trigger, class-signature discipline, the
  `any axis maxed → T3` clause, and the full APPROVE / APPROVE-WITH-NITS /
  BLOCK verdict vocabulary.
- Cline adapter: T0 recon explicitly assigned to Plan mode (read-only safety
  over model cost), resolving the tier-map contradiction.

### Deprecated

### Removed

### Security

- Claude Code adapter: SPEC §5 invariant 1 ("only the orchestrator writes
  state") is now enforced at the tool layer, not just in the prompt —
  `executor` and `heavy-executor` carry a `PreToolUse` guard hook
  (`.claude/hooks/tierdecay-guard.sh`) that blocks their calls referencing
  `.claude/` or `.tierdecay/`, and `settings.json` `ask`-gates all remaining
  state writes behind human approval. CI verifies the guard's behaviour.
- README/SECURITY.md: the anti-poisoning FAQ no longer claims impossibility
  ("it can't write") — defenses are documented as explicit layers (protocol,
  tool-layer enforcement, human review) with the residual risk stated.
- SECURITY.md: new "Distribution and shared-repo surface" section — install
  from tagged releases verified against the `SHA256SUMS` asset (shipped from
  v0.1.0), and an explicit commit-vs-ignore policy choice for shared
  `.tierdecay/` state (a committed playbook is a shared attack surface;
  review its diffs like code).

### Fixed

- **install.sh could destroy learned state**: the `claude` target's
  `cp -rn … || cp -r …` fallback silently overwrote an existing `.claude/`
  (routing ledger and playbook included) on GNU coreutils ≥ 9.2, where `cp -n`
  exits non-zero when skipping. Replaced with a guarded per-file walk through
  `copy_safe` — existing files are always preserved and a differing incoming
  version lands as a `.tierdecay` sidecar; regression-tested in CI (idempotence
  test + full install matrix).
- Quick-start commands no longer `cd` into the checkout (which guaranteed the
  installer's self-install guard would abort) and now list all 8 targets.
- CI "Every adapter is complete" check was vacuous (the `*.md` glob matched
  `README.md` itself); it now excludes the README and actually fails on a
  missing context file.
- `adapter_request.yml`: unquoted `- Yes` parsed as a YAML boolean, breaking
  the dropdown; quoted. Bug-report dropdown now lists all adapters.
- `examples/self-build/playbook.md` made SPEC-conformant (provenance rewritten
  to T1, hit counter reset after downgrade).
- Docs no longer call the Bash installer "POSIX".

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
