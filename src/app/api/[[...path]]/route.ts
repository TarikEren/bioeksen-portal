/**
 * Every path under `/api` that no other route serves: 404 `RES-4200` in the
 * envelope of `sds-api-design`, with the request id (FND-05 rule 4). The folder
 * name is an optional catch-all, so `/api` itself is included, and the handler never
 * reads the path.
 */
import { defineNotFound } from "@/lib/http";

export const GET = defineNotFound();
export const POST = defineNotFound();
export const PUT = defineNotFound();
export const PATCH = defineNotFound();
export const DELETE = defineNotFound();
export const OPTIONS = defineNotFound();
