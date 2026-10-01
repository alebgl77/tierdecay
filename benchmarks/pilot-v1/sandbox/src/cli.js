#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { COMMANDS } = require('./commands');
const { parseArgs } = require('./args');
const { createIO } = require('./io');
const { Store } = require('./store');
const { KvError, UsageError } = require('./errors');
const { usage } = require('./usage');

// main() never exits the process: it returns the exit code.
function main(argv, { env = process.env, stdout, stderr } = {}) {
  const io = createIO({ stdout, stderr });
  try {
    const [name, ...rest] = argv;
    if (!name || name === 'help') {
      for (const command of COMMANDS) io.out(`${usage(command)}  ${command.summary}`);
      return name ? 0 : 2;
    }
    const command = COMMANDS.find((candidate) => candidate.name === name);
    if (!command) throw new UsageError(`unknown command: ${name}`);
    const parsed = parseArgs(rest, command.spec);
    const file = env.KVLITE_FILE || path.resolve('kvlite.json');
    const store = new Store(file).load();
    return command.run({ store, io }, parsed);
  } catch (error) {
    if (error instanceof KvError) {
      io.err(`error: ${error.message}`);
      return error.exitCode;
    }
    throw error;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main };
