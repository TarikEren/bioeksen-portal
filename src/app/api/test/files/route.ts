/**
 * `POST /api/test/files`: the file store for the test phase (PLT-10, FND-03
 * rule 4). Two bodies:
 *
 * - `{ documentId, versionId, languageCode, contentBase64 }` stores the bytes
 *   under the key of PLT-10 rule 3 and answers 201 `{ file: { key, sha256,
 *   sizeBytes }, downloadUrl }`. A key that exists gives 409 `RES-4300`, and the
 *   stored object stays the same (PLT-10.AC2). A store that does not answer
 *   gives 503 `UP-5500` (PLT-10.AC4).
 * - `{ key }` answers 200 `{ downloadUrl }` for a stored file, or 404 `RES-4200`.
 *
 * It answers 404 `RES-4200` unless the test seams are open. The body is at most 4 MiB.
 */
import { z } from "zod";

import { defineJsonRoute, defineMethodNotAllowed, jsonResponse, okResponse } from "@/lib/http";
import { signTestFile, storeTestFile } from "@/modules/platform/services/test-seam-service";

const BODY_LIMIT_BYTES = 4 * 1_048_576;

const StoreBody = z.strictObject({
  documentId: z.string(),
  versionId: z.string(),
  languageCode: z.string(),
  contentBase64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
const SignBody = z.strictObject({ key: z.string().max(512) });
const BodySchema = z.union([StoreBody, SignBody]);

export const POST = defineJsonRoute(
  { principal: "none", testSeam: true, bodySchema: BodySchema, bodyLimitBytes: BODY_LIMIT_BYTES },
  async ({ body }) => {
    if ("key" in body) {
      return okResponse({ downloadUrl: await signTestFile(body.key) });
    }
    const { documentId, versionId, languageCode, contentBase64 } = body;
    const stored = await storeTestFile({ documentId, versionId, languageCode }, Buffer.from(contentBase64, "base64"));
    return jsonResponse({ status: "ok", ...stored }, 201);
  },
);

const OTHER_METHODS = { principal: "none", testSeam: true, allow: ["POST"] } as const;

export const GET = defineMethodNotAllowed(OTHER_METHODS);
export const PUT = defineMethodNotAllowed(OTHER_METHODS);
export const PATCH = defineMethodNotAllowed(OTHER_METHODS);
export const DELETE = defineMethodNotAllowed(OTHER_METHODS);
export const OPTIONS = defineMethodNotAllowed(OTHER_METHODS);
