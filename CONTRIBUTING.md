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

**Adapters wanted:** Qwen Code, Amp, Continue, Cody. (Cline, Goose, and
Windsurf now ship in-tree — use them as worked examples.)

An adapter is one folder under `adapters/` containing:

1. the CLI's native context file implementing `core/SPEC.md` (phases or
   agents — pick what the CLI supports),
2. a README: install line + model-binding table,
3. an `install.sh` case (one `cp`/`copy_safe` block that seeds state).

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

Add a `case` arm in `install.sh` that copies the context file and calls
`seed_state` (native adapters may lay down their own state dir instead). Then
test it: run `install.sh <target>` into a throwaway repo and confirm the two
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

No test harness — verification is manual and takes a minute:

- `shellcheck install.sh` — the installer is POSIX bash; keep it clean.
- Install into a scratch repo and confirm files land:

  ```bash
  mkdir /tmp/td-scratch && cd /tmp/td-scratch
  /path/to/tierdecay/install.sh <claude|agents|gemini|aider>
  ls -R .            # context file present; state files seeded
  ```

- Re-run the installer in the same dir — existing files must be preserved
  (`copy_safe` writes `<file>.tierdecay` instead of clobbering).
- If you touched a context file, eyeball its line count against the ~120 cap.

## Commit & PR

- Keep PRs small and focused — one adapter, one doc pass, one fix.
- Conventional-ish commit subjects help: `feat(adapter): add goose`,
  `docs: clarify probe counter`, `fix(install): guard empty target`.
- Sign-off / DCO is welcome (`git commit -s`) but not required.
- Fill in the PR checklist (`.github/`): invariants preserved, no invented
  numbers, context file under the cap, `shellcheck` clean.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
