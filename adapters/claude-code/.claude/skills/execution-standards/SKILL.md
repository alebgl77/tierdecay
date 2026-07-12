---
name: execution-standards
description: Shared implementation discipline for executor agents — conventions, testing, diff hygiene, reporting. Preloaded into executor and heavy-executor via their skills frontmatter.
---

# Execution Standards

- Smallest diff that satisfies ACCEPTANCE. No drive-by refactors, no
  reformatting of untouched lines, no new dependencies unless the brief
  explicitly allows them.
- Mirror the codebase: naming, error handling, logging, test layout.
  Neighboring files ARE the style guide.
- Every behavior claimed in your report must be demonstrated by a command you
  actually ran (test, build, lint). Paste the command and the tail of its
  output — never the full log.
- No TODOs, no commented-out code, no placeholder secrets. Configuration goes
  through the repo's existing mechanisms.
- Public-facing changes (API, CLI, schema) require updating adjacent docs and
  tests in the same task.
- Reports go to an orchestrator that cannot see your transcript:
  self-contained, structured, short.
