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

TierDecay is markdown instruction files plus a Bash `install.sh` that copies
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

**3. Distribution and shared-repo surface.** The files are trivially forkable,
and the playbook is loaded into the agent's context every session — which
makes two indirect attacks realistic:

- *Look-alike / tampered checkout.* Anything named "tierdecay" is not this
  project. Install from a **tagged release** of this repository, not from an
  arbitrary clone of `main` or a fork: releases from this repo carry a
  `SHA256SUMS` asset — verify the archive against it before running
  `install.sh` (`sha256sum -c SHA256SUMS`). Read `install.sh` and the adapter
  you install; they are short on purpose.
- *Shared repositories.* If you **commit** `.tierdecay/` (or the Claude Code
  adapter's ledger/playbook under `.claude/`), you share learned state with
  your team — and anyone with write access to the repo can steer every
  teammate's agent through a poisoned playbook entry. Choose deliberately:
  commit the state and **review playbook diffs with the same scrutiny as
  code**, or add it to `.gitignore` and keep state per-machine (no shared
  poisoning, no shared learning). Never let a playbook diff through review
  unread.

## Enforcement layers (what is a guarantee, and what is not)

The §5 integrity invariants are **protocol-level rules interpreted by a
language model**, plus whatever technical enforcement your CLI can add. Be
precise about which layer you are relying on:

1. **Protocol (all adapters):** only the orchestrator/DISTILL phase writes
   state; VERIFY rejects executor diffs touching it. This is an instruction a
   model follows — strong in practice, but the same class of mechanism as a
   prompt injection, so it must not be your only layer.
2. **Technical (Claude Code adapter):** `executor` and `heavy-executor` carry
   a `PreToolUse` guard hook (`.claude/hooks/tierdecay-guard.sh`) that blocks,
   at the tool layer, any of their calls referencing `.claude/` or
   `.tierdecay/`; the shipped `settings.json` additionally `ask`-gates every
   remaining state write — including the orchestrator's own DISTILL — behind
   explicit human approval. A prompt-injected agent cannot silently write the
   ledger or playbook.
3. **Human:** review state diffs like code (see above), and treat an
   unexpected prompt to approve a state write as a red flag — that prompt IS
   the alarm going off.

A bypass of layer 2, or a shipped default that weakens it, is a security bug
and in scope.

Out of scope: the behavior of the underlying coding CLIs and models
themselves, and anything a user does after editing the shipped files
by hand. The invariants assume the files you install match the ones in this
repository — verify what you install.
