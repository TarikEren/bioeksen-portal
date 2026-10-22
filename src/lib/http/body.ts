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

/** The media type of a JSON body. */
const JSON_MEDIA_TYPE = "application/json";

/**
 * Refuses a media type that is not one of `accepted`, in UTF-8. A route accepts
 * `application/json`; a `PATCH` route also accepts `application/merge-patch+json`
 * (RFC 7396).
 */
export function assertJsonMediaType(contentType: string | null, accepted: readonly string[] = [JSON_MEDIA_TYPE]): void {
  const unsupported = new AppError("VAL-4600", `Unsupported media type (use ${accepted.join(" or ")})`);
  if (contentType === null) {
    throw unsupported;
  }
  const [mediaType, ...parameters] = contentType.split(";").map((part) => part.trim().toLowerCase());
  if (mediaType === undefined || !accepted.includes(mediaType)) {
    throw unsupported;
  }
  for (const parameter of parameters) {
    const [name, value] = parameter.split("=").map((part) => part.trim());
    if (name === "charset" && value?.replace(/"/g, "") !== "utf-8") {
      throw unsupported;
    }
  }
}

/**
 * Refuses a media type that is not `multipart/form-data` with a boundary
 * (DEC-054). The check comes after the size (`code-prefixes.md`, step 11 before
 * step 12).
 *
 * @throws AppError `VAL-4600`.
 */
export function assertMultipartMediaType(contentType: string | null): void {
  const unsupported = new AppError("VAL-4600", "Unsupported media type (use multipart/form-data)");
  if (contentType === null) {
    throw unsupported;
  }
  const [mediaType, ...parameters] = contentType.split(";").map((part) => part.trim());
  if (mediaType?.toLowerCase() !== "multipart/form-data") {
    throw unsupported;
  }
  const hasBoundary = parameters.some((parameter) => /^boundary=.+$/i.test(parameter));
  if (!hasBoundary) {
    throw unsupported;
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
export async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
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

/**
 * Parses the bytes of a `multipart/form-data` body.
 *
 * @throws AppError `VAL-4000` when the parts are malformed.
 */
export async function parseMultipartBytes(bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<FormData> {
  try {
    return await new Response(new Blob([bytes]), { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new AppError("VAL-4000", "Request body malformed (it is not multipart/form-data)");
  }
}

/**
 * The fields of a form as one plain object, for a strict schema. An empty text
 * and an empty file input are absent fields: a browser sends them for a field
 * that the person left empty. A field that appears twice becomes an array, which
 * the schema refuses. A server action takes the same form (DEC-054).
 */
export function formDataToObject(form: FormData): Record<string, unknown> {
  const values = new Map<string, FormDataEntryValue[]>();
  for (const [name, value] of form.entries()) {
    const empty = typeof value === "string" ? value === "" : value.size === 0 && value.name === "";
    if (!empty) {
      values.set(name, [...(values.get(name) ?? []), value]);
    }
  }
  // `Object.fromEntries` defines each key, so a field named `__proto__` stays a field.
  return Object.fromEntries([...values].map(([name, list]) => [name, list.length === 1 ? list[0] : list]));
}
