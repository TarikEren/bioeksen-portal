/**
 * The object store, S3 compatible (PLT-10, DEC-032, DEC-124): MinIO in the demo.
 *
 * The bucket `<S3_BUCKET>-documents` holds the IFU files. It is private and has
 * versioning on, and the app never deletes an object (DEC-124), so this file has
 * no delete. Only the server holds the credentials of the store.
 *
 * Two clients, because a signature covers the host: one for the calls of the app
 * (`S3_ENDPOINT_URL`) and one that only signs the download URLs for the browser
 * (`S3_PUBLIC_ENDPOINT_URL`, which is `S3_ENDPOINT_URL` when it is not set,
 * DEC-132). The signer makes no call.
 *
 * A failure of the store is an `AppError` of the registry: 503 `UP-5500` when
 * the store does not answer, 504 `UP-5501` when it answers late, 502 `UP-5000`
 * for an answer that the app cannot use (`sds-api-design`, `service-calls.md`).
 */
import "server-only";

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const CONNECTION_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 30_000;
/** One retry at most: a write names its key, so a repeat cannot replace an object (`If-None-Match: *`). */
const MAX_ATTEMPTS = 2;

interface Clients {
  readonly app: S3Client;
  readonly signer: S3Client;
}

let clients: Clients | undefined;

function getClients(): Clients {
  if (clients === undefined) {
    const config = getConfig();
    const shared = {
      region: config.S3_REGION,
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
      // A store of the estate is not a bucket host name under a domain: the bucket is in the path.
      forcePathStyle: true,
      // A store that is not AWS may not know the checksum headers of the newer SDK.
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
      responseChecksumValidation: "WHEN_REQUIRED" as const,
    };
    clients = {
      app: new S3Client({
        ...shared,
        endpoint: config.S3_ENDPOINT_URL,
        maxAttempts: MAX_ATTEMPTS,
        requestHandler: { connectionTimeout: CONNECTION_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS },
      }),
      signer: new S3Client({ ...shared, endpoint: config.S3_PUBLIC_ENDPOINT_URL ?? config.S3_ENDPOINT_URL }),
    };
  }
  return clients;
}

/** The name of the bucket of the IFU files (PLT-10 rule 2). */
export function documentsBucket(): string {
  return `${getConfig().S3_BUCKET}-documents`;
}

/** The HTTP status that the store answered, or `undefined` when it gave no answer. */
function statusOf(error: unknown): number | undefined {
  return error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
}

/** Maps an error of the SDK to the code of the registry. The text of the store goes to the cause only. */
function toObjectStoreError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const status = statusOf(error);
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "RequestTimeout") && status === undefined) {
    return new AppError("UP-5501", "Upstream timed out", { cause: error, reason: "the object store did not answer in time" });
  }
  if (status === undefined || status === 503 || status === 502 || status === 504) {
    return new AppError("UP-5500", "Upstream unavailable", { cause: error, reason: "the object store is not reachable" });
  }
  return new AppError("UP-5000", "Upstream response unusable", { cause: error, reason: "the object store refused the call" });
}

export type PutResult = "stored" | "exists";

/**
 * Writes an object with `If-None-Match: *`, so the store refuses to replace one
 * (PLT-10 rule 3, DEC-032). The stored object stays the same when the key exists
 * (PLT-10.AC2).
 */
export async function putObjectIfAbsent(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult> {
  try {
    await getClients().app.send(
      new PutObjectCommand({ Bucket: documentsBucket(), Key: key, Body: bytes, ContentType: contentType, IfNoneMatch: "*" }),
    );
    return "stored";
  } catch (error) {
    // 412 is the answer to `If-None-Match: *` for a key that exists. 409 is a write in the same moment.
    const status = statusOf(error);
    if (status === 412 || status === 409) {
      return "exists";
    }
    throw toObjectStoreError(error);
  }
}

/** Whether the object exists. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClients().app.send(new HeadObjectCommand({ Bucket: documentsBucket(), Key: key }));
    return true;
  } catch (error) {
    if (statusOf(error) === 404) {
      return false;
    }
    throw toObjectStoreError(error);
  }
}

/**
 * A URL for a download, signed for the public endpoint of the store (DEC-132). It
 * makes no call. `contentDisposition` is the header that the store answers with,
 * so the file downloads under the name that the caller chose (DEC-076).
 */
export async function signGetUrl(key: string, expiresInSeconds: number, contentDisposition?: string): Promise<string> {
  try {
    return await getSignedUrl(
      getClients().signer,
      new GetObjectCommand({
        Bucket: documentsBucket(),
        Key: key,
        ...(contentDisposition === undefined ? {} : { ResponseContentDisposition: contentDisposition }),
      }),
      { expiresIn: expiresInSeconds },
    );
  } catch (error) {
    throw toObjectStoreError(error);
  }
}
