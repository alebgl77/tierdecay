'use strict';

// Every user-facing failure is one of these. The CLI maps `exitCode` to the
// process exit status; nothing else in the codebase calls process.exit().
class KvError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.name = this.constructor.name;
    this.exitCode = exitCode;
  }
}

class UsageError extends KvError { constructor(message) { super(message, 2); } }
class NotFoundError extends KvError { constructor(message) { super(message, 3); } }
class ConflictError extends KvError { constructor(message) { super(message, 4); } }
class SchemaError extends KvError { constructor(message) { super(message, 5); } }

module.exports = { KvError, UsageError, NotFoundError, ConflictError, SchemaError };
