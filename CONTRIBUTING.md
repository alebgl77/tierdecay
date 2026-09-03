# Contributing

Thanks for looking. TierDecay is a few markdown files and a protocol — no
build, no daemon, no SDK — so the barrier to a useful contribution is low.
The point of the project is to make the routing decision once at the expensive
tier and let it decay; anything that helps another CLI participate in that loop
is welcome.

## Ways to contribute

- **Write a new adapter** — teach another coding CLI to speak `core/SPEC.md`
  (see the wanted list below).
- **Improve an existing adapter** — tighten a context file, fix a model
  binding, shrink line count without losing an invariant.
- **Docs** — the README, SPEC, and adapter READMEs. Clarity over volume.
- **Share a real decay curve** — post an anonymized `ledger.md` (or the
  `predicted`/`executed`/`outcome` columns) from your own repo. Real posteriors
  are the only benchmarks this project trusts. See "post your ledger, not ours"
  in the README.

## Add an adapter

**Adapters wanted:** Qwen Code, Amp, Continue, Cody. (Cline, Goose, Windsurf,
and Cursor now ship in-tree — use them as worked examples.)

An adapter is one folder under `adapters/` containing:

1. the CLI's native context file implementing `core/SPEC.md` (phases or
   agents — pick what the CLI supports),
2. a README: install line + model-binding table,
3. an `install.sh` target case and matching preflight plan, ownership/source
   allowlist, and state-seeding behavior.

Folder layout (follow the existing adapters, e.g. `adapters/aider/`):

```
adapters/<cli>/
  <CONTEXT_FILE>     # AGENTS.md, GEMINI.md, CLAUDE.md, CONVENTIONS.md, …
  README.md          # one install line + a T0–T3 → model table
  # anything the CLI loads natively (.claude/ agents, skills, settings, …)
```

The model-binding table maps the four tiers to concrete models the CLI can
switch between:

| Tier | Role | Bind to |
|---|---|---|
| T3 | plan / review | your frontier model |
| T2 | complex execution | your strong workhorse |
| T1 | standard execution | your fast/cheap model |
| T0 | read-only recon | your cheapest model |

Keep `install.sh` target cases, preflight plans, and the ownership/source
allowlist in sync. Copy the context file, seed state (`seed_state` for
non-native adapters), and include the companion protocol/model files. The
native allowlist must retain these nine known or historical non-state
artifacts so old ownership records remain safe to process:

- `.claude/hooks/tierdecay-guard.sh` and `.claude/settings.json`;
- `.claude/agents/{scout,executor,heavy-executor,oracle}.md`;
- `.claude/skills/{execution-standards,model-routing,tier-decay}/SKILL.md`.

The learned ledger and repo-playbook are state, not uninstallable artifacts.
If a recorded source disappears, uninstall must preserve the installed file
while relinquishing the selected target's ownership. Add regressions when
changing these inventories or collision/ownership behavior.

Then test it: run `install.sh <target>` into a throwaway repo and confirm the two
state files seed — `.tierdecay/ledger.md` and `.tierdecay/playbook.md` for
non-native adapters, or the adapter's own state dir for native ones. The first
high-tier solve should have somewhere to write its first ledger row.

## Ground rules

- Every integrity invariant in **SPEC §5** must survive the adaptation. If your
  CLI can't enforce "only the orchestrator writes the ledger," say so in the
  README rather than dropping the invariant.
- No invented benchmarks — decay curves come from real ledgers, never from
  numbers you'd like to be true.
- Keep context files under **~120 lines**. They live in every prompt; every
  line is rent.

## Testing your change

Run the repository's regression suites from its root (Bash and Node.js required):

```bash
bash tests/test-installer.sh
bash tests/test-routing-order.sh
bash tests/test-guard.sh
node tests/test-model-policy.js
shellcheck install.sh tests/*.sh adapters/claude-code/.claude/hooks/tierdecay-guard.sh
```

CI runs the suites on Ubuntu, macOS, and Windows with Git Bash. The guard
suite invokes `tests/test-guard-windows.js` automatically on Windows; it is
not a separate CI entrypoint. Read any `SKIP` output: platform- or
capability-dependent skipped checks are not passes. Guard/security failures
must never be suppressed. The model-policy test checks aliases and hook
registration/frontmatter structure; it does not launch Claude or prove that a
live client loaded the hooks. Use the native adapter's manual smoke check for
that additional check. Ubuntu CI also runs ShellCheck and protocol/docs checks.

- Install into a scratch repo and confirm files land (Cursor example):

  ```bash
  scratch="$(mktemp -d)"
  cd "$scratch"
  /path/to/tierdecay/install.sh cursor
  ls -R .            # context file present; state files seeded
  ```

- Re-run the installer in the same dir — existing files must be preserved
  (`copy_safe` writes `<file>.tierdecay` instead of clobbering).
- `tests/test-routing-order.sh` checks live playbook → PRIORS → rubric order
  and the 120-line cap for every native context file.

## Commit & PR

- Keep PRs small and focused — one adapter, one doc pass, one fix.
- Conventional-ish commit subjects help: `feat(adapter): add goose`,
  `docs: clarify probe counter`, `fix(install): guard empty target`.
- Sign-off / DCO is welcome (`git commit -s`) but not required.
- Fill in the PR checklist (`.github/`): invariants preserved, no invented
  numbers, context file under the cap, `shellcheck` clean.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
