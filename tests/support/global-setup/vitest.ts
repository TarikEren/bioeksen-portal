/**
 * The global setup of the Vitest project `integration`: the guard, a new empty
 * database, and the migrations (FND-06 rules 2 and 4).
 */
import { prepareDisposableDatabase } from "./database";

export async function setup(): Promise<void> {
  await prepareDisposableDatabase("integration");
}
