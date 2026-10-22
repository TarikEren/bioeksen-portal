/**
 * The empirical values that the app sets itself, with the reason for each
 * (`sds-config`, **Overriding an empirical value**; `service-calls.md`,
 * **Empirical values**). A value here is not a setting of the deployment.
 */

/** The fetch of the signing keys is a call on the request path (`service-calls.md`, **Timeouts**). */
export const JWKS_FETCH = {
  /** The per-attempt timeout of the request path. */
  attemptTimeoutMs: 1_200,
  /** One try and one retry, on a connection failure, a timeout or a 502, 503 or 504. */
  attempts: 2,
  /** The wait before the retry. Two attempts and this wait fit in the total budget of 3 s. */
  backoffMs: 200,
  /**
   * Departure from `service-calls.md`: the connect timeout (500 ms) is not set on
   * its own. The `fetch` of Node.js has no option for it, and the per-attempt
   * timeout bounds the connect. The header `X-Request-Deadline-Ms` is not read
   * yet, because the wrapper of the routes does not pass a deadline on.
   */
  connectTimeoutMs: null,
} as const;

/**
 * The most fetches of the key set in one window. A token with a `kid` that the
 * app does not hold makes a fetch, so a token with a junk `kid` could make the
 * app call the issuer at will. The value is a choice of this app: six fetches in
 * a minute let a key rotation land and keep the issuer calm. It is not taken
 * from `sds-auth`, which asks only that the refetch is rate limited
 * (`credentials.md`, **Rotation and revocation**).
 */
export const JWKS_REFETCH_BUDGET = { fetches: 6, windowMs: 60_000 } as const;
