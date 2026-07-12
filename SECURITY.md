# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| latest `main` | yes |

TierDecay ships as source. Only the current `main` is supported; pull the
latest before reporting.

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting:

**https://github.com/alebgl77/tierdecay/security/advisories/new**

Please do **not** open a public issue for security matters — that discloses
the problem before there is a fix. We aim to acknowledge a report within
**72 hours** and will coordinate a fix and disclosure timeline with you from
there.

## Scope & threat model

TierDecay is markdown instruction files plus a POSIX `install.sh` that copies
those files into your repository. There is no network service, no runtime
daemon, no telemetry, and no secret handling — so the usual server-side and
credential surfaces do not apply here. Two surfaces are real and in scope:

**1. `install.sh` file operations.** The installer runs in your shell with
your permissions and writes into your working tree (`CLAUDE.md`, `AGENTS.md`,
`.claude/`, `.tierdecay/`, etc.). It refuses to run from the checkout itself
and writes `*.tierdecay` sidecars rather than clobbering existing files, but
it is still a script that touches your filesystem. Read it before running it,
run it from the repo you intend to equip, and review the diff it produces.
Bugs in its path handling, overwrite guards, or detection logic are in scope.

**2. The instruction files themselves.** This is the interesting surface. The
adapters and the compiled playbook steer an autonomous coding agent, so a
malicious edit to an adapter file, or a **poisoned playbook entry**, can
influence what that agent does in your repository — the injection lives in
context, not in code. TierDecay's integrity invariants (`core/SPEC.md` §5)
exist precisely to contain playbook self-poisoning: only the orchestrator
writes the ledger and playbook, executor diffs touching them are rejected at
VERIFY, any acceptance failure while an entry was referenced quarantines it,
and the playbook is hard-capped. A defect that lets an executor write state,
lets a quarantined entry keep applying, or otherwise **bypasses a §5
invariant** is a security bug and in scope — as is a supply-chain edit that
smuggles hostile instructions into an adapter or template.

Out of scope: the behavior of the underlying coding CLIs and models
themselves, and anything a user does after editing the shipped files
by hand. The invariants assume the files you install match the ones in this
repository — verify what you install.
