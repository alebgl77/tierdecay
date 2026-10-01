'use strict';

const { NotFoundError } = require('../errors');

module.exports = {
  name: 'get',
  summary: 'Print the value stored under a key',
  spec: { positionals: ['key'], flags: { json: 'boolean' } },
  run(ctx, { args, flags }) {
    if (!ctx.store.has(args.key)) throw new NotFoundError(`no such key: ${args.key}`);
    const record = ctx.store.get(args.key);
    ctx.io.out(flags.json ? JSON.stringify(record) : String(record.value));
    return 0;
  }
};
