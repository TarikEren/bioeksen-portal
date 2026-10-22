import { describe, expect, it } from "vitest";

import { redactConnection } from "./database";

// Source: sds-testing, "Test databases": a suite never prints a connection string. Review 2, R-043.
describe("redactConnection", () => {
  const encodedPassword = "p%40ss%25word%2Fqa";
  const decodedPassword = "p@ss%word/qa";
  const connectionString = `postgresql://qa:${encodedPassword}@127.0.0.1:5432/bioeksen_portal_qa_integration`;

  it("removes the whole connection string", () => {
    const output = redactConnection(`cannot connect to ${connectionString} now`, connectionString);

    expect(output).not.toContain(connectionString);
    expect(output).not.toContain(encodedPassword);
  });

  it("removes the password in its encoded form", () => {
    expect(redactConnection(`password=${encodedPassword}`, connectionString)).not.toContain(encodedPassword);
  });

  it("removes the password in its decoded form", () => {
    expect(redactConnection(`password "${decodedPassword}" refused`, connectionString)).not.toContain(decodedPassword);
  });

  it("keeps a text with no secret as it is", () => {
    expect(redactConnection("migration 0001 failed", connectionString)).toBe("migration 0001 failed");
  });
});
