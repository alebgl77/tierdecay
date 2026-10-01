'use strict';

// Command registry, sorted by command name. Every module in this directory
// (except index.js) must be registered here, and README.md must document it.
// Command module shape:
//   name, summary, spec: { positionals: [...], flags: { name: 'boolean'|'string' } }
//   run(ctx, { args, flags }) -> exit code (0 on success). ctx = { store, io }.
//   Commands throw KvError subclasses for failures; mutating commands must call
//   ctx.store.save() before returning.
const COMMANDS = [
  require('./get'),
  require('./list'),
  require('./set'),
];

module.exports = { COMMANDS };
