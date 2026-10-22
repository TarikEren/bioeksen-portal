/**
 * The global setup of the Playwright suite: the guard, a new empty database,
 * and the migrations (FND-06 rules 2 and 4).
 */
import { prepareDisposableDatabase } from "./database";

export default async function globalSetup(): Promise<void> {
  await prepareDisposableDatabase("e2e");
}
