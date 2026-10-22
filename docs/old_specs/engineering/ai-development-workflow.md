# AI Development Workflow

Use this sequence for non-trivial engineering tasks:

1. Understand the request and affected user/business behavior.
2. Identify affected domain(s).
3. Read `project-overview.md` and relevant domain references.
4. Inspect current models, services, API, frontend, tests, and migrations.
5. Identify invariants and compatibility constraints.
6. Design the smallest compatible change.
7. Implement backend/domain behavior first when it is authoritative.
8. Enforce authorization.
9. Add/update tests.
10. Implement frontend/backoffice behavior.
11. Verify localization.
12. Review audit/privacy impact.
13. Review migration/data impact.
14. Run relevant tests/static checks.
15. Summarize changed behavior, tests, risks, and any follow-up.

Do not invent new parallel mechanisms before inspecting the existing one.
