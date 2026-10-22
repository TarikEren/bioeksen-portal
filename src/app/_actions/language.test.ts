import { beforeEach, describe, expect, it, vi } from "vitest";

interface StoredCookie {
  readonly value: string;
  readonly options: Record<string, unknown>;
}

const jar = new Map<string, StoredCookie>();

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const stored = jar.get(name);
        return stored === undefined ? undefined : { name, value: stored.value };
      },
      set: (name: string, value: string, options: Record<string, unknown>) => {
        jar.set(name, { value, options });
      },
    }),
  headers: () => Promise.resolve(new Headers({ "x-request-id": "request-from-proxy" })),
}));

const { setLanguage } = await import("./language");

// Source: FND-08 AC3, AC4; sds-nextjs-backend section 3 (validate every action argument);
// sds-api-design (the result of a server action is the envelope).
describe("setLanguage", () => {
  beforeEach(() => {
    jar.clear();
  });

  it("sets bp_lang for 365 days and answers ok", async () => {
    const result = await setLanguage("en");

    expect(result).toEqual({ status: "ok" });
    expect(jar.get("bp_lang")?.value).toBe("en");
    expect(jar.get("bp_lang")?.options).toMatchObject({ maxAge: 31_536_000, path: "/", sameSite: "lax", httpOnly: true });
  });

  it("keeps the last choice", async () => {
    await setLanguage("en");
    await setLanguage("tr");

    expect(jar.get("bp_lang")?.value).toBe("tr");
  });

  it("refuses a language that the interface does not have, with VAL-4002, and sets no cookie", async () => {
    const result = await setLanguage("de" as never);

    expect(result).toMatchObject({
      status: "fail",
      code: "VAL-4002",
      details: [{ field: "language", issue: "is not one of the allowed values" }],
    });
    expect(jar.size).toBe(0);
  });

  it("refuses a missing argument with VAL-4001, and sets no cookie", async () => {
    const result = await setLanguage(undefined as never);

    expect(result).toMatchObject({ status: "fail", code: "VAL-4001" });
    expect(jar.size).toBe(0);
  });

  it("refuses a value that is not a string with VAL-4002", async () => {
    const result = await setLanguage({ language: "en" } as never);

    expect(result).toMatchObject({ status: "fail", code: "VAL-4002" });
    expect(jar.size).toBe(0);
  });
});
