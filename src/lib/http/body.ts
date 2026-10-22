/**
 * The checks of a request body, before any schema sees it
 * (`code-prefixes.md`, steps 11 to 13; `standard-api-endpoints.md`,
 * **Method, size and media type**):
 *
 * - a body over the limit is 413 `VAL-4550`;
 * - a media type that is not `application/json` is 415 `VAL-4600`;
 * - a body that does not parse is 400 `VAL-4000`.
 *
 * The limit counts the bytes as they arrive. `Content-Length` only lets a
 * request that declares too much fail early: a chunked body has no length, and
 * a sender can understate one.
 */
import { AppError } from "@/lib/errors";

function tooLarge(limit: number): AppError {
  return new AppError("VAL-4550", `Request body too large (at most ${String(limit)} bytes)`);
}

/** Refuses a media type that is not JSON in UTF-8. */
export function assertJsonMediaType(contentType: string | null): void {
  const unsupported = new AppError("VAL-4600", "Unsupported media type (use application/json)");
  if (contentType === null) {
    throw unsupported;
  }
  const [mediaType, ...parameters] = contentType.split(";").map((part) => part.trim().toLowerCase());
  if (mediaType !== "application/json") {
    throw unsupported;
  }
  for (const parameter of parameters) {
    const [name, value] = parameter.split("=").map((part) => part.trim());
    if (name === "charset" && value?.replace(/"/g, "") !== "utf-8") {
      throw unsupported;
    }
  }
}

/** Refuses a request that declares a body over the limit, before one byte is read. */
export function assertDeclaredLength(request: Request, limit: number): void {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > limit) {
    throw tooLarge(limit);
  }
}

/**
 * Reads the body up to `limit` bytes.
 *
 * @throws AppError `VAL-4550` as soon as the bytes that arrived pass the limit.
 * The rest of the stream is not read.
 */
export async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array> {
  assertDeclaredLength(request, limit);
  if (request.body === null) {
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge(limit);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Parses JSON text in UTF-8.
 *
 * @throws AppError `VAL-4000` when the bytes are not UTF-8, or not JSON, or empty.
 */
export function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AppError("VAL-4000", "Request body malformed (it is not JSON)");
  }
}
