/**
 * Setup of every worker of the Vitest project `integration`.
 *
 * Code under test reads `DATABASE_URL` (FND-03). In this project it must name
 * the disposable database and never the development database. The guard runs
 * again here, so a worker started without the global setup fails closed.
 */
import { assertDisposableDatabase } from "../db-guard";

const connectionString = process.env["TEST_DATABASE_URL"];
assertDisposableDatabase(connectionString, "TEST_DATABASE_URL", { tier: "integration" });
process.env["DATABASE_URL"] = connectionString;
