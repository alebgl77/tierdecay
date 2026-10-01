'use strict';

const { ConflictError } = require('../errors');

module.exports = {
  name: 'set',
  summary: 'Store a value under a key',
  spec: { positionals: ['key', 'value'], flags: { 'no-overwrite': 'boolean' } },
  run(ctx, { args, flags }) {
    if (flags['no-overwrite'] && ctx.store.has(args.key)) throw new ConflictError(`key exists: ${args.key}`);
    const previous = ctx.store.get(args.key);
    ctx.store.put(args.key, { ...(previous || { createdAt: null }), value: args.value });
    ctx.store.save();
    ctx.io.out(`set ${args.key}`);
    return 0;
  }
};
