'use strict';

// v2: every record carries `createdAt` (ISO date string or null when unknown).
module.exports = {
  version: 2,
  name: 'add-created-at',
  up(doc) {
    const records = {};
    for (const [key, record] of Object.entries(doc.records)) {
      records[key] = { ...record, createdAt: record.createdAt === undefined ? null : record.createdAt };
    }
    return { ...doc, records };
  }
};
