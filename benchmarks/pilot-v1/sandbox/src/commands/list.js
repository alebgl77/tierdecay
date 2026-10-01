'use strict';

module.exports = {
  name: 'list',
  summary: 'Print every key, sorted',
  spec: { positionals: [], flags: { json: 'boolean' } },
  run(ctx, { flags }) {
    const keys = ctx.store.keys();
    if (flags.json) ctx.io.out(JSON.stringify(keys));
    else for (const key of keys) ctx.io.out(key);
    return 0;
  }
};
