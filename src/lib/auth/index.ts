/**
 * The credential check of the endpoints that need an operator (FND-04,
 * `sds-auth`).
 *
 * Skeleton of stage B0: the names and the signatures. Every body throws
 * `NotImplemented`. The check, when built, follows the validation order of
 * `sds-auth` and stops at the first failure: 401 `AUTH-4100`, `AUTH-4103`,
 * `AUTH-4102`, `AUTH-4101`; 503 `AUTH-5500` when the identity provider does not
 * answer; 403 `PERM-4151` for a token that is valid and not an operator. An app
 * credential never satisfies an operator requirement. A rejection never says
 * which claim failed or whether the principal exists.
 */
import "server-only";

import { NotImplemented } from "@/lib/errors";

export interface OperatorPrincipal {
  readonly kind: "operator";
  /** The subject of the token (`sub`). It correlates; it is not a secret. */
  readonly subject: string;
}

/**
 * Authenticates the caller as an operator.
 *
 * @param authorizationHeader The value of the `Authorization` header, `null` when absent.
 * @throws AppError `AUTH-4100`, `AUTH-4101`, `AUTH-4102`, `AUTH-4103`, `AUTH-5500`, `PERM-4151`.
 */
export function authenticateOperator(authorizationHeader: string | null): Promise<OperatorPrincipal> {
  void authorizationHeader;
  throw new NotImplemented("authenticateOperator");
}
