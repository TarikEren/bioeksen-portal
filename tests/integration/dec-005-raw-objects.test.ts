/**
 * DEC-005: the drift check cannot see the raw objects of a migration, so an
 * integration test proves that each one exists. The raw object of B0 is the
 * function `platform_refuse_delete()`, for the DELETE and TRUNCATE triggers of
 * the controlled tables (FND-06 rule 5, DEC-010). Finding R-014 of review 1.
 *
 * The global setup applied the migrations to the disposable `_integration`
 * database. The test makes a scratch table with the two triggers, and drops it
 * at the end.
 */
import { randomBytes } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRATCH = `qa_refuse_delete_${randomBytes(4).toString("hex")}`;

let database: Client;

beforeAll(async () => {
  database = new Client({ connectionString: process.env["DATABASE_URL"] });
  await database.connect();
});

afterAll(async () => {
  await database.query(`DROP TABLE IF EXISTS public."${SCRATCH}"`);
  await database.end();
});

async function rowCount(): Promise<number> {
  const result = await database.query<{ count: string }>(`SELECT count(*) AS count FROM public."${SCRATCH}"`);
  return Number(result.rows[0]?.count ?? -1);
}

async function sqlState(statement: string): Promise<string | undefined> {
  try {
    await database.query(statement);
  } catch (error) {
    const code: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
    return typeof code === "string" ? code : "(an error with no SQLSTATE)";
  }
  return undefined;
}

describe("DEC-005 raw objects of the migrations", () => {
  // Source: DEC-005 and FND-06 rule 5. No acceptance criterion of B0 covers it.
  /** The migrations create platform_refuse_delete(); a trigger with it refuses DELETE and TRUNCATE, and the row stays. */
  it("DEC-005 the migration creates platform_refuse_delete(), and a trigger with it refuses DELETE and TRUNCATE", async () => {
    const found = await database.query<{ procedure: string | null }>(
      "SELECT to_regprocedure('public.platform_refuse_delete()')::text AS procedure",
    );
    expect(found.rows[0]?.procedure, "to_regprocedure('public.platform_refuse_delete()') is not null").not.toBeNull();

    await database.query(`CREATE TABLE public."${SCRATCH}" (id bigserial PRIMARY KEY, label text NOT NULL)`);
    await database.query(
      `CREATE TRIGGER refuse_delete BEFORE DELETE ON public."${SCRATCH}" ` +
        "FOR EACH ROW EXECUTE FUNCTION public.platform_refuse_delete()",
    );
    await database.query(
      `CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON public."${SCRATCH}" ` +
        "FOR EACH STATEMENT EXECUTE FUNCTION public.platform_refuse_delete()",
    );
    await database.query(`INSERT INTO public."${SCRATCH}" (label) VALUES ('kept')`);
    expect(await rowCount(), "precondition: the scratch table holds one row").toBe(1);

    expect(await sqlState(`DELETE FROM public."${SCRATCH}"`), "the database refuses DELETE").toBeDefined();
    expect(await rowCount(), "the row stays after DELETE").toBe(1);

    expect(await sqlState(`TRUNCATE public."${SCRATCH}"`), "the database refuses TRUNCATE").toBeDefined();
    expect(await rowCount(), "the row stays after TRUNCATE").toBe(1);
  });
});
