# Running TierDecay in production on Linux

TierDecay has no daemon, no database, no network access, and no runtime
dependencies. "Production" means four things: the advisor is installed
reproducibly, CI gates on the health of the routing state, concurrent writers
cannot corrupt the ledger, and upgrades are verifiable. This guide covers each.

## 1. Install

| Option | When | Command |
|---|---|---|
| Verified release archive | servers, golden images | download `tierdecay-<v>.tar.gz`, `tierdecay-<v>.cdx.json`, `SHA256SUMS` from the release; `sha256sum -c SHA256SUMS`; extract to `/opt/tierdecay` |
| npm from the tagged Git ref | developer machines | `npm install -g github:alebgl77/tierdecay#v0.5.0` |
| OCI image | CI runners, sandboxes, agents in containers | `docker build -t tierdecay .` (distroless, `nonroot`, base images pinned by digest) |
| Claude Code plugin | Claude Code users | `/plugin marketplace add alebgl77/tierdecay` then `/plugin install tierdecay@tierdecay` |

From an extracted archive, expose the CLI and completion:

```bash
sudo ln -s /opt/tierdecay/bin/tierdecay.js /usr/local/bin/tierdecay
tierdecay completion --shell bash | sudo tee /etc/bash_completion.d/tierdecay >/dev/null
tierdecay --version
```

Requirements: Node.js ≥ 18 (`tierdecay doctor` checks it) and, for the
installer, Bash ≥ 3.2. Nothing is installed globally by `install.sh`; it copies
adapter files into the repository you run it from.

## 2. Gate CI on the routing state

```yaml
- uses: actions/checkout@v4
- uses: alebgl77/tierdecay@v0.5.0
  with:
    root: .
    epoch: my-bindings-2026-10   # optional: enables recertification checks
    fail-on-warn: false
```

The action runs `tierdecay doctor`, writes a table to the job summary, and
fails the step on any failing check: unparsable ledger or playbook, playbook
over its 150-line cap, world-writable state, an invalid router configuration,
a non-executable guard. Warnings cover missing `MODELS.md`, CRLF line
endings, live entries without `epoch:`, and owed bookkeeping (decays,
recertifications, missing PRIORS rows).

Without GitHub Actions, the same gate is a single command:

```bash
tierdecay doctor --root . || exit 1          # exit 1 = a check failed
docker run --rm --read-only --network none -v "$PWD:/work:ro" tierdecay doctor
```

## 3. Concurrency and integrity

- **One write path.** The engine never writes the ledger or playbook except
  through `tierdecay observe --append LEDGER` (or the MCP `tierdecay_record`
  tool when explicitly enabled). It validates the row, takes an exclusive lock
  file (`<ledger>.lock`, `O_CREAT|O_EXCL`), re-reads and re-validates the whole
  ledger, refuses duplicate `obs_id`s, writes a temporary file in the same
  directory, `fsync`s it, and renames it over the ledger. Readers never see a
  partial file; parallel writers serialize. A lock older than 30 s is treated
  as stale (crashed writer) and broken; a live lock times out after 10 s with
  exit code 3.
- **Filesystems.** Use a local filesystem for the working copy. Exclusive
  create is not reliable on some network filesystems (for example NFSv2/v3);
  if the repository lives on one, funnel ledger appends through a single
  writer.
- **Permissions.** Keep state files group-writable at most (`umask 002` for a
  shared checkout, `022` otherwise). `doctor` fails on world-writable state;
  `--append` preserves the existing file mode.
- **Executors.** The Claude Code guard blocks executor subagents from
  touching `.claude/` and `.tierdecay/`. The MCP server is read-only unless
  started with `--allow-ledger-append true`; enable that only for the
  orchestrator's own session, because MCP tools are visible to every agent in
  a client session.

## 4. MCP server under process supervision

`tierdecay mcp` speaks newline-delimited JSON-RPC on stdin/stdout and logs
nothing to stdout. Clients spawn it per session; there is nothing to keep
running. It re-reads state on every call, so edits made by the orchestrator
are visible immediately. In a container:

```bash
docker run --rm -i --read-only --network none -v "$PWD:/work:ro" tierdecay mcp
```

## 5. Exit codes (stable)

| Code | Meaning |
|---|---|
| 0 | success (or a documented shadow fallback) |
| 1 | `doctor` found at least one failing check |
| 2 | invalid input, arguments, or configuration |
| 3 | incoherent Markdown state, or the ledger is locked |
| 4 | replay is missing potential outcomes |
| 5 | unexpected internal error |

## 6. Upgrades and supply chain

- Every release is created by CI from a tag on `main` after the full test
  matrix passes on that exact commit, and carries the source archive, a
  CycloneDX SBOM, and `SHA256SUMS` over both.
- Zero runtime dependencies: the SBOM lists the component and the Node.js
  platform requirement only.
- Re-running `install.sh` never overwrites learned state; differing incoming
  files land as `*.tierdecay` sidecars to merge by hand.
- After changing a model alias or an effort level, start a new binding epoch
  (`.tierdecay/MODELS.md`): entries that record `epoch:` re-certify at their
  provenance tier before descending again.

## 7. Determinism

Same inputs, same bytes: outputs are canonical JSON with sorted keys and fixed
numeric precision, no timestamps, no locale-dependent ordering, and no random
source (`bench` uses an explicit seed). This makes routing decisions diffable
in code review and reproducible in incident analysis.
