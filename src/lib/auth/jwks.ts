/**
 * The signing keys of the identity provider (`sds-auth`, `credentials.md`,
 * **Rotation and revocation**).
 *
 * The cache holds the keys of the JWKS endpoint:
 * - it refreshes the keys when they are older than `maxAgeSeconds`;
 * - it fetches again when a token names a `kid` that it does not hold, at most
 *   `FETCH_BUDGET` times in `FETCH_WINDOW_MS`, so a token with a junk `kid`
 *   cannot make the app hammer the issuer;
 * - it keeps a key it holds when a refresh fails, because the key may still be
 *   good, and it answers `AUTH-5500` only when the key is unknown and the
 *   fetch fails.
 *
 * The fetch is a call on the request path. It follows `service-calls.md`: a
 * timeout for each attempt, one retry after a connection failure, a timeout or a
 * 502, 503 or 504, and a total under 3 s. The values, and the one departure (no
 * separate connect timeout), are in `@/lib/config/empirical`.
 */
import "server-only";

import { type CryptoKey, type JWK, type KeyObject, importJWK } from "jose";
import { z } from "zod";

import { JWKS_FETCH, JWKS_REFETCH_BUDGET } from "@/lib/config/empirical";
import { AppError } from "@/lib/errors";

const MAX_BODY_BYTES = 256 * 1024;

type SigningKey = CryptoKey | KeyObject;

const rsaKeySchema = z.object({
  kty: z.literal("RSA"),
  kid: z.string().min(1),
  n: z.string().min(1),
  e: z.string().min(1),
});

const keySetSchema = z.object({ keys: z.array(z.unknown()) });

export interface JwksCacheOptions {
  readonly uri: string;
  readonly maxAgeSeconds: number;
}

export class JwksCache {
  private readonly options: JwksCacheOptions;
  private keys = new Map<string, SigningKey>();
  private fetchedAt = 0;
  private attempts: number[] = [];
  private inFlight: Promise<boolean> | undefined;
  /** Whether the last fetch failed. While the budget is spent, it tells the cause of an unknown kid. */
  private lastFetchFailed = false;

  constructor(options: JwksCacheOptions) {
    this.options = options;
  }

  /**
   * The key for a `kid`.
   *
   * @throws AppError `AUTH-4101` when the key set has no such key, or the
   * budget of fetches is spent and the key is unknown; `AUTH-5500` when the key
   * is unknown and the fetch fails.
   */
  async resolve(kid: string | undefined): Promise<SigningKey> {
    if (kid === undefined) {
      throw new AppError("AUTH-4101", "Credential invalid", { reason: "token header has no kid" });
    }
    const now = Date.now();
    const known = this.keys.get(kid);
    const fresh = now - this.fetchedAt < this.options.maxAgeSeconds * 1000;
    if (known !== undefined && fresh) {
      return known;
    }

    if (!this.hasBudget(now)) {
      if (known !== undefined) {
        return known;
      }
      // The provider is down if the last fetch failed: that is step 6, the same
      // answer as the requests before the budget was spent.
      if (this.lastFetchFailed) {
        throw new AppError("AUTH-5500", "Identity provider unavailable", { reason: "fetch budget spent after a failed fetch" });
      }
      throw new AppError("AUTH-4101", "Credential invalid", { reason: "unknown kid, fetch budget spent" });
    }

    const fetched = await this.refresh(now);
    const current = this.keys.get(kid);
    if (current !== undefined) {
      return current;
    }
    if (!fetched) {
      throw new AppError("AUTH-5500", "Identity provider unavailable", { reason: "jwks fetch failed" });
    }
    throw new AppError("AUTH-4101", "Credential invalid", { reason: "no key with the kid of the token" });
  }

  private hasBudget(now: number): boolean {
    this.attempts = this.attempts.filter((attemptAt) => now - attemptAt < JWKS_REFETCH_BUDGET.windowMs);
    return this.attempts.length < JWKS_REFETCH_BUDGET.fetches;
  }

  private refresh(now: number): Promise<boolean> {
    this.inFlight ??= this.fetchKeys(now).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** One try, and one retry after a failure that may pass. @returns `null` when no attempt got an answer. */
  private async fetchWithRetry(): Promise<Response | null> {
    for (let attempt = 1; attempt <= JWKS_FETCH.attempts; attempt += 1) {
      try {
        const response = await fetch(this.options.uri, {
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(JWKS_FETCH.attemptTimeoutMs),
        });
        const retryable = response.status === 502 || response.status === 503 || response.status === 504;
        if (!retryable || attempt === JWKS_FETCH.attempts) {
          return response;
        }
      } catch {
        if (attempt === JWKS_FETCH.attempts) {
          return null;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, JWKS_FETCH.backoffMs));
    }
    return null;
  }

  /** @returns `true` when the key set was fetched and read. */
  private async fetchKeys(now: number): Promise<boolean> {
    const fetched = await this.fetchKeySet(now);
    this.lastFetchFailed = !fetched;
    return fetched;
  }

  private async fetchKeySet(now: number): Promise<boolean> {
    this.attempts.push(now);
    try {
      const response = await this.fetchWithRetry();
      if (response === null || !response.ok) {
        return false;
      }
      const text = await response.text();
      if (text.length > MAX_BODY_BYTES) {
        return false;
      }
      const parsed = keySetSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return false;
      }
      const next = new Map<string, SigningKey>();
      for (const candidate of parsed.data.keys) {
        const key = rsaKeySchema.safeParse(candidate);
        if (key.success) {
          const jwk: JWK = { kty: key.data.kty, kid: key.data.kid, n: key.data.n, e: key.data.e };
          const imported = await importJWK(jwk, "RS256");
          if (!(imported instanceof Uint8Array)) {
            next.set(key.data.kid, imported);
          }
        }
      }
      this.keys = next;
      this.fetchedAt = Date.now();
      return true;
    } catch {
      return false;
    }
  }
}
