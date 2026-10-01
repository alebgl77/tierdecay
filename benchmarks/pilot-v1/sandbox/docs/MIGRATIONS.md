# Schema migrations

Each migration produces the listed schema version. Migrations are pure and
idempotent; `test/conventions.test.js` enforces both.

| version | name | effect |
|---|---|---|
| 2 | add-created-at | every record carries `createdAt` (null when unknown) |
