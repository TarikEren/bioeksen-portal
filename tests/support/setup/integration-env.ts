/**
 * Setup of every worker of the Vitest project `integration`.
 *
 * Code under test reads `DATABASE_URL` (FND-03). In this project it must name
 * the disposable database and never the development database. The guard runs
 * again here, so a worker started without the global setup fails closed.
 *
 * The worker then receives every setting of FND-03 rule 2 with a test value
 * (`tests/support/test-environment.ts`):
 * - PostgreSQL is the disposable database, and Redis is `TEST_REDIS_URL`
 *   (default: the local Redis). Both answer.
 * - The object store and the mail relay point to ports where nothing
 *   listens, so they do not answer (FND-04.AC2).
 * - The issuer of operator tokens is the local JWKS server of the global
 *   setup (`tests/support/global-setup/jwks.ts`).
 * - `APP_ENV` is `test` and the test seams are on (FND-03 rule 4), for the
 *   echo route of FND-05.
 */
import { inject } from "vitest";

import { assertDisposableDatabase } from "../db-guard";
import { closedPort } from "../ports";
import { appEnvironment, testRedisUrl } from "../test-environment";

const connectionString = process.env["TEST_DATABASE_URL"];
assertDisposableDatabase(connectionString, "TEST_DATABASE_URL", { tier: "integration" });
if (connectionString === undefined) {
  throw new Error("TEST_DATABASE_URL is not set.");
}

const issuer = inject("testIssuer");
const objectStorePort = await closedPort();
const mailRelayPort = await closedPort();

Object.assign(
  process.env,
  appEnvironment({
    databaseUrl: connectionString,
    redisUrl: testRedisUrl(),
    jwksUri: issuer.jwksUri,
    publicBaseUrl: "http://localhost:3000",
    s3EndpointUrl: `http://127.0.0.1:${String(objectStorePort)}`,
    smtpHost: "127.0.0.1",
    smtpPort: String(mailRelayPort),
  }),
);
