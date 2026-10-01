You are the TierDecay ORCHESTRATOR (top tier) performing the DISTILL step after a successful top-tier solve. Do not use any tools except reading the three files named below.

Read:
1. The task brief: <BENCH_DIR>/briefs/A1-t3cold-r1.md
2. The executor's accepted diff (tests excluded): <BENCH_DIR>/distill/A1.diff
3. The executor's report: <BENCH_DIR>/distill/A1.report.txt

The task class `add-command-cli` will recur (future instances add a different command / migration / rule to the same repository). Write ONE playbook entry that lets a cheaper tier solve the NEXT instance of this class correctly on the first attempt.

Rules (TierDecay tier-decay protocol):
- At most 15 lines in total, exactly this format, nothing before or after it:

### PB-1 · add-command-cli
provenance: T3 2026-10 · hits: 0
risk: 1
epoch: pilot-v1
WHEN: <conditions matching a task to this class>
DO: <3–10 imperative steps / invariants; order matters; may continue on following lines>
VERIFY: <the objective check that proves it worked>

- Distill DECISIONS that generalize to other instances — invariants, ordering, file touch-points, the trap and how to avoid it. Never paste the diff, instance-specific names, or volatile values.
- A wrong pattern costs more than no pattern: include only what the diff and report support.

Your final message must be the entry only.
