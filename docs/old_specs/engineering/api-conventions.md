# API Conventions

Use versioned APIs, e.g. `/api/v1/`.

Prefer stable business resources over exposing ORM internals.

Example endpoints may include:

- `POST /api/v1/eifu/resolve/`
- `GET /api/v1/courses/`
- `POST /api/v1/course-versions/{id}/submit-review/`
- `POST /api/v1/course-versions/{id}/approve/`
- `POST /api/v1/course-versions/{id}/publish/`

Use stable machine-readable error codes. Localize user-facing messages in the frontend.

Example:

```json
{
  "code": "LOT_NOT_FOUND",
  "message": "Lot could not be resolved.",
  "details": {}
}
```

Do not trust frontend-provided ownership, organization, or permission claims. Enforce object-level authorization server-side.

Paginate potentially large collections. Avoid unbounded audit/analytics responses.

The authoritative list of `code` values is `error-codes.md`. Never emit a code that is not registered there.
