# Definition of Done

A change is complete only after applicable checks are satisfied:

- behavior implemented
- tests added/updated and passing
- authorization verified
- localization handled
- audit impact handled
- migration reviewed
- API compatibility considered
- loading/error/empty states handled
- accessibility considered
- security reviewed
- documentation updated
- performance/data-integrity risks reviewed
- no known critical TODO remains

Each check item has a reference file: authorization -> `permission-matrix.md`, localization -> `localization.md`, audit -> `audit-traceability.md`, migration -> `database-migrations.md`, API compatibility -> `api-conventions.md` and `error-codes.md`, accessibility -> `accessibility.md`, security -> `security.md`, performance -> `performance.md`.

Run `make verify` before claiming completion.
