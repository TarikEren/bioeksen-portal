/**
 * Which principal a verified token carries (`sds-auth`, `credentials.md`,
 * **Principal type**). The type is derived from the claims that Entra emits:
 *
 * | Token | Principal |
 * |---|---|
 * | `scp` absent, `roles` present | app |
 * | `scp` holds the operator scope and `roles` holds `operator` | operator |
 * | `scp` present otherwise | a person who is not an operator |
 * | neither | none |
 *
 * This file is pure.
 */
import { z } from "zod";

/** The role that makes an operator (`credentials.md`, **Roles**). */
export const OPERATOR_ROLE = "operator";

const principalClaimsSchema = z.object({
  /** A delegated token. A space separated list of scopes. */
  scp: z.string().optional(),
  roles: z.array(z.string()).optional(),
});

export type PrincipalKind = "operator" | "app" | "person" | "none";

/** @returns `none` also when `scp` or `roles` has a form that Entra does not use. */
export function classifyPrincipal(payload: unknown, operatorScope: string): PrincipalKind {
  const parsed = principalClaimsSchema.safeParse(payload);
  if (!parsed.success) {
    return "none";
  }
  const { scp, roles } = parsed.data;
  if (scp === undefined) {
    return roles === undefined ? "none" : "app";
  }
  const scopes = scp.split(" ").filter((scope) => scope !== "");
  const holdsScope = scopes.includes(operatorScope);
  const holdsRole = roles?.includes(OPERATOR_ROLE) === true;
  return holdsScope && holdsRole ? "operator" : "person";
}
