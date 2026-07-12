# Claude Code adapter (native) — Fable 5 / Opus 4.8 / Sonnet 4.6

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
  diffs touching it.
- Any acceptance failure while an entry was referenced → instant QUARANTINE.
- Playbook hard cap 150 lines with hits-based eviction (no context rot).
- A failed probe sets a sticky floor — the system can't downgrade past
  demonstrated failure.

## Install
1. Copy `CLAUDE.md` and the `.claude/` directory to your repo root (merge with
   any existing config).
2. Requires a plan/org with Fable 5 access — check with `/model`.
3. Start `claude`: the main thread runs Fable 5 via `.claude/settings.json`.
   Per-session override: `/model fable`.
4. Enable extended thinking in the session (Tab). Since Claude Code v2.1.198,
   subagents inherit the main conversation's thinking configuration.

## Verify
- `/agents` should list: scout, executor, heavy-executor, oracle.
- Ask for a multi-step feature. Expected behavior: scout recon → plan with
  [T1]/[T2]/[T3] tags → dispatch → verification → oracle review on critical
  diffs.
- Some builds have had a bug where the frontmatter `model:` field is ignored
  and subagents inherit the parent model. If you see everything running on
  Fable, add one line to CLAUDE.md: "when dispatching, pass the model
  explicitly in the Agent call." Do NOT use `CLAUDE_CODE_SUBAGENT_MODEL` —
  it overrides ALL subagents to a single model and destroys the tiering.

## Tuning
- Scout runs on Haiku for cheap recon (same pattern as the built-in Explore
  agent). If recon reports feel shallow, bump it to `sonnet`.
- Aliases (`fable`, `opus`, `sonnet`, `haiku`) track the latest models. To pin
  exact versions instead: `claude-fable-5`, `claude-opus-4-8`,
  `claude-sonnet-4-6`.
- No Fable access? Set `settings.json` model to `opusplan` and `oracle` to
  `opus` — the protocol degrades gracefully (Opus plans, Sonnet executes).
- The `skills:` field in executor frontmatter preloads `execution-standards`
  into their context at startup — edit that one file to change the discipline
  of both executors at once.
