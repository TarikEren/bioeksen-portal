/**
 * The global setup of the Vitest project `integration`: a local issuer of
 * operator tokens (`tests/support/token-issuer.ts`). The integration setup
 * points `ENTRA_JWKS_URI` to it, and the workers read it with
 * `inject("testIssuer")`.
 */
import type { TestProject } from "vitest/node";

import { type TestIssuer, startTokenIssuer } from "../token-issuer";

export type { TestIssuer } from "../token-issuer";
export { TRUSTED_KID } from "../token-issuer";

declare module "vitest" {
  export interface ProvidedContext {
    testIssuer: TestIssuer;
  }
}

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const running = await startTokenIssuer();
  project.provide("testIssuer", running.issuer);
  return async () => {
    await running.close();
  };
}
