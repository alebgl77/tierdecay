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
1. Copy `CLAUDE.md` and the `.claude/` directory to your repo root (merge with
   any existing config).
2. **No special access needed** — the default binds only models available on any
   paid Claude Code plan (`opus` / `sonnet` / `haiku`). Check yours with `/model`.
3. Start `claude`: the main thread runs the top tier via `.claude/settings.json`
   (`"model": "opus"`). Per-session override: `/model opus`.
   Have access to a model above Opus? See the optional frontier-tier upgrade in
   [`core/MODELS.md`](../../core/MODELS.md) — two lines, fully optional.
4. Enable extended thinking in the session (Tab); in current Claude Code
   versions subagents inherit the main conversation's thinking configuration.

## State-write enforcement

SPEC §5's "only the orchestrator writes state" is enforced in the tool layer
here, not just in the prompt:

- `executor` and `heavy-executor` carry a `PreToolUse` hook
  (`.claude/hooks/tierdecay-guard.sh`) that blocks any of their
  Write/Edit/Bash calls referencing `.claude/` or `.tierdecay/` — prompt
  injection included. `scout` and `oracle` are read-only by tool grant.
- `settings.json` `ask`-gates `Edit(.claude/**)` and `Edit(.tierdecay/**)`:
  every surviving state write — including the orchestrator's own DISTILL —
  asks for your approval. One click per task close; an unexpected approval
  prompt is your injection alarm. Prefer protocol-only enforcement? Remove
  the `ask` rules — but then the invariants rest on the prompt alone.

Note: per-agent `hooks` frontmatter applies to project agents like these;
Claude Code ignores it for agents loaded from plugins.

## Verify
- `/agents` should list: scout, executor, heavy-executor, oracle.
- **Skills preload wired?** Dispatch to `executor`: "quote the first line of the
  PATTERNS section of your playbook." A blank/"no such section" answer means the
  `skills:` frontmatter isn't taking effect on your Claude Code version — the
  distillation half of the loop is dark; pin the entry into the brief until it is.
- **Integrity hook active?** Dispatch to `executor`: "append `# test` to
  `.claude/routing-ledger.md`." It must be blocked by the `PreToolUse` guard
  (`.claude/hooks/tierdecay-guard.sh`). If the write goes through, your build
  doesn't honor per-agent `hooks:` — fall back to VERIFY-level enforcement
  (the `settings.json` `ask` rules still gate state writes).
- Ask for a multi-step feature. Expected behavior: scout recon → plan with
  [T1]/[T2]/[T3] tags → dispatch → verification → oracle review on critical
  diffs.
- If every subagent runs on the same model, the per-agent `model:`
  binding isn't taking effect — name the model explicitly when you dispatch
  (pass it in the Agent call). Avoid `CLAUDE_CODE_SUBAGENT_MODEL`: it forces
  ALL subagents onto one model and destroys the tiering.

## Tuning
- Scout runs on the `haiku` alias for cheap recon (same pattern as the built-in
  Explore agent). If recon reports feel shallow, bump it to `sonnet`.
- **Aliases are the point.** `fable`, `opus`, `sonnet`, and `haiku` resolve to
  the latest model in each family at session start, so a new release needs no
  edit here. Current bindings and pinning guidance live in one file:
  [`core/MODELS.md`](../../core/MODELS.md) (installed as `.tierdecay/MODELS.md`).
  Pin an exact ID only for reproducibility — a pin freezes that tier.
- Want the orchestrator to plan on a bigger model than it executes with? Set
  `settings.json` to `opusplan` — Claude Code plans on the top tier and drops to
  the fast tier to execute.
- The `skills:` field in executor frontmatter preloads `execution-standards`
  into their context at startup — edit that one file to change the discipline
  of both executors at once.
