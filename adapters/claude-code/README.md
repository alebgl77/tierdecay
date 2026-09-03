# Claude Code adapter (native) — four tiers, bound by alias

## Tier Decay — the self-distilling router

The kit's differentiating optimization: routing is an **online-learning
system**, not a static rubric.

The loop:
1. Every task writes one row to `.claude/routing-ledger.md` (predicted tier,
   executed tier, outcome, escalations).
2. After any [T2]/[T3] success on a recurring class, the orchestrator distills
   the pattern (≤15 lines: invariants, order, the trap) into the
   `repo-playbook` skill — which is **preloaded into both executors**.
3. Next occurrence of that class runs a **probe** one tier lower with the
   entry in the brief. Two probe hits → the class's default tier drops
   permanently. Decay iterates: T3 → T2 → T1.
4. Symmetric upgrade: two escalations raise a class's default. The rubric is
   the cold-start prior; the ledger is the posterior.

Net effect: the marginal cost of each recurring problem class decays toward
Sonnet pricing. High-tier solves become capex amortized over every reuse —
break-even at the first reuse.

Anti-poisoning defenses (the failure mode of any self-modifying system):
- Only the main thread writes under `.claude/**`; VERIFY rejects executor
  diffs touching it — and the invariant is also enforced mechanically at the
  tool layer (see the enforcement section below).
- Any acceptance failure while an entry was referenced → instant QUARANTINE.
- Playbook hard cap 150 lines with hits-based eviction (no context rot).
- A failed probe sets a sticky floor — the system can't downgrade past
  demonstrated failure.

## Install
Prerequisite: `node` must be available on `PATH`. The Claude adapter uses it to
parse and canonicalize `PreToolUse` payloads; no npm package is required. The
guard fails closed when Node.js is unavailable.

1. Prefer `/path/to/tierdecay/install.sh claude` from the repo you want to equip.
   For a manual install, copy this adapter's `CLAUDE.md` and `.claude/` directory
   to your repo root, then copy `core/MODELS.md` from the TierDecay checkout to
   `.tierdecay/MODELS.md` (create `.tierdecay/` if needed). **Merge existing
   files deliberately; do not overwrite learned state or hardened settings.**
2. Four roles use two aliases: `opus` for the main thread, oracle, and heavy
   executor; `sonnet` for the executor and scout. Check access and the resolved
   model with your client's model controls; no plan availability is promised.
3. Start `claude`: the main thread runs the top tier via `.claude/settings.json`
   (`"model": "opus"`). Per-session override: `/model opus`.
4. Configure thinking in your client as appropriate and verify that the agents
   and their hooks are loaded using the checks below.

### Upgrade from v0.2.0 to v0.2.1

1. Download and verify the tagged release as described in the
   [root README](../../README.md#quick-start), then run its installer with the
   `claude` target from your project. Reinstallation does not automatically
   update existing files: differing incoming files become `*.tierdecay` sidecars.
2. Review and merge each generated sidecar with its destination, including the
   guard, agent definitions, settings, and `.tierdecay/MODELS.md`. Keep your
   learned `.claude/routing-ledger.md` and playbook PATTERNS/QUARANTINE entries;
   merge only the needed template metadata in `.claude/skills/repo-playbook/SKILL.md`.
   Preserve hardened permissions and any project-specific hooks in
   `.claude/settings.json`. Do not replace them wholesale with the defaults.
   Existing pending sidecars are preserved too; resolve them before retrying.
3. Reload the Claude session and project agents so the merged definitions are
   active. Run the integrity-hook smoke check under **Verify** in a disposable
   project with the same merged configuration. It must block the attempted
   state write; static tests alone do not establish that your client loaded it.

Uninstall preserves learned state. If an owned artifact's recorded source is
missing, it also preserves that installed file and relinquishes only the
selected target's ownership; removal is not inferred from a missing source.

## State-write enforcement

SPEC §5's "only the orchestrator writes state" is enforced in the tool layer
here, not just in the prompt:

- `executor` and `heavy-executor` carry a `PreToolUse` hook
  (`.claude/hooks/tierdecay-guard.sh`) that blocks their
  Write/Edit/MultiEdit/NotebookEdit calls when target paths point into
  `.claude/` or `.tierdecay/`, and blocks observable Bash references to those
  directories. For Bash, this is defense in depth over path
  literals, not a shell interpreter: a command that constructs the protected
  name without any literal can evade the hook. VERIFY must therefore reject
  executor state diffs regardless of the hook result. `scout` and `oracle` are
  read-only by tool grant.
- `settings.json` `ask`-gates `Edit(.claude/**)` and `Edit(.tierdecay/**)`:
  built-in file edits matching those paths — including the orchestrator's own
  DISTILL — ask for your approval. This rule does not sandbox Bash; dynamically
  constructed commands remain subject to VERIFY. An unexpected approval prompt
  is your injection alarm. Prefer protocol-only enforcement? Remove the `ask`
  rules — but then the invariants rest on the prompt alone.

Note: per-agent `hooks` frontmatter applies to project agents like these;
Claude Code ignores it for agents loaded from plugins.

## Verify

- Repository suites check payload behavior and registration structure, not a
  live Claude Code session. Platform/capability skips are reported explicitly;
  a skipped fixture is not evidence that the corresponding behavior passed.
- `/agents` should list: scout, executor, heavy-executor, oracle.
- **Skills preload wired?** Dispatch to `executor`: "quote the first line of the
  PATTERNS section of your playbook." A blank/"no such section" answer means the
  `skills:` frontmatter isn't taking effect on your Claude Code version — the
  distillation half of the loop is dark; pin the entry into the brief until it is.
- **Integrity hook active?** Dispatch to `executor`: "append `# test` to
  `.claude/routing-ledger.md`." Use a disposable project. It must be blocked by
  the `PreToolUse` guard (`.claude/hooks/tierdecay-guard.sh`). If the write goes through, your build
  has not demonstrated active per-agent `hooks:` enforcement: stop, review the
  loaded configuration, and keep VERIFY mandatory. The `settings.json` `ask`
  rules are a separate layer, not a substitute for this smoke check.
- Ask for a multi-step feature. Expected behavior: scout recon → plan with
  [T1]/[T2]/[T3] tags → dispatch → verification → oracle review on critical
  diffs.
- If every subagent runs on the same model, the per-agent `model:`
  binding isn't taking effect — name the model explicitly when you dispatch
  (pass it in the Agent call). Avoid `CLAUDE_CODE_SUBAGENT_MODEL`: it forces
  ALL subagents onto one model and destroys the tiering.

## Tuning
- Scout and executor use `sonnet`; the main thread, oracle, and heavy executor
  use `opus`. Keep this two-alias policy consistent across settings and agents.
- **Aliases are the point.** `opus` and `sonnet` avoid pinning a provider version
  in every agent. Check the model resolved by your client at session start.
  Current bindings and pinning guidance live in one file:
  [`core/MODELS.md`](../../core/MODELS.md) (installed as `.tierdecay/MODELS.md`).
  Pin an exact ID only for reproducibility — a pin freezes that tier.
- The `skills:` field in executor frontmatter preloads `execution-standards`
  into their context at startup — edit that one file to change the discipline
  of both executors at once.
