---
name: init
description: Opt the current project into TierDecay by seeding its routing ledger, repo playbook, and model-binding policy without overwriting anything. Use when the user runs /tierdecay:init or asks to set up TierDecay routing in a project.
---

# Initialise TierDecay in this project

1. From the project root, run `tierdecay-init` (this plugin puts it on the Bash
   PATH; if it is not found, run `"${CLAUDE_PLUGIN_ROOT}/bin/tierdecay-init"`).
2. Report each line it prints (`created` / `kept`). Never overwrite or "reset"
   an existing ledger or playbook: learned state is the product.
3. Relay its "Next" notes. The orchestrator protocol loads at the start of the
   next session in this project; ask the user to start a new session (or run
   `/clear`) and to use `/model opus` for the main thread.
